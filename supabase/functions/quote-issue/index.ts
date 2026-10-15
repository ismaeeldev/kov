// Kōv — Edge Function: quote-issue
// Source: docs/03_MasterPrompts.md §9.4, docs/01_ScopeDocument.md's PDF-selector
// defect entry §9 (do NOT reproduce), KOV-FR-009/KOV-FR-010, docs/05_DataModel.md §2.9.
//
// Issuance: recomputes authoritative totals, freezes a complete snapshot
// (client/business/lines/totals/VAT/legal-mention/timestamp — everything the
// PDF needs, nothing fetched live at render time), inserts an immutable
// quote_versions row, flips quotes.status to 'issued', generates the PDF
// EXCLUSIVELY from that just-inserted snapshot (never from live quotes/
// quote_lines state), and stores it in the owner-scoped 'documents' Storage
// bucket + a documents row.
//
// This is the direct, structural fix for the "PDF-selector mismatch" defect:
// the generator here has no code path that reads live state at all, so it
// cannot suffer that defect by construction.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1'
import { calculateQuoteTotals, roundBankers } from '../../../src/lib/calc/quoteTotals.ts'
import { VAT_MENTIONS } from '../../../src/features/quotes/vatMentions.ts'
import { withCors } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Scope-audit finding (2026-09-26): this file previously had its OWN,
// independently-hardcoded copy of the VAT legal-mention text, which had
// drifted from the canonical src/features/quotes/vatMentions.ts (the editor
// UI said "art. 283-2 nonies du CGI" — matching docs/01_ScopeDocument.md
// §5.4's own authoritative table — while this file's copy said "283-2 ter",
// a wrong legal citation shipping on real client-facing PDFs). Now imports
// the same canonical module used everywhere else, so the two can never
// diverge again. VAT_MENTION_LABELS kept as a local alias only so the rest
// of this file's `snapshot.vat_mention_code` lookups below don't need
// renaming.
const VAT_MENTION_LABELS: Record<string, string> = VAT_MENTIONS

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function generatePdfBytes(snapshot: Record<string, unknown>): Promise<Uint8Array> {
  // Reads EXCLUSIVELY from the snapshot object passed in — never a live
  // query, never DOM state. This is the whole point.
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89]) // A4 in points
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold)

  const business = snapshot.business as Record<string, unknown>
  const client = snapshot.client as Record<string, unknown>
  const lines = snapshot.lines as Array<Record<string, unknown>>

  let y = 800
  const left = 50

  page.drawText(String(business.legal_name ?? ''), { x: left, y, size: 16, font: boldFont })
  y -= 20
  page.drawText(`SIREN: ${business.siren ?? ''}`, { x: left, y, size: 9, font })
  y -= 30

  page.drawText(`Devis ${snapshot.reference}`, { x: left, y, size: 14, font: boldFont })
  y -= 18
  page.drawText(`Émis le ${snapshot.issued_at}`, { x: left, y, size: 9, font })
  y -= 24

  page.drawText(`Client : ${client.name ?? ''}`, { x: left, y, size: 11, font })
  y -= 30

  page.drawText('Désignation', { x: left, y, size: 9, font: boldFont })
  page.drawText('Qté', { x: 350, y, size: 9, font: boldFont })
  page.drawText('PU HT', { x: 400, y, size: 9, font: boldFont })
  page.drawText('Total HT', { x: 470, y, size: 9, font: boldFont })
  y -= 14
  page.drawLine({
    start: { x: left, y },
    end: { x: 545, y },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  })
  y -= 14

  for (const line of lines) {
    // roundBankers (not .toFixed(2)/Math.round) — the same rounding rule
    // KOV-FR-007/docs/06_AIPromptRegistry.md §3.1 mandates for every other
    // commercial figure in this document; a line landing on an exact .005
    // boundary must round identically here as everywhere else.
    const lineTotal = roundBankers(Number(line.quantity) * Number(line.unit_price))
    page.drawText(String(line.designation ?? '').slice(0, 45), { x: left, y, size: 9, font })
    page.drawText(String(line.quantity), { x: 350, y, size: 9, font })
    page.drawText(Number(line.unit_price).toFixed(2), { x: 400, y, size: 9, font })
    page.drawText(lineTotal.toFixed(2), { x: 470, y, size: 9, font })
    y -= 16
  }

  y -= 10
  page.drawLine({
    start: { x: left, y },
    end: { x: 545, y },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  })
  y -= 20

  page.drawText(`Sous-total HT : ${Number(snapshot.subtotal_ht).toFixed(2)} €`, {
    x: 350,
    y,
    size: 10,
    font,
  })
  y -= 16
  page.drawText(`TVA (${snapshot.vat_rate}%) : ${Number(snapshot.vat_amount).toFixed(2)} €`, {
    x: 350,
    y,
    size: 10,
    font,
  })
  y -= 16
  page.drawText(`Total TTC : ${Number(snapshot.total_ttc).toFixed(2)} €`, {
    x: 350,
    y,
    size: 12,
    font: boldFont,
  })

  if (snapshot.vat_mention_code) {
    y -= 30
    page.drawText(VAT_MENTION_LABELS[snapshot.vat_mention_code as string] ?? '', {
      x: left,
      y,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
    })
  }

  if (business.legal_mentions) {
    y -= 30
    const mentionsText = (business.legal_mentions as { text?: string }).text ?? ''
    page.drawText(mentionsText.slice(0, 120), {
      x: left,
      y,
      size: 7,
      font,
      color: rgb(0.5, 0.5, 0.5),
    })
  }

  return doc.save()
}

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 })
  }

  let quoteId: string | undefined
  try {
    const body = await req.json()
    quoteId = body.quoteId
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
  }
  if (!quoteId) {
    return new Response(JSON.stringify({ error: 'Missing quoteId' }), { status: 400 })
  }

  const callerClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser()

  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired session' }), { status: 401 })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: quote, error: quoteError } = await admin
    .from('quotes')
    .select('*')
    .eq('id', quoteId)
    .eq('owner_id', user.id)
    .single()

  if (quoteError || !quote) {
    return new Response(JSON.stringify({ error: 'Quote not found or not owned by caller' }), {
      status: 404,
    })
  }

  // Edit-after-issuance rule (KOV-FR-006/010): only a Draft quote can be
  // issued directly here. A quote past Draft must go through the "edit
  // opens a new draft copy" path (Step 9.4 item 5 / QuoteEditorPage) —
  // never re-issue an already-issued quote in place.
  if (quote.status !== 'draft') {
    return new Response(JSON.stringify({ error: 'Seul un devis en brouillon peut être émis.' }), {
      status: 409,
    })
  }

  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('id, name, address, phone, email, siren')
    .eq('id', quote.client_id)
    .single()
  if (clientError || !client) {
    return new Response(JSON.stringify({ error: 'Client introuvable pour ce devis.' }), {
      status: 404,
    })
  }

  const { data: business, error: businessError } = await admin
    .from('businesses')
    .select(
      'legal_name, siren, address, phone, email, legal_mentions, default_vat_rate, legal_fields_complete',
    )
    .eq('owner_id', user.id)
    .single()
  if (businessError || !business) {
    return new Response(
      JSON.stringify({
        error:
          "Informations d'entreprise introuvables. Complète ton profil entreprise avant d'émettre un devis.",
      }),
      { status: 409 },
    )
  }

  // Scope-audit finding (2026-09-26): this check previously only confirmed a
  // businesses row EXISTED, never that its legal fields were actually
  // complete — the "legal fields validated before PDF generation" guarantee
  // (docs/01_ScopeDocument.md §5.1/§8, KOV-FR-002) was enforced only as a
  // client-side warning banner, not a real server-side gate. A business row
  // with a blank SIREN/legal_mentions could still issue a quote. Fixed here,
  // at the one place issuance is actually authoritative.
  if (!business.legal_fields_complete) {
    return new Response(
      JSON.stringify({
        error:
          "Informations légales de l'entreprise incomplètes (raison sociale, SIREN, adresse, téléphone ou mentions légales manquants). Complète ton profil entreprise avant d'émettre un devis.",
      }),
      { status: 409 },
    )
  }

  const { data: lines, error: linesError } = await admin
    .from('quote_lines')
    .select('designation, unit, quantity, unit_price, purchase_price, sort_order')
    .eq('quote_id', quoteId)
    .order('sort_order', { ascending: true })
  if (linesError) {
    return new Response(JSON.stringify({ error: linesError.message }), { status: 500 })
  }
  if (!lines || lines.length === 0) {
    return new Response(JSON.stringify({ error: 'Un devis sans ligne ne peut pas être émis.' }), {
      status: 409,
    })
  }

  // Step 8.4's authoritative recalculation, one final time — the figures
  // frozen into the snapshot below are these, not whatever the frontend last
  // showed.
  const totals = calculateQuoteTotals(lines, quote.vat_rate)

  const issuedAt = new Date().toISOString()
  const snapshot = {
    reference: quote.reference,
    issued_at: issuedAt,
    vat_rate: quote.vat_rate,
    vat_mention_code: quote.vat_mention_code,
    subtotal_ht: totals.subtotal_ht,
    total_ttc: totals.total_ttc,
    vat_amount: totals.vat_amount,
    projected_margin_pct: totals.projected_margin_pct,
    client: {
      id: client.id,
      name: client.name,
      address: client.address,
      phone: client.phone,
      email: client.email,
      siren: client.siren,
    },
    business: {
      legal_name: business.legal_name,
      siren: business.siren,
      address: business.address,
      phone: business.phone,
      email: business.email,
      legal_mentions: business.legal_mentions,
      default_vat_rate: business.default_vat_rate,
    },
    lines: lines.map((l) => ({
      designation: l.designation,
      unit: l.unit,
      quantity: l.quantity,
      unit_price: l.unit_price,
      purchase_price: l.purchase_price,
    })),
  }

  const snapshotJson = JSON.stringify(snapshot)
  const snapshotHash = await sha256Hex(snapshotJson)

  const { count: existingVersionCount } = await admin
    .from('quote_versions')
    .select('id', { count: 'exact', head: true })
    .eq('quote_id', quoteId)
  const versionNumber = (existingVersionCount ?? 0) + 1

  // Generate the PDF from the snapshot BEFORE inserting anything else, so a
  // PDF-generation failure never leaves a half-issued quote_versions row
  // with no corresponding document.
  let pdfBytes: Uint8Array
  try {
    pdfBytes = await generatePdfBytes(snapshot)
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Échec de la génération du PDF: ' + String(err) }),
      {
        status: 500,
      },
    )
  }

  const storagePath = `${user.id}/quote_pdf/${quoteId}-v${versionNumber}.pdf`
  const { error: uploadError } = await admin.storage
    .from('documents')
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: false })
  if (uploadError) {
    return new Response(
      JSON.stringify({ error: 'Échec du stockage du PDF: ' + uploadError.message }),
      {
        status: 500,
      },
    )
  }

  const { data: documentRow, error: documentError } = await admin
    .from('documents')
    .insert({
      owner_id: user.id,
      client_id: client.id,
      name: `Devis ${quote.reference} (v${versionNumber}).pdf`,
      doc_type: 'quote_pdf',
      storage_path: storagePath,
      mime_type: 'application/pdf',
      size_bytes: pdfBytes.byteLength,
    })
    .select('id')
    .single()
  if (documentError || !documentRow) {
    return new Response(
      JSON.stringify({ error: 'Échec de l’enregistrement du document: ' + documentError?.message }),
      { status: 500 },
    )
  }

  const { data: versionRow, error: versionError } = await admin
    .from('quote_versions')
    .insert({
      quote_id: quoteId,
      owner_id: user.id,
      version_number: versionNumber,
      snapshot,
      snapshot_hash: snapshotHash,
      pdf_document_id: documentRow.id,
      generated_by_model: null,
    })
    .select('id')
    .single()
  if (versionError || !versionRow) {
    return new Response(
      JSON.stringify({
        error: 'Échec de l’enregistrement de la version: ' + versionError?.message,
      }),
      { status: 500 },
    )
  }

  const { error: updateError } = await admin
    .from('quotes')
    .update({
      status: 'issued',
      current_version_id: versionRow.id,
      issued_at: issuedAt,
      subtotal_ht: totals.subtotal_ht,
      total_ttc: totals.total_ttc,
      projected_margin_pct: totals.projected_margin_pct,
    })
    .eq('id', quoteId)
  if (updateError) {
    return new Response(
      JSON.stringify({ error: 'Échec de la mise à jour du devis: ' + updateError.message }),
      { status: 500 },
    )
  }

  const { error: eventError } = await admin.from('quote_events').insert({
    quote_id: quoteId,
    owner_id: user.id,
    quote_version_id: versionRow.id,
    event_type: 'issued',
    actor: 'owner',
  })
  if (eventError) {
    // Non-fatal — the quote is genuinely issued at this point; a missing
    // journal event is a secondary concern, not worth failing the whole
    // issuance for after the PDF/version/status are all already committed.
    console.error('Failed to record quote_events issued row:', eventError.message)
  }

  return new Response(
    JSON.stringify({
      success: true,
      quoteId,
      versionNumber,
      versionId: versionRow.id,
      documentId: documentRow.id,
      snapshotHash,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}))

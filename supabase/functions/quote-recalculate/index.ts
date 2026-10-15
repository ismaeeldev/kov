// Kōv — Edge Function: quote-recalculate
// Source: docs/03_MasterPrompts.md §8.4, docs/01_ScopeDocument.md KOV-FR-007's
// "totaux affichés = instantané persisté = PDF" requirement.
//
// Authoritatively recomputes and persists a quote's subtotal_ht/total_ttc/
// projected_margin_pct from its CURRENT quote_lines rows. This is the figure
// Step 9's PDF/issuance step reads from — the frontend's live MarginBox
// (Step 8.3) is instant UI feedback only; this Edge Function is what actually
// gets persisted as the authoritative total.
//
// IMPORTANT — single source of truth: this imports src/lib/calc/quoteTotals.ts
// via a relative path REACHING OUTSIDE supabase/functions/, rather than
// duplicating the calculation logic here. The Supabase CLI bundles a
// function's entire relative-import closure at deploy time (not just the
// contents of its own directory), so this works precisely because
// quoteTotals.ts has zero Node/browser-only dependencies (per its own doc
// comment) — it is equally valid Deno code. This is deliberate: duplicating
// the rounding/margin math here would let the two paths drift apart exactly
// as the master prompt warns against. NEVER re-implement quote-totals-calc
// separately in this file — if the import path ever breaks (e.g. a future
// monorepo restructure), fix the path, don't fork the logic.
import { calculateQuoteTotals } from '../../../src/lib/calc/quoteTotals.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { withCors } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

  // Verify the caller's own JWT and derive their user id — the same pattern
  // as delete-account: never trust a client-supplied owner id, only the
  // authenticated caller's own.
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

  // Load the quote scoped to the caller's own ownership — RLS would also
  // enforce this on a non-admin client, but the admin client bypasses RLS,
  // so the .eq('owner_id', ...) here IS the enforcement point.
  const { data: quote, error: quoteError } = await admin
    .from('quotes')
    .select('id, vat_rate, owner_id')
    .eq('id', quoteId)
    .eq('owner_id', user.id)
    .single()

  if (quoteError || !quote) {
    return new Response(JSON.stringify({ error: 'Quote not found or not owned by caller' }), {
      status: 404,
    })
  }

  const { data: lines, error: linesError } = await admin
    .from('quote_lines')
    .select('quantity, unit_price, purchase_price')
    .eq('quote_id', quoteId)

  if (linesError) {
    return new Response(JSON.stringify({ error: linesError.message }), { status: 500 })
  }

  const totals = calculateQuoteTotals(lines ?? [], quote.vat_rate)

  const { error: updateError } = await admin
    .from('quotes')
    .update({
      subtotal_ht: totals.subtotal_ht,
      total_ttc: totals.total_ttc,
      projected_margin_pct: totals.projected_margin_pct,
    })
    .eq('id', quoteId)

  if (updateError) {
    return new Response(JSON.stringify({ error: updateError.message }), { status: 500 })
  }

  return new Response(
    JSON.stringify({
      success: true,
      quoteId,
      subtotal_ht: totals.subtotal_ht,
      total_ttc: totals.total_ttc,
      projected_margin_pct: totals.projected_margin_pct,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}))

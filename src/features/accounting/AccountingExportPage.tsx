import * as React from 'react'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Mail, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineError } from '@/components/ui/InlineError'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useMinDuration } from '@/hooks/useMinDuration'
import { useOwnerRecord } from '@/hooks/useOwnerRecord'
import { generateFecFile, fecFileName, type FecRow } from '@/lib/calc/generateFec'
import { apiRead, apiWrite, ApiTimeoutError } from '@/lib/apiClient'

type Format = 'pennylane' | 'tiime' | 'fec' | 'pdf_excel'
// Previously also offered 'vat_summary' and 'receivables' checkboxes, but
// neither ever affected FEC or PDF/CSV generation — no VAT-summary or
// receivables sub-report exists anywhere in this file, so checking/
// unchecking them silently did nothing. Removed rather than wired to fake
// content, consistent with this app's "never present non-functional UI as
// if it works" posture elsewhere (the e-signature modal, supplier-
// connection modal) — module 16 deep audit, 2026-10-08.
type Category = 'sales_invoices' | 'purchase_invoices'

const FORMAT_LABELS: Record<Format, string> = {
  pennylane: 'Connexion directe Pennylane',
  tiime: 'Connexion directe Tiime',
  fec: 'Fichier FEC standard',
  pdf_excel: 'Dossier PDF + Synthèse CSV',
}

const CATEGORY_LABELS: Record<Category, string> = {
  sales_invoices: 'Factures de vente',
  purchase_invoices: "Factures d'achat et frais",
}

interface InvoiceRow {
  id: string
  amount_ttc: number
  issued_at: string | null
  status: string
  client_id: string
  quote: { reference: string; vat_rate: number } | null
}

interface CostRow {
  id: string
  description: string
  amount: number | null
  hours: number | null
  hourly_rate: number | null
  incurred_at: string
  cost_type: 'supply' | 'labor_hours' | 'misc'
  source_order_id: string | null
}

/** Formats a local Date as YYYY-MM-DD directly from its Y/M/D components —
 * NEVER via `.toISOString()`, which converts to UTC first and would shift
 * the date backward by one day for any browser timezone behind UTC (this
 * app is France-only today, UTC+1/+2, so that case can't currently fire, but
 * `.toISOString().slice(0, 10)` on a local-midnight Date is a landmine for
 * anyone whose system clock/timezone is set west of UTC — module 16 deep
 * audit, 2026-10-08). */
function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Current civil quarter bounds (ISO dates). */
function currentQuarterBounds(date: Date = new Date()): {
  start: string
  end: string
  label: string
} {
  const quarter = Math.floor(date.getMonth() / 3)
  const start = new Date(date.getFullYear(), quarter * 3, 1)
  const end = new Date(date.getFullYear(), quarter * 3 + 3, 0)
  return {
    start: toLocalIsoDate(start),
    end: toLocalIsoDate(end),
    label: `T${quarter + 1} ${date.getFullYear()}`,
  }
}

function costAmount(cost: CostRow): number {
  if (cost.cost_type === 'labor_hours') return (cost.hours ?? 0) * (cost.hourly_rate ?? 38)
  return cost.amount ?? 0
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function downloadBytes(filename: string, bytes: Uint8Array, mimeType: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * s-compta — Export comptable. docs/03_MasterPrompts.md §13.6,
 * docs/01_ScopeDocument.md §5.13. Quarter banner computed from real
 * invoices/project_costs, format selection, category checkboxes,
 * missing-documents alert (cost/order rows with no linked document).
 * FEC + PDF+CSV are real, working client-side generation/downloads (no
 * Storage bucket write needed — the Storage RLS-policy blocker noted
 * elsewhere in this project is explicitly sidestepped this way); Pennylane/
 * Tiime are honestly labeled as not-yet-live per the explicit scope note.
 */
export default function AccountingExportPage() {
  const { user } = useAuth()
  const { business } = useOwnerRecord()
  const [invoices, setInvoices] = React.useState<InvoiceRow[] | null>(null)
  const [costs, setCosts] = React.useState<CostRow[] | null>(null)
  const [missingDocumentsAlert, setMissingDocumentsAlert] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [format, setFormat] = React.useState<Format>('fec')
  const [categories, setCategories] = React.useState<Set<Category>>(
    new Set(['sales_invoices', 'purchase_invoices']),
  )
  const [generateStatus, setGenerateStatus] = React.useState<
    'idle' | 'generating' | 'done' | 'error'
  >('idle')
  const [generateError, setGenerateError] = React.useState<string | null>(null)
  // Separate from generateError — the export file itself still downloads
  // successfully even if this tracking write fails, so it's a distinct,
  // lower-severity warning rather than a hard failure of the export itself.
  // Previously swallowed silently (`catch { // Non-fatal }`), which left the
  // artisan with no way to know the audit-trail/accountant-notified state
  // might be stale.
  const [trackingWarning, setTrackingWarning] = React.useState<string | null>(null)
  const fetchedFor = React.useRef<string | null>(null)
  // A ref, not a state check — a state-only guard doesn't actually prevent a
  // genuine same-tick double-click (React batches setState, so a second
  // click handler invoked before the first's state update commits can still
  // read the stale value) — see SatisfactionPage.tsx's doc comment (module
  // 15 deep audit, 2026-10-08) for the full story; same gap found here on
  // re-read (module 16 deep audit, 2026-10-08).
  const generatingRef = React.useRef(false)
  const sendingToAccountantRef = React.useRef(false)

  const { start, end, label } = React.useMemo(() => currentQuarterBounds(), [])

  const load = React.useCallback(async () => {
    if (!user) return
    setLoadError(null)

    let invoicesData: unknown, invoicesError: { message: string } | null | undefined
    let costsData: unknown[] | null, documentsData: unknown[] | null
    try {
      ;[
        { data: invoicesData, error: invoicesError },
        { data: costsData },
        { data: documentsData },
      ] = await Promise.all([
        apiRead((client) =>
          client
            .from('invoices')
            .select('id, amount_ttc, issued_at, status, client_id, quote:quotes(reference, vat_rate)')
            .eq('owner_id', user.id)
            .gte('issued_at', start)
            .lte('issued_at', end),
        ),
        apiRead((client) =>
          client
            .from('project_costs')
            .select(
              'id, description, amount, hours, hourly_rate, incurred_at, cost_type, source_order_id',
            )
            .eq('owner_id', user.id)
            .gte('incurred_at', start)
            .lte('incurred_at', end),
        ),
        apiRead((client) =>
          client.from('documents').select('id, doc_type').eq('owner_id', user.id),
        ),
      ])
    } catch (err) {
      setLoadError(err instanceof ApiTimeoutError ? err.message : String(err))
      return
    }

    if (invoicesError) {
      setLoadError(invoicesError.message)
      return
    }
    setInvoices((invoicesData as unknown as InvoiceRow[]) ?? [])
    setCosts((costsData as CostRow[]) ?? [])
    const hasAnySupportingDocs = (documentsData ?? []).some((d) =>
      ['upload_scan', 'upload_photo', 'upload_file'].includes((d as { doc_type: string }).doc_type),
    )
    const hasPurchaseCosts = (costsData ?? []).length > 0
    setMissingDocumentsAlert(hasPurchaseCosts && !hasAnySupportingDocs)
  }, [user, start, end])

  React.useEffect(() => {
    if (!user || fetchedFor.current === `${user.id}:${start}`) return
    fetchedFor.current = `${user.id}:${start}`
    load()
  }, [user, start, load])

  function toggleCategory(cat: Category) {
    setCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  async function handleGenerate() {
    if (!invoices || !costs || !business || generatingRef.current) return
    generatingRef.current = true
    setGenerateStatus('generating')
    setGenerateError(null)

    try {
      await new Promise((resolve) => setTimeout(resolve, 400))

      if (format === 'fec') {
        const rows: FecRow[] = []
        let ecritureNum = 1
        // Hoisted above the loop rather than `break`ing inside it on the
        // first iteration — both produce the same result today (the
        // category toggle is all-or-nothing, never per-row), but a `break`
        // inside a loop reads as conditional-per-item logic and would
        // silently produce wrong partial output if anyone later changes this
        // to filter per-row instead (module 16 deep audit, 2026-10-08).
        const includedInvoices = categories.has('sales_invoices') ? invoices : []
        for (const invoice of includedInvoices) {
          rows.push({
            journalCode: 'VE',
            journalLib: 'Journal des ventes',
            ecritureNum: String(ecritureNum),
            ecritureDate: invoice.issued_at ?? start,
            compteNum: '411000',
            compteLib: 'Clients',
            pieceRef: invoice.quote?.reference ?? invoice.id,
            pieceDate: invoice.issued_at ?? start,
            ecritureLib: `Facture ${invoice.quote?.reference ?? invoice.id}`,
            debit: invoice.amount_ttc,
            credit: 0,
            validDate: invoice.issued_at ?? start,
          })
          rows.push({
            journalCode: 'VE',
            journalLib: 'Journal des ventes',
            ecritureNum: String(ecritureNum),
            ecritureDate: invoice.issued_at ?? start,
            compteNum: '706000',
            compteLib: 'Prestations de services',
            pieceRef: invoice.quote?.reference ?? invoice.id,
            pieceDate: invoice.issued_at ?? start,
            ecritureLib: `Facture ${invoice.quote?.reference ?? invoice.id}`,
            debit: 0,
            credit: invoice.amount_ttc,
            validDate: invoice.issued_at ?? start,
          })
          ecritureNum += 1
        }
        const includedCosts = categories.has('purchase_invoices') ? costs : []
        for (const cost of includedCosts) {
          const amount = costAmount(cost)
          rows.push({
            journalCode: 'AC',
            journalLib: 'Journal des achats',
            ecritureNum: String(ecritureNum),
            ecritureDate: cost.incurred_at,
            compteNum: '607000',
            compteLib: 'Achats de marchandises',
            pieceRef: cost.id,
            pieceDate: cost.incurred_at,
            ecritureLib: cost.description,
            debit: amount,
            credit: 0,
            validDate: cost.incurred_at,
          })
          rows.push({
            journalCode: 'AC',
            journalLib: 'Journal des achats',
            ecritureNum: String(ecritureNum),
            ecritureDate: cost.incurred_at,
            compteNum: '401000',
            compteLib: 'Fournisseurs',
            pieceRef: cost.id,
            pieceDate: cost.incurred_at,
            ecritureLib: cost.description,
            debit: 0,
            credit: amount,
            validDate: cost.incurred_at,
          })
          ecritureNum += 1
        }
        const fileContent = generateFecFile(rows)
        const filename = business.siren ? fecFileName(business.siren, end) : `export-fec-${end}.txt`
        downloadTextFile(filename, fileContent, 'text/plain;charset=utf-8')
      } else if (format === 'pdf_excel') {
        // Dynamically imported — pdf-lib is a sizeable dependency only ever
        // needed by this one export format; a static top-level import pulled
        // the whole library into this route's eagerly-loaded chunk even for
        // artisans who never pick "PDF / Excel" (436KB/180KB gzip chunk,
        // 16.8 cross-cutting bundle-size audit, 2026-10-06).
        const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
        const pdfDoc = await PDFDocument.create()
        const page = pdfDoc.addPage([595, 842])
        const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
        const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
        let y = 800
        page.drawText(`Export comptable — ${label}`, {
          x: 40,
          y,
          size: 16,
          font,
          color: rgb(0, 0, 0),
        })
        y -= 30
        // Previously always summed ALL invoices/costs regardless of the
        // category checkboxes above — unlike the FEC branch, which already
        // respected them. Unchecking "Factures de vente" or "Factures
        // d'achat" silently had no effect on the PDF/CSV output (module 16
        // deep audit, 2026-10-08).
        const includedInvoices = categories.has('sales_invoices') ? invoices : []
        const includedCosts = categories.has('purchase_invoices') ? costs : []
        const totalTtc = includedInvoices.reduce((sum, i) => sum + Number(i.amount_ttc), 0)
        const totalCosts = includedCosts.reduce((sum, c) => sum + costAmount(c), 0)
        page.drawText(`Chiffre d'affaires TTC : ${totalTtc.toFixed(2)} €`, {
          x: 40,
          y,
          size: 11,
          font: regularFont,
        })
        y -= 18
        page.drawText(`Achats/coûts : ${totalCosts.toFixed(2)} €`, {
          x: 40,
          y,
          size: 11,
          font: regularFont,
        })
        y -= 18
        page.drawText(`Factures émises : ${includedInvoices.length}`, {
          x: 40,
          y,
          size: 11,
          font: regularFont,
        })
        const pdfBytes = await pdfDoc.save()
        downloadBytes(`export-${end}.pdf`, pdfBytes, 'application/pdf')

        const csvLines = [
          'type,reference,date,montant',
          ...includedInvoices.map(
            (i) => `vente,${i.quote?.reference ?? i.id},${i.issued_at},${i.amount_ttc}`,
          ),
          ...includedCosts.map((c) => `achat,${c.id},${c.incurred_at},${costAmount(c).toFixed(2)}`),
        ]
        downloadTextFile(`export-${end}.csv`, csvLines.join('\r\n'), 'text/csv;charset=utf-8')
      }

      if (user) {
        try {
          const { error: trackingError } = await apiWrite((client) =>
            client.from('accounting_exports').insert({
              owner_id: user.id,
              period_start: start,
              period_end: end,
              format,
              included_categories: Array.from(categories),
              missing_documents: missingDocumentsAlert ? ['purchase_costs_without_supporting_doc'] : [],
              status: 'downloaded',
            }),
          )
          if (trackingError) {
            setTrackingWarning(
              `L'export a bien été téléchargé, mais son suivi n'a pas pu être enregistré : ${trackingError.message}`,
            )
          } else {
            setTrackingWarning(null)
          }
        } catch (err) {
          setTrackingWarning(
            `L'export a bien été téléchargé, mais son suivi n'a pas pu être enregistré : ${err instanceof ApiTimeoutError ? err.message : String(err)}`,
          )
        }
      }

      generatingRef.current = false
      setGenerateStatus('done')
    } catch (err) {
      generatingRef.current = false
      setGenerateStatus('error')
      setGenerateError(String(err))
    }
  }

  async function handleSendToAccountant() {
    if (!business?.accountant_email || sendingToAccountantRef.current) return
    sendingToAccountantRef.current = true
    const subject = encodeURIComponent(`Export comptable — ${label}`)
    const body = encodeURIComponent(
      `Bonjour,\n\nVoici l'export comptable de la période ${label} (${FORMAT_LABELS[format]}).\nLe fichier vient d'être téléchargé — merci de le joindre à cet email avant l'envoi.\n\nCordialement.`,
    )
    window.location.href = `mailto:${business.accountant_email}?subject=${subject}&body=${body}`

    if (user) {
      try {
        const { error: trackingError } = await apiWrite((client) =>
          client
            .from('accounting_exports')
            .update({ status: 'sent' })
            .eq('owner_id', user.id)
            .eq('period_start', start)
            .eq('period_end', end)
            .eq('format', format),
        )
        if (trackingError) {
          setTrackingWarning(
            `L'email a bien été préparé, mais le statut d'envoi n'a pas pu être enregistré : ${trackingError.message}`,
          )
        } else {
          setTrackingWarning(null)
        }
      } catch (err) {
        setTrackingWarning(
          `L'email a bien été préparé, mais le statut d'envoi n'a pas pu être enregistré : ${err instanceof ApiTimeoutError ? err.message : String(err)}`,
        )
      }
    }
    sendingToAccountantRef.current = false
  }

  // Hook must be called unconditionally (before any early return) to satisfy
  // the Rules of Hooks.
  const showSkeleton = useMinDuration(invoices === null || costs === null)

  if (loadError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <InlineError message={loadError} onRetry={load} />
      </div>
    )
  }

  if (showSkeleton) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-4xl flex-col p-4 sm:p-6">
        <Skeleton className="mb-4 h-4 w-16 rounded-xs" />
        <Skeleton className="mb-1 h-8 w-56 rounded-xs" />
        <Skeleton className="mb-6 h-3.5 w-72 rounded-xs opacity-70" />
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-md border border-divider/30 bg-surface/90 p-4 shadow-flat">
              <Skeleton className="h-3 w-20 rounded-xs opacity-60" />
              <Skeleton className="mt-2 h-6 w-24 rounded-xs" />
            </div>
          ))}
        </div>
        <div className="rounded-md border border-divider/30 bg-surface/90 p-5 shadow-raised">
          <Skeleton className="mb-4 h-5 w-36 rounded-xs" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Skeleton className="h-16 w-full rounded-sm" />
            <Skeleton className="h-16 w-full rounded-sm" />
          </div>
        </div>
      </div>
    )
  }

  // useMinDuration holds `showSkeleton` true slightly longer than the raw
  // nullable check it wraps, so TypeScript can no longer narrow these
  // variables from the branch above alone — always true in practice by the
  // time we get here, needed only to satisfy strict-null-checks.
  if (invoices === null || costs === null) return null

  const totalTtc = invoices.reduce((sum, i) => sum + Number(i.amount_ttc), 0)
  const vatCollected = invoices.reduce((sum, i) => {
    const rate = i.quote?.vat_rate ?? 20
    const ttc = Number(i.amount_ttc)
    return sum + (ttc - ttc / (1 + rate / 100))
  }, 0)
  const isEmpty = invoices.length === 0 && costs.length === 0

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-4xl flex-col p-4 sm:p-6">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="font-serif text-[24px] sm:text-[28px] font-black tracking-tight text-text-hi">
            Export comptable
          </h1>
          <p className="mt-1 text-[13px] text-text-mid">
            Génération conforme du journal des ventes et des achats
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-brand-200/60 dark:border-brand-800/60 bg-brand-50/70 dark:bg-brand-950/40 px-3 py-1 text-xs font-black text-text-hi">
          <Receipt size={14} strokeWidth={2} className="text-brand-500" />
          {label}
        </span>
      </div>

      <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-divider/60 bg-surface p-4 shadow-sm">
          <p className="font-mono text-[20px] font-black tracking-tight text-text-hi">
            {totalTtc.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
          </p>
          <p className="mt-1 text-[10.5px] font-bold tracking-wider text-text-mid uppercase">
            Encaissé TTC
          </p>
        </div>
        <div className="rounded-xl border border-divider/60 bg-surface p-4 shadow-sm">
          <p className="font-mono text-[20px] font-black tracking-tight text-success-text">
            {vatCollected.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
          </p>
          <p className="mt-1 text-[10.5px] font-bold tracking-wider text-text-mid uppercase">
            TVA collectée
          </p>
        </div>
        <div className="rounded-xl border border-divider/60 bg-surface p-4 shadow-sm">
          <p className="font-mono text-[20px] font-black tracking-tight text-text-hi">
            {invoices.length}
          </p>
          <p className="mt-1 text-[10.5px] font-bold tracking-wider text-text-mid uppercase">
            Factures émises
          </p>
        </div>
        <div className="rounded-xl border border-divider/60 bg-surface p-4 shadow-sm">
          <p className="font-mono text-[20px] font-black tracking-tight text-text-hi">
            {costs.length}
          </p>
          <p className="mt-1 text-[10.5px] font-bold tracking-wider text-text-mid uppercase">
            Pièces d'achat
          </p>
        </div>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={<FileSpreadsheet size={36} strokeWidth={1.5} />}
          heading="Rien à exporter"
          description={`Aucune facture ni aucun coût enregistré pour cette période (${label}).`}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {missingDocumentsAlert ? (
            <div className="flex items-start gap-3 rounded-xl border border-gold-400/40 bg-gold-50/80 dark:bg-gold-950/30 p-4 text-[12.5px] text-gold-900 dark:text-gold-200">
              <AlertTriangle size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-gold-600 dark:text-gold-400" />
              <span>
                <strong>Attention justificatifs manquants :</strong> aucun justificatif n'est attaché à tes pièces d'achat pour ce trimestre — la TVA correspondante pourrait ne pas être admise en déduction.
              </span>
            </div>
          ) : null}

          <div className="rounded-xl border border-divider/60 bg-surface p-5 shadow-sm">
            <span className="mb-3 block text-[11px] font-black tracking-[0.06em] text-text-mid uppercase">
              Format d'exportation
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(Object.keys(FORMAT_LABELS) as Format[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                    format === f
                      ? 'border-brand-500 bg-brand-50/70 dark:bg-brand-950/40 text-text-hi shadow-xs ring-1 ring-brand-500/30 font-bold'
                      : 'border-divider/60 bg-surface text-text-hi hover:border-brand-500/40'
                  }`}
                >
                  <span className="text-[13px] font-extrabold text-text-hi">{FORMAT_LABELS[f]}</span>
                  <span className="mt-0.5 text-[11px] text-text-mid">
                    {f === 'fec'
                      ? // generateFec.ts deliberately uses pipe (|) as the field
                        // separator — a choice the arrêté explicitly permits — but
                        // this label previously said "tabulé" (tab-delimited),
                        // which doesn't match the real file. Fixed the label
                        // rather than the generator, since pipe is the correct,
                        // intentional, documented choice (module 16 deep audit,
                        // 2026-10-08).
                        'Standard administration fiscale française (.txt, séparateur |)'
                      : f === 'pdf_excel'
                      ? 'Rapport de synthèse et listing tableur'
                      : 'Intégration logicielle automatique'}
                  </span>
                </button>
              ))}
            </div>
            {format === 'pennylane' || format === 'tiime' ? (
              <p className="mt-2.5 text-[11.5px] text-text-low italic">
                Connexion directe API en cours d'homologation — sélectionne le fichier FEC ou PDF/Excel pour transmettre à ton expert-comptable dès aujourd'hui.
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border border-divider/60 bg-surface p-5 shadow-sm">
            <span className="mb-3 block text-[11px] font-black tracking-[0.06em] text-text-mid uppercase">
              Éléments inclus dans le dossier
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => (
                <label
                  key={cat}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all ${
                    categories.has(cat)
                      ? 'border-brand-500/30 bg-brand-50/30 dark:bg-brand-950/20 text-text-hi'
                      : 'border-divider/60 bg-surface text-text-mid opacity-70'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={categories.has(cat)}
                    onChange={() => toggleCategory(cat)}
                    className="h-4.5 w-4.5 rounded border-divider text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-[13px] font-bold">{CATEGORY_LABELS[cat]}</span>
                </label>
              ))}
            </div>
          </div>

          {generateStatus === 'error' && generateError ? (
            <InlineError message={generateError} />
          ) : null}

          {trackingWarning ? (
            <div className="flex items-start gap-2 rounded-card border-2 border-gold-500 bg-gold-100 p-3.5 text-[13px] font-bold text-gold-tint-text">
              <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
              <span className="flex-1">{trackingWarning}</span>
              <button
                type="button"
                onClick={() => setTrackingWarning(null)}
                aria-label="Fermer cet avertissement"
                className="shrink-0 text-[11px] underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                Fermer
              </button>
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            <Button
              variant="primary"
              disabled={
                generateStatus === 'generating' || format === 'pennylane' || format === 'tiime'
              }
              onClick={handleGenerate}
              className="w-full font-extrabold gap-2 text-[14px] shadow-sm"
            >
              {generateStatus === 'generating' ? (
                'Génération en cours...'
              ) : (
                <>
                  <Download size={18} strokeWidth={2.5} />
                  Générer et télécharger l'export ({label})
                </>
              )}
            </Button>

            {generateStatus === 'done' ? (
              <div className="rounded-xl border border-margin-green/30 bg-margin-green/10 p-4 text-center">
                <p className="flex items-center justify-center gap-1.5 text-[13px] font-extrabold text-success-text">
                  <CheckCircle2 size={16} strokeWidth={2.5} />
                  Export téléchargé avec succès
                </p>
                {business?.accountant_email ? (
                  <Button
                    variant="ghost"
                    onClick={handleSendToAccountant}
                    className="mt-3 w-full border border-divider/60 font-bold gap-2 text-xs"
                  >
                    <Mail size={15} strokeWidth={2} />
                    Notifier le comptable ({business.accountant_email})
                  </Button>
                ) : (
                  <p className="mt-2 text-[11.5px] text-text-mid">
                    Ajoute l'email de ton comptable dans les paramètres de ton entreprise pour pouvoir lui notifier directement cet export.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}


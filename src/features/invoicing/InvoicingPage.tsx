import * as React from 'react'
import { AlertTriangle, Receipt } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Badge, type badgeVariants } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineError } from '@/components/ui/InlineError'
import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useMinDuration } from '@/hooks/useMinDuration'
import { apiRead, ApiTimeoutError } from '@/lib/apiClient'
import type { VariantProps } from 'class-variance-authority'

type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'

interface InvoiceRow {
  id: string
  invoice_type: 'acompte' | 'situation' | 'solde' | 'totalite'
  amount_ttc: number
  status: InvoiceStatus
  due_date: string
  client_id: string
  client: { name: string } | null
}

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyée',
  paid: 'Payée',
  overdue: 'En retard',
  cancelled: 'Annulée',
}

const STATUS_TONE: Record<InvoiceStatus, VariantProps<typeof badgeVariants>['tone']> = {
  draft: 'neutral',
  sent: 'info',
  paid: 'success',
  overdue: 'error',
  cancelled: 'neutral',
}

const INVOICE_TYPE_LABELS: Record<InvoiceRow['invoice_type'], string> = {
  acompte: 'Acompte',
  situation: 'Situation',
  solde: 'Solde',
  totalite: 'Totalité',
}

const FILTERS: Array<{ id: InvoiceStatus | 'all'; label: string }> = [
  { id: 'all', label: 'Toutes' },
  { id: 'draft', label: 'Brouillon' },
  { id: 'sent', label: 'Envoyée' },
  { id: 'paid', label: 'Payée' },
  { id: 'overdue', label: 'En retard' },
  { id: 'cancelled', label: 'Annulée' },
]

/**
 * Invoicing list (s-factures) — docs/03_MasterPrompts.md §11.2 item 4.
 * Status filter across draft/sent/paid/overdue/cancelled.
 */
export default function InvoicingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [invoices, setInvoices] = React.useState<InvoiceRow[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [filter, setFilter] = React.useState<InvoiceStatus | 'all'>('all')
  // Set only when arriving here right after InvoiceCreateModal's onCreated
  // navigate() call carried a non-fatal journal-auto-feed-failure warning in
  // location.state (scope audit, 2026-09-26) — this screen stays mounted
  // long enough to actually show it, unlike the modal that already closed.
  const [journalWarning, setJournalWarning] = React.useState<string | null>(
    (location.state as { journalWarning?: string } | null)?.journalWarning ?? null,
  )
  const fetchedFor = React.useRef<string | null>(null)

  const load = React.useCallback(async () => {
    if (!user) return
    setLoadError(null)
    try {
      const { data, error } = await apiRead((client) =>
        client
          .from('invoices')
          .select('id, invoice_type, amount_ttc, status, due_date, client_id, client:clients(name)')
          .eq('owner_id', user.id)
          .order('issued_at', { ascending: false }),
      )

      if (error) {
        setLoadError(error.message)
        return
      }
      setInvoices(data as unknown as InvoiceRow[])
    } catch (err) {
      setLoadError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }, [user])

  React.useEffect(() => {
    if (!user || fetchedFor.current === user.id) return
    fetchedFor.current = user.id
    load()
  }, [user, load])

  // Hook must be called unconditionally (before any early return) to satisfy
  // the Rules of Hooks.
  const showSkeleton = useMinDuration(invoices === null)

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <InlineError message={loadError} onRetry={load} />
      </div>
    )
  }

  if (showSkeleton) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col gap-4 p-6">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-2 pb-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-pill" />
          ))}
        </div>
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </div>
    )
  }

  // useMinDuration holds `showSkeleton` true slightly longer than the raw
  // `invoices === null` check it wraps, so TypeScript can no longer narrow
  // `invoices` from the branch above alone — always true in practice by the
  // time we get here, needed only to satisfy strict-null-checks.
  if (!invoices) return null

  const filtered = filter === 'all' ? invoices : invoices.filter((i) => i.status === filter)

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-[24px] font-black tracking-tight text-text-hi">Facturation</h1>
          <p className="mt-0.5 text-[13px] text-text-mid">
            Suivi des factures, acomptes, situations et soldes.
          </p>
        </div>
      </div>

      {journalWarning ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-md border-2 border-gold-500 bg-gold-100 p-3.5 text-[13px] font-bold text-gold-tint-text shadow-xs">
          <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
          <span className="flex-1">{journalWarning}</span>
          <button
            type="button"
            onClick={() => setJournalWarning(null)}
            aria-label="Fermer cet avertissement"
            className="shrink-0 text-[11px] underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Fermer
          </button>
        </div>
      ) : null}

      {invoices.length > 0 ? (
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`shrink-0 rounded-pill px-3.5 py-1.5 text-[12px] font-bold tracking-tight whitespace-nowrap transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg ${
                filter === f.id
                  ? 'bg-brand-500 text-white shadow-xs'
                  : 'bg-recessed text-text-mid hover:bg-surface-hover hover:text-text-hi'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}

      {invoices.length === 0 ? (
        <EmptyState
          icon={<Receipt size={40} strokeWidth={1.5} />}
          heading="Aucune facture pour l'instant"
          description="Les factures se créent depuis un devis accepté ou un chantier."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Receipt size={40} strokeWidth={1.5} />}
          heading="Aucune facture dans ce statut"
          description="Essaie un autre filtre pour voir le reste de tes factures."
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {filtered.map((invoice) => (
            <li key={invoice.id}>
              <button
                type="button"
                onClick={() =>
                  navigate(invoice.status === 'overdue' ? '/unpaid' : `/clients/${invoice.client_id}`)
                }
                className="group flex w-full items-center justify-between gap-4 rounded-md border border-divider/70 bg-surface p-4 text-left shadow-raised transition-all hover:border-brand-500/40 hover:bg-surface-hover hover:shadow-raised-hover active:scale-[0.99] outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-extrabold text-text-hi group-hover:text-brand-500 transition-colors">
                    {invoice.client?.name ?? 'Client'}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-text-mid font-medium">
                    <span className="font-semibold text-text-hi">{INVOICE_TYPE_LABELS[invoice.invoice_type]}</span>
                    <span>·</span>
                    <span>
                      échéance {new Date(invoice.due_date).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="font-mono tabular-nums text-[16px] font-extrabold text-text-hi">
                    {invoice.amount_ttc.toFixed(2)} €
                  </span>
                  <Badge tone={STATUS_TONE[invoice.status]}>{STATUS_LABELS[invoice.status]}</Badge>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

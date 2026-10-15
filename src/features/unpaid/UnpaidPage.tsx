import * as React from 'react'
import { AlertTriangle, Send } from 'lucide-react'
import { motion } from 'framer-motion'
import { DunningLevelBadge, type DunningLevel as BadgeDunningLevel } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineError } from '@/components/ui/InlineError'
import { Skeleton, SkeletonStatTile } from '@/components/ui/Skeleton'
import { StatTile } from '@/components/ui/StatTile'
import { useAuth } from '@/hooks/useAuth'
import { useMinDuration } from '@/hooks/useMinDuration'
import { calculateDunningLevel, daysOverdue } from '@/lib/calc/dunningLevel'
import { apiRead, apiWrite, ApiTimeoutError } from '@/lib/apiClient'
import { DunningModal } from './DunningModal'

function toBadgeLevel(level: number): BadgeDunningLevel {
  return Math.min(3, Math.max(1, level)) as BadgeDunningLevel
}

interface UnpaidInvoiceRow {
  id: string
  client_id: string
  reference: string
  amount_ttc: number
  due_date: string
  dunning_level: number
  client: { name: string } | null
  quote: { reference: string } | null
}

/**
 * Unpaid invoices (s-impayes) — docs/03_MasterPrompts.md §11.3 items 2-4,
 * docs/01_ScopeDocument.md §5.8. Recalculates each overdue invoice's
 * dunning_level on load (chosen over a scheduled Edge Function for this
 * stage per the master prompt's explicit "pick whichever is simpler" note —
 * a full Postgres cron schedule is deferred to the later operations-
 * hardening step) — persists the recalculated level back so it stays
 * correct even when nobody opens this screen for a while, then reads the
 * persisted values back for display.
 */
export default function UnpaidPage() {
  const { user } = useAuth()
  const [invoices, setInvoices] = React.useState<UnpaidInvoiceRow[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [dunningTarget, setDunningTarget] = React.useState<UnpaidInvoiceRow | null>(null)
  const [justSentId, setJustSentId] = React.useState<string | null>(null)
  const [journalWarning, setJournalWarning] = React.useState<string | null>(null)
  const fetchedFor = React.useRef<string | null>(null)

  const load = React.useCallback(async () => {
    if (!user) return
    setLoadError(null)

    try {
      const { data, error } = await apiRead((client) =>
        client
          .from('invoices')
          .select(
            'id, client_id, amount_ttc, due_date, dunning_level, status, client:clients(name), quote:quotes(reference)',
          )
          .eq('owner_id', user.id)
          .in('status', ['sent', 'overdue'])
          .order('due_date', { ascending: true }),
      )

      if (error) {
        setLoadError(error.message)
        return
      }

      const rows = (data as unknown as (UnpaidInvoiceRow & { status: string })[]) ?? []
      const today = new Date()
      const overdue = rows.filter((r) => calculateDunningLevel(r.due_date, today) >= 1)

      // Recalculate + persist dunning_level (and flip status to 'overdue') for
      // any invoice whose computed level has moved since it was last loaded —
      // keeps the DB's persisted value correct without a scheduled job.
      await Promise.all(
        overdue.map((r) => {
          const computed = calculateDunningLevel(r.due_date, today)
          if (computed === r.dunning_level) return Promise.resolve()
          return apiWrite((client) =>
            client
              .from('invoices')
              .update({ dunning_level: computed, status: 'overdue' })
              .eq('id', r.id),
          )
        }),
      )

      setInvoices(
        overdue.map((r) => ({
          ...r,
          dunning_level: calculateDunningLevel(r.due_date, today),
          reference: r.quote?.reference ?? '',
        })),
      )
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
      <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
        <div className="mb-6">
          <Skeleton className="h-8 w-56 rounded-xs" />
          <Skeleton className="mt-1.5 h-3.5 w-72 rounded-xs opacity-75" />
        </div>
        <div className="mb-6 grid grid-cols-2 gap-3">
          <SkeletonStatTile />
          <SkeletonStatTile />
        </div>
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-sm border border-divider/30 bg-surface/80 p-4.5 shadow-raised"
            >
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-40 rounded-xs" />
                <Skeleton className="h-3 w-32 rounded-xs opacity-70" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-20 rounded-xs" />
                <Skeleton className="h-8 w-24 rounded-sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // useMinDuration holds `showSkeleton` true slightly longer than the raw
  // `invoices === null` check it wraps, so TypeScript can no longer narrow
  // `invoices` from the branch above alone — this re-check is always true in
  // practice by the time we get here (the skeleton branch above only returns
  // once `invoices` is non-null AND the minimum hold time has elapsed) but is
  // needed to satisfy strict-null-checks, not a real runtime possibility.
  if (!invoices) return null

  const totalOutstanding = invoices.reduce((sum, i) => sum + i.amount_ttc, 0)

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-[24px] font-black tracking-tight text-text-hi">Impayés & Relances</h1>
          <p className="mt-0.5 text-[13px] text-text-mid">
            Gestion du recouvrement avec escalade de relance graduée.
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
        <div className="mb-6 grid grid-cols-2 gap-3">
          <StatTile label="Total en attente" value={`${totalOutstanding.toFixed(2)} €`} />
          <StatTile label="Factures impayées" value={String(invoices.length)} />
        </div>
      ) : null}

      {invoices.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle size={40} strokeWidth={1.5} className="text-success-text" />}
          heading={<span className="text-success-text">Aucun impayé actuellement ✓</span>}
          description="Toutes les factures envoyées sont à jour de règlement."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {invoices.map((invoice) => {
            const late = daysOverdue(invoice.due_date)
            return (
              <motion.li
                key={invoice.id}
                animate={justSentId === invoice.id ? { x: [0, -4, 4, -3, 3, 0] } : { x: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-center justify-between gap-4 rounded-md border border-divider/70 bg-surface p-4 shadow-raised transition-all hover:border-divider hover:shadow-raised-hover"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-extrabold text-text-hi truncate">
                      {invoice.client?.name ?? 'Client'}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] font-medium text-text-mid">
                    <span className="font-mono tabular-nums font-bold text-text-hi">
                      {invoice.amount_ttc.toFixed(2)} €
                    </span>
                    <span>·</span>
                    <span className="font-semibold text-error-text">
                      en retard de {late} jour{late > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="mt-2">
                    <DunningLevelBadge level={toBadgeLevel(invoice.dunning_level)} />
                  </div>
                </div>
                <div className="shrink-0">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setDunningTarget(invoice)}
                    className="flex items-center gap-1.5 shadow-sm"
                  >
                    <Send size={14} strokeWidth={2.5} />
                    Relancer
                  </Button>
                </div>
              </motion.li>
            )
          })}
        </ul>
      )}

      {dunningTarget ? (
        <DunningModal
          invoiceId={dunningTarget.id}
          clientId={dunningTarget.client_id}
          level={toBadgeLevel(dunningTarget.dunning_level)}
          reference={dunningTarget.reference}
          amount={dunningTarget.amount_ttc}
          daysLate={daysOverdue(dunningTarget.due_date)}
          onClose={() => setDunningTarget(null)}
          onSent={(warning) => {
            const sentId = dunningTarget.id
            setDunningTarget(null)
            setJustSentId(sentId)
            setJournalWarning(warning ?? null)
            window.setTimeout(() => setJustSentId(null), 600)
            load()
          }}
        />
      ) : null}
    </div>
  )
}

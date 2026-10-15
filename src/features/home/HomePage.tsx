import * as React from 'react'
import { AlertTriangle, FileText, Mic, Users } from 'lucide-react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ContextualActionCard } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineError } from '@/components/ui/InlineError'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useMinDuration } from '@/hooks/useMinDuration'
import { calculateDunningLevel } from '@/lib/calc/dunningLevel'
import { apiRead, ApiTimeoutError } from '@/lib/apiClient'
import { ReportModal } from '@/features/projects/components/ReportModal'
import { ConfirmSendReportModal } from '@/features/projects/components/ConfirmSendReportModal'
import { usePlanningConflicts } from '@/features/planning/usePlanningConflictBadge'

interface ActionItem {
  id: string
  kind: 'unpaid' | 'quote_issued' | 'report_due' | 'planning_conflict'
  title: string
  subtitle: string
  onAction: () => void
  actionLabel: string
  accent: 'brand' | 'urgence' | 'gold' | 'success'
}

/**
 * s-home — Accueil. Real smart action list (module 6.2) — only genuinely
 * real, live-computed items, never a fabricated one to fill space
 * (KOV-FR-019's "aucune activité fictive"). Time-of-day switch after 16:00
 * real time shows the evening list (report-first, dictation auto-starts on
 * the report card's tap per docs/04_ApplicationFlow.md §2.2/§3.6) versus the
 * morning list. Scoped tightly to what Step 13.2 actually needs (an evening
 * report card) plus the two other simplest, already-real data sources this
 * app has (unpaid invoices from Step 11, issued-awaiting-response quotes
 * from Step 8-9) — module 6.2's full smart-list breadth (day/week summaries,
 * planning conflicts, etc.) is a broader scope than any single master-prompt
 * step actually assigns; building the full thing is deferred, not silently
 * skipped — see docs/07_ProjectState.md for the explicit note.
 */
export default function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [unpaidCount, setUnpaidCount] = React.useState<number | null>(null)
  const [unpaidTotal, setUnpaidTotal] = React.useState(0)
  const [issuedQuoteCount, setIssuedQuoteCount] = React.useState<number | null>(null)
  const [reportDueProjects, setReportDueProjects] = React.useState<
    { id: string; name: string; client_id: string; client: { name: string } | null }[] | null
  >(null)
  const [reportModalProjectId, setReportModalProjectId] = React.useState<string | null>(null)
  // Bug fix (module 3 deep audit, 2026-10-07): ReportModal's onSaved result
  // carries `notifyClient` — true only when the artisan explicitly checked
  // "notify client" inside the dictation modal — and its own doc comment is
  // explicit that the caller must open the confirm-send flow "only when
  // true, never unconditionally." HomePage's callback was discarding the
  // entire result object, so a report dictated from the evening Home card
  // with "notify client" checked silently never reached the client at all —
  // same pendingReport/ConfirmSendReportModal pattern ProjectDetailPage
  // already uses correctly for its own "Rapport" action.
  const [pendingReport, setPendingReport] = React.useState<{
    updateId: string
    projectId: string
    clientId: string
    clientName: string
    progressPct: number | null
    text: string
  } | null>(null)
  const [journalWarning, setJournalWarning] = React.useState<string | null>(null)
  const fetchedFor = React.useRef<string | null>(null)
  const planningConflicts = usePlanningConflicts()

  // Re-checked on an interval, not just once at mount — `new Date().getHours()`
  // alone would freeze at whatever time the component happened to first
  // render and never re-evaluate for the rest of the session. A tradesperson
  // realistically keeps this single tab open across the 16:00 boundary (it's
  // the app's home screen), so without this the evening "Rapport du jour"
  // card — the flagship evening feature per this module's own doc comment —
  // would silently never appear unless they manually reloaded the page.
  // Checked every minute, not more often: this only ever flips once a day,
  // so there is no need for anything finer-grained (module 3 deep audit,
  // 2026-10-07).
  const [isEvening, setIsEvening] = React.useState(() => new Date().getHours() >= 16)
  React.useEffect(() => {
    const id = setInterval(() => setIsEvening(new Date().getHours() >= 16), 60_000)
    return () => clearInterval(id)
  }, [])

  const load = React.useCallback(async () => {
    if (!user) return
    setLoadError(null)

    try {
      const [{ data: invoices, error: invoicesError }, { count: issuedQuotes }, { data: projects }] =
        await Promise.all([
          apiRead((client) =>
            client
              .from('invoices')
              .select('id, amount_ttc, due_date')
              .eq('owner_id', user.id)
              .in('status', ['sent', 'overdue']),
          ),
          apiRead((client) =>
            client
              .from('quotes')
              .select('id', { count: 'exact', head: true })
              .eq('owner_id', user.id)
              .eq('status', 'issued'),
          ),
          apiRead((client) =>
            client
              .from('projects')
              .select('id, name, client_id, client:clients(name)')
              .eq('owner_id', user.id)
              .eq('status', 'in_progress'),
          ),
        ])

      if (invoicesError) {
        setLoadError(invoicesError.message)
        return
      }

      const today = new Date()
      const overdue = (invoices ?? []).filter(
        (inv) => calculateDunningLevel(inv.due_date, today) >= 1,
      )
      setUnpaidCount(overdue.length)
      setUnpaidTotal(overdue.reduce((sum, inv) => sum + Number(inv.amount_ttc ?? 0), 0))
      // Bug fix (module 3 E2E audit, 2026-10-07): this previously destructured
      // `data` from a `{ count: 'exact', head: true }` query — a head request
      // always returns `data: null`/`[]`, with the real row count living on
      // the separate `count` field instead, which was being silently
      // discarded. The "devis en attente" stat tile and smart-action-list
      // item were therefore always reading `null`/0 regardless of the real
      // number of issued quotes. Same `{ count }` destructure already used
      // correctly for this identical query shape in OnboardingPage.tsx and
      // useQuoteEditor.ts.
      setIssuedQuoteCount(issuedQuotes ?? 0)
      setReportDueProjects(
        (projects as unknown as {
          id: string
          name: string
          client_id: string
          client: { name: string } | null
        }[]) ?? [],
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
  const showSkeleton = useMinDuration(unpaidCount === null || reportDueProjects === null)

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
        <div className="mb-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <Skeleton className="h-8 w-48 rounded-xs" />
            <Skeleton className="mt-1 h-3.5 w-64 rounded-xs opacity-75" />
          </div>
          <Skeleton className="h-7 w-36 rounded-pill" />
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-sm border border-divider/30 bg-surface/80 p-3.5 shadow-flat">
            <Skeleton className="h-3 w-24 rounded-xs opacity-60" />
            <Skeleton className="mt-2 h-6 w-12 rounded-xs" />
          </div>
          <div className="rounded-sm border border-divider/30 bg-surface/80 p-3.5 shadow-flat">
            <Skeleton className="h-3 w-24 rounded-xs opacity-60" />
            <Skeleton className="mt-2 h-6 w-12 rounded-xs" />
          </div>
          <div className="col-span-2 sm:col-span-1 rounded-sm border border-divider/30 bg-surface/80 p-3.5 shadow-flat">
            <Skeleton className="h-3 w-28 rounded-xs opacity-60" />
            <Skeleton className="mt-2 h-6 w-20 rounded-xs" />
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3.5 rounded-sm border border-divider/40 bg-surface/80 p-4 shadow-raised"
            >
              <Skeleton className="h-10 w-10 shrink-0 rounded-sm" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/5 rounded-xs" />
                <Skeleton className="h-3 w-3/5 rounded-xs opacity-75" />
              </div>
              <Skeleton className="h-7 w-16 shrink-0 rounded-pill" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // useMinDuration holds `showSkeleton` true slightly longer than the raw
  // nullable check it wraps, so TypeScript can no longer narrow these
  // variables from the branch above alone — always true in practice by the
  // time we get here, needed only to satisfy strict-null-checks.
  if (unpaidCount === null || reportDueProjects === null) return null

  const items: ActionItem[] = []

  if (isEvening && reportDueProjects.length > 0) {
    const first = reportDueProjects[0]
    items.push({
      id: `report-${first.id}`,
      kind: 'report_due',
      title: 'Rapport du jour',
      subtitle: `${first.name}${reportDueProjects.length > 1 ? ` (+${reportDueProjects.length - 1} autre${reportDueProjects.length > 2 ? 's' : ''})` : ''}`,
      onAction: () => setReportModalProjectId(first.id),
      actionLabel: 'Dicter',
      accent: 'brand',
    })
  }

  if (unpaidCount > 0) {
    items.push({
      id: 'unpaid',
      kind: 'unpaid',
      title: `${unpaidCount} facture${unpaidCount > 1 ? 's' : ''} impayée${unpaidCount > 1 ? 's' : ''}`,
      subtitle: `${unpaidTotal.toFixed(2)} € en attente`,
      onAction: () => navigate('/unpaid'),
      actionLabel: 'Voir',
      accent: 'urgence',
    })
  }

  if (planningConflicts.length > 0) {
    items.push({
      id: 'planning-conflict',
      kind: 'planning_conflict',
      title: `${planningConflicts.length} conflit${planningConflicts.length > 1 ? 's' : ''} de planning`,
      subtitle: 'Un même employé assigné à deux chantiers en même temps',
      onAction: () => navigate('/planning'),
      actionLabel: 'Voir',
      accent: 'urgence',
    })
  }

  if (issuedQuoteCount && issuedQuoteCount > 0) {
    items.push({
      id: 'issued-quotes',
      kind: 'quote_issued',
      title: `${issuedQuoteCount} devis en attente de réponse`,
      subtitle: 'Émis, pas encore accepté ni refusé',
      onAction: () => navigate('/quotes'),
      actionLabel: 'Voir',
      accent: 'gold',
    })
  }

  // "N things to handle · X min" header (docs/01_ScopeDocument.md §5.2's
  // exact example: "6 things to handle · 2 min") — scope audit fix
  // (2026-09-26): previously only a static greeting existed. The minute
  // estimate is a plain, disclosed per-item heuristic (2 min/action — a
  // dunning send, a quick glance at a quote, a dictated report all fit
  // roughly that order of magnitude), not a fabricated precise duration;
  // it only ever appears alongside the real item count it's derived from.
  const MINUTES_PER_ITEM = 2
  const totalMinutes = items.length * MINUTES_PER_ITEM

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6 lg:p-8">
      {/* Header Hero Section */}
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-serif text-[26px] font-black tracking-tight text-text-hi">
            Accueil
          </h1>
          <p className="mt-1 text-[13.5px] font-medium text-text-mid">
            {items.length > 0
              ? `${items.length} chose${items.length > 1 ? 's' : ''} à régler · ~${totalMinutes} min`
              : isEvening
                ? 'Bonsoir — tous tes indicateurs sont au vert.'
                : 'Bonjour — voici tes priorités du jour.'}
          </p>
        </div>

        <div className="inline-flex items-center gap-2 self-start rounded-pill border border-divider/40 bg-surface/80 px-3 py-1.5 backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-brand-500 shadow-accent-glow" />
          <span className="text-[11.5px] font-bold text-text-mid capitalize">
            {new Date().toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </span>
        </div>
      </div>

      {journalWarning ? (
        <div className="mb-4 flex items-start gap-2 rounded-card border-2 border-gold-500 bg-gold-100 p-3.5 text-[13px] font-bold text-gold-tint-text">
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

      {/* Quick Summary Stat Strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-sm border border-divider/30 bg-surface/80 p-3.5 backdrop-blur-md shadow-flat">
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-low">
            Chantiers actifs
          </span>
          <p className="mt-1 font-sans text-[20px] font-black tabular-nums text-text-hi">
            {reportDueProjects.length}
          </p>
        </div>
        <div className="rounded-sm border border-divider/30 bg-surface/80 p-3.5 backdrop-blur-md shadow-flat">
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-low">
            Devis en attente
          </span>
          <p className="mt-1 font-sans text-[20px] font-black tabular-nums text-gold-500">
            {issuedQuoteCount ?? 0}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-sm border border-divider/30 bg-surface/80 p-3.5 backdrop-blur-md shadow-flat">
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-low">
            Factures impayées
          </span>
          <p className="mt-1 font-sans text-[20px] font-black tabular-nums text-urgence-500">
            {unpaidCount} <span className="text-[12px] font-normal text-text-low">({unpaidTotal.toFixed(0)} €)</span>
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle size={40} strokeWidth={1.5} className="text-success-text" />}
          heading={<span className="text-success-text">Rien à régler pour le moment ✓</span>}
          description="Tes factures, devis et chantiers sont parfaitement à jour."
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((item, index) => (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: index * 0.04 }}
            >
              <ContextualActionCard
                accent={item.accent}
                icon={
                  item.kind === 'report_due' ? (
                    <Mic size={20} strokeWidth={1.75} />
                  ) : item.kind === 'planning_conflict' ? (
                    <Users size={20} strokeWidth={1.75} />
                  ) : (
                    <FileText size={20} strokeWidth={1.75} />
                  )
                }
                cardTitle={item.title}
                subtitle={item.subtitle}
                onActionClick={item.onAction}
                action={
                  <span className="text-[12px] font-bold text-brand-500">{item.actionLabel}</span>
                }
              />
            </motion.li>
          ))}
        </ul>
      )}

      {reportModalProjectId ? (
        <ReportModal
          projectId={reportModalProjectId}
          autoStartDictation
          onClose={() => setReportModalProjectId(null)}
          onSaved={(result) => {
            setReportModalProjectId(null)
            load()
            if (result.notifyClient) {
              const project = reportDueProjects?.find((p) => p.id === reportModalProjectId)
              if (project?.client) {
                setPendingReport({
                  updateId: result.updateId,
                  projectId: reportModalProjectId,
                  clientId: project.client_id,
                  clientName: project.client.name,
                  progressPct: result.progressPct,
                  text: result.text,
                })
              }
            }
          }}
        />
      ) : null}

      {pendingReport ? (
        <ConfirmSendReportModal
          updateId={pendingReport.updateId}
          clientId={pendingReport.clientId}
          projectId={pendingReport.projectId}
          clientName={pendingReport.clientName}
          progressPct={pendingReport.progressPct}
          summaryText={pendingReport.text}
          onClose={() => setPendingReport(null)}
          onSent={(warning) => {
            setPendingReport(null)
            setJournalWarning(warning ?? null)
          }}
        />
      ) : null}
    </div>
  )
}

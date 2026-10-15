import * as React from 'react'
import { AlertTriangle, ArrowLeft, FileText, Mic, Package, Plus, Wallet, Wrench } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineError } from '@/components/ui/InlineError'
import { Input } from '@/components/ui/Input'
import { MarginBox } from '@/components/ui/MarginBox'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useMinDuration } from '@/hooks/useMinDuration'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import {
  calculateProjectProfitability,
  type ProjectCostInput,
} from '@/lib/calc/projectProfitability'
import { apiRead, apiWrite, ApiTimeoutError } from '@/lib/apiClient'
import { deriveAvenantLines } from './avenantLines'
import { InvoiceCreateModal } from '@/features/invoicing/InvoiceCreateModal'
import { ReportModal } from './components/ReportModal'
import { ConfirmSendReportModal } from './components/ConfirmSendReportModal'
import { ReportViewModal, type ReportViewData } from './components/ReportViewModal'
import { OrderModal } from '@/features/orders/OrderModal'

interface ProjectRow {
  id: string
  client_id: string
  source_quote_id: string
  name: string
  status: 'planned' | 'in_progress' | 'awaiting_payment' | 'closed'
  planned_value_ttc: number
  planned_margin_pct: number
  start_date: string | null
  end_date: string | null
  client: { name: string } | null
}

interface ProjectCostRow extends ProjectCostInput {
  id: string
  incurred_at: string
}

interface ProjectUpdateRow {
  id: string
  text_content: string
  progress_pct: number | null
  input_method: 'typed' | 'voice'
  sent_to_client: boolean
  client_sms_sent_at: string | null
  created_at: string
}

const STATUS_LABELS: Record<ProjectRow['status'], string> = {
  planned: 'Planifié',
  in_progress: 'En cours',
  awaiting_payment: 'En attente de paiement',
  closed: 'Clôturé',
}

const COST_TYPE_LABELS: Record<ProjectCostInput['cost_type'], string> = {
  supply: 'Fourniture',
  labor_hours: 'Main d’oeuvre',
  misc: 'Divers',
}

const emptyCostForm = {
  cost_type: 'supply' as ProjectCostInput['cost_type'],
  description: '',
  amount: '',
  hours: '',
  hourly_rate: '38',
  incurred_at: new Date().toISOString().slice(0, 10),
}

/**
 * Chantier (s-chantier) — docs/03_MasterPrompts.md §10.3,
 * docs/01_ScopeDocument.md §5.9 (module 6.9). Status/dates shell, a
 * chronological notes list (project_updates — display shell only this step,
 * per the master prompt: "Step 13.2 will feed this fully"), a cost-entry UI,
 * and the real "Ce que ce chantier te rapporte" profitability block wired to
 * the MarginBox extended variant with real data — never a demo/placeholder
 * figure (KOV-FR-012).
 */
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const isOnline = useOnlineStatus()
  const prefersReducedMotion = useReducedMotion()

  const [project, setProject] = React.useState<ProjectRow | null>(null)
  const [costs, setCosts] = React.useState<ProjectCostRow[] | null>(null)
  const [updates, setUpdates] = React.useState<ProjectUpdateRow[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  // Costs/updates errors previously blanked nothing at all — silently
  // swallowed, so a project_costs fetch failure rendered profitability as if
  // costs were genuinely zero, with no indication anything went wrong (scope
  // audit, 2026-09-26). Scoped locally instead of joining loadError, since
  // neither failure should blank the whole page — the project itself still
  // loaded fine.
  const [costsError, setCostsError] = React.useState<string | null>(null)
  const [updatesError, setUpdatesError] = React.useState<string | null>(null)
  const [statusSaving, setStatusSaving] = React.useState(false)
  const [statusError, setStatusError] = React.useState<string | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [form, setForm] = React.useState(emptyCostForm)
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'saving' | 'error'>('idle')
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [isGeneratingAvenant, setIsGeneratingAvenant] = React.useState(false)
  const [avenantError, setAvenantError] = React.useState<string | null>(null)
  const [invoiceModalOpen, setInvoiceModalOpen] = React.useState(false)
  const [reportModalOpen, setReportModalOpen] = React.useState(false)
  const [orderModalOpen, setOrderModalOpen] = React.useState(false)
  const [pendingReport, setPendingReport] = React.useState<{
    updateId: string
    progressPct: number | null
    text: string
  } | null>(null)
  const [viewingReport, setViewingReport] = React.useState<ProjectUpdateRow | null>(null)
  const [journalWarning, setJournalWarning] = React.useState<string | null>(null)
  const fetchedFor = React.useRef<string | null>(null)
  // Refs, not the adjacent state checks alone — see SatisfactionPage.tsx's
  // doc comment (module 15 deep audit, 2026-10-08). Each handler performs a
  // real write (status change, avenant/change_order creation, cost insert),
  // so a same-tick double-click must not slip through twice (module 20
  // close-out sweep, 2026-10-15).
  const statusSavingRef = React.useRef(false)
  const generatingAvenantRef = React.useRef(false)
  const addingCostRef = React.useRef(false)
  // The profitability-reveal motion moment (§9.2) plays only the FIRST time
  // real data lands in a session — never re-plays on every refetch (e.g.
  // after adding a cost row), which would feel like unnecessary noise on an
  // otherwise-quiet update. State (not a ref read during render) because
  // eslint-plugin-react-hooks's react-hooks/refs rule flags any ref.current
  // access inside the render body, even a read-only one used only to choose
  // an animation prop — the flip itself happens in the effect below, once,
  // after the first real paint.
  const [revealPlayed, setRevealPlayed] = React.useState(false)

  const load = React.useCallback(async () => {
    if (!user || !id) return
    setLoadError(null)
    setCostsError(null)
    setUpdatesError(null)
    try {
      const [
        { data: projectData, error: projectError },
        { data: costsData, error: costsErrorResult },
        { data: updatesData, error: updatesErrorResult },
      ] = await Promise.all([
        apiRead((client) =>
          client
            .from('projects')
            .select(
              'id, client_id, source_quote_id, name, status, planned_value_ttc, planned_margin_pct, start_date, end_date, client:clients(name)',
            )
            .eq('id', id)
            .eq('owner_id', user.id)
            .single(),
        ),
        apiRead((client) =>
          client
            .from('project_costs')
            .select('id, cost_type, description, amount, hours, hourly_rate, incurred_at')
            .eq('project_id', id)
            .order('incurred_at', { ascending: false }),
        ),
        apiRead((client) =>
          client
            .from('project_updates')
            .select(
              'id, text_content, progress_pct, input_method, sent_to_client, client_sms_sent_at, created_at',
            )
            .eq('project_id', id)
            .order('created_at', { ascending: false }),
        ),
      ])

      if (projectError) {
        setLoadError(projectError.message)
        return
      }
      setProject(projectData as unknown as ProjectRow)
      // costs/updates each fail independently of the project itself and of
      // each other — neither blanks the page; costs=[] on failure keeps
      // profitability's math well-defined, but costsError still visibly
      // flags that the figures shown are NOT known-complete.
      if (costsErrorResult) {
        setCostsError(costsErrorResult.message)
        setCosts([])
      } else {
        setCosts((costsData as ProjectCostRow[]) ?? [])
      }
      if (updatesErrorResult) {
        setUpdatesError(updatesErrorResult.message)
        setUpdates([])
      } else {
        setUpdates((updatesData as ProjectUpdateRow[]) ?? [])
      }
    } catch (err) {
      setLoadError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }, [user, id])

  React.useEffect(() => {
    if (!user || !id || fetchedFor.current === id) return
    fetchedFor.current = id
    load()
  }, [user, id, load])

  async function handleStatusChange(status: ProjectRow['status']) {
    if (!id || statusSavingRef.current) return
    statusSavingRef.current = true
    setStatusSaving(true)
    setStatusError(null)
    try {
      const { error } = await apiWrite((client) =>
        client.from('projects').update({ status }).eq('id', id),
      )
      if (error) {
        statusSavingRef.current = false
        setStatusSaving(false)
        setStatusError(error.message)
        return
      }
    } catch (err) {
      statusSavingRef.current = false
      setStatusSaving(false)
      setStatusError(err instanceof ApiTimeoutError ? err.message : String(err))
      return
    }
    statusSavingRef.current = false
    setStatusSaving(false)
    load()
  }

  // Avenant generation (docs/03_MasterPrompts.md §10.4 item 2) — creates a
  // DRAFT change_orders row with lines pre-filled from the real overrun
  // breakdown, then navigates to the review/send screen (ChangeOrderReviewPage)
  // where the artisan edits before anything is sent. Nothing here creates a
  // quote — that only happens if/when the artisan explicitly sends from the
  // review screen, reusing the real quote pipeline.
  async function handleGenerateAvenant() {
    if (!user || !id || costs === null || generatingAvenantRef.current) return
    if (costsError) {
      setAvenantError(
        'Impossible de générer un avenant : les coûts réels n’ont pas pu être chargés. Réessaie une fois les coûts rechargés.',
      )
      return
    }
    generatingAvenantRef.current = true
    setAvenantError(null)
    setIsGeneratingAvenant(true)

    const lines = deriveAvenantLines(profitability.overruns, project!.planned_margin_pct)
    try {
      const { data, error } = await apiWrite((client) =>
        client
          .from('change_orders')
          .insert({
            owner_id: user.id,
            project_id: id,
            generated_from_cost_ids: costs.map((c) => c.id),
            lines,
            status: 'draft',
          })
          .select('id')
          .single(),
      )

      generatingAvenantRef.current = false
      setIsGeneratingAvenant(false)
      if (error || !data) {
        setAvenantError(error?.message ?? "Échec de la génération de l'avenant.")
        return
      }
      navigate(`/projects/change-order/${data.id}`)
    } catch (err) {
      generatingAvenantRef.current = false
      setIsGeneratingAvenant(false)
      setAvenantError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }

  async function handleAddCost(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !id || addingCostRef.current) return
    addingCostRef.current = true
    setSaveStatus('saving')
    setSaveError(null)

    const payload = {
      owner_id: user.id,
      project_id: id,
      cost_type: form.cost_type,
      description: form.description,
      amount: form.cost_type === 'labor_hours' ? null : Number(form.amount) || 0,
      hours: form.cost_type === 'labor_hours' ? Number(form.hours) || 0 : null,
      hourly_rate: form.cost_type === 'labor_hours' ? Number(form.hourly_rate) || 38 : null,
      incurred_at: form.incurred_at,
    }

    try {
      const { error } = await apiWrite((client) => client.from('project_costs').insert(payload))
      if (error) {
        addingCostRef.current = false
        setSaveStatus('error')
        setSaveError(error.message)
        return
      }

      addingCostRef.current = false
      setSaveStatus('idle')
      setForm(emptyCostForm)
      setFormOpen(false)
      load()
    } catch (err) {
      addingCostRef.current = false
      setSaveStatus('error')
      setSaveError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }

  // Flips once, on the render right after real project data first lands —
  // deferred to a microtask (not called synchronously in the effect body)
  // for the same eslint-plugin-react-hooks/set-state-in-effect reasons as
  // QuoteEditorPage.tsx's step-resume logic elsewhere in this codebase.
  React.useEffect(() => {
    if (project && !revealPlayed) queueMicrotask(() => setRevealPlayed(true))
  }, [project, revealPlayed])

  // Hook must be called unconditionally (before any early return) to satisfy
  // the Rules of Hooks.
  const showSkeleton = useMinDuration(!project || costs === null)

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <InlineError message={loadError} onRetry={load} />
      </div>
    )
  }

  // Loading state sized to the eventual profitability-block shape (§2.8's
  // explicit "avoid layout shift on load" rule) — the reveal motion moment
  // only plays once real data has genuinely arrived, never over a skeleton.
  if (showSkeleton) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
        <Skeleton className="mb-4 h-4 w-16 rounded-xs" />
        <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <Skeleton className="h-7 w-56 rounded-xs" />
            <Skeleton className="mt-1 h-3.5 w-36 rounded-xs opacity-70" />
          </div>
          <Skeleton className="h-6 w-24 rounded-pill" />
        </div>

        {/* Profitability summary card skeleton */}
        <div className="mb-6 rounded-md border border-divider/30 bg-surface/90 p-5 shadow-raised">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-20 rounded-xs opacity-60" />
              <Skeleton className="h-6 w-24 rounded-xs" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-20 rounded-xs opacity-60" />
              <Skeleton className="h-6 w-24 rounded-xs" />
            </div>
            <div className="col-span-2 sm:col-span-1 flex flex-col gap-1.5">
              <Skeleton className="h-3 w-24 rounded-xs opacity-60" />
              <Skeleton className="h-6 w-28 rounded-xs" />
            </div>
          </div>
        </div>

        {/* Tab pills skeleton */}
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-28 shrink-0 rounded-pill" />
          ))}
        </div>

        {/* Content card skeleton */}
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-divider/30 bg-surface/80 p-5 shadow-flat">
            <Skeleton className="mb-4 h-5 w-40 rounded-xs" />
            <div className="flex flex-col gap-2.5">
              <Skeleton className="h-10 w-full rounded-xs" />
              <Skeleton className="h-10 w-full rounded-xs" />
              <Skeleton className="h-10 w-full rounded-xs" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // useMinDuration holds `showSkeleton` true slightly longer than the raw
  // `!project || costs === null` check it wraps, so TypeScript can no longer
  // narrow either variable from the branch above alone — always true in
  // practice by the time we get here, needed only to satisfy strict-null-checks.
  if (!project || costs === null) return null

  const profitability = calculateProjectProfitability(project, costs)
  const isFirstReveal = !revealPlayed

  const hasOverruns = profitability.gapPoints !== null && profitability.gapPoints < 0

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
      <button
        type="button"
        onClick={() => navigate('/quotes')}
        className="mb-4 flex w-fit items-center gap-1.5 text-[13px] font-bold text-text-mid outline-none transition-colors hover:text-text-hi focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg"
      >
        <ArrowLeft size={16} strokeWidth={2.5} />
        Devis
      </button>

      <div className="mb-3">
        <h1 className="font-serif text-[22px] font-black text-text-hi">{project.name}</h1>
        {project.client ? (
          <p className="mt-0.5 text-[13px] text-text-mid">Client : {project.client.name}</p>
        ) : null}
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

      {/* Action and status rows */}
      <div className="mb-4 flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STATUS_LABELS) as ProjectRow['status'][]).map((s) => {
            const isSelected = project.status === s
            return (
              <button
                key={s}
                type="button"
                disabled={statusSaving}
                onClick={() => handleStatusChange(s)}
                className={`rounded-pill px-3 py-1.5 text-[11px] font-bold outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg disabled:opacity-40 ${
                  isSelected
                    ? 'bg-brand-700 text-white shadow-raised'
                    : 'border border-divider/60 bg-surface text-text-mid hover:border-brand-500/50 hover:text-text-hi'
                }`}
              >
                {STATUS_LABELS[s]}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setReportModalOpen(true)}>
            <Mic size={16} strokeWidth={2.5} />
            Rapport
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setInvoiceModalOpen(true)}>
            <FileText size={16} strokeWidth={2.5} />
            Facturer
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOrderModalOpen(true)}>
            <Package size={16} strokeWidth={2.5} />
            Commander
          </Button>
        </div>
      </div>

      {statusError ? <InlineError message={statusError} className="mb-4" /> : null}

      {costsError ? (
        <InlineError
          message={`Coûts non chargés — les chiffres ci-dessous sont incomplets : ${costsError}`}
          onRetry={load}
          className="mb-4"
        />
      ) : null}

      {/* "Ce que ce chantier te rapporte" — docs/01_ScopeDocument.md §5.9's
      three-level reading, wired to the MarginBox extended variant. */}
      <motion.div
        initial={isFirstReveal && !prefersReducedMotion ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      >
        <MarginBox
          marginPct={profitability.realMarginPct ?? 0}
          animateReveal={isFirstReveal}
          extended={{
            plannedMarginPct: project.planned_margin_pct,
            remainingAmountLabel: `Il te reste ${profitability.remainingAmount.toFixed(2)} € une fois tout payé.`,
          }}
        />
      </motion.div>

      <div className="mt-3 flex flex-col gap-1.5 rounded-card border border-divider/60 bg-surface p-4 text-[13px] shadow-raised">
        <div className="flex justify-between">
          <span className="text-text-mid">Facturé au client</span>
          <span className="font-mono tabular-nums font-bold text-text-hi">
            {profitability.billedTtc.toFixed(2)} €
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-mid">Fournitures</span>
          <span className="font-mono tabular-nums font-bold text-text-hi">
            − {profitability.totalSupplyCost.toFixed(2)} €
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-mid">Main d’oeuvre</span>
          <span className="font-mono tabular-nums font-bold text-text-hi">
            − {profitability.totalLaborCost.toFixed(2)} €
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-mid">Divers</span>
          <span className="font-mono tabular-nums font-bold text-text-hi">
            − {profitability.totalMiscCost.toFixed(2)} €
          </span>
        </div>
      </div>

      {profitability.overruns.length > 0 ? (
        <div className="mt-3 rounded-card border border-divider/60 bg-surface p-4 shadow-raised">
          <h2 className="mb-2.5 text-[13px] font-bold tracking-[0.05em] text-text-mid uppercase">
            Ce qui a mangé la marge
          </h2>
          <ul className="flex flex-col gap-2">
            {profitability.overruns.map((item, i) => (
              <motion.li
                key={i}
                initial={isFirstReveal && !prefersReducedMotion ? { opacity: 0, x: -8 } : false}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: 0.3 + i * 0.04 }}
                className="flex items-start justify-between gap-3 rounded-card border border-divider/40 bg-page-bg/40 p-2.5 text-[13px]"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-text-hi">{item.description}</span>
                  <span className="ml-1.5 whitespace-nowrap text-[11px] text-text-low">
                    ({COST_TYPE_LABELS[item.cost_type]})
                  </span>
                </div>
                <span className="shrink-0 font-mono tabular-nums font-bold text-error-text">
                  {item.cost.toFixed(2)} €
                </span>
              </motion.li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasOverruns ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.35 }}
          className="mt-3"
        >
          {avenantError ? <InlineError message={avenantError} className="mb-3" /> : null}
          <Button
            variant="urgent"
            disabled={isGeneratingAvenant || !isOnline || !!costsError}
            onClick={handleGenerateAvenant}
          >
            <Wrench size={16} strokeWidth={2} />
            {isGeneratingAvenant ? 'Génération...' : 'Générer un avenant'}
          </Button>
        </motion.div>
      ) : null}

      <section className="mt-6 rounded-card border border-divider/60 bg-surface p-4 shadow-raised">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-[13px] font-bold tracking-[0.05em] text-text-mid uppercase">
            <Wallet size={14} strokeWidth={2.5} className="text-brand-500" />
            Coûts réels
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setFormOpen(true)} disabled={!isOnline}>
            <Plus size={16} strokeWidth={2.5} />
            Ajouter
          </Button>
        </div>

        {costs.length === 0 ? (
          <EmptyState
            icon={<Wallet size={36} strokeWidth={1.5} />}
            heading="Aucun coût enregistré"
            description="Ajoute les fournitures, heures et frais divers au fur et à mesure du chantier."
            className="mt-2"
          />
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {costs.map((cost) => (
              <li
                key={cost.id}
                className="flex items-center justify-between gap-3 rounded-card border border-divider/40 bg-page-bg/40 p-3 text-[13px]"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-text-hi">{cost.description}</div>
                  <div className="mt-0.5 text-[11px] text-text-low">
                    {COST_TYPE_LABELS[cost.cost_type]} ·{' '}
                    {new Date(cost.incurred_at).toLocaleDateString('fr-FR')}
                  </div>
                </div>
                <span className="shrink-0 font-mono tabular-nums font-bold text-text-hi">
                  {lineCostLabel(cost)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 rounded-card border border-divider/60 bg-surface p-4 shadow-raised">
        <h2 className="flex items-center gap-1.5 text-[13px] font-bold tracking-[0.05em] text-text-mid uppercase">
          <FileText size={14} strokeWidth={2.5} className="text-brand-500" />
          Notes et rapports
        </h2>
        {updatesError ? (
          <InlineError
            message={`Notes et rapports non chargés : ${updatesError}`}
            onRetry={load}
            className="mt-3"
          />
        ) : null}
        {updates.length === 0 ? (
          <EmptyState
            icon={<FileText size={36} strokeWidth={1.5} />}
            heading="Aucune note pour l'instant"
            description="Les rapports dictés ou saisis pour ce chantier apparaîtront ici."
            className="mt-2"
          />
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {updates.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => setViewingReport(u)}
                  className="w-full rounded-card border border-divider/40 bg-page-bg/40 p-3 text-left text-[13px] outline-none transition-all hover:border-brand-500/60 focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  <p className="line-clamp-2 text-text-hi">{u.text_content}</p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-text-low">
                    <span>{new Date(u.created_at).toLocaleString('fr-FR')}</span>
                    {u.progress_pct !== null ? <span>· {u.progress_pct}%</span> : null}
                    {u.sent_to_client ? (
                      <span className="font-bold text-brand-500">· Envoyé au client</span>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {formOpen ? (
        <Modal
          onClose={() => setFormOpen(false)}
          labelledBy="add-cost-modal-title"
          panelClassName="max-w-sm gap-3"
        >
          <form onSubmit={handleAddCost} className="flex flex-col gap-3">
            <h2
              id="add-cost-modal-title"
              className="font-serif text-[18px] font-black text-text-hi"
            >
              Ajouter un coût
            </h2>

            <div className="flex gap-2">
              {(Object.keys(COST_TYPE_LABELS) as ProjectCostInput['cost_type'][]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, cost_type: t }))}
                  className={`h-10 flex-1 rounded-sm border-[1.5px] text-[12px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                    form.cost_type === t
                      ? 'border-brand-500 bg-brand-700 text-white'
                      : 'border-divider bg-surface text-text-hi'
                  }`}
                >
                  {COST_TYPE_LABELS[t]}
                </button>
              ))}
            </div>

            <Input
              label="Description"
              required
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />

            {form.cost_type === 'labor_hours' ? (
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Heures"
                  type="number"
                  step="0.5"
                  inputMode="decimal"
                  required
                  value={form.hours}
                  onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                />
                <Input
                  label="Taux horaire (€)"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={form.hourly_rate}
                  onChange={(e) => setForm((f) => ({ ...f, hourly_rate: e.target.value }))}
                />
              </div>
            ) : (
              <Input
                label="Montant (€)"
                type="number"
                step="0.01"
                inputMode="decimal"
                required
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            )}

            <Input
              label="Date"
              type="date"
              required
              value={form.incurred_at}
              onChange={(e) => setForm((f) => ({ ...f, incurred_at: e.target.value }))}
            />

            {saveStatus === 'error' && saveError ? <InlineError message={saveError} /> : null}

            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant="ghost"
                className="flex-1"
                onClick={() => setFormOpen(false)}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="flex-1"
                disabled={saveStatus === 'saving' || !isOnline}
              >
                {saveStatus === 'saving' ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {invoiceModalOpen ? (
        <InvoiceCreateModal
          quoteId={project.source_quote_id}
          clientId={project.client_id}
          projectId={project.id}
          totalTtc={project.planned_value_ttc}
          onClose={() => setInvoiceModalOpen(false)}
          onCreated={(_invoiceId, journalWarning) => {
            setInvoiceModalOpen(false)
            navigate('/invoices', { state: journalWarning ? { journalWarning } : undefined })
          }}
        />
      ) : null}

      {reportModalOpen ? (
        <ReportModal
          projectId={project.id}
          onClose={() => setReportModalOpen(false)}
          onSaved={(result) => {
            setReportModalOpen(false)
            load()
            if (result.notifyClient) {
              setPendingReport({
                updateId: result.updateId,
                progressPct: result.progressPct,
                text: result.text,
              })
            }
          }}
        />
      ) : null}

      {orderModalOpen ? (
        <OrderModal
          projectId={project.id}
          quoteId={project.source_quote_id}
          onClose={() => setOrderModalOpen(false)}
          onCreated={() => {
            setOrderModalOpen(false)
            navigate('/orders')
          }}
        />
      ) : null}

      {pendingReport && project.client ? (
        <ConfirmSendReportModal
          updateId={pendingReport.updateId}
          clientId={project.client_id}
          projectId={project.id}
          clientName={project.client.name}
          progressPct={pendingReport.progressPct}
          summaryText={pendingReport.text}
          onClose={() => setPendingReport(null)}
          onSent={(warning) => {
            setPendingReport(null)
            setJournalWarning(warning ?? null)
            load()
          }}
        />
      ) : null}

      {viewingReport ? (
        <ReportViewModal
          report={viewingReport as ReportViewData}
          onClose={() => setViewingReport(null)}
        />
      ) : null}
    </div>
  )
}

function lineCostLabel(cost: ProjectCostRow): string {
  if (cost.cost_type === 'labor_hours') {
    const total = (cost.hours ?? 0) * (cost.hourly_rate ?? 38)
    return `${cost.hours}h × ${cost.hourly_rate}€ = ${total.toFixed(2)} €`
  }
  return `${(cost.amount ?? 0).toFixed(2)} €`
}

import * as React from 'react'
import { AlertTriangle, Banknote, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineError } from '@/components/ui/InlineError'
import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useMinDuration } from '@/hooks/useMinDuration'
import { apiRead, ApiTimeoutError } from '@/lib/apiClient'
import { FinancingModal } from './FinancingModal'

type Partner = 'eco_ptz' | 'domofinance' | 'franfinance' | 'sofinco'

const PARTNER_LABELS: Record<Partner, string> = {
  eco_ptz: 'éco-PTZ',
  domofinance: 'Domofinance',
  franfinance: 'Franfinance',
  sofinco: 'Sofinco',
}

interface ClientOption {
  id: string
  name: string
}

interface SimulationRow {
  id: string
  partner: Partner
  amount: number
  term_months: number
  monthly_payment: number
  sent_to_client: boolean
  created_at: string
  // Real, required FK (migration 0010) — previously fetched nowhere and
  // rendered nowhere, so with more than one client having simulations this
  // list was genuinely ambiguous: no way to tell which 580 €/mois row
  // belonged to which client (module 14 deep audit, 2026-10-07).
  client: { name: string } | null
}

/**
 * s-financeurs — Financement. docs/03_MasterPrompts.md §13.8,
 * docs/01_ScopeDocument.md §5.15. Partner list, PROMINENT indicative-only
 * disclosure (never small print — a direct legal-caution requirement, the
 * exact defect the master prompt names as something to correct, not
 * reproduce), a real deterministic simulation, send-to-client action.
 */
export default function FinancingPage() {
  const { user } = useAuth()
  const [clients, setClients] = React.useState<ClientOption[] | null>(null)
  const [simulations, setSimulations] = React.useState<SimulationRow[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [modalOpen, setModalOpen] = React.useState(false)
  const [journalWarning, setJournalWarning] = React.useState<string | null>(null)
  const fetchedFor = React.useRef<string | null>(null)

  const load = React.useCallback(async () => {
    if (!user) return
    setLoadError(null)
    let clientsData, clientsError, simsData
    try {
      ;[{ data: clientsData, error: clientsError }, { data: simsData }] = await Promise.all([
        apiRead((client) =>
          client.from('clients').select('id, name').eq('owner_id', user.id).eq('status', 'active'),
        ),
        apiRead((client) =>
          client
            .from('financing_simulations')
            .select(
              'id, partner, amount, term_months, monthly_payment, sent_to_client, created_at, client:clients(name)',
            )
            .eq('owner_id', user.id)
            .order('created_at', { ascending: false }),
        ),
      ])
    } catch (err) {
      setLoadError(err instanceof ApiTimeoutError ? err.message : String(err))
      return
    }
    if (clientsError) {
      setLoadError(clientsError.message)
      return
    }
    setClients((clientsData as ClientOption[]) ?? [])
    setSimulations((simsData as unknown as SimulationRow[]) ?? [])
  }, [user])

  React.useEffect(() => {
    if (!user || fetchedFor.current === user.id) return
    fetchedFor.current = user.id
    load()
  }, [user, load])

  // Hook must be called unconditionally (before any early return) to satisfy
  // the Rules of Hooks.
  const showSkeleton = useMinDuration(clients === null || simulations === null)

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
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-44 rounded-xs" />
            <Skeleton className="mt-1 h-3.5 w-72 rounded-xs opacity-70" />
          </div>
          <Skeleton className="h-9 w-32 rounded-sm" />
        </div>
        <div className="mb-6 rounded-md border border-divider/30 bg-surface/90 p-4 shadow-flat">
          <Skeleton className="h-4 w-full rounded-xs" />
        </div>
        <div className="flex flex-col gap-3">
          <SkeletonRow count={3} />
        </div>
      </div>
    )
  }

  // useMinDuration holds `showSkeleton` true slightly longer than the raw
  // nullable check it wraps, so TypeScript can no longer narrow these
  // variables from the branch above alone — always true in practice by the
  // time we get here, needed only to satisfy strict-null-checks.
  if (clients === null || simulations === null) return null

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-[26px] font-black text-text-hi">Financement</h1>
          <p className="mt-1 text-[13px] text-text-mid">
            Simulations indicatives et propositions partenaires pour tes clients.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setModalOpen(true)}
          disabled={clients.length === 0}
        >
          <Plus size={16} strokeWidth={2.5} />
          Nouvelle simulation
        </Button>
      </div>

      {/* PROMINENT indicative-only disclosure — deliberately styled as a
      top-of-page, impossible-to-miss banner, never a small-print footnote.
      Given distinctly MORE visual weight than the dismissible journalWarning
      below (thicker border, solid icon chip, no dismiss affordance) since
      this one is a permanent legal-posture fixture, not a transient notice —
      visually conflating the two undersells how important this disclosure is
      (16.7 audit, 2026-10-06). */}
      <div className="mb-5 flex items-center gap-3.5 rounded-2xl border-2 border-gold-500 bg-gold-100 p-4.5 text-[13px] font-bold text-gold-tint-text shadow-raised">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-500 text-white shadow-sm">
          <AlertTriangle size={20} strokeWidth={2.4} />
        </span>
        <span className="leading-[1.5]">
          Simulation indicative uniquement — les taux affichés sont des exemples, pas les taux réels
          des partenaires. Ne constitue pas une offre de financement.
        </span>
      </div>

      {journalWarning ? (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-gold-400/50 bg-gold-100 p-4 text-[13px] font-bold text-gold-tint-text shadow-raised">
          <AlertTriangle size={18} strokeWidth={2.2} className="mt-0.5 shrink-0 text-gold-600" />
          <span className="flex-1 leading-[1.5]">{journalWarning}</span>
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

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-text-low mr-1">
          Partenaires :
        </span>
        {(Object.keys(PARTNER_LABELS) as Partner[]).map((p) => (
          <span
            key={p}
            className="rounded-pill border border-divider/40 bg-surface px-3 py-1 text-[11.5px] font-bold text-text-mid shadow-xs"
          >
            {PARTNER_LABELS[p]}
          </span>
        ))}
      </div>

      {clients.length === 0 ? (
        <p className="mb-6 rounded-xl border border-divider/40 bg-surface/50 p-3.5 text-[12.5px] text-text-mid">
          Ajoute un client actif pour pouvoir créer une simulation de financement.
        </p>
      ) : null}

      {simulations.length === 0 ? (
        <EmptyState
          icon={<Banknote size={40} strokeWidth={1.5} />}
          heading="Aucune simulation pour l'instant"
          description="Crée une première simulation indicative pour aider ton client à financer son projet."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {simulations.map((sim) => (
            <li
              key={sim.id}
              className="flex flex-col gap-2 rounded-2xl border border-divider/60 bg-surface p-4 shadow-raised hover:shadow-floating transition-all"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[14px] font-extrabold text-text-hi">
                  {sim.client?.name ?? 'Client'}
                </span>
                <span className="font-mono text-[11.5px] tabular-nums text-text-low">
                  {new Date(sim.created_at).toLocaleDateString('fr-FR')}
                </span>
              </div>
              <span className="w-fit rounded-pill bg-brand-100 px-2.5 py-0.5 text-[11px] font-extrabold text-brand-900 uppercase">
                {PARTNER_LABELS[sim.partner]}
              </span>

              <div className="flex items-baseline justify-between gap-4 mt-1">
                <div>
                  <span className="font-mono text-[18px] font-bold tabular-nums text-text-hi">
                    {sim.amount.toFixed(2)} €
                  </span>
                  <span className="ml-1.5 text-[12.5px] text-text-mid">sur {sim.term_months} mois</span>
                </div>
                <div className="text-right">
                  <span className="text-[12px] text-text-mid">Mensualité : </span>
                  <span className="font-mono text-[16px] font-bold tabular-nums text-brand-300">
                    {sim.monthly_payment.toFixed(2)} €/m
                  </span>
                </div>
              </div>

              {sim.sent_to_client ? (
                <div className="mt-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-success-text">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
                  Envoyée au client
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {modalOpen ? (
        <FinancingModal
          clients={clients}
          onClose={() => setModalOpen(false)}
          onSaved={(warning) => {
            setModalOpen(false)
            setJournalWarning(warning ?? null)
            load()
          }}
        />
      ) : null}
    </div>
  )
}


import * as React from 'react'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { InlineError } from '@/components/ui/InlineError'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useMinDuration } from '@/hooks/useMinDuration'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { apiRead, apiWrite, ApiTimeoutError } from '@/lib/apiClient'
import { calculateQuoteTotals } from '@/lib/calc/quoteTotals'
import { useQuoteEditor } from '@/features/quotes/useQuoteEditor'
import type { ProposedAvenantLine } from './avenantLines'

interface ChangeOrderRow {
  id: string
  project_id: string
  lines: ProposedAvenantLine[]
  status: 'draft' | 'sent' | 'accepted' | 'declined'
  resulting_quote_id: string | null
}

interface ProjectSummary {
  client_id: string
  name: string
}

/**
 * Avenant review/send — docs/03_MasterPrompts.md §10.4 items 2-3. Shows the
 * change_orders draft's pre-filled lines (editable before send, never
 * auto-sent), and on "Envoyer l'avenant" creates a REAL supplementary quotes
 * row using the SAME quote creation pipeline as any other quote
 * (useQuoteEditor's own createDraft/addLine — the exact functions
 * QuoteStepClient/QuoteStepDevis call, not a reimplementation), then
 * navigates into the normal quote editor so the artisan continues through
 * the identical Devis/Envoyer/issuance flow — same calculation, versioning,
 * and PDF generation guarantees as any other quote, per the master prompt's
 * explicit "do not build a second, parallel quote-creation code path" rule.
 */
export default function ChangeOrderReviewPage() {
  const { changeOrderId } = useParams<{ changeOrderId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const isOnline = useOnlineStatus()
  // Mounted with no quoteId — this is exactly the same hook instance shape
  // /quotes/new uses before a client is picked; createDraft/addLine below are
  // its real, shared implementation.
  const editor = useQuoteEditor(undefined)

  const [changeOrder, setChangeOrder] = React.useState<ChangeOrderRow | null>(null)
  const [project, setProject] = React.useState<ProjectSummary | null>(null)
  const [lines, setLines] = React.useState<ProposedAvenantLine[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [sendStatus, setSendStatus] = React.useState<'idle' | 'sending' | 'error'>('idle')
  const [sendError, setSendError] = React.useState<string | null>(null)
  // These lines are generated from EVERY real cost row logged on the
  // project, not a true delta against the original quote (the data model
  // has no "planned cost per category" to compare against — see
  // avenantLines.ts/projectProfitability.ts doc comments). Without an
  // explicit checkbox, an artisan could send an avenant that re-bills a
  // client for costs their original devis already covered, having simply
  // not noticed a pre-filled line didn't belong (module 7 deep audit,
  // 2026-10-07).
  const [reviewConfirmed, setReviewConfirmed] = React.useState(false)
  const fetchedFor = React.useRef<string | null>(null)
  // A ref, not a state check — see SatisfactionPage.tsx's doc comment
  // (module 15 deep audit, 2026-10-08): a state-only guard can still be
  // beaten by two click handlers firing in the same React batch.
  const sendingRef = React.useRef(false)

  const load = React.useCallback(async () => {
    if (!user || !changeOrderId) return
    setLoadError(null)
    try {
      const { data, error } = await apiRead((client) =>
        client
          .from('change_orders')
          .select('id, project_id, lines, status, resulting_quote_id')
          .eq('id', changeOrderId)
          .eq('owner_id', user.id)
          .single(),
      )
      if (error || !data) {
        setLoadError(error?.message ?? 'Avenant introuvable.')
        return
      }
      const row = data as ChangeOrderRow
      setChangeOrder(row)
      setLines(row.lines)

      const { data: projectData } = await apiRead((client) =>
        client.from('projects').select('client_id, name').eq('id', row.project_id).single(),
      )
      setProject(projectData as ProjectSummary)
    } catch (err) {
      setLoadError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }, [user, changeOrderId])

  React.useEffect(() => {
    if (!user || !changeOrderId || fetchedFor.current === changeOrderId) return
    fetchedFor.current = changeOrderId
    load()
  }, [user, changeOrderId, load])

  function updateLine(index: number, patch: Partial<ProposedAvenantLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSend() {
    if (!changeOrder || !project || lines.length === 0 || sendingRef.current) return
    sendingRef.current = true
    setSendStatus('sending')
    setSendError(null)

    // Reuse the real pipeline: createDraft (same function QuoteStepClient
    // calls) then addLine per proposed line (same function QuoteStepDevis
    // calls) — this quote will go through the exact same editor UI,
    // quote-recalculate math, and quote-issue PDF pipeline as any other.
    const { id: newQuoteId, error: createError } = await editor.createDraft(project.client_id)
    if (createError || !newQuoteId) {
      sendingRef.current = false
      setSendStatus('error')
      setSendError(createError ?? 'Échec de la création du devis.')
      return
    }

    for (const line of lines) {
      const { error: lineError } = await editor.addLine({
        designation: line.designation,
        unit: line.unit,
        quantity: line.quantity,
        unit_price: line.unit_price,
        purchase_price: line.purchase_price,
      })
      if (lineError) {
        sendingRef.current = false
        setSendStatus('error')
        setSendError(lineError)
        return
      }
    }

    try {
      const { error: updateError } = await apiWrite((client) =>
        client
          .from('change_orders')
          .update({ status: 'sent', resulting_quote_id: newQuoteId })
          .eq('id', changeOrder.id),
      )
      if (updateError) {
        sendingRef.current = false
        setSendStatus('error')
        setSendError(updateError.message)
        return
      }
    } catch (err) {
      sendingRef.current = false
      setSendStatus('error')
      setSendError(err instanceof ApiTimeoutError ? err.message : String(err))
      return
    }

    // Hand off to the real quote editor — the artisan continues through the
    // exact same Travaux/Devis/Envoyer steps and issuance flow as any quote.
    navigate(`/quotes/${newQuoteId}/edit`, { replace: true })
  }

  // Hook must be called unconditionally (before any early return) to satisfy
  // the Rules of Hooks.
  const showSkeleton = useMinDuration(!changeOrder || !project)

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
        <Skeleton className="mb-4 h-4 w-16 rounded-xs" />
        <Skeleton className="mb-2 h-7 w-48 rounded-xs" />
        <Skeleton className="mb-6 h-4 w-64 rounded-xs opacity-70" />
        <div className="mb-6 rounded-md border border-divider/30 bg-surface/90 p-5 shadow-raised">
          <Skeleton className="mb-4 h-5 w-36 rounded-xs" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-12 w-full rounded-sm" />
            <Skeleton className="h-12 w-full rounded-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Skeleton className="h-10 w-28 rounded-sm" />
          <Skeleton className="h-10 w-36 rounded-sm" />
        </div>
      </div>
    )
  }

  // useMinDuration holds `showSkeleton` true slightly longer than the raw
  // nullable check it wraps, so TypeScript can no longer narrow these
  // variables from the branch above alone — always true in practice by the
  // time we get here, needed only to satisfy strict-null-checks.
  if (!changeOrder || !project) return null

  if (changeOrder.status !== 'draft') {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-[15px] font-bold text-text-hi">
          Cet avenant a déjà été envoyé
          {changeOrder.resulting_quote_id ? ' — retrouve-le dans tes devis.' : '.'}
        </p>
        {changeOrder.resulting_quote_id ? (
          <Button
            variant="primary"
            onClick={() => navigate(`/quotes/${changeOrder.resulting_quote_id}/edit`)}
          >
            Voir le devis
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => navigate(`/projects/${changeOrder.project_id}`)}>
            Retour au chantier
          </Button>
        )}
      </div>
    )
  }

  // Canonical totals (same module/rounding rule as every other quote-total
  // figure, docs/06_AIPromptRegistry.md §3.1) — VAT rate hardcoded to 20 to
  // match exactly what useQuoteEditor.createDraft actually persists on the
  // real quote this avenant becomes on send (see handleSend above); showing
  // a different rate here would make this preview diverge from the quote
  // the artisan ends up reviewing next.
  const totals = calculateQuoteTotals(
    lines.map((l) => ({
      quantity: l.quantity,
      unit_price: l.unit_price,
      purchase_price: l.purchase_price,
    })),
    20,
  )

  return (
    // <main> (Step 14.7 item 7 fix): this screen bypasses AppShell (its own
    // focused avenant flow, no persistent nav shell), so it needs its own
    // landmark rather than relying on AppShell's.
    <main className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
      <button
        type="button"
        onClick={() => navigate(`/projects/${changeOrder.project_id}`)}
        className="mb-4 flex w-fit items-center gap-1.5 text-[13px] font-bold text-text-mid outline-none transition-colors hover:text-text-hi focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg"
      >
        <ArrowLeft size={16} strokeWidth={2.5} />
        Chantier
      </button>

      <div className="mb-4">
        <h1 className="font-serif text-[22px] font-black text-text-hi">
          Avenant — {project.name}
        </h1>
        <p className="mt-0.5 text-[13px] text-text-mid">
          Lignes générées à partir de TOUS les coûts réels enregistrés sur ce chantier — pas
          seulement les dépassements au-delà du devis initial. Vérifie et supprime toute ligne déjà
          couverte par le devis d'origine avant d'envoyer, pour ne pas refacturer un coût que le
          client a déjà payé.
        </p>
      </div>

      <motion.ul
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.24 }}
        className="flex flex-col gap-3"
      >
        {lines.map((line, i) => (
          <motion.li
            key={i}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.04 }}
            className="rounded-card border border-divider/60 bg-surface p-4 shadow-raised"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <Input
                label="Désignation"
                value={line.designation}
                onChange={(e) => updateLine(i, { designation: e.target.value })}
                wrapperClassName="flex-1"
              />
              <button
                type="button"
                onClick={() => removeLine(i)}
                // 44x44px minimum touch target (field-use with gloves) — the icon
                // itself stays 18px, padding pads the hit area out to spec.
                className="mt-6 flex h-11 w-11 shrink-0 items-center justify-center rounded-card text-error-text outline-none transition-colors hover:bg-error-bg/20 focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                aria-label="Supprimer cette ligne"
              >
                <Trash2 size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Quantité"
                type="number"
                step="0.01"
                value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: Number(e.target.value) || 0 })}
              />
              <Input
                label="Prix de vente (€)"
                type="number"
                step="0.01"
                value={line.unit_price}
                onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) || 0 })}
              />
            </div>
          </motion.li>
        ))}
      </motion.ul>

      {lines.length === 0 ? (
        <p className="rounded-card border border-divider/40 bg-recessed py-8 text-center text-[13px] text-text-mid">
          Aucune ligne — reviens au chantier pour recommencer cet avenant si besoin.
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-1.5 rounded-card border border-divider/60 bg-surface p-4 text-[13px] shadow-raised">
        <div className="flex justify-between">
          <span className="text-text-mid">Sous-total HT</span>
          <span className="font-mono tabular-nums font-bold text-text-hi">
            {totals.subtotal_ht.toFixed(2)} €
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-mid">TVA (20%)</span>
          <span className="font-mono tabular-nums font-bold text-text-hi">
            {totals.vat_amount.toFixed(2)} €
          </span>
        </div>
        <div className="mt-1 flex justify-between border-t border-divider/40 pt-2 text-[15px]">
          <span className="font-extrabold text-text-hi">Total TTC</span>
          <span className="font-mono tabular-nums font-black text-text-hi">
            {totals.total_ttc.toFixed(2)} €
          </span>
        </div>
      </div>

      {sendStatus === 'error' && sendError ? (
        <InlineError message={sendError} className="mt-4" />
      ) : null}
      {!isOnline ? (
        <div className="mt-4 rounded-card border border-divider/40 bg-recessed px-3.5 py-2.5 text-center text-[12px] font-bold text-text-mid">
          Hors ligne — l'envoi nécessite une connexion internet.
        </div>
      ) : null}

      {lines.length > 0 ? (
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-card border border-divider/60 bg-recessed p-3.5 text-[12.5px] font-medium text-text-mid select-none">
          <input
            type="checkbox"
            checked={reviewConfirmed}
            onChange={(e) => setReviewConfirmed(e.target.checked)}
            className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-xs border-[1.5px] border-divider bg-surface text-brand-500 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-recessed"
          />
          <span>
            J'ai vérifié chaque ligne ci-dessus et supprimé celles déjà couvertes par le devis
            d'origine — je ne refacture pas un coût que le client a déjà payé.
          </span>
        </label>
      ) : null}

      <Button
        variant="primary"
        className="mt-4"
        disabled={sendStatus === 'sending' || !isOnline || lines.length === 0 || !reviewConfirmed}
        onClick={handleSend}
      >
        {sendStatus === 'sending' ? 'Création du devis...' : "Envoyer l'avenant"}
      </Button>
    </main>
  )
}

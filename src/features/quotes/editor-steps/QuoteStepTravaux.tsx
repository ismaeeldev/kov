import * as React from 'react'
import { Sparkles } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { InlineError } from '@/components/ui/InlineError'
import { apiWrite } from '@/lib/apiClient'
import { calculateQuoteTotals } from '@/lib/calc/quoteTotals'
import type { useQuoteEditor } from '../useQuoteEditor'

interface ProposedLine {
  catalogue_item_id: string | null
  matched_label: string
  suggested_quantity: number | null
  unit: string
  confidence: number
  needs_clarification: boolean
}

interface DraftAssistResult {
  proposed_lines: ProposedLine[]
  clarification_questions: string[]
  unmatched_notes: string[]
}

interface QuoteStepTravauxProps {
  editor: ReturnType<typeof useQuoteEditor>
  description: string
  onChangeDescription: (value: string) => void
  onBack: () => void
  onNext: () => void
}

/**
 * Step 2 — Travaux — docs/04_ApplicationFlow.md §2.5, docs/03_MasterPrompts.md
 * §9.3. Free-text description entry + "Assister avec l'IA," calling
 * supabase/functions/quote-draft-assist (docs/06_AIPromptRegistry.md §2.1).
 *
 * KOV-FR-008 hard requirement: nothing is written to quote_lines
 * automatically — every proposed line requires an explicit "Ajouter" (or
 * "Ajouter tout") action, and the manual line-entry path in the Devis step
 * remains fully usable regardless of this call's state (in flight, failed,
 * or never attempted).
 *
 * Motion (docs/02_ThemeGuideline.md §9.1/§9.2): the "Kōv réfléchit..." state
 * uses the agent-purple pulsing-ring treatment (§9.2's "Dictation active
 * state" moment — same visual language as any other Kōv-thinking indicator),
 * the proposed-lines panel staggers in 40ms/item (§9.1 rule 4, "stagger,
 * don't dump"), and applying a line plays a brief settle flash so the
 * artisan can visibly track which lines they've already pulled in —
 * `AnimatePresence`/Framer `layout` throughout so removals/insertions never
 * hard-cut. All of it degrades to an instant state change under
 * `prefers-reduced-motion` via each `motion.*` element's own `transition`
 * being skipped by Framer automatically when the OS setting is on (Framer's
 * built-in reduced-motion handling, already enabled app-wide via
 * `<MotionConfig reducedMotion="user">` in main.tsx).
 */
export function QuoteStepTravaux({
  editor,
  description,
  onChangeDescription,
  onBack,
  onNext,
}: QuoteStepTravauxProps) {
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<DraftAssistResult | null>(null)
  const [appliedIds, setAppliedIds] = React.useState<Set<number>>(new Set())
  const [justAppliedId, setJustAppliedId] = React.useState<number | null>(null)
  // `appliedIds` state is only set AFTER a line's write succeeds, so it can't
  // guard the in-flight window — a fast double-click on the same proposed
  // line (or applyAll racing a manual click on the same index) could insert
  // it twice. A ref, checked synchronously per-index, actually closes that
  // window (module 20 close-out sweep, 2026-10-15).
  const applyingIndicesRef = React.useRef<Set<number>>(new Set())
  // Framer's MotionConfig reducedMotion="user" does not reliably suppress
  // infinite-repeat loop animations (confirmed live: the pulse ring's scale
  // loop kept animating under prefers-reduced-motion even with that config
  // set app-wide) — explicit useReducedMotion() + a branch is the correct
  // pattern here, matching QuoteStepEnvoyer.tsx's GSAP sweep animation.
  const prefersReducedMotion = useReducedMotion()
  // Same stale-closure gap as above: `status === 'loading'` is only checked
  // via the disabled prop, which reads state that hasn't committed yet on a
  // genuine same-tick double-click (module 20 close-out sweep, 2026-10-15).
  const assistingRef = React.useRef(false)

  async function handleAssist() {
    if (assistingRef.current) return
    assistingRef.current = true
    setStatus('loading')
    setError(null)
    setResult(null)
    setAppliedIds(new Set())

    try {
      const { data, error: fnError } = await apiWrite((client) =>
        client.functions.invoke('quote-draft-assist', {
          body: { quoteId: editor.quote?.id, description },
        }),
      )

      if (fnError) {
        assistingRef.current = false
        setStatus('error')
        setError(
          "L'assistant IA est momentanément indisponible. Tu peux continuer à ajouter tes lignes manuellement à l'étape suivante.",
        )
        return
      }

      assistingRef.current = false
      setResult(data as DraftAssistResult)
      setStatus('idle')
    } catch {
      assistingRef.current = false
      setStatus('error')
      setError(
        "L'assistant IA est momentanément indisponible. Tu peux continuer à ajouter tes lignes manuellement à l'étape suivante.",
      )
    }
  }

  async function applyLine(line: ProposedLine, index: number) {
    if (line.catalogue_item_id === null) return // needs_clarification lines are never auto-priced
    if (applyingIndicesRef.current.has(index)) return
    applyingIndicesRef.current.add(index)
    const { data: priceItem } = await editor.findPriceItemById(line.catalogue_item_id)
    if (!priceItem) {
      applyingIndicesRef.current.delete(index)
      return
    }

    // The applied line's unit_price/purchase_price come from the MATCHED
    // price_items row, never from the AI's text output — that output has no
    // price field to begin with (docs/06_AIPromptRegistry.md §2.1).
    const result = await editor.addLine({
      designation: priceItem.label,
      unit: priceItem.unit,
      quantity: line.suggested_quantity ?? 1,
      unit_price: priceItem.sale_price,
      purchase_price: priceItem.purchase_price,
      price_item_id: priceItem.id,
    })
    if (result.error) {
      applyingIndicesRef.current.delete(index)
      setError(result.error)
      return
    }
    applyingIndicesRef.current.delete(index)
    setAppliedIds((prev) => new Set(prev).add(index))
    setJustAppliedId(index)
    setTimeout(() => setJustAppliedId((current) => (current === index ? null : current)), 600)

    // Persist totals right away rather than leaving quotes.subtotal_ht/
    // total_ttc/projected_margin_pct stale until the Devis step's own effect
    // happens to run. `editor.lines` is a stale closure here (addLine's
    // setLines hasn't flushed to this render yet), so the newly-added line
    // from `result.line` is appended explicitly rather than re-reading
    // editor.lines after the fact (module 5 deep audit, 2026-10-07 — the
    // wizard currently forces a Devis-step visit before Envoyer, which masks
    // this in practice, but any future shortcut that skips step 2 would
    // otherwise silently desync the persisted total).
    if (editor.quote && result.line) {
      const totals = calculateQuoteTotals(
        [...editor.lines, result.line].map((l) => ({
          quantity: l.quantity,
          unit_price: l.unit_price,
          purchase_price: l.purchase_price,
        })),
        editor.quote.vat_rate,
      )
      await editor.persistTotals({
        subtotal_ht: totals.subtotal_ht,
        total_ttc: totals.total_ttc,
        projected_margin_pct: totals.projected_margin_pct,
      })
    }
  }

  async function applyAll() {
    if (!result) return
    for (let i = 0; i < result.proposed_lines.length; i++) {
      const line = result.proposed_lines[i]
      if (line.catalogue_item_id !== null && !appliedIds.has(i)) {
        await applyLine(line, i)
      }
    }
  }

  const hasApplicableLines = !!result?.proposed_lines.some((l) => l.catalogue_item_id !== null)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-serif text-[22px] font-black text-text-hi">Décrire les travaux</h1>
        <p className="mt-0.5 text-[13px] text-text-mid">
          Décris les travaux à réaliser — tu pourras ensuite ajuster les lignes du devis.
        </p>
      </div>

      <textarea
        rows={6}
        value={description}
        onChange={(e) => onChangeDescription(e.target.value)}
        placeholder="Ex : Remplacement chauffe-eau 200L thermodynamique, pose de deux radiateurs à inertie avec raccordement cuivre et purge..."
        className="w-full rounded-card border-[1.5px] border-divider/60 bg-surface px-4 py-3.5 text-[14px] text-text-hi outline-none transition-all duration-150 placeholder:text-text-low focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg shadow-sm"
      />

      <Button
        variant="agent"
        disabled={status === 'loading' || !description.trim()}
        onClick={handleAssist}
        className="relative overflow-hidden"
      >
        {status === 'loading' ? (
          <>
            {/* Pulsing concentric-ring treatment — §9.2's "Dictation active
            state" moment reused here, purple/agent-accent since this is Kōv
            actively "thinking," the same register as dictating into the
            Agent. Pure Framer keyframes, 1.1s loop — skipped entirely under
            prefers-reduced-motion (a static ring/icon still communicates
            "in progress" via the button's own disabled state + label). */}
            {!prefersReducedMotion ? (
              <motion.span
                className="absolute inset-0 rounded-[inherit] border-2 border-white/50"
                animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'easeOut' }}
                aria-hidden="true"
              />
            ) : null}
            {!prefersReducedMotion ? (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
                className="flex"
              >
                <Sparkles size={16} strokeWidth={2} />
              </motion.span>
            ) : (
              <Sparkles size={16} strokeWidth={2} />
            )}
            Kōv réfléchit...
          </>
        ) : (
          <>
            <Sparkles size={16} strokeWidth={2} />
            Assister avec l'IA
          </>
        )}
      </Button>

      {status === 'error' && error ? <InlineError message={error} onRetry={handleAssist} /> : null}

      <AnimatePresence>
        {result ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.34, 1.56, 0.64, 1] }}
            className="flex flex-col gap-3 rounded-card border border-divider/60 bg-surface p-4 shadow-raised"
          >
            <div className="flex items-center justify-between border-b border-divider/40 pb-2.5">
              <h2 className="text-[13px] font-bold tracking-[0.05em] text-text-mid uppercase">
                Lignes proposées
              </h2>
              {hasApplicableLines ? (
                <Button variant="ghost" size="sm" onClick={applyAll}>
                  Ajouter tout
                </Button>
              ) : null}
            </div>

            {result.proposed_lines.length === 0 ? (
              <p className="py-2 text-[13px] text-text-mid">Aucune ligne proposée.</p>
            ) : (
              result.proposed_lines.map((line, i) => (
                <motion.div
                  key={i}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    backgroundColor:
                      justAppliedId === i
                        ? ['rgba(5,150,105,0.18)', 'rgba(0,0,0,0)']
                        : 'rgba(0,0,0,0)',
                  }}
                  transition={{
                    opacity: { duration: 0.24, delay: i * 0.04 },
                    y: { duration: 0.24, delay: i * 0.04 },
                    backgroundColor: { duration: 0.6, ease: 'easeOut' },
                  }}
                  className={`flex items-center justify-between gap-3 rounded-card border p-3.5 transition-all ${
                    line.needs_clarification
                      ? 'border-gold-500/40 bg-gold-500/[0.08]'
                      : 'border-divider/60 bg-page-bg/40 hover:border-divider'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold text-text-hi">{line.matched_label}</div>
                    <div className="mt-0.5 text-[11px] text-text-mid">
                      {line.needs_clarification
                        ? 'À préciser — non ajoutée automatiquement'
                        : `Confiance ${Math.round(line.confidence * 100)}%`}
                    </div>
                  </div>
                  {!line.needs_clarification && line.catalogue_item_id ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={appliedIds.has(i)}
                      onClick={() => applyLine(line, i)}
                    >
                      {appliedIds.has(i) ? 'Ajoutée ✓' : 'Ajouter'}
                    </Button>
                  ) : null}
                </motion.div>
              ))
            )}

            {result.clarification_questions.length > 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.24, delay: result.proposed_lines.length * 0.04 }}
                className="mt-1 rounded-card border border-gold-500/30 bg-gold-500/[0.08] p-3.5"
              >
                <p className="mb-1 text-[11px] font-bold tracking-[0.05em] text-gold-500 uppercase">
                  Précisions nécessaires
                </p>
                <ul className="list-disc pl-4 text-[13px] text-text-mid space-y-0.5">
                  {result.clarification_questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </motion.div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="mt-2 flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onBack}>
          Retour
        </Button>
        <Button variant="primary" className="flex-1" onClick={onNext}>
          Continuer
        </Button>
      </div>
    </div>
  )
}

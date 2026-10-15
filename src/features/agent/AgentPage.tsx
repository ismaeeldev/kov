import * as React from 'react'
import { ArrowLeft, Mic, Send } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  AgentDictationRings,
  AgentResponseBubble,
  AgentSurface,
  AgentUserBubble,
  IntentConfirmationChip,
  PlanReviewCard,
  type PlanStep as ReviewPlanStep,
} from '@/components/ui/AgentSurface'
import { InlineError } from '@/components/ui/InlineError'
import { useAuth } from '@/hooks/useAuth'
import { useDictation } from '@/hooks/useDictation'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { apiRead, apiWrite, ApiTimeoutError } from '@/lib/apiClient'
import { supabase } from '@/lib/supabase'
import { executePlan, type PlanSteps } from './executePlan'
import { MoEnvoiModal } from './MoEnvoiModal'
import { isPlanExpired } from './planExpiry'

interface FallbackSuggestion {
  label: string
  intent: string
}

interface MatchedEntity {
  id: string | null
  name_as_understood: string
  match_confidence: number
}

interface IntentExtractResult {
  detected_intent: string | null
  intent_confidence: number
  second_best_confidence: number
  matched_client: MatchedEntity
  matched_project: MatchedEntity
  needs_disambiguation: boolean
  fallback_suggestions: FallbackSuggestion[]
}

interface PlanRow {
  id: string
  plan_steps: PlanSteps
  status: string
  created_at: string
}

type ConversationEntry = { kind: 'user'; text: string } | { kind: 'agent'; text: string }

/** Client-side utterance -> intent label map, mirrors the Edge Function's own
 * label choices, used only to render a readable confirmation chip — the
 * actual intent VALUE always comes from the server, never guessed here. */
const INTENT_LABELS: Record<string, string> = {
  rapport_termine: 'Rapport de chantier terminé',
  paiement_recu: 'Paiement reçu',
  relance: 'Relance client',
  impayes: 'Factures impayées',
  conflit_planning: 'Conflit de planning',
  livraison: 'Livraison',
  commande: 'Commande',
  journee: 'Résumé du jour',
  semaine: 'Résumé de la semaine',
  marge: 'Marge',
  retard: 'Retard',
  absence_salarie: "Absence d'un salarié",
  acompte: 'Acompte',
  depense: 'Dépense',
  nouveau_client: 'Nouveau client',
  prospection: 'Prospection',
}

/** AI-unavailable message differentiation — docs/04_ApplicationFlow.md §4's
 * "AI unavailable" row (KOV-FR-008): a timed-out request reads differently
 * from a genuine Edge Function/model failure (e.g. an invalid Anthropic key),
 * so the artisan gets an accurate signal rather than one generic string for
 * every failure mode. Offline is handled separately (the whole input is
 * disabled via isOnline below), so this only needs to split timeout vs other. */
function agentUnavailableMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiTimeoutError) {
    return "La requête a expiré. Vérifie ta connexion et réessaie — ta demande n'a pas été perdue."
  }
  return fallback
}

/**
 * s-agent — Kōv Agent conversation surface. docs/03_MasterPrompts.md §12.3,
 * docs/04_ApplicationFlow.md §2.9. Full-bleed, distraction-free (no AppShell
 * chrome, same posture as the quote-editor wizard) — the flagship
 * differentiator per docs/02_ThemeGuideline.md §6.9 gets its own dedicated
 * surface, never a generic chat window folded into the rest of the app.
 *
 * Voice dictation is intentionally stubbed as text-only this step —
 * src/hooks/useDictation.ts doesn't exist yet (built in Step 13.2 per the
 * master prompt's explicit "stub as text-only for now" instruction); the mic
 * affordance is simply omitted rather than wired to a non-functional no-op.
 */
export default function AgentPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isOnline = useOnlineStatus()
  const dictation = useDictation()
  const prefersReducedMotion = useReducedMotion()

  const [conversation, setConversation] = React.useState<ConversationEntry[]>([])
  const [input, setInput] = React.useState('')
  const [status, setStatus] = React.useState<
    'idle' | 'extracting' | 'generating' | 'executing' | 'executed' | 'error'
  >('idle')
  const [error, setError] = React.useState<string | null>(null)
  const [lastUtterance, setLastUtterance] = React.useState('')
  const [intentResult, setIntentResult] = React.useState<IntentExtractResult | null>(null)
  const [plan, setPlan] = React.useState<PlanRow | null>(null)
  const [removedStepIds, setRemovedStepIds] = React.useState<Set<string>>(new Set())
  const [editedMessages, setEditedMessages] = React.useState<Map<string, string>>(new Map())
  const [readingStepId, setReadingStepId] = React.useState<string | null>(null)
  const [executionSummary, setExecutionSummary] = React.useState<{
    executedCount: number
    journalCount: number
  } | null>(null)
  // docs/02_ThemeGuideline.md §9.2 "Agent plan-approval sequence" — each
  // executed step's row flashes as it completes, in visible sequence, so the
  // artisan can watch each action actually happen rather than see the whole
  // plan vanish at once.
  const [flashedStepIds, setFlashedStepIds] = React.useState<Set<string>>(new Set())
  // Synchronous re-entrancy guard for handleConfirmPlan — a ref updates
  // immediately, unlike `status` (React state), which a true same-tick
  // double-click can still observe as stale until the next render commits.
  // See handleConfirmPlan's own comment for the full story.
  const isExecutingRef = React.useRef(false)
  // Unmount guard for runExecution's own setTimeout-deferred setState calls
  // (the per-step flash + the final summary/conversation update) — found via
  // a stability audit (2026-10-04): navigating away from /agent mid-execution
  // previously left those timers armed, firing setState on an unmounted
  // component (a real React console warning at scale with many users
  // leaving conversations mid-flight, even though each timer is short-lived
  // and self-clearing, not an unbounded leak).
  const isMountedRef = React.useRef(true)
  React.useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  function reset() {
    setIntentResult(null)
    setPlan(null)
    setRemovedStepIds(new Set())
    setEditedMessages(new Map())
    setExecutionSummary(null)
  }

  // Voice input — Step 13.2 item 9's "close the loop" requirement: Step 12.3
  // stubbed the agent's mic as text-only pending src/hooks/useDictation.ts,
  // which now exists. Merges into the editable input field as it arrives,
  // same "never auto-submitted" rule as ReportModal.tsx — the artisan must
  // still explicitly tap Envoyer.
  const lastAppliedAgentTranscript = React.useRef('')
  React.useEffect(() => {
    if (dictation.transcript && dictation.transcript !== lastAppliedAgentTranscript.current) {
      const newPart = dictation.transcript.slice(lastAppliedAgentTranscript.current.length).trim()
      if (newPart) {
        setInput((prev) => (prev ? `${prev} ${newPart}`.trim() : newPart))
      }
      lastAppliedAgentTranscript.current = dictation.transcript
    }
  }, [dictation.transcript])

  function toggleAgentDictation() {
    if (dictation.status === 'listening') {
      dictation.stop()
      return
    }
    dictation.reset()
    lastAppliedAgentTranscript.current = ''
    dictation.start()
  }

  // On-load expiry sweep — docs/03_MasterPrompts.md §12.4 item 6: any of
  // THIS owner's plans left unconfirmed past 24h transitions to 'expired'.
  // Chosen over a scheduled Edge Function for this stage, same posture as
  // Step 11's dunning-level on-load recalculation (UnpaidPage.tsx).
  const expirySweepRan = React.useRef(false)
  React.useEffect(() => {
    if (!user || expirySweepRan.current) return
    expirySweepRan.current = true
    ;(async () => {
      try {
        const { data: staleRows } = await apiRead((client) =>
          client
            .from('agent_action_plans')
            .select('id, created_at')
            .eq('owner_id', user.id)
            .eq('status', 'proposed'),
        )
        const now = new Date()
        const expiredIds = (staleRows ?? [])
          .filter((row) => isPlanExpired(row.created_at, now))
          .map((row) => row.id)
        if (expiredIds.length > 0) {
          await apiWrite((client) =>
            client.from('agent_action_plans').update({ status: 'expired' }).in('id', expiredIds),
          )
        }
      } catch {
        // Best-effort sweep — a failed/timed-out check here silently leaves
        // stale plans to be caught by the defensive re-check in
        // handleConfirmPlan instead, never blocks the surface from loading.
      }
    })()
  }, [user])

  async function handleSend() {
    const utterance = input.trim()
    if (!utterance || !user) return

    setConversation((prev) => [...prev, { kind: 'user', text: utterance }])
    setInput('')
    setLastUtterance(utterance)
    reset()
    setStatus('extracting')
    setError(null)

    const hour = new Date().getHours()
    const timeOfDay: 'morning' | 'evening' = hour >= 5 && hour < 17 ? 'morning' : 'evening'

    let data: unknown
    let fnError: unknown
    try {
      ;({ data, error: fnError } = await apiWrite((client, signal) =>
        client.functions.invoke('agent-intent-extract', {
          body: { utterance, time_of_day: timeOfDay },
          signal,
        }),
      ))
    } catch (err) {
      setStatus('error')
      setError(
        agentUnavailableMessage(
          err,
          "L'agent est momentanément indisponible. Ta demande n'a pas été perdue, tu peux réessayer.",
        ),
      )
      return
    }

    if (fnError || !data) {
      setStatus('error')
      setError(
        "L'agent est momentanément indisponible. Ta demande n'a pas été perdue, tu peux réessayer.",
      )
      return
    }

    const result = data as IntentExtractResult
    setIntentResult(result)

    if (result.needs_disambiguation || !result.detected_intent) {
      setConversation((prev) => [
        ...prev,
        {
          kind: 'agent',
          text: result.matched_client.id
            ? `Tu parles du client ${result.matched_client.name_as_understood} ?`
            : "Je n'ai pas bien compris. Voici ce que je peux faire :",
        },
      ])
      setStatus('idle')
      return
    }

    // High confidence, auto-proceed straight to plan generation.
    setConversation((prev) => [
      ...prev,
      {
        kind: 'agent',
        text: `Compris : ${INTENT_LABELS[result.detected_intent!] ?? result.detected_intent}.`,
      },
    ])
    await generatePlan(result, utterance)
  }

  async function generatePlan(result: IntentExtractResult, utterance: string) {
    if (!result.matched_client.id) {
      setStatus('error')
      setError("Je n'ai pas pu identifier le client concerné. Reformule avec le nom du client ?")
      return
    }
    setStatus('generating')

    let data: unknown
    let fnError: unknown
    try {
      ;({ data, error: fnError } = await apiWrite((client, signal) =>
        client.functions.invoke('agent-plan-generate', {
          body: {
            detected_intent: result.detected_intent,
            matched_client_id: result.matched_client.id,
            matched_project_id: result.matched_project.id,
            source_utterance: utterance,
          },
          signal,
        }),
      ))
    } catch (err) {
      setStatus('error')
      setError(
        agentUnavailableMessage(
          err,
          "L'agent n'a pas pu préparer de plan. Réessaie dans un instant.",
        ),
      )
      return
    }

    if (fnError || !data) {
      setStatus('error')
      setError("L'agent n'a pas pu préparer de plan. Réessaie dans un instant.")
      return
    }

    setPlan(data as PlanRow)
    setStatus('idle')
  }

  function handleFallbackPick(suggestion: FallbackSuggestion) {
    if (!intentResult) return
    const syntheticResult: IntentExtractResult = {
      ...intentResult,
      detected_intent: suggestion.intent,
      needs_disambiguation: false,
    }
    setIntentResult(syntheticResult)
    setConversation((prev) => [...prev, { kind: 'agent', text: `Compris : ${suggestion.label}.` }])
    void generatePlan(syntheticResult, lastUtterance)
  }

  function toggleStep(stepId: string) {
    setRemovedStepIds((prev) => {
      const next = new Set(prev)
      if (next.has(stepId)) next.delete(stepId)
      else next.add(stepId)
      return next
    })
  }

  function handleSaveEditedMessage(stepId: string, text: string) {
    setEditedMessages((prev) => new Map(prev).set(stepId, text))
    setReadingStepId(null)
  }

  async function handleConfirmPlan() {
    if (!plan || !user || !intentResult) return
    // Re-entrancy guard — found via a stability audit (2026-10-04): a
    // genuine rapid double-click could dispatch two click events before
    // React commits the `setStatus('executing')` re-render that disables the
    // confirm button (a plain `disabled` HTML attribute, which only takes
    // effect post-commit) — `status` itself, being React state, can still be
    // read as stale by a second same-tick invocation. `isExecutingRef`
    // updates synchronously and is checked+set before any other statement,
    // closing that gap for real. Without this, both calls passed every
    // earlier guard and both invoked executePlan() against the same plan,
    // producing duplicate journal rows for the same "sent" message — a real
    // double-send record, not just a cosmetic glitch.
    if (isExecutingRef.current) return
    isExecutingRef.current = true

    try {
      // Defensive re-check — belt-and-suspenders alongside the on-load sweep
      // above, in case the plan crossed the 24h window while this exact card
      // sat open in an idle tab. A plan must never execute once expired.
      if (isPlanExpired(plan.created_at)) {
        try {
          await apiWrite((client) =>
            client.from('agent_action_plans').update({ status: 'expired' }).eq('id', plan.id),
          )
        } catch {
          // Best-effort — the plan is treated as expired client-side regardless.
        }
        setStatus('error')
        setError('Ce plan a expiré. Renvoie ta demande pour en générer un nouveau.')
        setPlan(null)
        return
      }

      setStatus('executing')
      setError(null)
      setFlashedStepIds(new Set())
      await runExecution()
    } finally {
      isExecutingRef.current = false
    }
  }

  async function runExecution() {
    if (!plan || !user || !intentResult) return
    try {
      let lastFlashAt = 0
      let lastFlashDelay = 0
      const result = await executePlan(supabase, {
        ownerId: user.id,
        planId: plan.id,
        clientId: intentResult.matched_client.id!,
        projectId: intentResult.matched_project.id,
        plan: plan.plan_steps,
        removedStepIds,
        editedMessages,
        onStepExecuted: (stepResult) => {
          if (!stepResult.executed) return
          // A minimum gap between flashes even when the real writes resolve
          // faster than that — otherwise a fast connection makes every step
          // flash in the same frame, defeating the "watch it happen one
          // after another" point of this moment (§9.1 rule 1: the animation
          // must actually communicate the state change, not just decorate it).
          const now = Date.now()
          const delay = Math.max(0, 220 - (now - lastFlashAt))
          lastFlashAt = now + delay
          lastFlashDelay = delay
          setTimeout(() => {
            if (!isMountedRef.current) return
            setFlashedStepIds((prev) => new Set(prev).add(stepResult.step_id))
          }, delay)
        },
      })
      const executedCount = result.results.filter((r) => r.executed).length
      const journalCount = result.results.filter((r) => r.journalRowId !== null).length
      // Hold on the flashing plan-review card until the LAST scheduled flash
      // has genuinely fired — otherwise the summary card would swap in while
      // a flash is still pending, cutting the sequence short.
      await new Promise((resolve) => setTimeout(resolve, lastFlashDelay + 260))
      if (!isMountedRef.current) return
      setExecutionSummary({ executedCount, journalCount })
      setStatus('executed')
      setConversation((prev) => [
        ...prev,
        {
          kind: 'agent',
          text: `Fait — ${executedCount} action${executedCount > 1 ? 's' : ''} exécutée${executedCount > 1 ? 's' : ''}.`,
        },
      ])
    } catch (err) {
      if (!isMountedRef.current) return
      setStatus('error')
      setError("Une erreur est survenue pendant l'exécution du plan. " + String(err))
    }
  }

  async function handleCancelPlan() {
    if (!plan) return
    try {
      await apiWrite((client) =>
        client.from('agent_action_plans').update({ status: 'dismissed' }).eq('id', plan.id),
      )
    } catch {
      // Best-effort — the review card is dismissed client-side regardless;
      // a stale 'proposed' row is still caught by the expiry sweep/re-check.
    }
    reset()
    setConversation((prev) => [
      ...prev,
      { kind: 'agent', text: 'Plan annulé — rien n’a été envoyé.' },
    ])
  }

  // PlanReviewCard's onReadMessage is a single card-level callback shown on
  // EVERY row (it has no per-step eligibility concept) — since "Lire le
  // message" only makes sense for send_message steps (§6.9's "per
  // outbound-message step" wording), the affordance is embedded directly
  // inside each step's own description instead of using that card-level
  // prop, which is intentionally left unset below.
  const reviewSteps: ReviewPlanStep[] = React.useMemo(() => {
    if (!plan) return []
    return plan.plan_steps.steps.map((step) => ({
      id: step.step_id,
      removable: step.removable,
      description: (
        <span className="relative flex items-center gap-2">
          <span className="flex-1">
            {step.description}
            {editedMessages.has(step.step_id) ? (
              <span className="ml-1.5 text-[10px] font-bold text-brand-700 uppercase">
                (modifié)
              </span>
            ) : null}
          </span>
          {step.step_type === 'send_message' ? (
            <button
              type="button"
              onClick={() => setReadingStepId(step.step_id)}
              className="shrink-0 rounded-xs text-[12px] font-bold text-brand-500 underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            >
              Lire le message
            </button>
          ) : null}
          {/* §9.2 "Agent plan-approval sequence" execution flash — a thin
          green underline sweeps left-to-right as this specific step
          completes, so each action's completion is individually visible
          rather than the whole plan resolving at once. */}
          {flashedStepIds.has(step.step_id) ? (
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.32, ease: 'easeOut' }}
              style={{ originX: 0 }}
              className="absolute right-0 bottom-[-6px] left-0 h-0.5 bg-margin-green"
              aria-hidden="true"
            />
          ) : null}
        </span>
      ),
    }))
  }, [plan, editedMessages, flashedStepIds])

  const readingStep = plan?.plan_steps.steps.find((s) => s.step_id === readingStepId) ?? null
  // Stability audit fix (2026-10-04): `executing` was missing from the
  // input/mic/submit disabled conditions below — a user could type and send
  // a brand-new message while a plan was still mid-execution, which raced
  // the in-flight handleConfirmPlan's own eventual setStatus/setConversation
  // calls against the new message's handleSend/generatePlan flow, visibly
  // corrupting conversation order or flipping status back unexpectedly.
  const isAgentBusy = status === 'extracting' || status === 'generating' || status === 'executing'

  return (
    <AgentSurface className="min-h-screen">
      {/* Desktop layout fix (found via a live UI survey, 2026-09-26): at
      1024px+ this screen previously stretched the mobile chat layout
      full-bleed with no centering/max-width — a single narrow bubble column
      pinned top-left of a huge empty gradient, and a full-width input bar
      with nothing connecting the two. Centers the whole conversation into a
      readable column (matching the rest of the app's lg:max-w-[1200px]
      convention, but narrower here since a chat column shouldn't stretch
      that wide).
      Motion/premium-register re-audit (docs/02_ThemeGuideline.md §1/§9,
      2026-09-26): the first texture pass (10%/8% opacity radial gradients)
      was too faint to register as real depth against a screenshot — bumped
      to genuinely visible mesh-gradient layers plus a soft rotating conic
      sheen, still strictly within the locked agent-purple palette (no new
      hue introduced), aria-hidden and never intercepting pointer events. */}
      {/* Desktop ambient depth and layered mesh gradients */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 hidden lg:block"
        style={{
          backgroundImage:
            'radial-gradient(circle at 14% 18%, rgba(255,255,255,0.22), transparent 42%), radial-gradient(circle at 86% 82%, rgba(255,255,255,0.16), transparent 38%), radial-gradient(circle at 50% 95%, rgba(124,58,237,0.4), transparent 55%)',
        }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 hidden lg:block"
        style={{
          backgroundImage:
            'conic-gradient(from 180deg at 50% 50%, transparent 0deg, rgba(255,255,255,0.06) 90deg, transparent 180deg, rgba(255,255,255,0.05) 270deg, transparent 360deg)',
        }}
        animate={prefersReducedMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
      />

      <div className="relative mx-auto flex w-full flex-1 flex-col lg:max-w-[720px] lg:px-6">
        <div className="flex items-center justify-between px-4 pt-6 pb-2 lg:px-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-white/80 outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-agent-700"
              aria-label="Retour"
            >
              <ArrowLeft size={20} strokeWidth={2} />
            </button>
            <div className="flex items-center gap-2.5">
              <h1 className="font-serif text-[20px] font-black text-white">Agent Kōv</h1>
              <div className="flex items-center gap-1.5 rounded-pill border border-white/25 bg-white/10 px-2.5 py-0.5 text-[10.5px] font-extrabold tracking-wider text-white/90 uppercase">
                <span className="h-1.5 w-1.5 rounded-full bg-margin-green shadow-sm animate-pulse" />
                <span>Assistant IA</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 lg:px-0">
          {conversation.length === 0 ? (
            <>
              {/* Idle-state watermark — a single large decorative glyph */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 hidden items-center justify-center font-serif text-[420px] leading-none font-black text-white/5 select-none lg:flex"
              >
                k
              </span>
              <AgentResponseBubble>
                Dis-moi ce qu'il se passe — un rapport de chantier, une relance, une dépense... Je
                m'occupe du reste.
              </AgentResponseBubble>

              {/* Quick suggestion prompt chips */}
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  'Rapport de chantier du jour',
                  'Relancer mes devis en attente',
                  'Faire le point sur mes impayés',
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      setInput(prompt)
                    }}
                    className="rounded-pill border border-white/20 bg-white/10 px-3.5 py-1.5 text-[12.5px] font-bold text-white/90 shadow-sm backdrop-blur-md transition-all hover:bg-white/20 hover:border-white/40 active:scale-95 text-left"
                  >
                    ✨ {prompt}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {conversation.map((entry, i) =>
            entry.kind === 'user' ? (
              <AgentUserBubble key={i}>{entry.text}</AgentUserBubble>
            ) : (
              <AgentResponseBubble key={i}>{entry.text}</AgentResponseBubble>
            ),
          )}

          {status === 'extracting' || status === 'generating' ? (
            <AgentResponseBubble>
              <span className="flex items-center gap-2.5">
                <span className="flex items-center gap-1" aria-hidden="true">
                  <span className="h-1.5 w-1.5 animate-agent-thinking rounded-full bg-gold-500 [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-agent-thinking rounded-full bg-gold-500 [animation-delay:160ms]" />
                  <span className="h-1.5 w-1.5 animate-agent-thinking rounded-full bg-gold-500 [animation-delay:320ms]" />
                </span>
                <span>{status === 'extracting' ? 'Kōv réfléchit...' : 'Préparation du plan...'}</span>
              </span>
            </AgentResponseBubble>
          ) : null}

          {intentResult?.needs_disambiguation ? (
            <div className="flex flex-col items-start gap-2.5">
              {intentResult.matched_client.id ? (
                <IntentConfirmationChip needsDisambiguation>
                  Client : {intentResult.matched_client.name_as_understood}
                </IntentConfirmationChip>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {intentResult.fallback_suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleFallbackPick(s)}
                    className="rounded-pill border border-white/30 bg-white/15 px-4 py-2 text-[13px] font-semibold text-white shadow-sm outline-none backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/25 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-agent-700"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {status === 'error' && error ? (
            <InlineError message={error} onRetry={() => setStatus('idle')} />
          ) : null}

          <AnimatePresence>
            {plan && status !== 'executed' ? (
              <PlanReviewCard
                planSummary={plan.plan_steps.plan_summary}
                steps={reviewSteps}
                removedStepIds={removedStepIds}
                onToggleStep={toggleStep}
                onConfirm={handleConfirmPlan}
                onCancel={handleCancelPlan}
                confirmDisabled={status === 'executing' || !isOnline}
              />
            ) : null}
          </AnimatePresence>

          {status === 'executed' && executionSummary ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-white/40 bg-white/95 p-5 text-noir-900 shadow-modal backdrop-blur-xl"
            >
              <p className="font-serif text-[16px] font-bold text-noir-900">
                {executionSummary.executedCount} action{executionSummary.executedCount > 1 ? 's' : ''}{' '}
                exécutée{executionSummary.executedCount > 1 ? 's' : ''}.
              </p>
              {executionSummary.journalCount > 0 ? (
                <p className="mt-1 text-[13px] text-noir-700">
                  {executionSummary.journalCount} entrée
                  {executionSummary.journalCount > 1 ? 's' : ''} ajoutée
                  {executionSummary.journalCount > 1 ? 's' : ''} à la main courante.
                </p>
              ) : null}
            </motion.div>
          ) : null}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSend()
          }}
          className="flex items-center gap-2 border-t border-white/10 bg-noir-900/60 p-3 backdrop-blur-xl lg:mx-0 lg:mb-6 lg:rounded-pill lg:border lg:border-white/20 lg:bg-noir-900/40 lg:px-2.5 lg:py-2 lg:shadow-agent-glow"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Écris ou dicte ta demande..."
            disabled={isAgentBusy || !isOnline}
            className="h-12 flex-1 rounded-pill bg-white/10 px-4 text-[15px] text-white placeholder:text-white/50 outline-none focus:bg-white/15 lg:bg-transparent"
          />
          {dictation.isSupported ? (
            <button
              type="button"
              onClick={toggleAgentDictation}
              disabled={isAgentBusy || !isOnline}
              aria-label={
                dictation.status === 'listening' ? 'Arrêter la dictée' : 'Démarrer la dictée'
              }
              className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 text-white outline-none transition-all hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-agent-700 disabled:opacity-40"
            >
              <AgentDictationRings active={dictation.status === 'listening'} />
              <Mic size={18} strokeWidth={2.25} className="relative z-10" />
            </button>
          ) : null}
          <button
            type="submit"
            disabled={!input.trim() || isAgentBusy || !isOnline}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-agent-700 shadow-raised outline-none transition-all hover:bg-white/90 active:scale-95 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-agent-700 disabled:opacity-40"
            aria-label="Envoyer"
          >
            <Send size={18} strokeWidth={2.25} />
          </button>
        </form>
      </div>

      {readingStep ? (
        <MoEnvoiModal
          step={readingStep}
          currentText={editedMessages.get(readingStep.step_id) ?? readingStep.message_text ?? ''}
          onSave={(text) => handleSaveEditedMessage(readingStep.step_id, text)}
          onClose={() => setReadingStepId(null)}
        />
      ) : null}
    </AgentSurface>
  )
}


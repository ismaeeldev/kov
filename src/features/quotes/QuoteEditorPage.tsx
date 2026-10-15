import * as React from 'react'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { InlineError } from '@/components/ui/InlineError'
import { Skeleton } from '@/components/ui/Skeleton'
import { useMinDuration } from '@/hooks/useMinDuration'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { QuoteStepClient } from './editor-steps/QuoteStepClient'
import { QuoteStepTravaux } from './editor-steps/QuoteStepTravaux'
import { QuoteStepDevis } from './editor-steps/QuoteStepDevis'
import { QuoteStepEnvoyer } from './editor-steps/QuoteStepEnvoyer'
import { IssuedQuoteView } from './IssuedQuoteView'
import { useQuoteEditor } from './useQuoteEditor'

const STEP_LABELS = ['Client', 'Travaux', 'Devis', 'Envoyer'] as const

/**
 * Quote editor — s-new-devis, docs/03_MasterPrompts.md §8.3, exact four-step
 * flow per docs/04_ApplicationFlow.md §2.5: Client -> Travaux -> Devis ->
 * Envoyer. Draft auto-saves on every field blur/commit (each step persists
 * directly via useQuoteEditor, never held only in local state).
 */
export default function QuoteEditorPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const isOnline = useOnlineStatus()
  const editor = useQuoteEditor(id)
  const [step, setStep] = React.useState(0)
  const [travauxDescription, setTravauxDescription] = React.useState('')
  const hasResumedStep = React.useRef(false)
  const stepHeadingRef = React.useRef<HTMLDivElement>(null)

  // WCAG AA fix (Step 14.5): without this, advancing/going back through the
  // wizard silently left focus on the now-unmounted Suivant/Retour button,
  // resetting toward <body> — a keyboard/screen-reader user got no signal
  // the step actually changed. Deliberately NOT skipped on the very first
  // render: an earlier version tried to skip it there (reasoning that the
  // resumed-step effect below souldn't steal focus from wherever the page
  // itself just received it), but that guard broke a much more common path —
  // creating a brand-new quote fully remounts this page at /quotes/:newId/edit
  // (QuoteStepClient's onCreated -> navigate(..., {replace:true})), which
  // resets `step` to 0 and makes the very next resume-to-step-1 change look
  // identical to the harmless silent-refresh-resume case, permanently
  // stranding focus on <body> — found live via a real Playwright keyboard
  // pass (10 consecutive Tab presses did nothing). Always focusing here,
  // including on the resumed-mid-wizard-reload case, is the safer default.
  React.useEffect(() => {
    stepHeadingRef.current?.focus()
  }, [step])

  // Reopening an existing draft (e.g. from the quotes list, or a page
  // refresh) must resume at a sensible step, not always restart the whole
  // wizard at Client — found via live testing: navigating directly to
  // /quotes/:id/edit for a quote that already has a client and lines landed
  // back on step 0 every time. Since travaux's free-text description isn't
  // itself persisted (no column for it — see the comment on QuoteStepTravaux),
  // the best available signal is what's actually been saved so far: a client
  // means step 0 is done, at least one line means Travaux is also done.
  React.useEffect(() => {
    if (hasResumedStep.current || editor.isLoading || !editor.quote) return
    hasResumedStep.current = true
    const resumeStep = editor.lines.length > 0 ? 2 : editor.quote.client_id ? 1 : 0
    if (resumeStep === 0) return
    // Deferred to a microtask rather than called synchronously in the effect
    // body — same reasoning as ProtectedRoute.tsx/useOwnerRecord.ts's async
    // .then()-based updates: eslint-plugin-react-hooks's set-state-in-effect
    // rule flags any synchronous setState call inside an effect, even a
    // one-time resume like this one.
    queueMicrotask(() => setStep(resumeStep))
  }, [editor.isLoading, editor.quote, editor.lines.length])

  // A quote in any non-draft status must never be mutated in place —
  // docs/05_DataModel.md §2.7's explicit rule. Editing one opens a fresh
  // draft copy instead (KOV-FR-006/010) — full implementation of copy-on-
  // edit is Step 9/10 scope (issuance + versioning); for now this step
  // simply refuses to render the editable form for a non-draft quote and
  // points back to the read-only list, rather than silently allowing edits
  // that would violate the immutable-version rule.
  const isEditableDraft = !editor.quote || editor.quote.status === 'draft'

  // Hook must be called unconditionally (before any early return) to satisfy
  // the Rules of Hooks.
  const showSkeleton = useMinDuration(editor.isLoading)

  if (showSkeleton) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
        <Skeleton className="mb-6 h-8 w-44 rounded-xs" />
        <div className="mb-6 flex items-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-1 items-center gap-2">
              <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
              <Skeleton className="hidden h-3 w-16 sm:inline rounded-xs" />
              {i < 3 ? <div className="h-px flex-1 bg-divider" /> : null}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full rounded-sm" />
          <Skeleton className="h-44 w-full rounded-sm" />
        </div>
      </div>
    )
  }

  if (editor.loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <InlineError message={editor.loadError} onRetry={editor.reload} />
      </div>
    )
  }

  if (!isEditableDraft && editor.quote) {
    return (
      <IssuedQuoteView
        quote={editor.quote}
        onReopened={() => {
          hasResumedStep.current = false
          setStep(2) // resume straight into Devis, the most likely edit target
          editor.reload()
        }}
        onQuoteChanged={() => editor.reload()}
      />
    )
  }

  return (
    // <main> (Step 14.7 item 7 fix): this screen bypasses AppShell (its own
    // 4-step wizard nav takes over instead of the persistent shell), so it
    // needs its own landmark rather than relying on AppShell's.
    <main className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
      {/* FAB morph target (§9.2) — this circle shares the mobile FAB's
      layoutId, so Framer animates it growing/repositioning from the FAB's
      on-screen position into this header on mount, rather than the wizard
      simply appearing with no connection to where the tap originated. Only
      relevant for a genuinely NEW quote (id === undefined) — resuming an
      existing draft (/quotes/:id/edit) was never opened via the FAB tap, so
      there's no origin to morph from; render a plain static circle there
      instead (no layoutId, so no animation is attempted). */}
      <motion.div
        layoutId={id ? undefined : 'quote-fab'}
        className="mb-3 flex h-11 w-11 items-center justify-center self-center rounded-full bg-brand-500 text-white shadow-accent-glow lg:hidden"
        aria-hidden="true"
      >
        <Plus size={20} strokeWidth={2.25} />
      </motion.div>

      <div className="mb-6 flex items-center gap-2">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold transition-colors duration-150 ${
                i === step
                  ? 'bg-brand-700 text-white shadow-xs'
                  : i < step
                    ? 'bg-margin-green text-white'
                    : 'bg-recessed text-text-low'
              }`}
            >
              {i + 1}
            </div>
            <span
              className={`hidden text-[12px] font-bold tracking-[0.02em] sm:inline transition-colors duration-150 ${i === step ? 'text-text-hi' : i < step ? 'text-text-mid' : 'text-text-low'}`}
            >
              {label}
            </span>
            {i < STEP_LABELS.length - 1 ? <div className="h-px flex-1 bg-divider" /> : null}
          </div>
        ))}
      </div>

      {!isOnline ? (
        <div className="mb-4 rounded-sm bg-recessed px-3 py-2 text-center text-[12px] font-bold text-text-mid">
          Hors ligne — les modifications ne peuvent pas être enregistrées tant que la connexion
          n'est pas rétablie.
        </div>
      ) : null}

      {/* tabIndex={-1}: not a tab stop, only a programmatic focus target so
      screen readers announce the new step's content when it's moved to. */}
      <div ref={stepHeadingRef} tabIndex={-1} className="outline-none">
        {step === 0 ? (
          <QuoteStepClient
            editor={editor}
            onNext={() => setStep(1)}
            isOnline={isOnline}
            onCreated={(newId) => navigate(`/quotes/${newId}/edit`, { replace: true })}
          />
        ) : null}
        {step === 1 ? (
          <QuoteStepTravaux
            editor={editor}
            description={travauxDescription}
            onChangeDescription={setTravauxDescription}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        ) : null}
        {step === 2 ? (
          <QuoteStepDevis
            editor={editor}
            isOnline={isOnline}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        ) : null}
        {step === 3 ? <QuoteStepEnvoyer editor={editor} onBack={() => setStep(2)} /> : null}
      </div>
    </main>
  )
}

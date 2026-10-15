import * as React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { HelpCircle, X } from 'lucide-react'
import { SendGuardBanner } from '@/components/ui/SendGuardBanner'
import { cn } from '@/lib/utils'

/**
 * Kōv Agent conversation surface — docs/02_ThemeGuideline.md §6.9.
 * The flagship differentiator (Cahier §6.5) gets a visually distinct,
 * unmistakable surface, NEVER styled as a generic chat window. Every element
 * here is purple/agent-accented, strictly separate from the brand steel-blue
 * used everywhere else in the app.
 */

/** Full-bleed gradient background container the agent conversation opens into.
 * Renders as <main> (Step 14.7 item 7 fix) — AgentPage.tsx (the only real
 * caller) bypasses AppShell entirely, so this is the correct place for the
 * landmark-one-main requirement rather than AppShell's own <main>. */
function AgentSurface({ className, children, ...props }: React.ComponentProps<'main'>) {
  return (
    <main
      data-slot="agent-surface"
      className={cn(
        'relative flex min-h-full flex-col overflow-x-hidden bg-[image:var(--gradient-agent)] text-white selection:bg-agent-500/40 selection:text-white',
        className,
      )}
      {...props}
    >
      {/* Background texture overlay — subtle noise/dot matrix pattern */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.9) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />
      {children}
    </main>
  )
}

/** User input bubble — translucent dark chip with glass effect, right-aligned. */
function AgentUserBubble({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="ml-auto max-w-[85%]"
    >
      <div
        data-slot="agent-user-bubble"
        className={cn(
          'rounded-2xl rounded-tr-xs border border-white/10 bg-noir-900/55 px-4 py-3 text-[14.5px] leading-[1.55] font-medium text-white shadow-raised backdrop-blur-md',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </motion.div>
  )
}

/** Agent response bubble — translucent light chip, left-aligned, with a glyph avatar. */
function AgentResponseBubble({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="flex items-start gap-2.5"
    >
      <div
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-white/30 to-white/10 text-[13px] font-black text-white shadow-sm"
        aria-hidden="true"
      >
        k
      </div>
      <div
        data-slot="agent-response-bubble"
        className={cn(
          'max-w-[85%] rounded-2xl rounded-tl-xs border border-white/15 bg-white/15 px-4 py-3 text-[14.5px] leading-[1.55] text-white shadow-raised backdrop-blur-md',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </motion.div>
  )
}

/**
 * Understood-intent confirmation chip. Uses the gold accent (never the
 * default white/purple chip styling) to signal "please confirm."
 */
function IntentConfirmationChip({
  className,
  needsDisambiguation,
  children,
  ...props
}: React.ComponentProps<'div'> & { needsDisambiguation?: boolean }) {
  return (
    <div
      data-slot="intent-confirmation-chip"
      className={cn(
        // WCAG AA fix (Step 14.5): text-agent-chip-text passes at every point along the gradient.
        'inline-flex items-center gap-2 rounded-pill border border-gold-400/50 bg-gold-500/20 px-4 py-2 text-[13px] font-bold text-agent-chip-text shadow-sm backdrop-blur-md',
        className,
      )}
      {...props}
    >
      {children}
      {needsDisambiguation ? (
        <HelpCircle size={14} strokeWidth={2.5} className="shrink-0 text-gold-300" aria-hidden="true" />
      ) : null}
    </div>
  )
}

export interface PlanStep {
  id: string
  description: React.ReactNode
  removable?: boolean
}

export interface PlanReviewCardProps {
  planSummary: React.ReactNode
  steps: PlanStep[]
  removedStepIds: Set<string>
  onToggleStep: (id: string) => void
  onReadMessage?: (id: string) => void
  onConfirm: () => void
  onCancel: () => void
  /** Disables the confirm action only — e.g. while offline or already executing.
   * Cancel always stays available. */
  confirmDisabled?: boolean
}

/**
 * Action-plan-review card — a separate, higher-contrast near-opaque card
 * floating over the gradient. Each step individually removable, persistent
 * "Rien n'est envoyé avant validation" banner, "Lire le message" expand
 * affordance per outbound-message step. This is the direct implementation of
 * KOV-FR-014's core trust guarantee — never let a step execute without this
 * card's explicit confirm action.
 */
function PlanReviewCard({
  planSummary,
  steps,
  removedStepIds,
  onToggleStep,
  onReadMessage,
  onConfirm,
  onCancel,
  confirmDisabled = false,
}: PlanReviewCardProps) {
  return (
    <motion.div
      data-slot="plan-review-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
      className="rounded-2xl border border-white/40 bg-white/95 p-5 text-noir-900 shadow-modal backdrop-blur-xl"
    >
      <div className="flex items-center justify-between gap-2 border-b border-noir-200/60 pb-3">
        <p className="font-serif text-[16px] font-bold leading-snug text-noir-900">{planSummary}</p>
        <span className="rounded-pill bg-agent-100 px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide text-agent-900 uppercase">
          Plan d'action
        </span>
      </div>

      <ul className="mt-3.5 flex flex-col gap-2.5">
        {steps.map((step, index) => {
          const isRemoved = removedStepIds.has(step.id)
          return (
            <motion.li
              key={step.id}
              initial={{ opacity: 0, scaleY: 0.92 }}
              animate={{ opacity: 1, scaleY: 1 }}
              transition={{ duration: 0.18, delay: index * 0.12, ease: [0.34, 1.56, 0.64, 1] }}
              className={cn(
                'flex items-center gap-3 rounded-xl border border-noir-200/80 bg-noir-50/90 px-3.5 py-3 transition-colors',
                isRemoved && 'opacity-40 grayscale line-through',
              )}
            >
              <span className="flex-1 text-[13.5px] font-medium leading-[1.5] text-noir-900">
                {step.description}
              </span>
              {onReadMessage ? (
                <button
                  type="button"
                  onClick={() => onReadMessage(step.id)}
                  className="shrink-0 rounded-xs text-[12px] font-bold text-brand-700 underline underline-offset-2 outline-none hover:text-brand-900 focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-recessed"
                >
                  Lire le message
                </button>
              ) : null}
              {step.removable !== false ? (
                <button
                  type="button"
                  onClick={() => onToggleStep(step.id)}
                  aria-label={isRemoved ? 'Rétablir cette étape' : 'Retirer cette étape'}
                  className="shrink-0 rounded-full p-2 text-noir-400 outline-none transition-colors hover:bg-noir-200/70 hover:text-noir-900 focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-recessed"
                >
                  <X size={15} strokeWidth={2.2} />
                </button>
              ) : null}
            </motion.li>
          )
        })}
      </ul>

      <SendGuardBanner
        className="mt-4"
        variant="agent"
        confirmLabel="OUI, confirmer"
        onConfirm={onConfirm}
        onCancel={onCancel}
        confirmDisabled={confirmDisabled}
      />
    </motion.div>
  )
}

/** Pulsing concentric rings for the voice-active/dictation state — agent-purple variant. */
function AgentDictationRings({ active }: { active: boolean }) {
  const prefersReducedMotion = useReducedMotion()
  if (!active) return null

  if (prefersReducedMotion) {
    return (
      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <span className="absolute h-16 w-16 rounded-full border-2 border-agent-300 opacity-40" />
      </span>
    )
  }

  return (
    <span
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      aria-hidden="true"
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute rounded-full border-2 border-agent-300"
          initial={{ width: 40, height: 40, opacity: 0.6 }}
          animate={{ width: 100, height: 100, opacity: 0 }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.35, ease: 'easeOut' }}
        />
      ))}
    </span>
  )
}

export {
  AgentSurface,
  AgentUserBubble,
  AgentResponseBubble,
  IntentConfirmationChip,
  PlanReviewCard,
  AgentDictationRings,
}


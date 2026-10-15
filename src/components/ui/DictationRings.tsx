import { motion, useReducedMotion } from 'framer-motion'

/**
 * Pulsing concentric rings for the voice-active/dictation state —
 * docs/02_ThemeGuideline.md §9.2. Two color variants: steel-blue for
 * report/notes dictation (this component), purple/agent for the Kōv Agent
 * (AgentSurface.tsx's AgentDictationRings, kept separate since it's already
 * built and consumed there — not worth a risky refactor of working code to
 * merge them for this step).
 *
 * Unlike AgentDictationRings, this variant respects prefers-reduced-motion —
 * an infinite-repeat Framer animation does NOT stop under the app-wide
 * MotionConfig reducedMotion="user" wrapper alone (a known, previously-fixed
 * bug pattern in this codebase, e.g. QuoteStepTravaux.tsx) — an explicit
 * useReducedMotion() check + static fallback is required for any new
 * repeat: Infinity animation.
 */
export function DictationRings({ active }: { active: boolean }) {
  const prefersReducedMotion = useReducedMotion()
  if (!active) return null

  if (prefersReducedMotion) {
    return (
      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <span className="absolute h-16 w-16 rounded-full border-2 border-brand-500 opacity-40" />
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
          className="absolute rounded-full border-2 border-brand-500"
          initial={{ width: 40, height: 40, opacity: 0.6 }}
          animate={{ width: 100, height: 100, opacity: 0 }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.35, ease: 'easeOut' }}
        />
      ))}
    </span>
  )
}

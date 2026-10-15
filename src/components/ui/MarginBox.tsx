import * as React from 'react'
import {
  AnimatePresence,
  motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  type HTMLMotionProps,
} from 'framer-motion'
import { getMarginTier, type MarginTier } from '@/lib/calc/marginTier'
import { cn } from '@/lib/utils'

/**
 * Kōv margin-indicator component — docs/02_ThemeGuideline.md §6.6 + §2.4.
 *
 * THE single most important component in the app's commercial logic (Cahier §6.4).
 * Used in two places: (1) the quote editor's live margin box, (2) the chantier
 * profitability screen's extended "Ce que ce chantier te rapporte" block.
 *
 * NAMING — do not deviate: tier variants are green/steelBlue/gold/red.
 * NEVER name any tier "amber" or "orange" — neither hue is actually used for the
 * middle two tiers (see docs/02_ThemeGuideline.md §2.4's explicit naming note and
 * docs/06_AIPromptRegistry.md §3.2's margin-tier-calc contract).
 *
 * Tier/color/advisory logic now lives in src/lib/calc/marginTier.ts (Step 8's
 * authoritative, vitest-covered calculation engine) — this component consumes
 * it directly rather than keeping its own duplicate copy, per
 * docs/06_AIPromptRegistry.md §3.2's "never re-implemented separately in two
 * places" rule.
 */

export type { MarginTier }

export interface MarginBoxProps extends HTMLMotionProps<'div'> {
  /** The margin percentage — tier is derived automatically from this value. */
  marginPct: number
  /** Custom advisory copy override (defaults to the tier's standard message). */
  advisoryOverride?: string
  /**
   * Extended variant for the chantier profitability screen: shows the planned
   * margin alongside the real margin, plus a progress bar with a planned-position
   * marker (Cahier §6.9's "trois niveaux de lecture").
   */
  extended?: {
    plannedMarginPct: number
    /** e.g. "Il te reste 4 200 € une fois tout payé." */
    remainingAmountLabel?: string
  }
  /**
   * docs/02_ThemeGuideline.md §9.2 "Chantier profitability reveal": on the
   * first time a session sees this block, the headline figure counts up
   * from zero (~500ms) and the extended variant's planned-position marker
   * slides in from the left, rather than both simply appearing at their
   * final value/position. Only ever passed true by the chantier screen's
   * own first-reveal gate — the quote editor's live-recalculating box never
   * sets this, since a live number should update instantly, not re-count
   * from zero on every keystroke.
   */
  animateReveal?: boolean
}

/** Counts a motion value from 0 to `target` over `durationMs`, rendering via
 * rAF rather than Framer's `animate()` so the displayed text can be
 * formatted with `.toFixed(1)` on every frame — a plain animated
 * MotionValue has no built-in text formatting. */
function useCountUp(target: number, durationMs: number, enabled: boolean): number {
  const value = useMotionValue(0)
  const [display, setDisplay] = React.useState(0)
  const startRef = React.useRef<number | null>(null)

  useAnimationFrame((time) => {
    if (!enabled) return
    if (startRef.current === null) startRef.current = time
    const elapsed = time - startRef.current
    const progress = Math.min(elapsed / durationMs, 1)
    // easeOut, matching the spec's "~500ms, eased out"
    const eased = 1 - Math.pow(1 - progress, 3)
    const next = target * eased
    value.set(next)
    setDisplay(next)
  })

  // `enabled` is fixed for the lifetime of a given MarginBox instance (the
  // chantier screen only ever passes animateReveal=true on a genuine first
  // reveal, never toggles it mid-session) — so the disabled branch can
  // return the target directly, no state/effect needed for it at all.
  return enabled ? display : target
}

/**
 * MarginBox — recalculates live on every quote-line edit. The color-shift
 * animation (§9.2) cross-fades background/border/figure color over 220ms
 * (cubic-bezier(0.4, 0, 0.2, 1) — deliberately calmer than the button-press
 * curve, since this is a numeric-trust moment). The figure itself digit-rolls
 * on change (old value slides out, new value slides in, via Framer's
 * AnimatePresence keyed on the rounded value — not literally GSAP TextPlugin,
 * but the same visual effect §9.2 describes) whenever `animateReveal` is NOT
 * set, i.e. the live quote-editor context; the chantier-reveal context
 * (`animateReveal=true`) uses the separate count-up-from-zero treatment
 * instead, since those two moments never both apply to the same instance.
 */
const MarginBox = React.forwardRef<HTMLDivElement, MarginBoxProps>(
  ({ className, marginPct, advisoryOverride, extended, animateReveal, ...props }, ref) => {
    const { tier, colorTokens, advisory } = getMarginTier(marginPct)
    const plannedTier = extended ? getMarginTier(extended.plannedMarginPct).tier : null
    const gapPoints = extended ? marginPct - extended.plannedMarginPct : null
    const prefersReducedMotion = useReducedMotion()
    const countUpEnabled = Boolean(animateReveal) && !prefersReducedMotion
    const displayedMarginPct = useCountUp(marginPct, 500, countUpEnabled)

    return (
      <motion.div
        ref={ref}
        data-slot="margin-box"
        data-tier={tier}
        layout
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          'relative overflow-hidden rounded-md pl-5 pr-4 py-4',
          colorTokens.tintBg,
          className,
        )}
        {...props}
      >
        <div
          className={cn('absolute inset-y-0 left-0 w-1', colorTokens.accentBar)}
          aria-hidden="true"
        />

        <div className="flex items-baseline gap-3">
          <span
            className={cn(
              'relative inline-flex overflow-hidden tabular-nums text-[34px] leading-[1.1] font-black',
              colorTokens.figureText,
            )}
          >
            {countUpEnabled || prefersReducedMotion ? (
              `${displayedMarginPct.toFixed(1)}%`
            ) : (
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={displayedMarginPct.toFixed(1)}
                  initial={{ y: 18, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -18, opacity: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                >
                  {displayedMarginPct.toFixed(1)}%
                </motion.span>
              </AnimatePresence>
            )}
          </span>
          {extended ? (
            <span className="tabular-nums text-[15px] font-semibold text-text-mid">
              prévu {extended.plannedMarginPct.toFixed(1)}%
              {gapPoints !== null ? (
                <span className={gapPoints >= 0 ? 'text-success-text' : 'text-error-text'}>
                  {' '}
                  ({gapPoints >= 0 ? '+' : ''}
                  {gapPoints.toFixed(1)} pts)
                </span>
              ) : null}
            </span>
          ) : null}
        </div>

        {/* text-margin-advisory-text (not the general text-text-mid) — WCAG AA
        fix (Step 14.5): text-mid fails 4.5:1 against every tier's tint
        background in light mode (3.65-4.25:1 measured); this token is
        identical to text-mid in dark mode (already passes) but darkened in
        light mode specifically for this tint-background context. */}
        <p className="mt-1 text-[13.5px] font-medium leading-[1.5] text-margin-advisory-text">
          {advisoryOverride ?? advisory}
        </p>

        {extended ? (
          <div className="mt-3">
            <div className="relative h-2 w-full overflow-hidden rounded-pill bg-recessed">
              <motion.div
                className={cn('h-full rounded-pill', colorTokens.accentBar)}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(Math.max(marginPct, 0), 100)}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
              {/* Planned-position marker — slides in from the left on first
              reveal (§9.2), matching the accent bar's own fill animation
              rather than simply appearing at its final position. */}
              <motion.div
                className="absolute inset-y-0 w-0.5 bg-text-hi/60"
                initial={
                  countUpEnabled
                    ? { left: 0, opacity: 0 }
                    : {
                        left: `${Math.min(Math.max(extended.plannedMarginPct, 0), 100)}%`,
                      }
                }
                animate={{
                  left: `${Math.min(Math.max(extended.plannedMarginPct, 0), 100)}%`,
                  opacity: 1,
                }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                aria-hidden="true"
                data-planned-tier={plannedTier ?? undefined}
              />
            </div>
            {extended.remainingAmountLabel ? (
              <p className="mt-2 text-[13.5px] font-bold text-text-hi">
                {extended.remainingAmountLabel}
              </p>
            ) : null}
          </div>
        ) : null}
      </motion.div>
    )
  },
)
MarginBox.displayName = 'MarginBox'

export { MarginBox }

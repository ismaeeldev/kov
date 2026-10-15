import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * Kōv status pill — docs/02_ThemeGuideline.md §6.4. Covers every status set named
 * in the theme doc: quote lifecycle (§6.7's exact 5 statuses), chantier lifecycle,
 * dunning escalation level, and material-order stock state.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[10px] font-bold tracking-[0.05em] uppercase leading-[1.4] whitespace-nowrap',
  {
    variants: {
      // WCAG AA requires 4.5:1 for this text size (10px bold does not qualify for the
      // 3:1 "large text" exception). Pairing each tier's raw saturated color directly
      // against its own pale "-100"/"-bg" tint FAILS AA (verified: as low as 3.08:1) —
      // every tone below therefore uses a purpose-built darker text shade specifically
      // for on-tint legibility. Never swap these back to the raw tier color as text.
      //
      // info/success/error use the shared --color-info-text/-success-text/-error-text
      // tokens (theme.css) rather than hardcoded hex: those tokens are mode-aware, and
      // -bg here (--color-info-bg/-success-bg/-error-bg) became mode-aware too once
      // Step 14.2.5's accessibility sweep found dark mode rendering the OLD fixed
      // light-pastel -bg tints — the original hardcoded hex values here were tuned
      // only against those light-mode-only pastels and went unreadable (1.59:1) once
      // -bg started varying by mode. gold/urgence now use their own dedicated
      // --gold-tint-text/--urgence-tint-text tokens (theme.css) — promoted from
      // one-off hardcoded hex during a later full-app audit (2026-09-26) that
      // grepped for stray literals outside theme.css — both -100 backgrounds
      // are fixed/non-mode-varying, so these two tokens are mode-independent,
      // same posture as --agent-chip-text. brand uses brand-900, already a
      // real token (mode-varying ramp step, not a one-off).
      tone: {
        neutral: 'bg-recessed text-text-mid', // pre-existing pairing, unaffected (text-mid already passes on dark)
        info: 'bg-info-bg text-info-text', // 6.6:1 light / 5.1:1 dark
        success: 'bg-success-bg text-success-text', // 5.9:1 light / 5.4:1 dark
        error: 'bg-error-bg text-error-text', // 6.3:1 light / 5.3:1 dark
        gold: 'bg-gold-100 text-gold-tint-text', // 5.8:1 on --gold-100 (#F7F0E3)
        urgence: 'bg-urgence-100 text-urgence-tint-text', // 6.6:1 on --urgence-100 (#FFF4EC)
        brand: 'bg-brand-100 text-brand-900', // 9.0:1 on --ol (#EBF3F9) — brand-900 already dark enough
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
)

export interface BadgeProps
  extends React.ComponentProps<'span'>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, ...props }, ref) => (
    <span
      ref={ref}
      data-slot="badge"
      className={cn(badgeVariants({ tone, className }))}
      {...props}
    />
  ),
)
Badge.displayName = 'Badge'

/** Quote lifecycle — exactly these 5 statuses, no more/fewer (§6.7). */
export type QuoteStatus = 'draft' | 'issued' | 'accepted' | 'declined' | 'expired_cancelled'
const quoteStatusTone: Record<QuoteStatus, VariantProps<typeof badgeVariants>['tone']> = {
  draft: 'neutral',
  issued: 'info',
  accepted: 'success',
  declined: 'error',
  expired_cancelled: 'neutral',
}
const quoteStatusLabel: Record<QuoteStatus, string> = {
  draft: 'Brouillon',
  issued: 'Émis',
  accepted: 'Accepté',
  declined: 'Refusé',
  expired_cancelled: 'Expiré / Annulé',
}
export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return (
    <Badge
      tone={quoteStatusTone[status]}
      className={status === 'expired_cancelled' ? 'opacity-70' : undefined}
    >
      {quoteStatusLabel[status]}
    </Badge>
  )
}

/** Chantier lifecycle — separate from quote status, tracked after conversion. */
export type ChantierStatus = 'planned' | 'in_progress' | 'awaiting_payment' | 'closed'
const chantierStatusTone: Record<ChantierStatus, VariantProps<typeof badgeVariants>['tone']> = {
  planned: 'neutral',
  in_progress: 'brand',
  awaiting_payment: 'gold',
  closed: 'success',
}
const chantierStatusLabel: Record<ChantierStatus, string> = {
  planned: 'Planifié',
  in_progress: 'En cours',
  awaiting_payment: 'En attente de paiement',
  closed: 'Clôturé',
}
export function ChantierStatusBadge({ status }: { status: ChantierStatus }) {
  return <Badge tone={chantierStatusTone[status]}>{chantierStatusLabel[status]}</Badge>
}

/** Dunning escalation level — severity must escalate visually (§6.4). */
export type DunningLevel = 1 | 2 | 3
const dunningLevelTone: Record<DunningLevel, VariantProps<typeof badgeVariants>['tone']> = {
  1: 'gold',
  2: 'urgence',
  3: 'error',
}
const dunningLevelLabel: Record<DunningLevel, string> = {
  1: 'Rappel courtois',
  2: 'Relance ferme',
  3: 'Mise en demeure',
}
/**
 * docs/02_ThemeGuideline.md §9.2 "Dunning-level escalation": when the level
 * ADVANCES (1→2→3) on an already-mounted badge, briefly shake-and-settle
 * (~180ms) as the color transitions to the next severity tier — represents a
 * real, meaningfully worse state for the artisan's cash flow. A first-mount
 * render or an unchanged level never animates (no shake on initial page
 * load, only on a live transition while the badge is on screen). Reduced
 * motion: skips the shake keyframes entirely, tone still updates instantly.
 */
export function DunningLevelBadge({ level }: { level: DunningLevel }) {
  const prefersReducedMotion = useReducedMotion()
  const controls = useAnimationControls()
  const prevLevel = React.useRef(level)

  React.useEffect(() => {
    if (prevLevel.current !== level) {
      if (level > prevLevel.current && !prefersReducedMotion) {
        controls.start({
          x: [0, -3, 3, -2, 2, 0],
          transition: { duration: 0.18, ease: 'easeInOut' },
        })
      }
      prevLevel.current = level
    }
  }, [level, controls, prefersReducedMotion])

  return (
    <motion.span animate={controls} className="inline-block">
      <Badge tone={dunningLevelTone[level]}>{dunningLevelLabel[level]}</Badge>
    </motion.span>
  )
}

/** Material stock state (module 6.6). */
export type StockState = 'available' | 'in_transit' | 'out_of_stock'
const stockStateTone: Record<StockState, VariantProps<typeof badgeVariants>['tone']> = {
  available: 'success',
  in_transit: 'info',
  out_of_stock: 'error',
}
const stockStateLabel: Record<StockState, string> = {
  available: 'Disponible',
  in_transit: 'En transit',
  out_of_stock: 'Rupture',
}
export function StockStateBadge({ state }: { state: StockState }) {
  return <Badge tone={stockStateTone[state]}>{stockStateLabel[state]}</Badge>
}

export { Badge, badgeVariants }

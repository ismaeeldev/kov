import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { Slot } from 'radix-ui'
import { cn } from '@/lib/utils'

/**
 * Kōv primary button component — docs/02_ThemeGuideline.md §6.1.
 *
 * Five variants, each with a specific real-world role in the app — never used
 * interchangeably (see docs/02_ThemeGuideline.md §1's "accent hierarchy" rule):
 *  - primary: the steel-blue brand action (quote save, confirm plan, primary flows)
 *  - agent:   reserved EXCLUSIVELY for Kōv Agent-related actions (purple gradient)
 *  - urgent:  reserved EXCLUSIVELY for time-sensitive/alarm contexts (dunning, overdue)
 *  - ghost:   secondary/tertiary actions, transparent background
 *  - icon:    icon-only buttons (back, small toggles)
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap select-none',
    'font-sans font-extrabold text-[15px] leading-none',
    'transition-colors duration-150',
    // CSS-based press feedback as a fallback for the `asChild` (Slot) path,
    // which renders a different element (e.g. <a> via a Link) and therefore
    // cannot receive Framer Motion's whileTap prop at all — found via a
    // shared-component state audit (2026-10-03): an asChild button previously
    // got ZERO press feedback, silently failing §6.1's "all buttons get
    // active/pressed feedback" requirement. The non-asChild <motion.button>
    // path still uses whileTap (the richer, spring-timed version) — this
    // class is harmless there too since active: only fires on genuine
    // press-and-hold, never conflicting with Framer's own scale value.
    'active:scale-[0.96] transition-transform',
    // A blanket disabled:opacity-* fades background AND text toward the page
    // behind it in lockstep, collapsing their contrast (measured 2.56:1 on the
    // primary variant — a real WCAG AA failure, found via live screenshot
    // review in Step 7). A solid, purpose-built muted pairing keeps a real
    // 7.0:1 ratio while still reading as clearly "off" — never reintroduce a
    // disabled:opacity-* override on this component.
    'disabled:pointer-events-none disabled:bg-recessed disabled:text-text-low disabled:shadow-none',
    'min-h-11 min-w-11', // 44x44px minimum touch target — field-use with gloves
    'outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg',
  ],
  {
    variants: {
      // WCAG AA note: white text on the raw --accent-500/--urgence-500 fails 4.5:1
      // (4.31:1 / 2.80:1 measured) — the resting state below uses -700 instead (passes
      // at 5.7:1 / 4.6:1), with -500 reserved for hover/active (brighter on interaction)
      // and for non-text uses (icons, borders, shadows, gradients) where contrast math
      // doesn't apply. This intentionally inverts the theme doc's original default/hover
      // pairing — see docs/02_ThemeGuideline.md §6.1's updated note for the full rationale.
      variant: {
        primary: 'bg-brand-700 text-white hover:bg-brand-500 shadow-accent-glow',
        agent: 'bg-[image:var(--gradient-agent)] text-white hover:brightness-90 shadow-agent-glow',
        urgent: 'bg-urgence-700 text-white hover:bg-urgence-500 shadow-urgence-glow',
        ghost:
          'bg-transparent text-text-hi border border-divider/40 hover:bg-recessed disabled:bg-transparent disabled:border-divider/20 disabled:text-text-low',
        icon: 'bg-transparent text-text-hi hover:bg-recessed rounded-full disabled:bg-transparent disabled:text-text-low',
      },
      size: {
        default: 'h-12 px-5 rounded-sm', // 48px
        sm: 'h-10 px-4 rounded-sm text-sm', // 40px
        iconDefault: 'h-10 w-10 rounded-xs',
        iconSm: 'h-9 w-9 rounded-xs',
      },
    },
    compoundVariants: [
      { variant: 'icon', size: 'default', class: 'rounded-full' },
      { variant: 'icon', size: 'sm', class: 'rounded-full' },
    ],
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends Omit<HTMLMotionProps<'button'>, 'ref'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, disabled, ...props }, ref) => {
    if (asChild) {
      // asChild renders a different element (e.g. an <a>) via Radix's Slot — it
      // takes plain DOM attributes, never Framer Motion's animation props
      // (whileTap/transition/etc.), so the motion-typed props are narrowed here.
      const {
        whileTap: _whileTap,
        transition: _transition,
        ...domProps
      } = props as React.ComponentProps<'button'> & Record<string, unknown>
      return (
        <Slot.Root className={cn(buttonVariants({ variant, size, className }))} {...domProps} />
      )
    }

    return (
      <motion.button
        ref={ref}
        data-slot="button"
        data-variant={variant}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled}
        // §9.1 easing: cubic-bezier(0.34, 1.56, 0.64, 1) — a confident, slight overshoot,
        // matching the client source's own FAB press curve exactly.
        whileTap={disabled ? undefined : { scale: 0.96 }}
        transition={{ duration: 0.16, ease: [0.34, 1.56, 0.64, 1] }}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }

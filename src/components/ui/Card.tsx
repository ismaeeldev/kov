import * as React from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * Kōv card primitives — docs/02_ThemeGuideline.md §6.2.
 * Standard card + ContextualActionCard (Home action-list items) + StatTile (in StatTile.tsx).
 */

const Card = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card"
      className={cn('bg-surface text-text-hi rounded-sm shadow-raised p-4 sm:p-5 transition-colors', className)}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

type ContextualActionCardAccent = 'brand' | 'urgence' | 'gold' | 'success'

const accentBarClass: Record<ContextualActionCardAccent, string> = {
  brand: 'before:bg-brand-500',
  urgence: 'before:bg-urgence-500',
  gold: 'before:bg-gold-500',
  success: 'before:bg-success',
}

export interface ContextualActionCardProps extends Omit<HTMLMotionProps<'div'>, 'title'> {
  /** Category color for the 3px left accent bar (docs/02_ThemeGuideline.md §6.2) */
  accent?: ContextualActionCardAccent
  icon?: React.ReactNode
  /** Card headline — ReactNode, not the native HTML `title` (tooltip) attribute. */
  cardTitle: React.ReactNode
  subtitle?: React.ReactNode
  action?: React.ReactNode
  onActionClick?: () => void
}

/**
 * Home screen action-list item (module 6.2's smart action list). Full-width tap
 * target on mobile per the theme spec — the whole card is interactive, not just
 * the action button.
 */
const ContextualActionCard = React.forwardRef<HTMLDivElement, ContextualActionCardProps>(
  (
    { className, accent = 'brand', icon, cardTitle, subtitle, action, onActionClick, ...props },
    ref,
  ) => (
    <motion.div
      ref={ref}
      data-slot="contextual-action-card"
      role={onActionClick ? 'button' : undefined}
      tabIndex={onActionClick ? 0 : undefined}
      onClick={onActionClick}
      onKeyDown={
        onActionClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onActionClick()
              }
            }
          : undefined
      }
      whileTap={onActionClick ? { scale: 0.98 } : undefined}
      transition={{ duration: 0.16, ease: [0.34, 1.56, 0.64, 1] }}
      className={cn(
        'group relative flex items-center gap-3 rounded-sm bg-surface p-4 shadow-raised transition-all duration-150',
        'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-sm',
        accentBarClass[accent],
        onActionClick &&
          'cursor-pointer hover:bg-surface-hover hover:shadow-floating active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg',
        className,
      )}
      {...props}
    >
      {icon ? <div className="shrink-0 text-text-hi transition-transform duration-150 group-hover:scale-105">{icon}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] leading-[1.3] font-extrabold text-text-hi">
          {cardTitle}
        </div>
        {subtitle ? (
          <div className="mt-0.5 truncate text-[12px] leading-[1.45] font-medium text-text-mid">
            {subtitle}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </motion.div>
  ),
)
ContextualActionCard.displayName = 'ContextualActionCard'

export { Card, ContextualActionCard }

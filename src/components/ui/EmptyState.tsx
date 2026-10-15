import * as React from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

/**
 * Reusable empty-state shell — docs/03_MasterPrompts.md §3.2 / docs/04_ApplicationFlow.md
 * §4 ("Empty"). Every screen supplies its own icon/heading/description/CTA copy (per
 * docs/04_ApplicationFlow.md §2.x's exact per-screen wording, e.g. "Aucun devis pour
 * l'instant") — this shell just keeps the visual treatment consistent everywhere.
 * NEVER fabricate content to fill an empty state (a direct KOV-FR-019 requirement).
 */
export interface EmptyStateProps {
  icon?: React.ReactNode
  heading: React.ReactNode
  description?: React.ReactNode
  actionLabel?: React.ReactNode
  onAction?: () => void
  className?: string
}

function EmptyState({
  icon,
  heading,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-3.5 px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-recessed text-text-low shadow-flat">
          {icon}
        </div>
      ) : null}
      <p className="text-[17px] font-extrabold leading-[1.3] text-text-hi">{heading}</p>
      {description ? (
        <p className="max-w-[36ch] text-[13.5px] font-medium leading-[1.55] text-text-mid">
          {description}
        </p>
      ) : null}
      {actionLabel && onAction ? (
        <Button variant="primary" size="sm" className="mt-2.5" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}

export { EmptyState }

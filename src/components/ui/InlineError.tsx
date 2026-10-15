import { RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

/**
 * Small, in-context error component with a Retry action — docs/03_MasterPrompts.md
 * §3.2 / docs/04_ApplicationFlow.md §4 ("Error (recoverable)"). Local to the affected
 * section only — a failed fetch in one part of a screen must never blank the rest
 * of that screen behind it.
 */
export interface InlineErrorProps {
  message?: string
  onRetry?: () => void
  className?: string
}

function InlineError({
  message = 'Une erreur est survenue. Vérifie ta connexion et réessaie.',
  onRetry,
  className,
}: InlineErrorProps) {
  return (
    <div
      data-slot="inline-error"
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-sm border border-error/30 bg-error-bg/10 p-4 text-center',
        className,
      )}
    >
      <TriangleAlert size={20} strokeWidth={1.75} className="text-error-text" />
      <p className="text-[13px] font-medium leading-[1.5] text-text-mid">{message}</p>
      {onRetry ? (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          <RefreshCw size={14} strokeWidth={2} />
          Réessayer
        </Button>
      ) : null}
    </div>
  )
}

export { InlineError }

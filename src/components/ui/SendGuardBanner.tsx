import * as React from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

/**
 * The "nothing sent without confirmation" pattern — docs/03_MasterPrompts.md §3.2.
 * Reused everywhere a client-facing send is about to happen: dunning (mo-relance),
 * invoicing sends, Kōv Agent plan execution (module 6.5), financing-proposal sends.
 * Built once here so this guarantee is never reimplemented five different ways.
 *
 * Consumed by: AgentSurface.tsx's PlanReviewCard (Step 2, refactored here to use
 * this shared component instead of its own inline banner), and every dunning/
 * invoicing/financing send confirmation from Step 11 onward.
 */
export interface SendGuardBannerProps {
  /** Defaults to the standard copy — override only if a specific flow needs different wording. */
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  /** Use the agent (purple) button variant instead of primary — for Kōv Agent flows. */
  variant?: 'primary' | 'agent'
  /** Disables the confirm action only — e.g. while offline (docs/04_ApplicationFlow.md
   * §4's "anything that would send to a client... clearly disables") or mid-send. Cancel
   * always stays available. */
  confirmDisabled?: boolean
  className?: string
}

function SendGuardBanner({
  message = 'Rien n’est envoyé avant validation',
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  onConfirm,
  onCancel,
  variant = 'primary',
  confirmDisabled = false,
  className,
}: SendGuardBannerProps) {
  const cancelRef = React.useRef<HTMLButtonElement>(null)

  // WCAG AA fix (Step 14.5): this banner swaps in to replace the normal
  // action row (e.g. DunningModal's "Revoir et envoyer" button) — without
  // this, focus silently fell back toward <body> right as the confirm step
  // appeared. Cancel (not Confirm) gets initial focus: the safer default for
  // a send-confirmation step, consistent with this component's whole
  // "nothing sent without deliberate action" posture.
  React.useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  const isAgent = variant === 'agent'

  return (
    <div data-slot="send-guard-banner" className={cn('flex flex-col gap-3', className)}>
      <div
        className={cn(
          'flex items-center justify-center gap-1.5 rounded-sm px-3 py-2 text-center text-[10px] font-bold tracking-[0.05em] uppercase',
          isAgent ? 'bg-noir-100 text-noir-700' : 'bg-recessed text-text-mid',
        )}
      >
        <ShieldCheck size={12} strokeWidth={2} />
        {message}
      </div>
      <div className="flex gap-2">
        <Button
          ref={cancelRef}
          variant="ghost"
          size="sm"
          className={cn(
            'flex-1',
            isAgent && 'border-noir-300 text-noir-900 hover:bg-noir-100 focus-visible:ring-agent-500/45',
          )}
          onClick={onCancel}
        >
          {cancelLabel}
        </Button>
        <Button
          variant={variant}
          size="sm"
          className="flex-1"
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  )
}

export { SendGuardBanner }

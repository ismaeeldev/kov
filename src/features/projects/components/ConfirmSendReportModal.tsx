import * as React from 'react'
import { InlineError } from '@/components/ui/InlineError'
import { Modal } from '@/components/ui/Modal'
import { SendGuardBanner } from '@/components/ui/SendGuardBanner'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { apiWrite, ApiTimeoutError } from '@/lib/apiClient'

interface ConfirmSendReportModalProps {
  updateId: string
  clientId: string
  projectId: string
  clientName: string
  progressPct: number | null
  summaryText: string
  onClose: () => void
  /** `journalWarning` set when the report was genuinely sent but the
   * non-fatal main-courante auto-feed write failed — surfaced by the caller,
   * which stays mounted after this modal closes (scope audit, 2026-09-26). */
  onSent: (journalWarning?: string) => void
}

function buildSmsText(clientName: string, progressPct: number | null, summaryText: string): string {
  const progressPart = progressPct !== null ? ` (${progressPct}% terminé)` : ''
  return `Bonjour ${clientName}, voici un point sur votre chantier${progressPart} : ${summaryText}`
}

/**
 * mo-confirm-envoi — docs/03_MasterPrompts.md §13.2 item 3,
 * docs/04_ApplicationFlow.md §3.8. Preview of the exact summary SMS text,
 * explicit confirm/cancel via SendGuardBanner. On confirm: sets
 * project_updates.sent_to_client=true + client_sms_sent_at, auto-feeds the
 * client's journal (entry_type='rapport', direction='outbound').
 */
export function ConfirmSendReportModal({
  updateId,
  clientId,
  projectId,
  clientName,
  progressPct,
  summaryText,
  onClose,
  onSent,
}: ConfirmSendReportModalProps) {
  const { user } = useAuth()
  const isOnline = useOnlineStatus()
  const [status, setStatus] = React.useState<'idle' | 'sending' | 'error'>('idle')
  const [error, setError] = React.useState<string | null>(null)
  // A ref, not the `status` state check alone — see SatisfactionPage.tsx's
  // doc comment (module 15 deep audit, 2026-10-08). This sends a real SMS to
  // the client, so a same-tick double-click on "Envoyer" must not slip
  // through twice (module 20 close-out sweep, 2026-10-15).
  const sendingRef = React.useRef(false)

  const smsText = buildSmsText(clientName, progressPct, summaryText)

  async function handleConfirm() {
    if (!user || sendingRef.current) return
    sendingRef.current = true
    setStatus('sending')
    setError(null)

    const now = new Date().toISOString()
    try {
      const { error: updateError } = await apiWrite((client) =>
        client
          .from('project_updates')
          .update({ sent_to_client: true, client_sms_sent_at: now })
          .eq('id', updateId),
      )

      if (updateError) {
        sendingRef.current = false
        setStatus('error')
        setError(updateError.message)
        return
      }

      let journalWarning: string | undefined
      try {
        const { error: journalError } = await apiWrite((client) =>
          client.from('journal').insert({
            owner_id: user.id,
            client_id: clientId,
            entry_type: 'rapport',
            direction: 'outbound',
            title: 'Rapport de chantier envoyé',
            body: smsText,
            related_project_id: projectId,
            occurred_at: now,
          }),
        )
        if (journalError) {
          // Non-fatal — the report itself is genuinely sent; a missing
          // journal entry is a secondary concern. Still surfaced to the
          // caller (see onSent's doc comment) rather than only
          // console-logged, per the 2026-09-26 scope audit finding.
          console.error('Failed to auto-feed journal on report send:', journalError.message)
          journalWarning =
            "Le rapport a bien été envoyé, mais il n'a pas pu être ajouté à la main courante."
        }
      } catch (err) {
        console.error(
          'Failed to auto-feed journal on report send:',
          err instanceof ApiTimeoutError ? err.message : err,
        )
        journalWarning =
          "Le rapport a bien été envoyé, mais il n'a pas pu être ajouté à la main courante."
      }

      sendingRef.current = false
      setStatus('idle')
      onSent(journalWarning)
    } catch (err) {
      sendingRef.current = false
      setStatus('error')
      setError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="confirm-send-report-modal-title" panelClassName="max-w-sm">
      <h2
        id="confirm-send-report-modal-title"
        className="font-serif text-[18px] font-black text-text-hi"
      >
        Informer le client
      </h2>

      <div className="rounded-sm bg-recessed p-3">
        <p className="mb-1 text-[11px] font-bold tracking-[0.05em] text-text-mid uppercase">
          SMS qui sera envoyé
        </p>
        <p className="text-[13px] leading-[1.5] text-text-hi">{smsText}</p>
      </div>

      {status === 'error' && error ? <InlineError message={error} /> : null}

      <SendGuardBanner
        confirmLabel={status === 'sending' ? 'Envoi...' : 'Envoyer'}
        onConfirm={handleConfirm}
        onCancel={onClose}
        confirmDisabled={status === 'sending' || !isOnline}
      />
    </Modal>
  )
}

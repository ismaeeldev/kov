import * as React from 'react'
import { Button } from '@/components/ui/Button'
import { InlineError } from '@/components/ui/InlineError'
import { Modal } from '@/components/ui/Modal'
import { SendGuardBanner } from '@/components/ui/SendGuardBanner'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import type { DunningLevel } from '@/components/ui/Badge'
import { apiWrite, ApiTimeoutError } from '@/lib/apiClient'

type Channel = 'sms' | 'email' | 'recommande_ar'

const CHANNEL_LABELS: Record<Channel, string> = {
  sms: 'SMS',
  email: 'Email',
  recommande_ar: 'Lettre recommandée AR',
}

/** docs/01_ScopeDocument.md §5.8's exact three-level table — subject line
 * samples are literal quotes from the spec, body text extrapolates the same
 * register (courteous -> firm -> formal notice) consistently with each
 * level's named purpose. Level 3 mentions the €40 flat-rate recovery
 * indemnity (art. L441-10 du Code de commerce) and recommends registered
 * mail, both explicit spec requirements. */
function buildMessage(
  level: DunningLevel,
  params: { ref: string; amount: number; daysLate: number },
): {
  subject: string
  body: string
} {
  const amountStr = `${params.amount.toFixed(2)} €`
  if (level === 1) {
    return {
      subject: `Petit rappel — facture ${params.ref}`,
      body: `Bonjour,\n\nSauf erreur de notre part, la facture ${params.ref} d'un montant de ${amountStr} n'a pas encore été réglée. Il s'agit probablement d'un oubli — pourriez-vous procéder au règlement dès que possible ?\n\nMerci et bonne journée.`,
    }
  }
  if (level === 2) {
    return {
      subject: `Facture ${params.ref} — échue depuis ${params.daysLate} jours`,
      body: `Bonjour,\n\nMalgré notre précédent rappel, la facture ${params.ref} d'un montant de ${amountStr} demeure impayée à ce jour, soit ${params.daysLate} jours de retard. Merci de bien vouloir régulariser cette situation sous les meilleurs délais.\n\nSans règlement de votre part, nous nous verrons contraints d'engager une procédure de recouvrement.\n\nCordialement.`,
    }
  }
  return {
    subject: `MISE EN DEMEURE — facture ${params.ref}`,
    body: `Madame, Monsieur,\n\nMalgré nos relances successives, la facture ${params.ref} d'un montant de ${amountStr} reste impayée à ce jour, soit ${params.daysLate} jours de retard.\n\nPar la présente, nous vous mettons en demeure de régler cette somme sous 8 jours. À défaut de règlement dans ce délai, une indemnité forfaitaire de recouvrement de 40 € (art. L441-10 du Code de commerce) sera due, sans préjudice des pénalités de retard déjà applicables, et nous nous réservons le droit d'engager toute procédure utile au recouvrement de notre créance.\n\nCette lettre est envoyée en recommandé avec accusé de réception pour valoir ce que de droit.\n\nCordialement.`,
  }
}

interface DunningModalProps {
  invoiceId: string
  clientId: string
  level: DunningLevel
  reference: string
  amount: number
  daysLate: number
  onClose: () => void
  /** `journalWarning` is set when the real relance succeeded but the
   * non-fatal main-courante auto-feed write failed — the caller (which
   * stays mounted after this modal closes, unlike this modal's own local
   * error state) is the only place that can still show the artisan a
   * visible signal, per a scope audit (2026-09-26) finding this was
   * previously console-only with zero user-facing surfacing. */
  onSent: (journalWarning?: string) => void
}

/**
 * mo-relance — docs/03_MasterPrompts.md §11.3 items 4-5,
 * docs/04_ApplicationFlow.md §3.3. Pre-written message per current dunning
 * level, fully editable before send, channel choice. On send: creates a
 * dunning_events row recording the message AS ACTUALLY SENT (post-edit),
 * then auto-feeds the journal — using SendGuardBanner for the explicit
 * confirm-before-send step (no dunning message ever leaves without it).
 */
export function DunningModal({
  invoiceId,
  clientId,
  level,
  reference,
  amount,
  daysLate,
  onClose,
  onSent,
}: DunningModalProps) {
  const { user } = useAuth()
  const isOnline = useOnlineStatus()
  const initial = React.useMemo(
    () => buildMessage(level, { ref: reference, amount, daysLate }),
    [level, reference, amount, daysLate],
  )
  const [channel, setChannel] = React.useState<Channel>(level === 3 ? 'recommande_ar' : 'email')
  const [subject, setSubject] = React.useState(initial.subject)
  const [body, setBody] = React.useState(initial.body)
  const [confirming, setConfirming] = React.useState(false)
  const [status, setStatus] = React.useState<'idle' | 'sending' | 'error'>('idle')
  const [error, setError] = React.useState<string | null>(null)
  // A ref, not a state check — state read inside a regular closure can still
  // be stale when two click handlers fire in the same tick (React batches
  // setState, so a second same-tick call can read the pre-update value and
  // pass a state-only guard too). Found live: a genuine concurrent
  // double-click produced 2 journal rows despite an earlier state-only
  // version of this guard (module 15 deep audit, 2026-10-08 — corrected
  // across every file this pattern was applied to this session).
  const sendingRef = React.useRef(false)

  async function handleSend() {
    if (!user || sendingRef.current) return
    sendingRef.current = true
    setStatus('sending')
    setError(null)

    const messageText = channel === 'email' ? `${subject}\n\n${body}` : body

    try {
      const { error: dunningError } = await apiWrite((client) =>
        client.from('dunning_events').insert({
          owner_id: user.id,
          invoice_id: invoiceId,
          level,
          channel,
          message_text: messageText,
        }),
      )
      if (dunningError) {
        sendingRef.current = false
        setStatus('error')
        setError(dunningError.message)
        return
      }

      const journalEntryType = channel === 'recommande_ar' ? 'recommande' : channel
      let journalWarning: string | undefined
      try {
        const { error: journalError } = await apiWrite((client) =>
          client.from('journal').insert({
            owner_id: user.id,
            client_id: clientId,
            entry_type: journalEntryType,
            direction: 'outbound',
            title: subject || `Relance niveau ${level} — facture ${reference}`,
            body: messageText,
            related_invoice_id: invoiceId,
          }),
        )
        if (journalError) {
          console.error('Failed to auto-feed journal on dunning send:', journalError.message)
          journalWarning =
            "La relance a bien été envoyée, mais elle n'a pas pu être ajoutée à la main courante."
        }
      } catch (err) {
        console.error(
          'Failed to auto-feed journal on dunning send:',
          err instanceof ApiTimeoutError ? err.message : err,
        )
        journalWarning =
          "La relance a bien été envoyée, mais elle n'a pas pu être ajoutée à la main courante."
      }

      sendingRef.current = false
      setStatus('idle')
      onSent(journalWarning)
    } catch (err) {
      sendingRef.current = false
      setStatus('error')
      setError(err instanceof ApiTimeoutError ? err.message : 'Une erreur est survenue.')
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="dunning-modal-title">
      <h2 id="dunning-modal-title" className="font-serif text-[18px] font-black text-text-hi">
        Envoyer une relance
      </h2>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold tracking-[0.05em] text-text-mid uppercase">
          Canal
        </span>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(CHANNEL_LABELS) as Channel[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              className={`rounded-sm border-[1.5px] px-2 py-2.5 text-[11px] font-bold transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                channel === c
                  ? 'border-brand-500 bg-brand-700 text-white shadow-xs'
                  : 'border-divider bg-surface text-text-hi hover:border-border-hover hover:bg-surface-hover'
              }`}
            >
              {CHANNEL_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      {channel === 'email' ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold tracking-[0.05em] text-text-mid uppercase">
            Objet
          </label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-11 rounded-sm border-[1.5px] border-divider bg-surface px-3 text-[14px] text-text-hi transition-colors focus:border-brand-500 focus:outline-none"
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-bold tracking-[0.05em] text-text-mid uppercase">
          Message
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          className="rounded-sm border-[1.5px] border-divider bg-surface p-3 text-[13px] leading-[1.5] text-text-hi transition-colors focus:border-brand-500 focus:outline-none"
        />
      </div>

      {status === 'error' && error ? <InlineError message={error} /> : null}

      {confirming ? (
        <SendGuardBanner
          onCancel={() => setConfirming(false)}
          onConfirm={handleSend}
          confirmLabel={status === 'sending' ? 'Envoi...' : 'Envoyer la relance'}
          confirmDisabled={status === 'sending' || !isOnline}
        />
      ) : (
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
            Annuler
          </Button>
          <Button
            type="button"
            variant="primary"
            className="flex-1"
            disabled={!isOnline}
            onClick={() => setConfirming(true)}
          >
            Revoir et envoyer
          </Button>
        </div>
      )}
    </Modal>
  )
}

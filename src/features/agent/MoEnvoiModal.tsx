import * as React from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { PlanStep } from './executePlan'

const CHANNEL_LABELS: Record<string, string> = {
  sms: 'SMS',
  email: 'Email',
  recommande_ar: 'Lettre recommandée AR',
}

interface MoEnvoiModalProps {
  step: PlanStep
  currentText: string
  onSave: (text: string) => void
  onClose: () => void
}

/**
 * mo-envoi — docs/04_ApplicationFlow.md §3.4. Opens from a plan-review
 * card's "Lire le message" affordance. Full message text, editable, channel
 * and recipient shown. Does NOT send anything itself — returns the edited
 * text to the plan-review step; sending only happens on the plan's overall
 * "OUI" confirm (KOV-FR-014's "tout message destiné à un client est visible
 * avant envoi").
 */
export function MoEnvoiModal({ step, currentText, onSave, onClose }: MoEnvoiModalProps) {
  const [text, setText] = React.useState(currentText)

  return (
    <Modal onClose={onClose} labelledBy="mo-envoi-modal-title">
      <h2 id="mo-envoi-modal-title" className="font-serif text-[18px] font-black text-text-hi">
        Lire le message
      </h2>

      <div className="flex flex-wrap gap-3 text-[12px] text-text-mid">
        {step.target_channel ? (
          <span>
            <span className="font-bold text-text-hi">Canal :</span>{' '}
            {CHANNEL_LABELS[step.target_channel] ?? step.target_channel}
          </span>
        ) : null}
        {step.recipient ? (
          <span>
            <span className="font-bold text-text-hi">Destinataire :</span> {step.recipient}
          </span>
        ) : null}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        className="rounded-sm border-[1.5px] border-divider bg-surface p-3 text-[13px] leading-[1.5] text-text-hi outline-none focus:border-brand-500"
      />

      <div className="flex gap-2">
        <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
          Annuler
        </Button>
        <Button type="button" variant="primary" className="flex-1" onClick={() => onSave(text)}>
          Enregistrer
        </Button>
      </div>
    </Modal>
  )
}

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

export interface JournalEntryModalData {
  title: string
  body: string | null
  occurred_at: string
}

interface JournalEntryModalProps {
  entry: JournalEntryModalData
  onClose: () => void
}

/**
 * mo-jr — docs/03_MasterPrompts.md §13.3 item 4, docs/04_ApplicationFlow.md
 * §3.5. Read-only full-text view of one main-courante entry. Opens from
 * tapping any journal entry in s-fiche-detail's main courante or s-msg's
 * thread list.
 */
export function JournalEntryModal({ entry, onClose }: JournalEntryModalProps) {
  return (
    <Modal onClose={onClose} labelledBy="journal-entry-modal-title" panelClassName="max-w-sm gap-3">
      <h2 id="journal-entry-modal-title" className="font-serif text-[16px] font-black text-text-hi">
        {entry.title}
      </h2>
      <p className="text-[11px] text-text-low">
        {new Date(entry.occurred_at).toLocaleString('fr-FR')}
      </p>
      <p className="whitespace-pre-wrap text-[13px] leading-[1.5] text-text-hi">{entry.body}</p>
      <Button variant="ghost" className="mt-2" onClick={onClose}>
        Fermer
      </Button>
    </Modal>
  )
}

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

export interface ReportViewData {
  text_content: string
  progress_pct: number | null
  input_method: 'typed' | 'voice'
  sent_to_client: boolean
  client_sms_sent_at: string | null
  created_at: string
}

interface ReportViewModalProps {
  report: ReportViewData
  onClose: () => void
}

/**
 * mo-rapport-vue — docs/03_MasterPrompts.md §13.2 item 5,
 * docs/04_ApplicationFlow.md §3.7. Read-only view of a past report and, if
 * sent, the exact SMS text that reached the client.
 */
export function ReportViewModal({ report, onClose }: ReportViewModalProps) {
  return (
    <Modal onClose={onClose} labelledBy="report-view-modal-title" panelClassName="max-w-sm">
      <h2 id="report-view-modal-title" className="font-serif text-[18px] font-black text-text-hi">
        Rapport du chantier
      </h2>
      <p className="text-[11px] text-text-low">
        {new Date(report.created_at).toLocaleString('fr-FR')}
        {report.progress_pct !== null ? ` · ${report.progress_pct}% terminé` : ''}
      </p>

      <p className="whitespace-pre-wrap text-[13px] leading-[1.5] text-text-hi">
        {report.text_content}
      </p>

      {report.sent_to_client ? (
        <div className="rounded-sm bg-recessed p-3">
          <p className="mb-1 text-[11px] font-bold tracking-[0.05em] text-text-mid uppercase">
            Envoyé au client
            {report.client_sms_sent_at
              ? ` · ${new Date(report.client_sms_sent_at).toLocaleString('fr-FR')}`
              : ''}
          </p>
        </div>
      ) : (
        <p className="text-[12px] text-text-low">Ce rapport n'a pas été envoyé au client.</p>
      )}

      <Button variant="ghost" onClick={onClose}>
        Fermer
      </Button>
    </Modal>
  )
}

import * as React from 'react'
import { Mic, MicOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DictationRings } from '@/components/ui/DictationRings'
import { InlineError } from '@/components/ui/InlineError'
import { Modal } from '@/components/ui/Modal'
import { useDictation } from '@/hooks/useDictation'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { apiWrite, ApiTimeoutError } from '@/lib/apiClient'

interface ReportModalProps {
  projectId: string
  /** Auto-starts dictation on open — Home's evening "rapport du jour" card
   * opens this modal with dictation already listening (docs/04_ApplicationFlow.md
   * §3.6's "auto-starts dictation on open"); s-chantier's own report action
   * opens it idle, letting the artisan choose typed or voice. */
  autoStartDictation?: boolean
  onClose: () => void
  /** Called after the project_updates row is saved. `notifyClient` reflects
   * the artisan's explicit checkbox choice in THIS modal — the caller opens
   * mo-confirm-envoi only when true, never unconditionally. */
  onSaved: (result: {
    updateId: string
    notifyClient: boolean
    text: string
    progressPct: number | null
  }) => void
}

/**
 * mo-rapport — docs/03_MasterPrompts.md §13.2 item 2, docs/04_ApplicationFlow.md
 * §3.6. Text field with dictation (mic button, pulsing rings while active,
 * transcript editable before save — NEVER auto-submitted from speech output
 * directly), progress percentage, what-was-done text.
 */
export function ReportModal({
  projectId,
  autoStartDictation = false,
  onClose,
  onSaved,
}: ReportModalProps) {
  const { user } = useAuth()
  const isOnline = useOnlineStatus()
  const dictation = useDictation()

  const [text, setText] = React.useState('')
  const [progressPct, setProgressPct] = React.useState('')
  const [inputMethod, setInputMethod] = React.useState<'typed' | 'voice'>('typed')
  const [notifyClient, setNotifyClient] = React.useState(false)
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'error'>('idle')
  const [error, setError] = React.useState<string | null>(null)

  const startedAutoRef = React.useRef(false)
  React.useEffect(() => {
    if (autoStartDictation && dictation.isSupported && !startedAutoRef.current) {
      startedAutoRef.current = true
      setInputMethod('voice')
      dictation.start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start()/isSupported are stable across the modal's lifetime; only autoStartDictation should trigger this
  }, [autoStartDictation])

  // The transcript is merged into the editable text field as it arrives —
  // still fully editable afterward, never submitted directly from speech
  // recognition output (docs/04_ApplicationFlow.md §3.6's explicit rule).
  const lastAppliedTranscript = React.useRef('')
  // A ref, not the `status` state check alone — see SatisfactionPage.tsx's
  // doc comment (module 15 deep audit, 2026-10-08). handleSave inserts a
  // project_updates row, so a same-tick double-click on Enregistrer must not
  // slip through twice (module 20 close-out sweep, 2026-10-15).
  const savingRef = React.useRef(false)
  React.useEffect(() => {
    if (dictation.transcript && dictation.transcript !== lastAppliedTranscript.current) {
      const newPart = dictation.transcript.slice(lastAppliedTranscript.current.length).trim()
      if (newPart) {
        setText((prev) => (prev ? `${prev} ${newPart}`.trim() : newPart))
      }
      lastAppliedTranscript.current = dictation.transcript
    }
  }, [dictation.transcript])

  function toggleDictation() {
    if (dictation.status === 'listening') {
      dictation.stop()
      return
    }
    setInputMethod('voice')
    dictation.start()
  }

  async function handleSave() {
    if (!user || !text.trim() || savingRef.current) return
    savingRef.current = true
    setStatus('saving')
    setError(null)

    try {
      const { data, error: insertError } = await apiWrite((client) =>
        client
          .from('project_updates')
          .insert({
            owner_id: user.id,
            project_id: projectId,
            text_content: text.trim(),
            progress_pct: progressPct ? Number(progressPct) : null,
            input_method: inputMethod,
          })
          .select('id')
          .single(),
      )

      if (insertError || !data) {
        savingRef.current = false
        setStatus('error')
        setError(insertError?.message ?? "Échec de l'enregistrement du rapport.")
        return
      }

      savingRef.current = false
      setStatus('idle')
      onSaved({
        updateId: data.id,
        notifyClient,
        text: text.trim(),
        progressPct: progressPct ? Number(progressPct) : null,
      })
    } catch (err) {
      savingRef.current = false
      setStatus('error')
      setError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="report-modal-title">
      <h2 id="report-modal-title" className="font-serif text-[18px] font-black text-text-hi">
        Rapport de chantier
      </h2>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold tracking-[0.05em] text-text-mid uppercase">
            Ce qui a été fait
          </label>
          {dictation.isSupported ? (
            <button
              type="button"
              onClick={toggleDictation}
              aria-label={
                dictation.status === 'listening' ? 'Arrêter la dictée' : 'Démarrer la dictée'
              }
              className="relative flex h-11 w-11 items-center justify-center rounded-full bg-recessed text-text-hi outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <DictationRings active={dictation.status === 'listening'} />
              {dictation.status === 'listening' ? (
                <Mic size={16} strokeWidth={2} className="relative z-10 text-brand-500" />
              ) : (
                <Mic size={16} strokeWidth={2} className="relative z-10" />
              )}
            </button>
          ) : (
            <span
              className="flex items-center gap-1 text-[11px] text-text-low"
              title="Dictée vocale non disponible sur ce navigateur"
            >
              <MicOff size={14} strokeWidth={2} />
              Dictée indisponible
            </span>
          )}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Décris ce qui a été fait aujourd'hui..."
          className="rounded-sm border-[1.5px] border-divider bg-surface p-3 text-[13px] leading-[1.5] text-text-hi outline-none focus:border-brand-500"
        />
        {dictation.status === 'permission_denied' ? (
          <p className="text-[11px] text-error-text">
            Micro refusé — tu peux toujours taper ton rapport ci-dessus.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-bold tracking-[0.05em] text-text-mid uppercase">
          Avancement (%)
        </label>
        <input
          type="number"
          min={0}
          max={100}
          value={progressPct}
          onChange={(e) => setProgressPct(e.target.value)}
          className="h-11 rounded-sm border-[1.5px] border-divider bg-surface px-3 text-[14px] text-text-hi outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        />
      </div>

      <label className="flex items-center gap-2 text-[13px] font-medium text-text-hi">
        <input
          type="checkbox"
          checked={notifyClient}
          onChange={(e) => setNotifyClient(e.target.checked)}
          className="outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        />
        Informer le client par SMS
      </label>

      {status === 'error' && error ? <InlineError message={error} /> : null}

      <div className="flex gap-2">
        <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
          Annuler
        </Button>
        <Button
          type="button"
          variant="primary"
          className="flex-1"
          disabled={!text.trim() || status === 'saving' || !isOnline}
          onClick={handleSave}
        >
          {status === 'saving' ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>
    </Modal>
  )
}

import * as React from 'react'
import { Check, FileSignature, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { InlineError } from '@/components/ui/InlineError'
import { Modal } from '@/components/ui/Modal'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { apiWrite, ApiTimeoutError } from '@/lib/apiClient'

interface QuoteAcceptancePanelProps {
  quoteId: string
  quoteVersionId: string
  status: 'issued' | 'accepted' | 'declined'
  /** The note recorded alongside the most recent accept/decline event, if
   * any — displayed once the quote has moved past 'issued', so the note
   * field (previously write-only: schema-ready but rendered nowhere) is
   * actually visible again afterward. */
  lastEventNote?: string | null
  onRecorded: () => void
}

/**
 * "Acceptation du devis" — docs/04_ApplicationFlow.md §2.23, docs/03_MasterPrompts.md
 * §9.5. NEVER labeled "Signature" anywhere in this component's copy — the
 * canvas mark is an honest, non-legally-probative acknowledgment, distinct
 * from the separate (not-yet-built) real e-signature integration path. Only
 * ever reachable from an ISSUED quote — quote_events.event_type='accepted'
 * must always reference an issued quote_version (enforced both here and
 * server-side by always passing the current, already-issued version id).
 */
export function QuoteAcceptancePanel({
  quoteId,
  quoteVersionId,
  status,
  lastEventNote,
  onRecorded,
}: QuoteAcceptancePanelProps) {
  const isOnline = useOnlineStatus()
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const isDrawingRef = React.useRef(false)
  // A ref, not the `saveStatus` state check alone — see SatisfactionPage.tsx's
  // doc comment (module 15 deep audit, 2026-10-08). recordEvent inserts a
  // quote_events row, so a same-tick double-click on Accept/Decline must not
  // slip through twice (module 20 close-out sweep, 2026-10-15).
  const recordingRef = React.useRef(false)
  const [hasMark, setHasMark] = React.useState(false)
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [savedAs, setSavedAs] = React.useState<'accepted' | 'declined' | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [esignatureModalOpen, setEsignatureModalOpen] = React.useState(false)
  const [note, setNote] = React.useState('')

  function getCanvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    isDrawingRef.current = true
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getCanvasPoint(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    const { x, y } = getCanvasPoint(e)
    ctx.lineTo(x, y)
    // Read the real, mode-aware --text-hi custom property rather than a
    // hardcoded hex (full-app audit, 2026-09-26, found this literal — it
    // never adapted to light mode: the canvas draws on `bg-recessed`, which
    // is near-black in dark mode but near-white in light mode, so a fixed
    // pale-gray stroke would be nearly invisible once light mode's
    // recessed-bg is also pale). --text-hi is already the app's own
    // maximum-contrast-per-mode token, exactly what a legible pen color needs.
    // Fallback only fires if getComputedStyle somehow returns an empty string
    // (should never happen once theme.css is loaded) — matches --noir-100,
    // the real dark-mode --text-hi value, not an arbitrary new color.
    ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue('--text-hi').trim() || '#e8e8e6'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.stroke()
    setHasMark(true)
  }

  function handlePointerUp() {
    isDrawingRef.current = false
  }

  function clearMark() {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    }
    setHasMark(false)
  }

  async function recordEvent(
    eventType: 'accepted' | 'declined',
    acceptanceMethod: 'canvas_mark' | null,
  ) {
    if (recordingRef.current) return
    recordingRef.current = true
    setSaveStatus('saving')
    setError(null)

    // Hard invariant (docs/03_MasterPrompts.md §9.5 item 4): an 'accepted'
    // event must always reference an ISSUED quote_version — quoteVersionId
    // passed into this component is always the quote's current (already-
    // issued) version, so this is satisfied by construction; still validated
    // by the not-null check below rather than silently sending null.
    if (!quoteVersionId) {
      recordingRef.current = false
      setSaveStatus('error')
      setError('Aucune version émise à référencer — action impossible.')
      return
    }

    try {
      const { error: insertError } = await apiWrite((client) =>
        client.from('quote_events').insert({
          quote_id: quoteId,
          quote_version_id: quoteVersionId,
          event_type: eventType,
          acceptance_method: acceptanceMethod,
          actor: 'owner',
          note: note.trim() || null,
        }),
      )
      if (insertError) {
        recordingRef.current = false
        setSaveStatus('error')
        setError(insertError.message)
        return
      }

      const { error: updateError } = await apiWrite((client) =>
        client.from('quotes').update({ status: eventType }).eq('id', quoteId),
      )
      if (updateError) {
        recordingRef.current = false
        setSaveStatus('error')
        setError(updateError.message)
        return
      }

      // Brief, visible "saved" confirmation before handing off to the parent's
      // refetch — without this the panel would just silently swap to the
      // already-recorded state with no moment acknowledging the action landed,
      // which for a decision this consequential (accepting/declining a real
      // quote) deserves a real confirmation beat, not an instant cut.
      setSaveStatus('saved')
      setSavedAs(eventType)
      setTimeout(() => onRecorded(), 700)
    } catch (err) {
      recordingRef.current = false
      setSaveStatus('error')
      setError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }

  if (status !== 'issued') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24 }}
        className="mt-4 rounded-sm bg-surface p-4 shadow-raised"
      >
        <p className="flex items-center gap-2 text-[13px] font-bold text-text-hi">
          {status === 'accepted' ? (
            <>
              <Check size={16} strokeWidth={2.5} className="text-margin-green" />
              Devis accepté
            </>
          ) : (
            <>
              <X size={16} strokeWidth={2.5} className="text-margin-red" />
              Devis refusé
            </>
          )}
        </p>
        {lastEventNote ? (
          <p className="mt-2 rounded-sm bg-recessed p-2.5 text-[12px] leading-[1.5] text-text-mid">
            {lastEventNote}
          </p>
        ) : null}
      </motion.div>
    )
  }

  if (saveStatus === 'saved') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
        className="mt-4 flex flex-col items-center gap-2 rounded-sm bg-surface p-6 text-center shadow-raised"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1], delay: 0.05 }}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${
            savedAs === 'accepted' ? 'bg-margin-green/15' : 'bg-margin-red/15'
          }`}
        >
          {savedAs === 'accepted' ? (
            <Check size={24} strokeWidth={2.5} className="text-margin-green" />
          ) : (
            <X size={24} strokeWidth={2.5} className="text-margin-red" />
          )}
        </motion.div>
        <p className="text-[13px] font-bold text-text-hi">
          {savedAs === 'accepted' ? 'Devis marqué comme accepté' : 'Devis marqué comme refusé'}
        </p>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="mt-4 flex flex-col gap-3.5 rounded-card border border-divider/60 bg-surface p-5 shadow-raised"
    >
      <h2 className="text-[13px] font-bold tracking-[0.05em] text-text-mid uppercase">
        Acceptation du devis
      </h2>
      <p className="text-[12px] text-text-mid">
        Marque ce devis comme accepté ou refusé une fois la confirmation du client reçue (par
        téléphone, en personne ou par email), avec une marque d'acquittement optionnelle ci-dessous.
      </p>

      <canvas
        ref={canvasRef}
        width={320}
        height={100}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="w-full touch-none rounded-card border border-divider/60 bg-recessed"
      />
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-text-low">
          Marque d'acquittement — non probante juridiquement.
        </p>
        {hasMark ? (
          <button
            type="button"
            onClick={clearMark}
            className="text-[11px] font-bold text-text-mid outline-none transition-colors hover:text-text-hi focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Effacer
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="quote-acceptance-note"
          className="text-[11px] font-bold tracking-[0.05em] text-text-mid uppercase"
        >
          Note (optionnel)
        </label>
        <textarea
          id="quote-acceptance-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Ex. : accepté par téléphone le 12/03, souhaite démarrer début avril..."
          className="rounded-card border-[1.5px] border-divider/60 bg-surface p-3 text-[13px] leading-[1.5] text-text-hi outline-none transition-colors focus:border-brand-500"
        />
      </div>

      {saveStatus === 'error' && error ? <InlineError message={error} /> : null}

      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <Button
          variant="ghost"
          className="flex-1"
          disabled={saveStatus === 'saving' || !isOnline}
          onClick={() => recordEvent('declined', null)}
        >
          <X size={16} strokeWidth={2} />
          {saveStatus === 'saving' ? 'Enregistrement...' : 'Refuser'}
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={saveStatus === 'saving' || !isOnline}
          onClick={() => recordEvent('accepted', hasMark ? 'canvas_mark' : null)}
        >
          <Check size={16} strokeWidth={2.5} />
          {saveStatus === 'saving' ? 'Enregistrement...' : 'Accepter ce devis'}
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setEsignatureModalOpen(true)}
        className="flex items-center gap-1.5 rounded-xs text-[11px] font-bold text-text-mid underline underline-offset-2 outline-none transition-colors hover:text-text-hi focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        <FileSignature size={13} strokeWidth={2} />
        Signature électronique
      </button>

      {esignatureModalOpen ? (
        <Modal
          onClose={() => setEsignatureModalOpen(false)}
          labelledBy="esignature-modal-title"
          panelClassName="max-w-sm"
        >
          <h2 id="esignature-modal-title" className="font-serif text-[18px] font-black text-text-hi">
            Signature électronique
          </h2>
          {/* Honest, real state — not a fake success. docs/01_ScopeDocument.md
          §8/§9: a real e-signature service is wanted as a competitive
          standard, but must never be presented as connected/working until a
          real provider (e.g. Yousign, the standard French-market choice) is
          actually integrated. quote_events.acceptance_method='esignature' is
          schema-ready (migration 0004) for the day a real provider is wired
          in — this modal is the honest, structurally-ready placeholder for
          that integration, never a fake "signed" confirmation. */}
          <p className="text-[13px] leading-[1.5] text-text-mid">
            La signature électronique légalement valable n'est pas encore connectée à un
            prestataire (par exemple Yousign). Cette fonctionnalité arrivera séparément — en
            attendant, utilise la marque d'acquittement ci-dessus ou une confirmation par
            téléphone/email.
          </p>
          <Button variant="ghost" onClick={() => setEsignatureModalOpen(false)}>
            Fermer
          </Button>
        </Modal>
      ) : null}
    </motion.div>
  )
}

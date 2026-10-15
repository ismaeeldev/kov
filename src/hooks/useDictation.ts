import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Wraps the browser's Web Speech API (SpeechRecognition) — docs/03_MasterPrompts.md
 * §13.2 item 1, docs/01_ScopeDocument.md §5.12/§5.3. Used by chantier report
 * dictation (mo-rapport), client internal-notes dictation, and the Kōv Agent's
 * voice input.
 *
 * The transcript is NEVER auto-submitted — every consumer of this hook must
 * show it as editable text before any save/send action, per the explicit
 * "jamais auto-soumis" rule repeated across every dictation consumer's spec.
 * Text input always remains fully usable regardless of `isSupported`.
 */
export type DictationStatus = 'idle' | 'listening' | 'permission_denied' | 'unsupported' | 'error'

export interface UseDictationResult {
  isSupported: boolean
  status: DictationStatus
  transcript: string
  start: () => void
  stop: () => void
  /** Clears the accumulated transcript — call after the caller has copied it
   * into its own editable text field state, so a second dictation session
   * doesn't append onto stale text. */
  reset: () => void
}

// Minimal shape of the Web Speech API's SpeechRecognition — not in TS's lib.dom
// types (still non-standard/vendor-prefixed), so declared narrowly here rather
// than pulling in a whole ambient-types package for one browser API.
interface SpeechRecognitionResultLike {
  0: { transcript: string }
  isFinal: boolean
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useDictation(): UseDictationResult {
  const Ctor = getSpeechRecognitionCtor()
  const isSupported = Ctor !== null

  const [status, setStatus] = useState<DictationStatus>(isSupported ? 'idle' : 'unsupported')
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  const start = useCallback(() => {
    if (!Ctor) {
      setStatus('unsupported')
      return
    }
    try {
      const recognition = new Ctor()
      recognition.lang = 'fr-FR'
      recognition.continuous = true
      recognition.interimResults = true

      recognition.onresult = (event) => {
        let finalChunk = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result.isFinal) finalChunk += result[0].transcript
        }
        if (finalChunk) {
          setTranscript((prev) => (prev ? `${prev} ${finalChunk}`.trim() : finalChunk.trim()))
        }
      }
      recognition.onerror = (event) => {
        setStatus(
          event.error === 'not-allowed' || event.error === 'permission-denied'
            ? 'permission_denied'
            : 'error',
        )
      }
      recognition.onend = () => {
        setStatus((prev) => (prev === 'listening' ? 'idle' : prev))
      }

      recognitionRef.current = recognition
      recognition.start()
      setStatus('listening')
    } catch {
      setStatus('error')
    }
  }, [Ctor])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    setStatus('idle')
  }, [])

  const reset = useCallback(() => {
    setTranscript('')
  }, [])

  return { isSupported, status, transcript, start, stop, reset }
}

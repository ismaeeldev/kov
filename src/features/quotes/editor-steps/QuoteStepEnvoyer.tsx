import * as React from 'react'
import { gsap } from 'gsap'
import { Check } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { InlineError } from '@/components/ui/InlineError'
import { Modal } from '@/components/ui/Modal'
import { QuoteStatusBadge } from '@/components/ui/Badge'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { apiWrite, ApiTimeoutError } from '@/lib/apiClient'
import { calculateQuoteTotals, roundBankers } from '@/lib/calc/quoteTotals'
import { getVatMentionText } from '../vatMentions'
import type { useQuoteEditor } from '../useQuoteEditor'

interface QuoteStepEnvoyerProps {
  editor: ReturnType<typeof useQuoteEditor>
  onBack: () => void
}

/**
 * Step 4 — Envoyer — docs/04_ApplicationFlow.md §2.5, docs/03_MasterPrompts.md
 * §9.4. Review screen + real issuance ("Émettre le devis"), calling
 * supabase/functions/quote-issue. The document-fold motion moment
 * (docs/02_ThemeGuideline.md §9.2) is genuinely tied to the real server
 * response — never a fixed timer padded to look impressive, and never
 * shorter than the response actually takes.
 */
export function QuoteStepEnvoyer({ editor, onBack }: QuoteStepEnvoyerProps) {
  const navigate = useNavigate()
  const isOnline = useOnlineStatus()
  const prefersReducedMotion = useReducedMotion()
  const client = editor.clients.find((c) => c.id === editor.quote?.client_id)
  const vatMentionText = getVatMentionText(editor.quote?.vat_mention_code ?? null)

  const [issueStatus, setIssueStatus] = React.useState<'idle' | 'issuing' | 'success' | 'error'>(
    'idle',
  )
  const [issueError, setIssueError] = React.useState<string | null>(null)
  const [cancelConfirmOpen, setCancelConfirmOpen] = React.useState(false)
  const [cancelStatus, setCancelStatus] = React.useState<'idle' | 'cancelling' | 'error'>('idle')
  const [cancelError, setCancelError] = React.useState<string | null>(null)
  const sweepRef = React.useRef<HTMLDivElement>(null)
  const checkRef = React.useRef<SVGPathElement>(null)
  // Refs, not the `issueStatus`/`cancelStatus` state checks alone — see
  // SatisfactionPage.tsx's doc comment (module 15 deep audit, 2026-10-08).
  // Both handlers below trigger a real status transition (issuing or
  // cancelling a quote), so a same-tick double-click must not slip through
  // twice (module 20 close-out sweep, 2026-10-15).
  const issuingRef = React.useRef(false)
  const cancellingRef = React.useRef(false)

  async function handleIssue() {
    if (!editor.quote || issuingRef.current) return
    issuingRef.current = true
    const quoteId = editor.quote.id
    setIssueStatus('issuing')
    setIssueError(null)

    // The sweep animation plays for as long as the real call takes — no
    // fixed timer. A minimum-visible-duration floor (900ms) keeps it from
    // flashing imperceptibly on a very fast response, per the theme spec's
    // "900ms-1.4s" range, but never artificially extends beyond what the
    // server actually took if it's slower.
    const minDurationMs = prefersReducedMotion ? 0 : 900
    const startedAt = Date.now()

    if (!prefersReducedMotion && sweepRef.current) {
      gsap.fromTo(
        sweepRef.current,
        { yPercent: -100 },
        { yPercent: 100, duration: 1.2, ease: 'power1.inOut', repeat: -1 },
      )
    }

    let result: { data: { success?: boolean; error?: string } | null; error: unknown }
    try {
      result = await apiWrite((client) =>
        client.functions.invoke('quote-issue', { body: { quoteId } }),
      )
    } catch (err) {
      result = { data: null, error: err }
    }
    const { data, error } = result

    if (sweepRef.current) gsap.killTweensOf(sweepRef.current)

    const elapsed = Date.now() - startedAt
    if (elapsed < minDurationMs) {
      await new Promise((resolve) => setTimeout(resolve, minDurationMs - elapsed))
    }

    if (error || !data?.success) {
      issuingRef.current = false
      setIssueStatus('error')
      setIssueError(
        error instanceof ApiTimeoutError
          ? error.message
          : (data?.error ?? "L'émission a échoué. Le devis reste en brouillon, tu peux réessayer."),
      )
      return
    }

    issuingRef.current = false
    setIssueStatus('success')
    if (!prefersReducedMotion && checkRef.current) {
      gsap.fromTo(
        checkRef.current,
        { strokeDasharray: 24, strokeDashoffset: 24 },
        { strokeDashoffset: 0, duration: 0.4, ease: 'power2.out' },
      )
    }
    await editor.reload()
    setTimeout(() => navigate(`/quotes/${editor.quote!.id}/edit`, { replace: true }), 900)
  }

  // "Annuler ce devis" — docs/01_ScopeDocument.md KOV-FR-006's "create, edit,
  // duplicate, archive a quote" acceptance clause named 5 statuses including
  // Expired/Cancelled, but a full scope audit (2026-09-26) found nothing in
  // the codebase ever reached that status — no cancel action existed
  // anywhere. Only offered on a genuine Draft (never on an issued/accepted/
  // declined quote, which are terminal real-world outcomes that should never
  // be silently overwritten by a cancel button).
  async function handleCancel() {
    if (!editor.quote || cancellingRef.current) return
    cancellingRef.current = true
    setCancelStatus('cancelling')
    setCancelError(null)
    const result = await editor.updateQuote({ status: 'expired_cancelled' })
    if (result.error) {
      cancellingRef.current = false
      setCancelStatus('error')
      setCancelError(result.error)
      return
    }
    navigate('/quotes')
  }

  const isIssued = editor.quote?.status !== 'draft'

  // Canonical totals — same module/rounding rule (roundBankers) as every
  // other quote-total figure in the app (docs/06_AIPromptRegistry.md §3.1),
  // never ad-hoc arithmetic recomputed on this screen alone.
  const totals = calculateQuoteTotals(
    editor.lines.map((l) => ({
      quantity: l.quantity,
      unit_price: l.unit_price,
      purchase_price: l.purchase_price,
    })),
    editor.quote?.vat_rate ?? 20,
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-[22px] font-black text-text-hi">Aperçu du devis</h1>
          <p className="mt-0.5 text-[13px] text-text-mid">
            Vérifie les montants avant émission officielle.
          </p>
        </div>
        {editor.quote ? <QuoteStatusBadge status={editor.quote.status} /> : null}
      </div>

      <motion.div
        className="relative overflow-hidden rounded-card border border-divider/60 bg-surface p-5 shadow-raised"
        animate={issueStatus === 'issuing' ? { scale: 0.98 } : { scale: 1 }}
        transition={{ duration: 0.2 }}
      >
        {issueStatus === 'issuing' ? (
          <div
            ref={sweepRef}
            className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-transparent via-brand-500/25 to-transparent"
            aria-hidden="true"
          />
        ) : null}

        {issueStatus === 'success' ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-page-bg/80 backdrop-blur-xs">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
              <path
                ref={checkRef}
                d="M4 12.5L9.5 18L20 6"
                stroke="var(--margin-green)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ) : null}

        <div className="mb-4 flex items-center justify-between border-b border-divider/40 pb-3">
          <span className="font-mono text-[13px] font-bold text-text-mid">{editor.quote?.reference}</span>
          <span className="text-[14px] font-bold text-text-hi">{client?.name}</span>
        </div>

        <ul className="mb-4 flex flex-col gap-2.5">
          {editor.lines.map((line) => (
            <li key={line.id} className="flex items-start justify-between gap-3 text-[13px]">
              <div className="min-w-0 flex-1 text-text-hi">
                <span>{line.designation}</span>{' '}
                <span className="whitespace-nowrap text-text-mid font-normal">
                  × {line.quantity} {line.unit}
                </span>
              </div>
              <span className="shrink-0 font-mono tabular-nums font-bold text-text-hi">
                {/* roundBankers, not raw .toFixed(2) — see quoteTotals.ts's
                explicit rounding contract (docs/06_AIPromptRegistry.md §3.1). */}
                {roundBankers(line.quantity * line.unit_price).toFixed(2)} €
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-1.5 border-t border-divider/60 pt-3 text-[13px]">
          <div className="flex justify-between">
            <span className="text-text-mid">Sous-total HT</span>
            <span className="font-mono tabular-nums font-bold text-text-hi">
              {(editor.quote?.subtotal_ht ?? 0).toFixed(2)} €
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-mid">TVA ({editor.quote?.vat_rate}%)</span>
            <span className="font-mono tabular-nums font-bold text-text-hi">
              {totals.vat_amount.toFixed(2)} €
            </span>
          </div>
          <div className="mt-1 flex justify-between border-t border-divider/40 pt-2 text-[15px]">
            <span className="font-extrabold text-text-hi">Total TTC</span>
            <span className="font-mono tabular-nums font-black text-text-hi">
              {(editor.quote?.total_ttc ?? 0).toFixed(2)} €
            </span>
          </div>
        </div>

        {vatMentionText ? (
          <p className="mt-3 border-t border-divider/40 pt-3 text-[11px] leading-relaxed text-text-low">
            {vatMentionText}
          </p>
        ) : null}
      </motion.div>

      {!isOnline ? (
        <div className="rounded-card border border-divider/40 bg-recessed px-3.5 py-2.5 text-center text-[12px] font-bold text-text-mid">
          Hors ligne — l'émission du devis nécessite une connexion internet.
        </div>
      ) : null}

      {issueStatus === 'error' && issueError ? (
        <div className="flex flex-col gap-2">
          <InlineError message={issueError} onRetry={handleIssue} />
          {/* docs/04_ApplicationFlow.md §2.1's exit condition: if legal fields
          are incomplete, issuance must "re-check and block with a clear path
          back to Business Settings" — not just an inline error with no next
          step. quote-issue's own error message text is the one place this
          specific failure is distinguishable from any other issuance error. */}
          {issueError.includes('Informations légales') ? (
            <Button variant="ghost" onClick={() => navigate('/profile/business')}>
              Compléter mon entreprise
            </Button>
          ) : null}
        </div>
      ) : null}

      {isIssued ? (
        <Button variant="primary" disabled>
          Devis déjà émis
        </Button>
      ) : (
        <Button
          variant="primary"
          disabled={issueStatus === 'issuing' || !isOnline || editor.lines.length === 0}
          onClick={handleIssue}
        >
          {issueStatus === 'issuing' ? (
            'Émission en cours...'
          ) : (
            <>
              <Check size={16} strokeWidth={2.5} />
              Émettre le devis
            </>
          )}
        </Button>
      )}

      <div className="mt-2 flex gap-2">
        <Button
          variant="ghost"
          className="flex-1"
          onClick={onBack}
          disabled={issueStatus === 'issuing'}
        >
          Retour
        </Button>
        <Button
          variant="ghost"
          className="flex-1"
          onClick={() => navigate('/quotes')}
          disabled={issueStatus === 'issuing'}
        >
          Enregistrer et quitter
        </Button>
      </div>

      {!isIssued ? (
        <Button
          variant="ghost"
          className="mt-2 text-error-text hover:bg-error-bg/20"
          onClick={() => setCancelConfirmOpen(true)}
          disabled={issueStatus === 'issuing'}
        >
          Annuler ce devis
        </Button>
      ) : null}

      {cancelConfirmOpen ? (
        <Modal
          onClose={() => setCancelConfirmOpen(false)}
          labelledBy="cancel-quote-modal-title"
          panelClassName="max-w-sm"
        >
          <h2 id="cancel-quote-modal-title" className="font-serif text-[18px] font-black text-text-hi">
            Annuler ce devis ?
          </h2>
          <p className="text-[13px] leading-[1.5] text-text-mid">
            Le devis passera au statut Expiré/Annulé. Il restera consultable dans la liste des
            devis mais ne pourra plus être émis.
          </p>
          {cancelStatus === 'error' && cancelError ? <InlineError message={cancelError} /> : null}
          <div className="mt-2 flex gap-2">
            <Button
              variant="ghost"
              className="flex-1"
              disabled={cancelStatus === 'cancelling'}
              onClick={() => setCancelConfirmOpen(false)}
            >
              Retour
            </Button>
            <Button
              variant="urgent"
              className="flex-1"
              disabled={cancelStatus === 'cancelling' || !isOnline}
              onClick={handleCancel}
            >
              {cancelStatus === 'cancelling' ? 'Annulation...' : 'Oui, annuler'}
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

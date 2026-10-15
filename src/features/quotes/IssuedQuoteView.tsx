import * as React from 'react'
import { ArrowLeft, Check, Download, HardHat, Pencil } from 'lucide-react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { InlineError } from '@/components/ui/InlineError'
import { QuoteStatusBadge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { supabase } from '@/lib/supabase'
import { apiRead, apiWrite, ApiTimeoutError } from '@/lib/apiClient'
import { roundBankers } from '@/lib/calc/quoteTotals'
import { QuoteAcceptancePanel } from './QuoteAcceptancePanel'
import type { QuoteRow } from './useQuoteEditor'

interface QuoteVersionSnapshot {
  reference: string
  issued_at: string
  vat_rate: number
  subtotal_ht: number
  total_ttc: number
  /** Added after the initial snapshot shape shipped — older already-issued
   * quotes' frozen snapshots won't have this field, so every read falls back
   * to deriving it (see the render below), never assumes it's present. */
  vat_amount?: number
  client: { name: string }
  lines: Array<{ designation: string; unit: string; quantity: number; unit_price: number }>
}

interface QuoteVersionRow {
  id: string
  version_number: number
  snapshot: QuoteVersionSnapshot
  pdf_document_id: string | null
}

/**
 * Read-only issued-quote view — docs/04_ApplicationFlow.md §2.5's "Issued/
 * Accepted/Declined/Expired" state, docs/03_MasterPrompts.md §9.4 item 4.
 * Shows the quote EXACTLY as its frozen quote_versions.snapshot records it —
 * never re-derived from live quotes/quote_lines — plus a PDF download
 * restricted to the owner (KOV-FR-009), enforced by the Storage bucket's own
 * RLS policies (see supabase/migrations/0011), not just a hidden UI button.
 */
export function IssuedQuoteView({
  quote,
  onReopened,
  onQuoteChanged,
}: {
  quote: QuoteRow
  /** Called after the quote is successfully reverted to Draft — lets the
   * parent re-sync its editor state instead of forcing a full page reload. */
  onReopened: () => void
  /** Called after an acceptance/decline event is recorded — lets the parent
   * refetch so the updated status renders without a full page reload. */
  onQuoteChanged: () => void
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isOnline = useOnlineStatus()
  const [version, setVersion] = React.useState<QuoteVersionRow | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [downloadError, setDownloadError] = React.useState<string | null>(null)
  const [reopenError, setReopenError] = React.useState<string | null>(null)
  const [isReopening, setIsReopening] = React.useState(false)
  const [downloadStatus, setDownloadStatus] = React.useState<'idle' | 'preparing' | 'ready'>('idle')
  const [conversionError, setConversionError] = React.useState<string | null>(null)
  const [isConverting, setIsConverting] = React.useState(false)
  const [lastEventNote, setLastEventNote] = React.useState<string | null>(null)
  const fetchedFor = React.useRef<string | null>(null)
  // A ref, not the `isReopening` state check alone — see SatisfactionPage.tsx's
  // doc comment (module 15 deep audit, 2026-10-08). This status transition is
  // not idempotent-by-construction like handleCreateChantier below, so a
  // genuine same-tick double-click needs its own synchronous guard (module 20
  // close-out sweep, 2026-10-15).
  const reopeningRef = React.useRef(false)

  const load = React.useCallback(async () => {
    if (!quote.current_version_id) return
    setLoadError(null)
    try {
      const { data, error } = await apiRead((client) =>
        client
          .from('quote_versions')
          .select('id, version_number, snapshot, pdf_document_id')
          .eq('id', quote.current_version_id)
          .single(),
      )
      if (error) {
        setLoadError(error.message)
        return
      }
      setVersion(data as QuoteVersionRow)
    } catch (err) {
      setLoadError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }, [quote.current_version_id])

  React.useEffect(() => {
    if (!user || fetchedFor.current === quote.current_version_id) return
    fetchedFor.current = quote.current_version_id
    load()
  }, [user, quote.current_version_id, load])

  // Fetches the note (if any) from the most recent accept/decline event, so
  // it's actually shown once the quote has moved past 'issued' — previously
  // quote_events.note was schema-ready but write-only, never read back
  // anywhere (scope audit, 2026-09-26).
  React.useEffect(() => {
    if (quote.status !== 'accepted' && quote.status !== 'declined') return
    let cancelled = false
    apiRead((client) =>
      client
        .from('quote_events')
        .select('note')
        .eq('quote_id', quote.id)
        .in('event_type', ['accepted', 'declined'])
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    )
      .then(({ data }) => {
        if (!cancelled) setLastEventNote((data as { note: string | null } | null)?.note ?? null)
      })
      .catch(() => {
        // Non-fatal — the note is a supplementary display, not required for
        // the accepted/declined status itself to render correctly.
      })
    return () => {
      cancelled = true
    }
  }, [quote.id, quote.status])

  // Edit-after-issuance rule (docs/03_MasterPrompts.md §9.4 item 5): reopens
  // the SAME quotes.id back into an editable draft state — the already-
  // inserted quote_versions row (and its stored PDF) are never touched or
  // deleted, only quotes.status/current_version_id change here, so
  // re-issuing later correctly produces version_number+1 while version 1
  // remains completely intact and separately downloadable. Deliberately only
  // offered from 'issued' (not 'accepted'/'declined') — reopening an
  // Accepted quote for editing would undermine the client's actual
  // acceptance record; that status only moves forward via Step 10's
  // quote-to-chantier conversion, never back to Draft.
  async function handleReopenForEditing() {
    if (reopeningRef.current) return
    reopeningRef.current = true
    setIsReopening(true)
    setReopenError(null)
    try {
      const { error } = await apiWrite((client) =>
        client.from('quotes').update({ status: 'draft' }).eq('id', quote.id),
      )
      reopeningRef.current = false
      setIsReopening(false)
      if (error) {
        setReopenError(error.message)
        return
      }
      onReopened()
    } catch (err) {
      reopeningRef.current = false
      setIsReopening(false)
      setReopenError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }

  async function handleDownload() {
    if (!version?.pdf_document_id) return
    setDownloadError(null)
    setDownloadStatus('preparing')
    try {
      const { data: doc, error: docError } = await apiRead((client) =>
        client.from('documents').select('storage_path').eq('id', version.pdf_document_id).single(),
      )
      if (docError || !doc) {
        setDownloadStatus('idle')
        setDownloadError('Document introuvable.')
        return
      }
      // Storage RLS (owner-scoped path prefix, migration 0011) is the real
      // enforcement — this signed URL only ever succeeds for the caller's own
      // objects, not a UI-level restriction alone.
      const { data: signed, error: signError } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.storage_path, 60)
      if (signError || !signed) {
        setDownloadStatus('idle')
        setDownloadError('Impossible de générer le lien de téléchargement.')
        return
      }
      window.open(signed.signedUrl, '_blank', 'noopener,noreferrer')
      setDownloadStatus('ready')
      setTimeout(() => setDownloadStatus('idle'), 1600)
    } catch (err) {
      setDownloadStatus('idle')
      setDownloadError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }

  // Quote-to-chantier conversion (docs/03_MasterPrompts.md §10.2) — only
  // offered once status='accepted'. Idempotent by construction on the server
  // side (supabase/functions/quote-to-project) — a second tap (e.g. a
  // double-click, or reopening this view later) always lands on the SAME
  // projects row rather than erroring or duplicating, so this handler
  // navigates to the result either way without needing its own "already
  // exists" branch.
  async function handleCreateChantier() {
    setIsConverting(true)
    setConversionError(null)
    try {
      const { data, error } = await apiWrite((client) =>
        client.functions.invoke('quote-to-project', {
          body: { quoteId: quote.id },
        }),
      )
      setIsConverting(false)
      if (error || !data?.success) {
        setConversionError(
          (data as { error?: string } | null)?.error ??
            'La création du chantier a échoué. Tu peux réessayer.',
        )
        return
      }
      navigate(`/projects/${data.project.id}`)
    } catch (err) {
      setIsConverting(false)
      setConversionError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <InlineError message={loadError} onRetry={load} />
      </div>
    )
  }

  if (!version) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
        <Skeleton className="mb-4 h-4 w-16 rounded-xs" />
        <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <Skeleton className="h-7 w-48 rounded-xs" />
            <Skeleton className="mt-1 h-3.5 w-36 rounded-xs opacity-70" />
          </div>
          <Skeleton className="h-7 w-24 rounded-pill" />
        </div>
        <div className="rounded-md border border-divider/30 bg-surface/90 p-6 shadow-raised">
          <div className="mb-6 flex justify-between">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-32 rounded-xs" />
              <Skeleton className="h-3 w-48 rounded-xs opacity-60" />
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <Skeleton className="h-4 w-28 rounded-xs" />
              <Skeleton className="h-3 w-36 rounded-xs opacity-60" />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full rounded-sm" />
            <Skeleton className="h-10 w-full rounded-sm" />
            <Skeleton className="h-10 w-full rounded-sm" />
          </div>
          <div className="mt-6 flex justify-end">
            <Skeleton className="h-20 w-56 rounded-sm" />
          </div>
        </div>
      </div>
    )
  }

  const snapshot = version.snapshot

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
      <button
        type="button"
        onClick={() => navigate('/quotes')}
        className="mb-4 flex w-fit items-center gap-1.5 text-[13px] font-bold text-text-mid outline-none transition-colors hover:text-text-hi focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg"
      >
        <ArrowLeft size={16} strokeWidth={2.5} />
        Devis
      </button>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24 }}
        className="mb-4 flex items-center justify-between"
      >
        <div>
          <h1 className="font-serif text-[22px] font-black text-text-hi">{snapshot.reference}</h1>
          <p className="mt-0.5 text-[13px] text-text-mid">
            Document officiel émis
          </p>
        </div>
        <QuoteStatusBadge status={quote.status} />
      </motion.div>

      {/* The document-card entrance is deliberately calmer than a button-press
      moment (§9.1's easing note) — this is the frozen, trustworthy record of
      what was actually issued, so it settles in rather than snaps in. */}
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.36, ease: [0.4, 0, 0.2, 1], delay: 0.05 }}
        className="rounded-card border border-divider/60 bg-surface p-5 shadow-raised"
      >
        <div className="mb-4 flex items-center justify-between border-b border-divider/40 pb-3 text-[13px]">
          <span className="font-bold text-text-mid">
            Émis le {new Date(snapshot.issued_at).toLocaleDateString('fr-FR')}
          </span>
          <span className="text-[14px] font-bold text-text-hi">{snapshot.client.name}</span>
        </div>

        <ul className="mb-4 flex flex-col gap-2.5">
          {snapshot.lines.map((line, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: 0.15 + i * 0.03 }}
              className="flex items-start justify-between gap-3 text-[13px]"
            >
              <div className="min-w-0 flex-1 text-text-hi">
                <span>{line.designation}</span>{' '}
                <span className="whitespace-nowrap text-text-mid font-normal">
                  × {line.quantity} {line.unit}
                </span>
              </div>
              <span className="shrink-0 font-mono tabular-nums font-bold text-text-hi">
                {/* roundBankers — the same rounding rule mandated for every
                other commercial figure (docs/06_AIPromptRegistry.md §3.1),
                never .toFixed(2)'s round-half-away-from-zero. */}
                {roundBankers(line.quantity * line.unit_price).toFixed(2)} €
              </span>
            </motion.li>
          ))}
        </ul>

        <div className="flex flex-col gap-1.5 border-t border-divider/60 pt-3 text-[13px]">
          <div className="flex justify-between">
            <span className="text-text-mid">Sous-total HT</span>
            <span className="font-mono tabular-nums font-bold text-text-hi">
              {snapshot.subtotal_ht.toFixed(2)} €
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-mid">TVA ({snapshot.vat_rate}%)</span>
            <span className="font-mono tabular-nums font-bold text-text-hi">
              {/* Prefer the persisted, canonical vat_amount (added to the
              snapshot after this component originally shipped); fall back to
              deriving it for older already-issued quotes whose frozen
              snapshot predates this field. */}
              {(snapshot.vat_amount ?? snapshot.total_ttc - snapshot.subtotal_ht).toFixed(2)} €
            </span>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.24, delay: 0.25 }}
            className="mt-1 flex justify-between border-t border-divider/40 pt-2 text-[15px]"
          >
            <span className="font-extrabold text-text-hi">Total TTC</span>
            <span className="font-mono tabular-nums font-black text-text-hi">
              {snapshot.total_ttc.toFixed(2)} €
            </span>
          </motion.div>
        </div>
      </motion.div>

      {downloadError ? <InlineError message={downloadError} className="mt-4" /> : null}
      {reopenError ? <InlineError message={reopenError} className="mt-4" /> : null}

      <Button
        variant="primary"
        className="mt-4"
        onClick={handleDownload}
        disabled={downloadStatus === 'preparing'}
      >
        {downloadStatus === 'ready' ? (
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
            className="flex items-center gap-2"
          >
            <Check size={16} strokeWidth={2.5} />
            PDF ouvert
          </motion.span>
        ) : (
          <>
            <Download size={16} strokeWidth={2.5} />
            {downloadStatus === 'preparing'
              ? 'Préparation...'
              : `Télécharger le PDF (version ${version.version_number})`}
          </>
        )}
      </Button>

      {quote.status === 'issued' || quote.status === 'accepted' || quote.status === 'declined' ? (
        <QuoteAcceptancePanel
          quoteId={quote.id}
          quoteVersionId={quote.current_version_id ?? ''}
          status={quote.status}
          lastEventNote={lastEventNote}
          onRecorded={onQuoteChanged}
        />
      ) : null}

      {quote.status === 'accepted' ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.1 }}
        >
          {conversionError ? (
            <InlineError
              message={conversionError}
              onRetry={handleCreateChantier}
              className="mt-4"
            />
          ) : null}
          <Button
            variant="primary"
            className="mt-4"
            disabled={isConverting || !isOnline}
            onClick={handleCreateChantier}
          >
            <HardHat size={16} strokeWidth={2.25} />
            {isConverting ? 'Création du chantier...' : 'Créer le chantier'}
          </Button>
        </motion.div>
      ) : null}

      {quote.status === 'issued' ? (
        <Button
          variant="ghost"
          className="mt-2"
          disabled={isReopening || !isOnline}
          onClick={handleReopenForEditing}
          title="Rouvre ce devis pour modification — la version émise actuelle reste inchangée et téléchargeable ; réémettre créera une nouvelle version."
        >
          <Pencil size={16} strokeWidth={2} />
          {isReopening ? 'Réouverture...' : 'Modifier ce devis'}
        </Button>
      ) : null}
    </div>
  )
}

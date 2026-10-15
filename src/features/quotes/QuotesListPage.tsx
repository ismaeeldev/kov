import * as React from 'react'
import { Copy, FileText, Plus, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { QuoteStatusBadge, type QuoteStatus } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineError } from '@/components/ui/InlineError'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useMinDuration } from '@/hooks/useMinDuration'
import { apiRead, apiWrite, ApiTimeoutError } from '@/lib/apiClient'
import { generateReference } from './useQuoteEditor'
import { calculateQuoteTotals } from '@/lib/calc/quoteTotals'

interface QuoteListRow {
  id: string
  reference: string
  status: QuoteStatus
  total_ttc: number | null
  client_id: string
}

interface ClientOption {
  id: string
  name: string
}

const STATUS_FILTERS: { value: QuoteStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'draft', label: 'Brouillon' },
  { value: 'issued', label: 'Émis' },
  { value: 'accepted', label: 'Accepté' },
  { value: 'declined', label: 'Refusé' },
  { value: 'expired_cancelled', label: 'Expiré/Annulé' },
]

/**
 * Quotes list — s-devis, docs/03_MasterPrompts.md §8.3 item 5,
 * docs/04_ApplicationFlow.md §2.4. Paginated (client-side for this data
 * scale), search/filter by client or status.
 */
export default function QuotesListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [quotes, setQuotes] = React.useState<QuoteListRow[] | null>(null)
  const [clients, setClients] = React.useState<Record<string, string>>({})
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<QuoteStatus | 'all'>('all')
  const [duplicatingId, setDuplicatingId] = React.useState<string | null>(null)
  const [duplicateError, setDuplicateError] = React.useState<string | null>(null)
  const fetchedFor = React.useRef<string | null>(null)
  // A ref, not the `duplicatingId` state alone — see SatisfactionPage.tsx's
  // doc comment (module 15 deep audit, 2026-10-08). This handler had NO
  // pre-write guard at all (`duplicatingId` was only ever set, never checked
  // before starting), so a same-tick double-click created two duplicate
  // quotes. A Set keyed by source quote id so duplicating different quotes
  // concurrently still works (module 20 close-out sweep, 2026-10-15).
  const duplicatingIdsRef = React.useRef<Set<string>>(new Set())

  const load = React.useCallback(async () => {
    if (!user) return
    setLoadError(null)
    try {
      const [{ data: quotesData, error }, { data: clientsData }] = await Promise.all([
        apiRead((client) =>
          client
            .from('quotes')
            .select('id, reference, status, total_ttc, client_id')
            .eq('owner_id', user.id)
            .order('created_at', { ascending: false }),
        ),
        apiRead((client) => client.from('clients').select('id, name').eq('owner_id', user.id)),
      ])

      if (error) {
        setLoadError(error.message)
        return
      }
      setQuotes(quotesData as QuoteListRow[])
      const map: Record<string, string> = {}
      for (const c of (clientsData as ClientOption[]) ?? []) map[c.id] = c.name
      setClients(map)
    } catch (err) {
      setLoadError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }, [user])

  React.useEffect(() => {
    if (!user || fetchedFor.current === user.id) return
    fetchedFor.current = user.id
    load()
  }, [user, load])

  async function handleDuplicate(sourceQuote: QuoteListRow) {
    if (!user || duplicatingIdsRef.current.has(sourceQuote.id)) return
    duplicatingIdsRef.current.add(sourceQuote.id)
    setDuplicatingId(sourceQuote.id)
    setDuplicateError(null)

    try {
      // Read the source quote's own VAT rate/mention — previously this
      // function hardcoded `vat_rate: 20` and dropped vat_mention_code
      // entirely, so duplicating a reduced-rate (5.5%/10%), zero-rate, or
      // autoliquidation/export-mentioned quote silently reset it to standard
      // 20% VAT with no legal mention. A real money/legal-compliance bug if
      // the artisan doesn't notice before re-issuing (module 5 deep audit,
      // 2026-10-07).
      const { data: sourceQuoteFull, error: sourceQuoteError } = await apiRead((client) =>
        client
          .from('quotes')
          .select('vat_rate, vat_mention_code')
          .eq('id', sourceQuote.id)
          .single(),
      )
      if (sourceQuoteError) {
        setDuplicateError(sourceQuoteError.message)
        return
      }

      const { data: sourceLines, error: linesError } = await apiRead((client) =>
        client
          .from('quote_lines')
          .select(
            'designation, unit, quantity, unit_price, purchase_price, line_margin_pct, sort_order',
          )
          .eq('quote_id', sourceQuote.id)
          .order('sort_order', { ascending: true }),
      )
      if (linesError) {
        setDuplicateError(linesError.message)
        return
      }

      // Same collision-retry as useQuoteEditor.ts's createDraft — without
      // this, two references generated from the same `count` snapshot (e.g.
      // duplicating a quote at the same moment a new one is created in
      // another tab) surfaced a raw Postgres unique-constraint error to the
      // user instead of silently retrying with a fresh reference (module 5
      // deep audit, 2026-10-07).
      let newQuote: { id: string } | null = null
      let quoteError: { message: string } | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        const reference = await generateReference(user.id)
        const result = await apiWrite((client) =>
          client
            .from('quotes')
            .insert({
              owner_id: user.id,
              client_id: sourceQuote.client_id,
              reference,
              vat_rate: sourceQuoteFull.vat_rate,
              vat_mention_code: sourceQuoteFull.vat_mention_code,
              status: 'draft',
            })
            .select('id')
            .single(),
        )
        if (!result.error) {
          newQuote = result.data
          quoteError = null
          break
        }
        quoteError = result.error
        if (result.error.code !== '23505') break
      }
      if (quoteError || !newQuote) {
        setDuplicateError(quoteError?.message ?? 'Échec de la duplication du devis.')
        return
      }

      if (sourceLines && sourceLines.length > 0) {
        const { error: insertLinesError } = await apiWrite((client) =>
          client.from('quote_lines').insert(
            sourceLines.map((l) => ({
              quote_id: newQuote.id,
              owner_id: user.id,
              designation: l.designation,
              unit: l.unit,
              quantity: l.quantity,
              unit_price: l.unit_price,
              purchase_price: l.purchase_price,
              line_margin_pct: l.line_margin_pct,
              sort_order: l.sort_order,
            })),
          ),
        )
        if (insertLinesError) {
          setDuplicateError(insertLinesError.message)
          return
        }

        // Persist totals immediately rather than leaving them null until the
        // editor's own Devis-step effect happens to run — previously a
        // duplicated quote's subtotal_ht/total_ttc/projected_margin_pct sat
        // as null (displaying as "0,00 €" to anything reading the row
        // directly) until the artisan's browser rendered step 2 of the
        // editor. Same calculateQuoteTotals the editor itself uses, so the
        // figures can never disagree (module 5 deep audit, 2026-10-07).
        const totals = calculateQuoteTotals(sourceLines, sourceQuoteFull.vat_rate)
        await apiWrite((client) =>
          client
            .from('quotes')
            .update({
              subtotal_ht: totals.subtotal_ht,
              total_ttc: totals.total_ttc,
              projected_margin_pct: totals.projected_margin_pct,
            })
            .eq('id', newQuote.id),
        )
      }

      navigate(`/quotes/${newQuote.id}/edit`)
    } catch (err) {
      setDuplicateError(err instanceof ApiTimeoutError ? err.message : String(err))
    } finally {
      duplicatingIdsRef.current.delete(sourceQuote.id)
      setDuplicatingId(null)
    }
  }

  // Hook must be called unconditionally (before any early return) to satisfy
  // the Rules of Hooks.
  const showSkeleton = useMinDuration(quotes === null)

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <InlineError message={loadError} onRetry={load} />
      </div>
    )
  }

  if (showSkeleton) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6 lg:p-8">
        <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <Skeleton className="h-8 w-32 rounded-xs" />
            <Skeleton className="mt-1 h-3.5 w-48 rounded-xs opacity-75" />
          </div>
          <Skeleton className="h-9 w-32 rounded-sm" />
        </div>
        <Skeleton className="mb-3.5 h-12 w-full rounded-sm" />
        <div className="mb-5 flex flex-wrap gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-pill" />
          ))}
        </div>
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-sm border border-divider/30 bg-surface/80 p-4.5 shadow-raised"
            >
              <div className="flex items-center gap-3.5">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-36 rounded-xs" />
                  <Skeleton className="h-3 w-28 rounded-xs opacity-70" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end gap-1">
                  <Skeleton className="h-5 w-20 rounded-xs" />
                  <Skeleton className="h-3 w-16 rounded-xs opacity-60" />
                </div>
                <Skeleton className="h-6 w-20 rounded-pill" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // useMinDuration holds `showSkeleton` true slightly longer than the raw
  // `quotes === null` check it wraps, so TypeScript can no longer narrow
  // `quotes` from the branch above alone — always true in practice by the
  // time we get here, needed only to satisfy strict-null-checks.
  if (!quotes) return null

  const filtered = quotes.filter((q) => {
    if (statusFilter !== 'all' && q.status !== statusFilter) return false
    if (!search.trim()) return true
    const q2 = search.trim().toLowerCase()
    const clientName = clients[q.client_id]?.toLowerCase() ?? ''
    return q.reference.toLowerCase().includes(q2) || clientName.includes(q2)
  })

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6 lg:p-8">
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-serif text-[26px] font-black tracking-tight text-text-hi">Devis</h1>
          <p className="mt-1 text-[13px] font-medium text-text-mid">
            {quotes.length} devis enregistré{quotes.length > 1 ? 's' : ''} au total
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => navigate('/quotes/new')}
          className="shadow-accent-glow self-start sm:self-auto"
        >
          <Plus size={16} strokeWidth={2.5} />
          <span>Nouveau devis</span>
        </Button>
      </div>

      {quotes.length > 0 ? (
        <>
          <div className="mb-3.5">
            <Input
              placeholder="Rechercher par référence ou client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search size={16} />}
            />
          </div>
          <div className="mb-5 flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={`rounded-pill px-3.5 py-1.5 text-[11.5px] font-extrabold tracking-[0.03em] uppercase outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg ${
                  statusFilter === f.value
                    ? 'bg-brand-500 text-white shadow-accent-glow'
                    : 'bg-surface/80 text-text-mid border border-divider/30 hover:text-text-hi hover:bg-recessed'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {duplicateError ? <InlineError message={duplicateError} className="mb-4" /> : null}

      {quotes.length === 0 ? (
        <EmptyState
          icon={<FileText size={40} strokeWidth={1.5} />}
          heading="Aucun devis pour l'instant"
          description="Crée ton premier devis pour un client en quelques clics."
          actionLabel="Créer un devis"
          onAction={() => navigate('/quotes/new')}
        />
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-divider/30 bg-surface/80 p-8 text-center shadow-raised backdrop-blur-md">
          <p className="text-[13.5px] text-text-mid font-medium">
            Aucun devis ne correspond à &ldquo;{search}&rdquo;.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((q) => {
            const clientName = clients[q.client_id] ?? 'Client sans nom'
            const initials = clientName
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase())
              .join('')

            return (
              <li
                key={q.id}
                className="group relative flex items-center justify-between gap-3 rounded-md border border-divider/30 bg-surface/90 p-4.5 shadow-raised backdrop-blur-md transition-all duration-150 hover:border-brand-500/50 hover:shadow-floating"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/quotes/${q.id}/edit`)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-brand-500/10 font-bold text-brand-300 text-[13px] border border-brand-500/20">
                      {initials || 'CL'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-extrabold text-text-hi transition-colors group-hover:text-brand-300">
                        {clientName}
                      </div>
                      <div className="mt-0.5 font-mono text-[12px] text-text-low">{q.reference}</div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <QuoteStatusBadge status={q.status} />
                    <span className="font-mono text-[15px] font-black tabular-nums text-text-hi">
                      {(q.total_ttc ?? 0).toFixed(2)} €
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={`Dupliquer le devis ${q.reference}`}
                  disabled={duplicatingId === q.id}
                  onClick={() => handleDuplicate(q)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm text-text-low transition-colors hover:bg-recessed hover:text-text-hi outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-40"
                >
                  <Copy size={16} strokeWidth={2} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

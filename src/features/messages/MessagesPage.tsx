import * as React from 'react'
import { ArrowDownLeft, ArrowUpRight, MessageSquare } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineError } from '@/components/ui/InlineError'
import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useMinDuration } from '@/hooks/useMinDuration'
import { apiRead, ApiTimeoutError } from '@/lib/apiClient'

interface JournalRow {
  id: string
  client_id: string
  entry_type: string
  direction: 'inbound' | 'outbound'
  title: string
  occurred_at: string
}

interface ClientRow {
  id: string
  name: string
}

interface Thread {
  clientId: string
  clientName: string
  lastEntry: JournalRow
  awaitingReply: boolean
}

type Filter = 'tout' | 'recus' | 'sans_reponse'

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'tout', label: 'Tout' },
  { id: 'recus', label: 'Reçus' },
  { id: 'sans_reponse', label: 'Sans réponse' },
]

/**
 * s-msg — Messages (cross-client main courante view). docs/03_MasterPrompts.md
 * §13.3, docs/04_ApplicationFlow.md §2.13. One thread per client, sorted by
 * most recent exchange; three filters exactly (Tout/Reçus/Sans réponse — the
 * last case being the artisan's last message with no later client reply, the
 * "en attente" badge case). Thread tap navigates to the client record's main
 * courante section.
 */
export default function MessagesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [threads, setThreads] = React.useState<Thread[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [filter, setFilter] = React.useState<Filter>('tout')
  const fetchedFor = React.useRef<string | null>(null)

  const load = React.useCallback(async () => {
    if (!user) return
    setLoadError(null)

    let journalRows: JournalRow[] | null
    let clientRows: ClientRow[] | null

    try {
      const [{ data: journalData, error: journalError }, { data: clientData }] = await Promise.all([
        apiRead((client) =>
          client
            .from('journal')
            .select('id, client_id, entry_type, direction, title, occurred_at')
            .eq('owner_id', user.id)
            .order('occurred_at', { ascending: false }),
        ),
        apiRead((client) => client.from('clients').select('id, name').eq('owner_id', user.id)),
      ])

      if (journalError) {
        setLoadError(journalError.message)
        return
      }
      journalRows = journalData as JournalRow[] | null
      clientRows = clientData as ClientRow[] | null
    } catch (err) {
      setLoadError(
        err instanceof ApiTimeoutError ? err.message : 'Impossible de charger les messages.',
      )
      return
    }

    const clientsById = new Map((clientRows ?? []).map((c) => [c.id, c.name]))

    const rows = journalRows ?? []
    const lastEntryByClient = new Map<string, JournalRow>()
    const lastOutboundByClient = new Map<string, JournalRow>()
    const hasLaterInboundByClient = new Map<string, boolean>()

    for (const row of rows) {
      if (!lastEntryByClient.has(row.client_id)) {
        lastEntryByClient.set(row.client_id, row)
      }
      if (row.direction === 'outbound' && !lastOutboundByClient.has(row.client_id)) {
        lastOutboundByClient.set(row.client_id, row)
      }
      if (row.direction === 'inbound') {
        const lastOutbound = lastOutboundByClient.get(row.client_id)
        if (!lastOutbound) {
          hasLaterInboundByClient.set(row.client_id, true)
        }
      }
    }

    const result: Thread[] = Array.from(lastEntryByClient.entries()).map(
      ([clientId, lastEntry]) => {
        const lastOutbound = lastOutboundByClient.get(clientId)
        const awaitingReply = !!lastOutbound && !hasLaterInboundByClient.get(clientId)
        return {
          clientId,
          clientName: clientsById.get(clientId) ?? 'Client',
          lastEntry,
          awaitingReply,
        }
      },
    )

    result.sort(
      (a, b) =>
        new Date(b.lastEntry.occurred_at).getTime() - new Date(a.lastEntry.occurred_at).getTime(),
    )
    setThreads(result)
  }, [user])

  React.useEffect(() => {
    if (!user || fetchedFor.current === user.id) return
    fetchedFor.current = user.id
    load()
  }, [user, load])

  // Hook must be called unconditionally (before any early return) to satisfy
  // the Rules of Hooks — React would otherwise see a varying hook count once
  // loadError flips from null to set.
  const showSkeleton = useMinDuration(threads === null)

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <InlineError message={loadError} onRetry={load} />
      </div>
    )
  }

  if (showSkeleton) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
        <div className="mb-6">
          <Skeleton className="h-8 w-44 rounded-xs" />
          <Skeleton className="mt-1 h-3.5 w-64 rounded-xs opacity-70" />
        </div>
        <div className="mb-5 flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-pill" />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <SkeletonRow count={4} />
        </div>
      </div>
    )
  }

  // useMinDuration holds `showSkeleton` true slightly longer than the raw
  // `threads === null` check it wraps, so TypeScript can no longer narrow
  // `threads` from the branch above alone — always true in practice by the
  // time we get here, needed only to satisfy strict-null-checks.
  if (!threads) return null

  const filtered = threads.filter((t) => {
    if (filter === 'recus') return t.lastEntry.direction === 'inbound'
    if (filter === 'sans_reponse') return t.awaitingReply
    return true
  })

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
      <div className="mb-6">
        <h1 className="font-serif text-[26px] font-black text-text-hi">Messages</h1>
        <p className="mt-1 text-[13px] text-text-mid">
          Échanges récents et suivi des communications clients.
        </p>
      </div>

      {threads.length > 0 ? (
        <div className="mb-5 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-pill px-4 py-1.5 text-[12px] font-extrabold transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg ${
                filter === f.id
                  ? 'bg-brand-700 text-white shadow-sm'
                  : 'bg-recessed text-text-mid hover:text-text-hi'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}

      {threads.length === 0 ? (
        <EmptyState
          icon={<MessageSquare size={40} strokeWidth={1.5} />}
          heading="Aucun échange pour l'instant"
          description="Les messages et notes ajoutés à la main courante apparaîtront ici."
        />
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-text-mid">
          Aucun message ne correspond à ce filtre.
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {filtered.map((thread) => {
            const isInbound = thread.lastEntry.direction === 'inbound'
            return (
              <li key={thread.clientId}>
                <button
                  type="button"
                  onClick={() => navigate(`/clients/${thread.clientId}`)}
                  className="group flex w-full items-center justify-between gap-3.5 rounded-2xl border border-divider/60 bg-surface p-4 text-left shadow-raised transition-all hover:border-brand-500/40 hover:shadow-floating focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface outline-none"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform group-hover:scale-105 ${
                      isInbound
                        ? 'bg-info/15 text-info-text border border-info/25'
                        : 'bg-brand-500/15 text-brand-300 border border-brand-500/25'
                    }`}
                    aria-hidden="true"
                  >
                    {isInbound ? (
                      <ArrowDownLeft size={18} strokeWidth={2.2} />
                    ) : (
                      <ArrowUpRight size={18} strokeWidth={2.2} />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-extrabold text-text-hi group-hover:text-brand-300 transition-colors">
                      {thread.clientName}
                    </div>
                    <div className="truncate text-[12.5px] text-text-mid">
                      {thread.lastEntry.title}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="font-mono text-[11.5px] tabular-nums text-text-low">
                      {new Date(thread.lastEntry.occurred_at).toLocaleDateString('fr-FR')}
                    </span>
                    {thread.awaitingReply ? (
                      <span className="rounded-pill border border-gold-400/40 bg-gold-100 px-2.5 py-0.5 text-[10px] font-extrabold text-gold-tint-text uppercase tracking-wide">
                        En attente
                      </span>
                    ) : null}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}


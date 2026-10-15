import * as React from 'react'
import { ArrowLeft, CalendarCheck, CheckCircle2, SmilePlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineError } from '@/components/ui/InlineError'
import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useMinDuration } from '@/hooks/useMinDuration'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { apiRead, apiWrite, ApiTimeoutError } from '@/lib/apiClient'

interface ClientFollowup {
  id: string
  name: string
  next_followup_reminder: string | null
}

/**
 * Satisfaction (/profile/satisfaction) — docs/04_ApplicationFlow.md §2.19.
 * Lightweight post-chantier check-in tracking: surfaces each active client's
 * `next_followup_reminder` (clients.next_followup_reminder — set manually on
 * the client record today; no automated scheduling exists yet) and lets the
 * artisan mark a check-in as sent (clears the reminder date + feeds the
 * client's journal with a 'note' entry, the same generic entry_type already
 * used by ConflictModal/FinancingModal for non-channel-specific notes).
 */
export default function SatisfactionPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isOnline = useOnlineStatus()
  const [clients, setClients] = React.useState<ClientFollowup[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [sendingId, setSendingId] = React.useState<string | null>(null)
  const [sendError, setSendError] = React.useState<string | null>(null)
  const fetchedFor = React.useRef<string | null>(null)
  // A ref, not just the `sendingId` state check below — state read inside a
  // regular function closure can still be stale when two click handlers fire
  // in the same tick (React batches the setState calls, so a second
  // same-tick call can read the pre-update value and pass the guard too).
  // A ref's `.current` is read/written synchronously with no batching, so it
  // actually closes the race a state-only check cannot (found live: a
  // genuine concurrent double-click on this exact button produced 2 journal
  // rows despite the state-only guard — module 15 deep audit, 2026-10-08,
  // same correct pattern AgentPage.tsx's isExecutingRef already used).
  const sendingRef = React.useRef(false)

  const load = React.useCallback(async () => {
    if (!user) return
    setLoadError(null)
    try {
      const { data, error } = await apiRead((client) =>
        client
          .from('clients')
          .select('id, name, next_followup_reminder')
          .eq('owner_id', user.id)
          .eq('status', 'active')
          .not('next_followup_reminder', 'is', null)
          .order('next_followup_reminder', { ascending: true }),
      )

      if (error) {
        setLoadError(error.message)
        return
      }
      setClients(data as ClientFollowup[])
    } catch (err) {
      setLoadError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }, [user])

  React.useEffect(() => {
    if (!user || fetchedFor.current === user.id) return
    fetchedFor.current = user.id
    load()
  }, [user, load])

  async function markSent(client: ClientFollowup) {
    if (!user || sendingRef.current) return
    sendingRef.current = true
    setSendingId(client.id)
    setSendError(null)

    try {
      const { error: journalError } = await apiWrite((client_) =>
        client_.from('journal').insert({
          owner_id: user.id,
          client_id: client.id,
          entry_type: 'note',
          direction: 'outbound',
          title: 'Suivi de satisfaction envoyé',
          body: `Suivi de satisfaction post-chantier envoyé à ${client.name}.`,
          occurred_at: new Date().toISOString(),
        }),
      )
      if (journalError) {
        sendingRef.current = false
        setSendingId(null)
        setSendError(journalError.message)
        return
      }

      const { error: updateError } = await apiWrite((client_) =>
        client_.from('clients').update({ next_followup_reminder: null }).eq('id', client.id),
      )
      if (updateError) {
        sendingRef.current = false
        setSendingId(null)
        // The journal entry above already succeeded — this failure only
        // leaves the reminder still set, so a retry would duplicate that
        // journal note. Say so explicitly rather than a bare error message,
        // since silently retrying here is not actually safe.
        setSendError(
          `Note de suivi enregistrée, mais le rappel n'a pas pu être retiré : ${updateError.message}. Ne relance pas l'envoi — retire le rappel manuellement si besoin.`,
        )
        return
      }
    } catch (err) {
      sendingRef.current = false
      setSendingId(null)
      setSendError(err instanceof ApiTimeoutError ? err.message : String(err))
      return
    }
    sendingRef.current = false

    setSendingId(null)
    load()
  }

  // Hook must be called unconditionally (before any early return) to satisfy
  // the Rules of Hooks.
  const showSkeleton = useMinDuration(clients === null)

  if (loadError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <InlineError message={loadError} onRetry={load} />
      </div>
    )
  }

  if (showSkeleton) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-4xl flex-col p-4 sm:p-6">
        <Skeleton className="mb-4 h-4 w-16 rounded-xs" />
        <Skeleton className="mb-1 h-8 w-56 rounded-xs" />
        <Skeleton className="mb-6 h-3.5 w-72 rounded-xs opacity-70" />
        <div className="flex flex-col gap-3">
          <SkeletonRow count={4} hasAvatar />
        </div>
      </div>
    )
  }

  // useMinDuration holds `showSkeleton` true slightly longer than the raw
  // `clients === null` check it wraps, so TypeScript can no longer narrow
  // `clients` from the branch above alone — always true in practice by the
  // time we get here, needed only to satisfy strict-null-checks.
  if (!clients) return null

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-4xl flex-col p-4 sm:p-6">
      <button
        type="button"
        onClick={() => navigate('/profile')}
        className="mb-4 inline-flex w-fit items-center gap-1.5 text-[13px] font-bold text-text-mid transition-colors hover:text-text-hi outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg rounded-sm"
      >
        <ArrowLeft size={16} strokeWidth={2.5} />
        Profil
      </button>

      <div className="mb-6">
        <h1 className="font-serif text-[24px] sm:text-[28px] font-black tracking-tight text-text-hi">
          Satisfaction client
        </h1>
        <p className="mt-1 text-[13px] text-text-mid">
          Suivi relationnel post-chantier et relances de recommandation
        </p>
      </div>

      {sendError ? <InlineError message={sendError} className="mb-4" /> : null}

      {clients.length === 0 ? (
        <EmptyState
          icon={<SmilePlus size={44} strokeWidth={1.5} className="text-brand-500" />}
          heading="Rien à suivre pour le moment."
          description="Un rappel de suivi apparaîtra ici dès que tu en programmeras un depuis la fiche d'un client."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {clients.map((client) => (
            <li
              key={client.id}
              className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-divider/60 bg-surface p-4.5 shadow-sm transition-all hover:border-brand-500/40 hover:shadow-md"
            >
              <button
                type="button"
                onClick={() => navigate(`/clients/${client.id}`)}
                className="flex min-w-0 flex-1 items-center gap-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-lg"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 font-bold border border-brand-200/50 dark:border-brand-800/50">
                  <CalendarCheck size={20} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-extrabold text-text-hi group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {client.name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-text-mid">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold-500" />
                    <span>
                      Rappel prévu le{' '}
                      <strong className="font-semibold text-text-hi">
                        {new Date(client.next_followup_reminder!).toLocaleDateString('fr-FR')}
                      </strong>
                    </span>
                  </div>
                </div>
              </button>

              <div className="flex items-center justify-end border-t border-divider/40 pt-3 sm:border-0 sm:pt-0">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!isOnline || sendingId === client.id}
                  onClick={() => markSent(client)}
                  className="w-full sm:w-auto border border-divider/60 font-bold gap-1.5 text-xs shadow-xs"
                >
                  <CheckCircle2 size={14} strokeWidth={2} className="text-success-text" />
                  {sendingId === client.id ? 'Envoi en cours...' : 'Marquer envoyé'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}


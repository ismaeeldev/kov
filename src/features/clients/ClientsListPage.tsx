import * as React from 'react'
import { ChevronRight, MapPin, Plus, Search, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineError } from '@/components/ui/InlineError'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useMinDuration } from '@/hooks/useMinDuration'
import { apiRead, ApiTimeoutError } from '@/lib/apiClient'

interface ClientRow {
  id: string
  name: string
  address: { city?: string } | null
  status: 'active' | 'archived'
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

/**
 * Clients list (s-clients) — docs/03_MasterPrompts.md §7.3,
 * docs/04_ApplicationFlow.md §2.6. Real-time search by name/city. Archived
 * clients excluded by default, reachable via an explicit toggle.
 */
export default function ClientsListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [clients, setClients] = React.useState<ClientRow[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [showArchived, setShowArchived] = React.useState(false)
  const fetchedFor = React.useRef<string | null>(null)

  const load = React.useCallback(async () => {
    if (!user) return
    setLoadError(null)
    try {
      const { data, error } = await apiRead((client) =>
        client
          .from('clients')
          .select('id, name, address, status')
          .eq('owner_id', user.id)
          .order('name', { ascending: true }),
      )

      if (error) {
        setLoadError(error.message)
        return
      }
      setClients(data as ClientRow[])
    } catch (err) {
      setLoadError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }, [user])

  React.useEffect(() => {
    if (!user || fetchedFor.current === user.id) return
    fetchedFor.current = user.id
    load()
  }, [user, load])

  // Hook must be called unconditionally (before any early return) to satisfy
  // the Rules of Hooks.
  const showSkeleton = useMinDuration(clients === null)

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
            <Skeleton className="mt-1 h-3.5 w-44 rounded-xs opacity-75" />
          </div>
          <Skeleton className="h-9 w-36 rounded-sm" />
        </div>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Skeleton className="h-12 flex-1 rounded-sm" />
          <Skeleton className="h-11 w-44 rounded-sm" />
        </div>
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-sm border border-divider/30 bg-surface/80 p-4 shadow-raised"
            >
              <div className="flex items-center gap-3.5">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-40 rounded-xs" />
                  <Skeleton className="h-3 w-32 rounded-xs opacity-70" />
                </div>
              </div>
              <Skeleton className="h-4 w-4 rounded-xs opacity-40" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // useMinDuration holds `showSkeleton` true slightly longer than the raw
  // `clients === null` check it wraps, so TypeScript can no longer narrow
  // `clients` from the branch above alone — always true in practice by the
  // time we get here, needed only to satisfy strict-null-checks.
  if (!clients) return null

  const filtered = clients.filter((c) => {
    if (!showArchived && c.status === 'archived') return false
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return c.name.toLowerCase().includes(q) || (c.address?.city ?? '').toLowerCase().includes(q)
  })

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6 lg:p-8">
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-serif text-[26px] font-black tracking-tight text-text-hi">Clients</h1>
          <p className="mt-1 text-[13px] font-medium text-text-mid">
            {clients.length} contact{clients.length > 1 ? 's' : ''} enregistré{clients.length > 1 ? 's' : ''}
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => navigate('/clients/new')}
          className="shadow-accent-glow self-start sm:self-auto"
        >
          <Plus size={16} strokeWidth={2.5} />
          <span>Ajouter un client</span>
        </Button>
      </div>

      {clients.length > 0 ? (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input
              placeholder="Rechercher par nom ou ville..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search size={16} />}
            />
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-sm border border-divider/30 bg-surface/80 px-3.5 py-3 text-[12px] font-bold text-text-mid hover:text-text-hi select-none transition-all">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-[18px] w-[18px] rounded-xs border-[1.5px] border-divider bg-surface text-brand-500 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg cursor-pointer"
            />
            Voir les clients archivés
          </label>
        </div>
      ) : null}

      {clients.length === 0 ? (
        <EmptyState
          icon={<Users size={40} strokeWidth={1.5} />}
          heading="Aucun client pour l'instant"
          description="Ajoute ton premier client pour commencer à créer des devis."
          actionLabel="Ajouter un client"
          onAction={() => navigate('/clients/new')}
        />
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-divider/30 bg-surface/80 p-8 text-center shadow-raised backdrop-blur-md">
          <p className="text-[13.5px] text-text-mid font-medium">
            Aucun contact ne correspond à &ldquo;{search}&rdquo;.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((client) => (
            <li key={client.id}>
              <button
                type="button"
                onClick={() => navigate(`/clients/${client.id}`)}
                className="group flex w-full items-center justify-between gap-4 rounded-md border border-divider/30 bg-surface/90 p-4.5 text-left shadow-raised backdrop-blur-md transition-all duration-150 outline-none hover:border-brand-500/50 hover:shadow-floating active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <div className="flex min-w-0 items-center gap-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-brand-500/30 bg-gradient-to-br from-brand-900/40 to-brand-700/25 font-mono text-[13px] font-bold text-brand-300 shadow-xs transition-colors group-hover:border-brand-500/60">
                    {initials(client.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-extrabold text-text-hi transition-colors group-hover:text-brand-300">
                      {client.name}
                    </div>
                    {client.address?.city ? (
                      <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-text-mid">
                        <MapPin size={13} className="shrink-0 text-brand-300/70" />
                        <span className="truncate">{client.address.city}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2.5">
                  {client.status === 'archived' ? (
                    <Badge tone="neutral">Archivé</Badge>
                  ) : null}
                  <ChevronRight
                    size={18}
                    className="text-text-low transition-all group-hover:translate-x-1 group-hover:text-brand-300"
                  />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

import * as React from 'react'
import { AlertTriangle, Calendar } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineError } from '@/components/ui/InlineError'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useMinDuration } from '@/hooks/useMinDuration'
import { useOwnerRecord } from '@/hooks/useOwnerRecord'
import { apiRead, ApiTimeoutError } from '@/lib/apiClient'
import { ConflictModal } from './ConflictModal'
import {
  conflictedProjectIds,
  detectPlanningConflicts,
  type PlanningConflict,
  type PlanningProject,
} from './conflictDetection'
import { currentWeekBounds } from './usePlanningConflictBadge'

interface EmployeeRow {
  id: string
  name: string
}

const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

function weekDays(startIso: string): string[] {
  const start = new Date(startIso + 'T00:00:00Z')
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setUTCDate(d.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

function projectSpansDay(project: PlanningProject, day: string): boolean {
  if (!project.start_date || !project.end_date) return false
  return project.start_date <= day && day <= project.end_date
}

/**
 * s-planning — Planning. docs/03_MasterPrompts.md §13.4,
 * docs/01_ScopeDocument.md §5.10 (module 6.10). Week view, chantiers per
 * day with assigned employees, conflict detection with a tab-level badge
 * (wired in AppShell.tsx via usePlanningConflictBadge) and per-chip warning
 * icons. Only meaningful in team mode — de-emphasized for solo businesses
 * per docs/04_ApplicationFlow.md §2.3's explicit scope note.
 */
export default function PlanningPage() {
  const { user } = useAuth()
  const { profile } = useOwnerRecord()
  const [projects, setProjects] = React.useState<PlanningProject[] | null>(null)
  const [employees, setEmployees] = React.useState<EmployeeRow[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [activeConflict, setActiveConflict] = React.useState<PlanningConflict | null>(null)
  const [journalWarning, setJournalWarning] = React.useState<string | null>(null)
  const fetchedFor = React.useRef<string | null>(null)

  const { start, end } = React.useMemo(() => currentWeekBounds(), [])
  const days = React.useMemo(() => weekDays(start), [start])

  const load = React.useCallback(async () => {
    if (!user) return
    setLoadError(null)

    try {
      const [{ data: projectsData, error: projectsError }, { data: employeesData }] =
        await Promise.all([
          apiRead((client) =>
            client
              .from('projects')
              .select('id, name, client_id, assigned_employee_ids, start_date, end_date')
              .eq('owner_id', user.id)
              .not('start_date', 'is', null)
              .lte('start_date', end)
              .gte('end_date', start),
          ),
          apiRead((client) =>
            client.from('employees').select('id, name').eq('owner_id', user.id).eq('active', true),
          ),
        ])

      if (projectsError) {
        setLoadError(projectsError.message)
        return
      }
      setProjects((projectsData as PlanningProject[]) ?? [])
      setEmployees((employeesData as EmployeeRow[]) ?? [])
    } catch (err) {
      setLoadError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }, [user, start, end])

  React.useEffect(() => {
    if (!user || fetchedFor.current === `${user.id}:${start}`) return
    fetchedFor.current = `${user.id}:${start}`
    load()
  }, [user, start, load])

  // Hook must be called unconditionally (before any early return) to satisfy
  // the Rules of Hooks.
  const showSkeleton = useMinDuration(projects === null || employees === null)

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
          <Skeleton className="h-8 w-60 rounded-xs" />
          <Skeleton className="mt-1.5 h-3.5 w-80 rounded-xs opacity-75" />
        </div>
        <div className="flex flex-col gap-3.5">
          {['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'].map((day, i) => (
            <div
              key={day}
              className="rounded-md border border-divider/40 bg-surface/85 p-4.5 shadow-raised"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="h-4 w-24 rounded-xs" />
                  {i === 0 ? <Skeleton className="h-4 w-16 rounded-pill" /> : null}
                </div>
                <Skeleton className="h-3 w-16 rounded-xs opacity-60" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between rounded-sm border border-divider/30 bg-recessed/80 p-3.5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-4 w-32 rounded-xs" />
                    <Skeleton className="h-3.5 w-20 rounded-xs opacity-70" />
                  </div>
                  <Skeleton className="h-4 w-16 rounded-pill" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // useMinDuration holds `showSkeleton` true slightly longer than the raw
  // nullable check it wraps, so TypeScript can no longer narrow these
  // variables from the branch above alone — always true in practice by the
  // time we get here, needed only to satisfy strict-null-checks.
  if (projects === null || employees === null) return null

  const employeesById = new Map(employees.map((e) => [e.id, e.name]))
  const conflicts = detectPlanningConflicts(projects)
  const conflictedIds = conflictedProjectIds(conflicts)

  const isSolo = profile?.team_mode === 'solo'

  if (isSolo) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
        <div className="mb-6">
          <h1 className="font-serif text-[24px] font-black tracking-tight text-text-hi">Planning Hebdomadaire</h1>
          <p className="mt-0.5 text-[13px] text-text-mid">
            Visualisation des affectations et chantiers de la semaine.
          </p>
        </div>
        <EmptyState
          icon={<Calendar size={40} strokeWidth={1.5} />}
          heading="Le planning d'équipe n'est pas utile en solo"
          description="Passe en mode équipe dans les réglages de l'entreprise pour suivre plusieurs chantiers et employés en parallèle."
        />
      </div>
    )
  }

  const projectA = activeConflict
    ? projects.find((p) => p.id === activeConflict.projectAId)
    : undefined
  const projectB = activeConflict
    ? projects.find((p) => p.id === activeConflict.projectBId)
    : undefined

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-[24px] font-black tracking-tight text-text-hi">Planning Hebdomadaire</h1>
          <p className="mt-0.5 text-[13px] text-text-mid">
            Planning des chantiers et détection des conflits de disponibilité.
          </p>
        </div>
      </div>

      {journalWarning ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-md border-2 border-gold-500 bg-gold-100 p-3.5 text-[13px] font-bold text-gold-tint-text shadow-xs">
          <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
          <span className="flex-1">{journalWarning}</span>
          <button
            type="button"
            onClick={() => setJournalWarning(null)}
            aria-label="Fermer cet avertissement"
            className="shrink-0 text-[11px] underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Fermer
          </button>
        </div>
      ) : null}

      {projects.length === 0 ? (
        <EmptyState
          icon={<Calendar size={40} strokeWidth={1.5} />}
          heading="Aucun chantier planifié cette semaine"
          description="Les dates de début et de fin se configurent depuis la fiche chantier."
        />
      ) : (
        <div className="flex flex-col gap-3.5">
          {days.map((day, i) => {
            const dayProjects = projects.filter((p) => projectSpansDay(p, day))
            const isToday = new Date().toISOString().slice(0, 10) === day

            return (
              <div
                key={day}
                className={`rounded-md border p-4.5 shadow-raised transition-all backdrop-blur-md ${
                  isToday
                    ? 'border-brand-500/50 bg-surface/95 ring-1 ring-brand-500/20'
                    : 'border-divider/40 bg-surface/85'
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <p className="text-[12px] font-extrabold tracking-[0.06em] text-text-hi uppercase">
                      {DAY_LABELS[i]} {new Date(day + 'T00:00:00Z').getUTCDate()}
                    </p>
                    {isToday && (
                      <span className="rounded-pill bg-brand-500/15 px-2 py-0.5 text-[10px] font-extrabold text-brand-300">
                        Aujourd'hui
                      </span>
                    )}
                  </div>
                  <span className="text-[11.5px] font-semibold text-text-low">
                    {dayProjects.length} chantier{dayProjects.length > 1 ? 's' : ''}
                  </span>
                </div>
                {dayProjects.length === 0 ? (
                  <p className="text-[12px] font-medium text-text-low/80 italic">— Aucun chantier programmé</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {dayProjects.map((p) => {
                      const hasConflict = conflictedIds.has(p.id)
                      return (
                        <li
                          key={p.id}
                          className={`flex items-center gap-3 rounded-sm p-3.5 text-[13px] font-bold transition-all ${
                            hasConflict
                              ? 'border border-error/40 bg-error-bg/25 text-error-text shadow-sm'
                              : 'border border-divider/30 bg-recessed/80 text-text-hi hover:border-divider/60'
                          }`}
                        >
                          {hasConflict ? (
                            <button
                              type="button"
                              onClick={() =>
                                setActiveConflict(
                                  conflicts.find(
                                    (c) => c.projectAId === p.id || c.projectBId === p.id,
                                  ) ?? null,
                                )
                              }
                              aria-label="Voir le conflit"
                              className="rounded-full bg-error/15 p-1.5 text-error-text hover:bg-error/25 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                            >
                              <AlertTriangle size={15} strokeWidth={2.5} className="animate-pulse text-error" />
                            </button>
                          ) : (
                            <span className="h-2 w-2 rounded-full bg-brand-500/80 shrink-0" />
                          )}
                          <span className="flex-1 truncate font-extrabold">{p.name}</span>
                          <span className="shrink-0 text-[11.5px] font-semibold text-text-mid bg-surface/60 px-2.5 py-1 rounded-xs border border-divider/20">
                            {p.assigned_employee_ids
                              .map((id) => employeesById.get(id) ?? '?')
                              .join(', ')}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}

      {activeConflict && projectA && projectB ? (
        <ConflictModal
          conflict={activeConflict}
          projectA={projectA}
          projectB={projectB}
          employees={employees}
          allProjects={projects}
          onClose={() => setActiveConflict(null)}
          onResolved={(warning) => {
            setActiveConflict(null)
            setJournalWarning(warning ?? null)
            load()
          }}
        />
      ) : null}
    </div>
  )
}

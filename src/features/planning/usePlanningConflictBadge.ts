import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { apiRead } from '@/lib/apiClient'
import { detectPlanningConflicts, type PlanningConflict, type PlanningProject } from './conflictDetection'

/** Sunday-to-Saturday week bounds containing `date` (ISO date strings). */
export function currentWeekBounds(date: Date = new Date()): { start: string; end: string } {
  const start = new Date(date)
  start.setDate(start.getDate() - start.getDay())
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

/** Lightweight conflict check for the current week, reused by AppShell.tsx
 * (the nav-tab warning badge), PlanningPage.tsx (the full week view), and
 * HomePage.tsx (the smart action list) so none of the three ever disagree
 * about whether a conflict exists. */
export function usePlanningConflictBadge(): boolean {
  return usePlanningConflicts().length > 0
}

/** Same underlying fetch as usePlanningConflictBadge, but exposes the actual
 * conflicts list — added for HomePage.tsx's smart action list (scope audit,
 * 2026-09-26: planning conflicts were entirely absent from Home's action
 * list, even though the badge/detection already existed elsewhere). */
export function usePlanningConflicts(): PlanningConflict[] {
  const { user } = useAuth()
  const [conflicts, setConflicts] = useState<PlanningConflict[]>([])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      const { start, end } = currentWeekBounds()
      try {
        const { data } = await apiRead((client) =>
          client
            .from('projects')
            .select('id, name, client_id, assigned_employee_ids, start_date, end_date')
            .eq('owner_id', user.id)
            .not('start_date', 'is', null)
            .lte('start_date', end)
            .gte('end_date', start),
        )

        if (cancelled) return
        setConflicts(detectPlanningConflicts((data as PlanningProject[]) ?? []))
      } catch {
        // No local error-display path for this lightweight hook (same as the
        // pre-existing behavior of silently ignoring a fetch error) — a
        // timeout/error simply leaves conflicts at its current value.
        if (cancelled) return
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  return conflicts
}

/**
 * conflictDetection — docs/03_MasterPrompts.md §13.4 item 2,
 * docs/01_ScopeDocument.md §5.10 (module 6.10). For a visible week, computes
 * whether any single employee is assigned to two chantiers with overlapping
 * date ranges — pure, framework-independent, unit-testable.
 */

export interface PlanningProject {
  id: string
  name: string
  client_id: string
  assigned_employee_ids: string[]
  start_date: string | null
  end_date: string | null
}

export interface PlanningConflict {
  employeeId: string
  projectAId: string
  projectBId: string
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  // Inclusive date ranges — two chantiers on the exact same single day both
  // count as overlapping (aStart <= bEnd && bStart <= aEnd).
  return aStart <= bEnd && bStart <= aEnd
}

/**
 * Returns every (employee, chantier A, chantier B) triple where that
 * employee is assigned to both chantiers and their date ranges overlap.
 * Projects with no dates or no assigned employees are skipped (nothing to
 * conflict on) rather than treated as an error.
 */
export function detectPlanningConflicts(projects: PlanningProject[]): PlanningConflict[] {
  const conflicts: PlanningConflict[] = []
  const dated = projects.filter(
    (p) => p.start_date && p.end_date && p.assigned_employee_ids.length > 0,
  )

  for (let i = 0; i < dated.length; i++) {
    for (let j = i + 1; j < dated.length; j++) {
      const a = dated[i]
      const b = dated[j]
      if (!rangesOverlap(a.start_date!, a.end_date!, b.start_date!, b.end_date!)) continue

      const sharedEmployees = a.assigned_employee_ids.filter((id) =>
        b.assigned_employee_ids.includes(id),
      )
      for (const employeeId of sharedEmployees) {
        conflicts.push({ employeeId, projectAId: a.id, projectBId: b.id })
      }
    }
  }

  return conflicts
}

/** Returns the set of project ids that appear in at least one conflict —
 * used to flag individual chantier chips with a warning icon. */
export function conflictedProjectIds(conflicts: PlanningConflict[]): Set<string> {
  const ids = new Set<string>()
  for (const c of conflicts) {
    ids.add(c.projectAId)
    ids.add(c.projectBId)
  }
  return ids
}

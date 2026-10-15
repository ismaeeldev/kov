import { describe, expect, it } from 'vitest'
import {
  conflictedProjectIds,
  detectPlanningConflicts,
  type PlanningProject,
} from './conflictDetection'

function project(
  id: string,
  employees: string[],
  start: string | null,
  end: string | null,
  name = id,
): PlanningProject {
  return {
    id,
    name,
    client_id: `client-${id}`,
    assigned_employee_ids: employees,
    start_date: start,
    end_date: end,
  }
}

describe('detectPlanningConflicts', () => {
  it('detects a conflict: same employee, two chantiers, overlapping dates', () => {
    const projects = [
      project('p1', ['emp-1'], '2026-09-14', '2026-09-16'),
      project('p2', ['emp-1'], '2026-09-15', '2026-09-17'),
    ]
    const conflicts = detectPlanningConflicts(projects)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ employeeId: 'emp-1', projectAId: 'p1', projectBId: 'p2' })
  })

  it('does not flag two chantiers with the same employee but non-overlapping dates', () => {
    const projects = [
      project('p1', ['emp-1'], '2026-09-14', '2026-09-15'),
      project('p2', ['emp-1'], '2026-09-16', '2026-09-17'),
    ]
    expect(detectPlanningConflicts(projects)).toHaveLength(0)
  })

  it('does not flag overlapping dates with different employees', () => {
    const projects = [
      project('p1', ['emp-1'], '2026-09-14', '2026-09-16'),
      project('p2', ['emp-2'], '2026-09-14', '2026-09-16'),
    ]
    expect(detectPlanningConflicts(projects)).toHaveLength(0)
  })

  it('flags a single-day overlap on the exact boundary date (inclusive ranges)', () => {
    const projects = [
      project('p1', ['emp-1'], '2026-09-14', '2026-09-15'),
      project('p2', ['emp-1'], '2026-09-15', '2026-09-16'),
    ]
    expect(detectPlanningConflicts(projects)).toHaveLength(1)
  })

  it('skips projects with no dates or no assigned employees', () => {
    const projects = [
      project('p1', [], '2026-09-14', '2026-09-16'),
      project('p2', ['emp-1'], null, null),
      project('p3', ['emp-1'], '2026-09-14', '2026-09-16'),
    ]
    expect(detectPlanningConflicts(projects)).toHaveLength(0)
  })

  it('detects a conflict when two employees are BOTH shared and overlapping (one conflict entry per shared employee)', () => {
    const projects = [
      project('p1', ['emp-1', 'emp-2'], '2026-09-14', '2026-09-16'),
      project('p2', ['emp-1', 'emp-2'], '2026-09-15', '2026-09-17'),
    ]
    const conflicts = detectPlanningConflicts(projects)
    expect(conflicts).toHaveLength(2)
    expect(conflicts.map((c) => c.employeeId).sort()).toEqual(['emp-1', 'emp-2'])
  })
})

describe('conflictedProjectIds', () => {
  it('returns the set of project ids involved in at least one conflict', () => {
    const conflicts = [{ employeeId: 'emp-1', projectAId: 'p1', projectBId: 'p2' }]
    expect(conflictedProjectIds(conflicts)).toEqual(new Set(['p1', 'p2']))
  })

  it('returns an empty set for no conflicts', () => {
    expect(conflictedProjectIds([])).toEqual(new Set())
  })
})

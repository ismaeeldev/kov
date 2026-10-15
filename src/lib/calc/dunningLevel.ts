/**
 * dunning-level-calc — docs/06_AIPromptRegistry.md §3.5,
 * docs/01_ScopeDocument.md §5.8 (module 6.8's exact threshold table).
 *
 * Pure, framework-independent TypeScript — same dual-use posture as the rest
 * of src/lib/calc/ (callable from the frontend for live UI display and from
 * a server-side Edge Function/scheduled job for the authoritative persisted
 * value). Given an invoice's due_date and "today," computes the correct
 * dunning_level. This calculation only ever PROPOSES readiness for the next
 * escalation level — the actual send still requires the artisan's explicit
 * channel choice and confirm action (docs/03_MasterPrompts.md §11.3 item 2's
 * note), never auto-sent by this function or its callers.
 *
 * Exact thresholds (docs/01_ScopeDocument.md §5.8's table):
 *   0 = not due (due_date is today or in the future)
 *   1 = >= 1 day overdue
 *   2 = >= 15 days overdue
 *   3 = >= 30 days overdue
 */

export type DunningLevel = 0 | 1 | 2 | 3

/**
 * @param dueDate The invoice's due_date, as a Date or an ISO date string
 *   (YYYY-MM-DD, matching the `date` column type — no time-of-day component).
 * @param today Defaults to the real current date; a caller may pass a fixed
 *   date for deterministic testing.
 */
export function calculateDunningLevel(
  dueDate: Date | string,
  today: Date = new Date(),
): DunningLevel {
  const due = typeof dueDate === 'string' ? new Date(dueDate + 'T00:00:00Z') : startOfDayUtc(dueDate)
  const now = startOfDayUtc(today)

  const msPerDay = 24 * 60 * 60 * 1000
  const daysOverdue = Math.floor((now.getTime() - due.getTime()) / msPerDay)

  if (daysOverdue >= 30) return 3
  if (daysOverdue >= 15) return 2
  if (daysOverdue >= 1) return 1
  return 0
}

function startOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/** Returns the number of days an invoice is overdue (0 if not overdue) —
 * used by the unpaid-invoices screen's "days-overdue" display, computed the
 * exact same way calculateDunningLevel derives its threshold comparisons so
 * the two numbers never disagree with each other. */
export function daysOverdue(dueDate: Date | string, today: Date = new Date()): number {
  const due = typeof dueDate === 'string' ? new Date(dueDate + 'T00:00:00Z') : startOfDayUtc(dueDate)
  const now = startOfDayUtc(today)
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.max(0, Math.floor((now.getTime() - due.getTime()) / msPerDay))
}

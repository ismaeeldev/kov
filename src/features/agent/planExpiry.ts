/**
 * planExpiry — docs/06_AIPromptRegistry.md §2.3, docs/03_MasterPrompts.md
 * §12.4 item 6: "a plan unconfirmed for a defined window (recommended: 24
 * hours) transitions to status='expired' via a scheduled check and is no
 * longer executable." Implemented as an on-load recalculation (same choice
 * already made for Step 11's dunning-level recalculation in UnpaidPage.tsx,
 * for the same reason — simplest for this stage, a full Postgres cron
 * schedule can be added later in the operations-hardening step).
 */

export const PLAN_EXPIRY_WINDOW_MS = 24 * 60 * 60 * 1000

export function isPlanExpired(createdAt: string, now: Date = new Date()): boolean {
  const created = new Date(createdAt)
  return now.getTime() - created.getTime() >= PLAN_EXPIRY_WINDOW_MS
}

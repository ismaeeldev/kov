/**
 * deliverySlots — docs/03_MasterPrompts.md §13.5 item 1,
 * docs/01_ScopeDocument.md §5.6's "dynamic delivery" behavior. Proposed
 * delivery time slots adapt to the LONGEST lead time among the selected
 * references — computed here as a pure, testable function rather than a
 * fixed slot list.
 */

export interface DeliverySlot {
  label: string
  date: string
}

/** Returns the longest lead_time_days among the given lines (0 for an
 * empty/all-zero list — same-day delivery is genuinely the correct answer
 * when nothing has any lead time). */
export function longestLeadTimeDays(leadTimesDays: Array<number | null>): number {
  const values = leadTimesDays.map((d) => d ?? 0)
  return values.length === 0 ? 0 : Math.max(...values)
}

/** Proposes 3 delivery slots starting no earlier than the longest lead time
 * among the order's references — never a slot that would arrive before the
 * slowest item is actually available. */
export function proposeDeliverySlots(
  leadTimesDays: Array<number | null>,
  today: Date = new Date(),
): DeliverySlot[] {
  const minDays = longestLeadTimeDays(leadTimesDays)
  return [0, 2, 4].map((offset) => {
    const date = new Date(today)
    date.setDate(date.getDate() + minDays + offset)
    return {
      label: date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
      date: date.toISOString().slice(0, 10),
    }
  })
}

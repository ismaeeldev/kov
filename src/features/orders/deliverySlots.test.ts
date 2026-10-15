import { describe, expect, it } from 'vitest'
import { longestLeadTimeDays, proposeDeliverySlots } from './deliverySlots'

describe('longestLeadTimeDays', () => {
  it('returns 0 for an empty list', () => {
    expect(longestLeadTimeDays([])).toBe(0)
  })

  it('returns 0 when all lead times are 0 or null', () => {
    expect(longestLeadTimeDays([0, null, 0])).toBe(0)
  })

  it('returns the maximum lead time among several references', () => {
    expect(longestLeadTimeDays([0, 5, 2])).toBe(5)
  })

  it('treats null as 0, not as ignored', () => {
    expect(longestLeadTimeDays([null, 3])).toBe(3)
  })
})

describe('proposeDeliverySlots', () => {
  const TODAY = new Date('2026-09-14T00:00:00Z')

  it('proposes same-day-or-later slots when no reference has a lead time', () => {
    const slots = proposeDeliverySlots([0, 0], TODAY)
    expect(slots).toHaveLength(3)
    expect(slots[0].date).toBe('2026-09-14')
  })

  it('adapts to the longest lead time among selected references (5 days), not the shortest', () => {
    const slots = proposeDeliverySlots([0, 5, 2], TODAY)
    // First slot must be at least 5 days out — never earlier than the
    // slowest item is actually available.
    expect(slots[0].date).toBe('2026-09-19')
  })

  it('each subsequent slot is later than the previous', () => {
    const slots = proposeDeliverySlots([3], TODAY)
    const dates = slots.map((s) => new Date(s.date).getTime())
    expect(dates[1]).toBeGreaterThan(dates[0])
    expect(dates[2]).toBeGreaterThan(dates[1])
  })
})

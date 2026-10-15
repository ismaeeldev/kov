import { describe, expect, it } from 'vitest'
import { calculateDunningLevel, daysOverdue } from './dunningLevel'

// Fixed "today" for deterministic testing — 2026-03-15.
const TODAY = new Date('2026-03-15T12:00:00Z')

function daysAgo(n: number): string {
  const d = new Date(TODAY)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

describe('calculateDunningLevel', () => {
  it('returns 0 when due_date is today (not yet overdue)', () => {
    expect(calculateDunningLevel(daysAgo(0), TODAY)).toBe(0)
  })

  it('returns 0 when due_date is in the future', () => {
    const future = new Date(TODAY)
    future.setUTCDate(future.getUTCDate() + 5)
    expect(calculateDunningLevel(future.toISOString().slice(0, 10), TODAY)).toBe(0)
  })

  // Level 1 boundary: exactly 1 day overdue, and one day before/after.
  it('returns 0 at 0 days overdue (one day before the level-1 boundary)', () => {
    expect(calculateDunningLevel(daysAgo(0), TODAY)).toBe(0)
  })
  it('returns 1 at EXACTLY 1 day overdue', () => {
    expect(calculateDunningLevel(daysAgo(1), TODAY)).toBe(1)
  })
  it('returns 1 at 2 days overdue (one day after the level-1 boundary)', () => {
    expect(calculateDunningLevel(daysAgo(2), TODAY)).toBe(1)
  })

  // Level 2 boundary: exactly 15 days overdue, and one day before/after.
  it('returns 1 at 14 days overdue (one day before the level-2 boundary)', () => {
    expect(calculateDunningLevel(daysAgo(14), TODAY)).toBe(1)
  })
  it('returns 2 at EXACTLY 15 days overdue', () => {
    expect(calculateDunningLevel(daysAgo(15), TODAY)).toBe(2)
  })
  it('returns 2 at 16 days overdue (one day after the level-2 boundary)', () => {
    expect(calculateDunningLevel(daysAgo(16), TODAY)).toBe(2)
  })

  // Level 3 boundary: exactly 30 days overdue, and one day before/after.
  it('returns 2 at 29 days overdue (one day before the level-3 boundary)', () => {
    expect(calculateDunningLevel(daysAgo(29), TODAY)).toBe(2)
  })
  it('returns 3 at EXACTLY 30 days overdue', () => {
    expect(calculateDunningLevel(daysAgo(30), TODAY)).toBe(3)
  })
  it('returns 3 at 31 days overdue (one day after the level-3 boundary)', () => {
    expect(calculateDunningLevel(daysAgo(31), TODAY)).toBe(3)
  })

  it('stays at level 3 far past the 30-day threshold', () => {
    expect(calculateDunningLevel(daysAgo(90), TODAY)).toBe(3)
  })

  it('accepts a real Date object for due_date, not just a string', () => {
    const due = new Date(TODAY)
    due.setUTCDate(due.getUTCDate() - 15)
    expect(calculateDunningLevel(due, TODAY)).toBe(2)
  })
})

describe('daysOverdue', () => {
  it('returns 0 for a non-overdue invoice', () => {
    expect(daysOverdue(daysAgo(0), TODAY)).toBe(0)
    const future = new Date(TODAY)
    future.setUTCDate(future.getUTCDate() + 5)
    expect(daysOverdue(future.toISOString().slice(0, 10), TODAY)).toBe(0)
  })

  it('matches the exact day count at each dunning-level boundary', () => {
    expect(daysOverdue(daysAgo(1), TODAY)).toBe(1)
    expect(daysOverdue(daysAgo(15), TODAY)).toBe(15)
    expect(daysOverdue(daysAgo(30), TODAY)).toBe(30)
  })
})

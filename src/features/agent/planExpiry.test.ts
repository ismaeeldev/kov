import { describe, expect, it } from 'vitest'
import { isPlanExpired } from './planExpiry'

describe('isPlanExpired', () => {
  const NOW = new Date('2026-09-14T12:00:00Z')

  it('is not expired immediately after creation', () => {
    expect(isPlanExpired('2026-09-14T12:00:00Z', NOW)).toBe(false)
  })

  it('is not expired just under 24 hours later', () => {
    expect(isPlanExpired('2026-09-13T12:00:01Z', NOW)).toBe(false)
  })

  it('is expired at exactly 24 hours', () => {
    expect(isPlanExpired('2026-09-13T12:00:00Z', NOW)).toBe(true)
  })

  it('is expired well past 24 hours', () => {
    expect(isPlanExpired('2026-09-10T12:00:00Z', NOW)).toBe(true)
  })
})

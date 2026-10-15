import { describe, expect, it } from 'vitest'
import { shouldAutoProceed } from './confidenceGate'

describe('shouldAutoProceed', () => {
  it('auto-proceeds when confidence is high and clearly separated from second-best (unambiguous case)', () => {
    expect(shouldAutoProceed(0.92, 0.1)).toBe(true)
  })

  it('requires disambiguation when confidence is below the 0.6 threshold, even with a big gap', () => {
    expect(shouldAutoProceed(0.55, 0.05)).toBe(false)
  })

  it('requires disambiguation when confidence is high but the gap to second-best is too small (ambiguous case)', () => {
    expect(shouldAutoProceed(0.75, 0.68)).toBe(false)
  })

  it('does not auto-proceed at exactly the threshold (strictly greater than, not >=)', () => {
    expect(shouldAutoProceed(0.6, 0.0)).toBe(false)
  })

  it('does not auto-proceed at exactly the gap boundary (strictly greater than, not >=)', () => {
    expect(shouldAutoProceed(0.9, 0.7)).toBe(false)
  })

  it('auto-proceeds just above both boundaries', () => {
    expect(shouldAutoProceed(0.61, 0.4)).toBe(true)
  })
})

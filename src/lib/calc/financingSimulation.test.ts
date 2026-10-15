import { describe, expect, it } from 'vitest'
import { calculateMonthlyPayment } from './financingSimulation'

describe('calculateMonthlyPayment', () => {
  it('matches a hand-verified reference case: 10000€ over 60 months at 3% annual', () => {
    // Cross-checked against the standard amortization formula computed
    // independently (M = P*r/(1-(1+r)^-n)) and against publicly known loan
    // calculator results for this exact input — 179.69€/month.
    const result = calculateMonthlyPayment({ amount: 10000, termMonths: 60, ratePctAnnual: 3 })
    expect(result).toBe(179.69)
  })

  it('matches a second hand-verified reference case: 5000€ over 24 months at 5.9% annual', () => {
    const result = calculateMonthlyPayment({ amount: 5000, termMonths: 24, ratePctAnnual: 5.9 })
    // Independently computed: r = 0.059/12 = 0.0049167, M = 5000*r/(1-(1+r)^-24)
    expect(result).toBeCloseTo(221.38, 2)
  })

  it('spreads the principal evenly over the term at exactly 0% interest (no division-by-zero blowup)', () => {
    const result = calculateMonthlyPayment({ amount: 1200, termMonths: 12, ratePctAnnual: 0 })
    expect(result).toBe(100)
  })

  it('returns 0 for a non-positive term', () => {
    expect(calculateMonthlyPayment({ amount: 1000, termMonths: 0, ratePctAnnual: 3 })).toBe(0)
  })

  it('produces a higher monthly payment for a higher rate, all else equal', () => {
    const low = calculateMonthlyPayment({ amount: 10000, termMonths: 60, ratePctAnnual: 2 })
    const high = calculateMonthlyPayment({ amount: 10000, termMonths: 60, ratePctAnnual: 8 })
    expect(high).toBeGreaterThan(low)
  })

  it('produces a lower monthly payment for a longer term, all else equal', () => {
    const short = calculateMonthlyPayment({ amount: 10000, termMonths: 24, ratePctAnnual: 3 })
    const long = calculateMonthlyPayment({ amount: 10000, termMonths: 84, ratePctAnnual: 3 })
    expect(long).toBeLessThan(short)
  })
})

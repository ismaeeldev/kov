import { describe, expect, it } from 'vitest'
import { getMarginTier } from './marginTier'

describe('getMarginTier', () => {
  it('returns green for margins strictly above 30%', () => {
    expect(getMarginTier(30.01).tier).toBe('green')
    expect(getMarginTier(50).tier).toBe('green')
    expect(getMarginTier(100).tier).toBe('green')
  })

  it('returns steelBlue exactly at the 30.00% boundary (">" is strict, not ">=")', () => {
    expect(getMarginTier(30).tier).toBe('steelBlue')
  })

  it('returns steelBlue for margins strictly above 20% and up to 30%', () => {
    expect(getMarginTier(20.01).tier).toBe('steelBlue')
    expect(getMarginTier(25).tier).toBe('steelBlue')
  })

  it('returns gold exactly at the 20.00% boundary', () => {
    expect(getMarginTier(20).tier).toBe('gold')
  })

  it('returns gold for margins strictly above 10% and up to 20%', () => {
    expect(getMarginTier(10.01).tier).toBe('gold')
    expect(getMarginTier(15).tier).toBe('gold')
  })

  it('returns gold exactly at the 10.00% boundary (the 0-10% "caution" band is also gold)', () => {
    expect(getMarginTier(10).tier).toBe('gold')
  })

  it('returns gold throughout the 0-10% caution band', () => {
    expect(getMarginTier(5).tier).toBe('gold')
    expect(getMarginTier(0.01).tier).toBe('gold')
  })

  it('returns red exactly at the 0.00% boundary ("<=0%")', () => {
    expect(getMarginTier(0).tier).toBe('red')
  })

  it('returns red for negative margins', () => {
    expect(getMarginTier(-10).tier).toBe('red')
    expect(getMarginTier(-100).tier).toBe('red')
  })

  it('never returns a tier named amber or orange', () => {
    const allTiers = [50, 25, 15, 5, -10].map((pct) => getMarginTier(pct).tier)
    for (const tier of allTiers) {
      expect(tier).not.toBe('amber')
      expect(tier).not.toBe('orange')
    }
  })

  it('returns the correct color tokens and advisory copy for each tier', () => {
    expect(getMarginTier(50).colorTokens.accentBar).toBe('bg-margin-green')
    expect(getMarginTier(25).colorTokens.accentBar).toBe('bg-margin-steel-blue')
    expect(getMarginTier(15).colorTokens.accentBar).toBe('bg-margin-gold')
    expect(getMarginTier(-10).colorTokens.accentBar).toBe('bg-margin-red')
    expect(getMarginTier(50).advisory).toBeTruthy()
  })
})

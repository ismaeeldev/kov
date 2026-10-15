import { describe, expect, it } from 'vitest'
import { calculateQuoteTotals, roundBankers, type QuoteLineInput } from './quoteTotals'

describe('roundBankers', () => {
  it('rounds half-to-even on an exact .005 boundary', () => {
    // 1.005 rounds to 1.00 (0 is even), not 1.01 (round-half-up would give 1.01)
    expect(roundBankers(1.005)).toBe(1)
    // 1.015 rounds to 1.02 (2 is even)
    expect(roundBankers(1.015)).toBeCloseTo(1.02, 5)
    // 1.025 rounds to 1.02 (2 is even), not 1.03
    expect(roundBankers(1.025)).toBeCloseTo(1.02, 5)
  })

  it('rounds non-boundary values normally', () => {
    expect(roundBankers(1.004)).toBe(1)
    expect(roundBankers(1.006)).toBeCloseTo(1.01, 5)
  })
})

describe('calculateQuoteTotals', () => {
  // (a) one fixture per VAT rate, hand-verified expected totals
  it('computes correct totals at 0% VAT', () => {
    const lines: QuoteLineInput[] = [
      { quantity: 2, unit_price: 50, purchase_price: 20 },
      { quantity: 1, unit_price: 100, purchase_price: 60 },
    ]
    // subtotal = 2*50 + 1*100 = 200
    const result = calculateQuoteTotals(lines, 0)
    expect(result.subtotal_ht).toBe(200)
    expect(result.total_ttc).toBe(200)
    expect(result.vat_amount).toBe(0)
    // margin value = (50-20)*2 + (100-60)*1 = 60 + 40 = 100 ; 100/200*100 = 50%
    expect(result.projected_margin_pct).toBe(50)
  })

  it('computes correct totals at 5.5% VAT', () => {
    const lines: QuoteLineInput[] = [{ quantity: 1, unit_price: 1000, purchase_price: 700 }]
    const result = calculateQuoteTotals(lines, 5.5)
    expect(result.subtotal_ht).toBe(1000)
    // 1000 * 1.055 = 1055
    expect(result.total_ttc).toBeCloseTo(1055, 5)
    expect(result.vat_amount).toBeCloseTo(55, 5)
    // margin = (1000-700)/1000*100 = 30%
    expect(result.projected_margin_pct).toBe(30)
  })

  it('computes correct totals at 10% VAT', () => {
    const lines: QuoteLineInput[] = [{ quantity: 3, unit_price: 150, purchase_price: 90 }]
    const result = calculateQuoteTotals(lines, 10)
    // subtotal = 450
    expect(result.subtotal_ht).toBe(450)
    expect(result.total_ttc).toBeCloseTo(495, 5)
    expect(result.vat_amount).toBeCloseTo(45, 5)
    // margin = (150-90)*3 / 450 * 100 = 180/450*100 = 40%
    expect(result.projected_margin_pct).toBe(40)
  })

  it('computes correct totals at 20% VAT', () => {
    const lines: QuoteLineInput[] = [{ quantity: 1, unit_price: 500, purchase_price: 300 }]
    const result = calculateQuoteTotals(lines, 20)
    expect(result.subtotal_ht).toBe(500)
    expect(result.total_ttc).toBeCloseTo(600, 5)
    expect(result.vat_amount).toBeCloseTo(100, 5)
    expect(result.projected_margin_pct).toBe(40)
  })

  // (b) at least two rounding-boundary fixtures
  it('rounds a subtotal landing exactly on a .005 boundary correctly', () => {
    // 0.5 * 20.01 = 10.005 exactly
    const lines: QuoteLineInput[] = [{ quantity: 0.5, unit_price: 20.01, purchase_price: 10 }]
    const result = calculateQuoteTotals(lines, 0)
    // banker's rounding: 10.005 -> 10.00 (0 is even)
    expect(result.subtotal_ht).toBe(10)
  })

  it('handles a repeating-decimal per-unit price without per-line rounding error', () => {
    // 1/3 unit price repeated three times should sum to exactly 1, not
    // 3 * round(0.3333...) which would introduce a rounding artifact.
    const unitPrice = 1 / 3
    const lines: QuoteLineInput[] = [
      { quantity: 1, unit_price: unitPrice, purchase_price: 0 },
      { quantity: 1, unit_price: unitPrice, purchase_price: 0 },
      { quantity: 1, unit_price: unitPrice, purchase_price: 0 },
    ]
    const result = calculateQuoteTotals(lines, 0)
    expect(result.subtotal_ht).toBe(1)
  })

  // (c) a zero-line-item quote
  it('returns all-zero/null totals for a quote with no lines', () => {
    const result = calculateQuoteTotals([], 20)
    expect(result.subtotal_ht).toBe(0)
    expect(result.total_ttc).toBe(0)
    expect(result.vat_amount).toBe(0)
    expect(result.projected_margin_pct).toBeNull()
  })

  // (d) a negative-margin fixture (purchase price exceeds sale price on a line)
  it('computes a negative margin when purchase price exceeds sale price', () => {
    const lines: QuoteLineInput[] = [{ quantity: 1, unit_price: 100, purchase_price: 150 }]
    const result = calculateQuoteTotals(lines, 20)
    expect(result.subtotal_ht).toBe(100)
    // margin = (100-150)/100*100 = -50%
    expect(result.projected_margin_pct).toBe(-50)
  })

  // (e) fixtures crossing each margin tier boundary exactly (30.00%, 20.00%, 10.00%, 0.00%)
  it('produces exactly 30.00% margin at the green/steelBlue boundary', () => {
    // margin value / subtotal = 0.30 exactly: purchase 70, sale 100 -> margin 30
    const lines: QuoteLineInput[] = [{ quantity: 1, unit_price: 100, purchase_price: 70 }]
    const result = calculateQuoteTotals(lines, 20)
    expect(result.projected_margin_pct).toBe(30)
  })

  it('produces exactly 20.00% margin at the steelBlue/gold boundary', () => {
    const lines: QuoteLineInput[] = [{ quantity: 1, unit_price: 100, purchase_price: 80 }]
    const result = calculateQuoteTotals(lines, 20)
    expect(result.projected_margin_pct).toBe(20)
  })

  it('produces exactly 10.00% margin at the gold/gold-caution boundary', () => {
    const lines: QuoteLineInput[] = [{ quantity: 1, unit_price: 100, purchase_price: 90 }]
    const result = calculateQuoteTotals(lines, 20)
    expect(result.projected_margin_pct).toBe(10)
  })

  it('produces exactly 0.00% margin at the gold/red boundary', () => {
    const lines: QuoteLineInput[] = [{ quantity: 1, unit_price: 100, purchase_price: 100 }]
    const result = calculateQuoteTotals(lines, 20)
    expect(result.projected_margin_pct).toBe(0)
  })

  it('sale_price defaults to unit_price when not provided', () => {
    const lines: QuoteLineInput[] = [{ quantity: 2, unit_price: 50, purchase_price: 30 }]
    const result = calculateQuoteTotals(lines, 0)
    // margin = (50-30)*2 / 100 * 100 = 40%
    expect(result.projected_margin_pct).toBe(40)
  })
})

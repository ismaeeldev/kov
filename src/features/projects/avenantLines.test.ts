import { describe, expect, it } from 'vitest'
import { deriveAvenantLines } from './avenantLines'
import type { OverrunItem } from '@/lib/calc/projectProfitability'

describe('deriveAvenantLines', () => {
  it('prices a labor_hours overrun at its real logged cost (already the business rate)', () => {
    const overruns: OverrunItem[] = [
      { cost_type: 'labor_hours', description: 'Heures supplémentaires', cost: 380 },
    ]
    const lines = deriveAvenantLines(overruns, 37)
    expect(lines).toHaveLength(1)
    expect(lines[0].unit_price).toBe(380)
    expect(lines[0].purchase_price).toBe(380)
    expect(lines[0].designation).toContain('Heures supplémentaires')
  })

  it('marks up a supply overrun by the chantier planned margin', () => {
    const overruns: OverrunItem[] = [
      { cost_type: 'supply', description: 'Matériel imprévu', cost: 630 },
    ]
    // planned margin 37% -> markup multiplier = 1 / (1 - 0.37) = 1.5873...
    const lines = deriveAvenantLines(overruns, 37)
    expect(lines[0].purchase_price).toBe(630)
    expect(lines[0].unit_price).toBeCloseTo(630 / 0.63, 2)
  })

  it('marks up a misc overrun the same way as a supply overrun', () => {
    const overruns: OverrunItem[] = [{ cost_type: 'misc', description: 'Frais annexes', cost: 100 }]
    const lines = deriveAvenantLines(overruns, 20)
    expect(lines[0].unit_price).toBeCloseTo(100 / 0.8, 2)
  })

  it('handles multiple overruns of mixed types', () => {
    const overruns: OverrunItem[] = [
      { cost_type: 'supply', description: 'Chauffe-eau', cost: 200 },
      { cost_type: 'labor_hours', description: 'Pose supplémentaire', cost: 76 },
    ]
    const lines = deriveAvenantLines(overruns, 30)
    expect(lines).toHaveLength(2)
    expect(lines[1].unit_price).toBe(76) // labor: real cost, no markup
  })

  it('clamps an unrealistic planned margin (>=95% or negative) to avoid a division blow-up', () => {
    const overruns: OverrunItem[] = [{ cost_type: 'supply', description: 'Test', cost: 100 }]
    const linesHighMargin = deriveAvenantLines(overruns, 99)
    expect(Number.isFinite(linesHighMargin[0].unit_price)).toBe(true)
    const linesNegativeMargin = deriveAvenantLines(overruns, -50)
    expect(Number.isFinite(linesNegativeMargin[0].unit_price)).toBe(true)
    expect(linesNegativeMargin[0].unit_price).toBe(100) // clamped to 0% markup
  })

  it('returns an empty array for an empty overrun list', () => {
    expect(deriveAvenantLines([], 37)).toEqual([])
  })
})

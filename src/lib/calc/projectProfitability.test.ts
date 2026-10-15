import { describe, expect, it } from 'vitest'
import { calculateProjectProfitability, type ProjectCostInput } from './projectProfitability'

describe('calculateProjectProfitability', () => {
  // Master prompt 10.3 item 3's explicit test: a chantier with ZERO
  // project_costs rows shows real margin EQUAL to planned margin — no
  // phantom overrun, no fabricated cost.
  it('shows real margin exactly equal to planned margin when there are zero cost rows', () => {
    const project = { planned_value_ttc: 10000, planned_margin_pct: 35 }
    const result = calculateProjectProfitability(project, [])

    expect(result.totalCosts).toBe(0)
    // remainingAmount/realMarginAmount stay the true billed-minus-costs
    // figure (equals billedTtc when nothing's been spent yet) — no
    // ambiguity there, used for "Il te reste X €."
    expect(result.realMarginAmount).toBe(10000)
    expect(result.remainingAmount).toBe(10000)
    // realMarginPct is the one figure with real ambiguity at zero costs: the
    // raw formula would give a nonsensical 100% ("100% profit margin" before
    // any real cost has even been logged). The master prompt's own explicit
    // test requires it default to the PLANNED margin instead — the honest
    // "trust the plan until real data exists" reading.
    expect(result.realMarginPct).toBe(35)
    expect(result.gapPoints).toBe(0)
    expect(result.overruns).toEqual([])
  })

  // Hand-verified fixture matching docs/01_ScopeDocument.md §5.9's own
  // worked example structure: billed 10 000€, planned margin 37%.
  // Costs: 2 000€ supplies, 40h labor at 38€/h (=1 520€), 300€ misc.
  it('produces the exact hand-calculated gap for a specific set of cost rows', () => {
    const project = { planned_value_ttc: 10000, planned_margin_pct: 37 }
    const costs: ProjectCostInput[] = [
      {
        cost_type: 'supply',
        description: 'Chauffe-eau',
        amount: 2000,
        hours: null,
        hourly_rate: null,
      },
      {
        cost_type: 'labor_hours',
        description: 'Pose',
        amount: null,
        hours: 40,
        hourly_rate: 38,
      },
      {
        cost_type: 'misc',
        description: 'Déplacement',
        amount: 300,
        hours: null,
        hourly_rate: null,
      },
    ]
    const result = calculateProjectProfitability(project, costs)

    // Total costs = 2000 + (40*38=1520) + 300 = 3820
    expect(result.totalSupplyCost).toBe(2000)
    expect(result.totalLaborCost).toBe(1520)
    expect(result.totalMiscCost).toBe(300)
    expect(result.totalCosts).toBe(3820)
    // Real margin amount = 10000 - 3820 = 6180
    expect(result.realMarginAmount).toBe(6180)
    // Real margin % = 6180 / 10000 * 100 = 61.8%
    expect(result.realMarginPct).toBeCloseTo(61.8, 5)
    // Gap = 61.8 - 37 = 24.8 points
    expect(result.gapPoints).toBeCloseTo(24.8, 5)
    expect(result.remainingAmount).toBe(6180)
    expect(result.overruns).toHaveLength(3)
  })

  it('defaults a labor_hours row missing an explicit hourly_rate to 38€/h', () => {
    const project = { planned_value_ttc: 1000, planned_margin_pct: 20 }
    const costs: ProjectCostInput[] = [
      {
        cost_type: 'labor_hours',
        description: 'Main d’oeuvre',
        amount: null,
        hours: 10,
        hourly_rate: null,
      },
    ]
    const result = calculateProjectProfitability(project, costs)
    expect(result.totalLaborCost).toBe(380) // 10 * 38
  })

  it('handles an overrun scenario where real costs exceed billed value (negative real margin)', () => {
    const project = { planned_value_ttc: 1000, planned_margin_pct: 20 }
    const costs: ProjectCostInput[] = [
      {
        cost_type: 'supply',
        description: 'Matériel imprévu',
        amount: 1500,
        hours: null,
        hourly_rate: null,
      },
    ]
    const result = calculateProjectProfitability(project, costs)
    expect(result.realMarginAmount).toBe(-500)
    expect(result.realMarginPct).toBe(-50)
    expect(result.remainingAmount).toBe(-500)
  })

  it('returns a null realMarginPct/gapPoints when billed value is zero (undefined margin, matching quoteTotals.ts convention)', () => {
    const project = { planned_value_ttc: 0, planned_margin_pct: 0 }
    const result = calculateProjectProfitability(project, [])
    expect(result.realMarginPct).toBeNull()
    expect(result.gapPoints).toBeNull()
  })
})

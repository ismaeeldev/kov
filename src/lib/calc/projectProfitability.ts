/**
 * project-profitability-calc — docs/06_AIPromptRegistry.md §3.3,
 * docs/01_ScopeDocument.md §5.9 (module 6.9), KOV-FR-012.
 *
 * Pure, framework-independent TypeScript — same dual-use posture as
 * quoteTotals.ts/marginTier.ts (zero React/Supabase/Claude dependency).
 * ALWAYS reads from persisted project_costs rows passed in by the caller —
 * never a demo/placeholder figure (KOV-FR-012 hard requirement). A chantier
 * with zero cost rows must show real margin exactly equal to planned margin,
 * never a phantom overrun or zero.
 *
 * Formula (docs/01_ScopeDocument.md §5.9's "Behavior — profitability" §2,
 * exact wording): "billed to client, minus supplies, minus labor (hours
 * logged × hourly rate), minus miscellaneous costs."
 */

export interface ProjectCostInput {
  cost_type: 'supply' | 'labor_hours' | 'misc'
  description: string
  amount: number | null
  hours: number | null
  hourly_rate: number | null
}

export interface OverrunItem {
  cost_type: 'supply' | 'labor_hours' | 'misc'
  description: string
  cost: number
}

export interface ProjectProfitabilityResult {
  /** "Billed to client" — the accepted quote's planned TTC value; real
   * profitability is always measured against what was actually billed, not
   * a live-recalculated figure. */
  billedTtc: number
  totalSupplyCost: number
  totalLaborCost: number
  totalMiscCost: number
  totalCosts: number
  /** billedTtc - totalCosts. */
  realMarginAmount: number
  /** (realMarginAmount / billedTtc) * 100 — null when billedTtc is 0, same
   * "undefined margin on zero revenue" convention as quoteTotals.ts. */
  realMarginPct: number | null
  plannedMarginPct: number
  /** realMarginPct - plannedMarginPct, in points. Null when realMarginPct is
   * null (nothing meaningful to compare). */
  gapPoints: number | null
  /** planned_value_ttc - totalCosts — "Il te reste X € une fois tout payé." */
  remainingAmount: number
  /** "What ate the margin" — every individual cost row that represents an
   * overrun against the plan, i.e. every real cost row, described by its own
   * reason/description and cost. Per docs/01_ScopeDocument.md §5.9's
   * "level 3" reading: "a named list of overruns, each with its reason and
   * its cost" — since there is no separate persisted "planned cost per
   * category" figure in this data model (only planned_margin_pct/
   * planned_value_ttc exist at the project level), every real project_costs
   * row IS the overrun list by construction: a chantier with zero costs has
   * an empty list (nothing ate the margin yet), and each row that exists
   * represents real money spent against the plan. */
  overruns: OverrunItem[]
}

function lineCost(cost: ProjectCostInput): number {
  if (cost.cost_type === 'labor_hours') {
    return (cost.hours ?? 0) * (cost.hourly_rate ?? 38)
  }
  return cost.amount ?? 0
}

export function calculateProjectProfitability(
  project: { planned_value_ttc: number; planned_margin_pct: number },
  costs: ProjectCostInput[],
): ProjectProfitabilityResult {
  const billedTtc = project.planned_value_ttc

  let totalSupplyCost = 0
  let totalLaborCost = 0
  let totalMiscCost = 0
  const overruns: OverrunItem[] = []

  for (const cost of costs) {
    const amount = lineCost(cost)
    if (cost.cost_type === 'supply') totalSupplyCost += amount
    else if (cost.cost_type === 'labor_hours') totalLaborCost += amount
    else totalMiscCost += amount

    overruns.push({ cost_type: cost.cost_type, description: cost.description, cost: amount })
  }

  const totalCosts = totalSupplyCost + totalLaborCost + totalMiscCost
  const remainingAmount = billedTtc - totalCosts

  // Zero real costs logged yet = no real data to measure against, NOT a
  // (mathematically technically correct but practically nonsensical) 100%
  // margin — before the artisan has entered any actual cost, the honest
  // default is to trust the plan: real margin defaults to the PLANNED
  // margin, with a zero-point gap, exactly matching the master prompt's own
  // explicit test ("a chantier with zero project_costs rows shows real
  // margin equal to planned margin"). realMarginAmount stays the true
  // billed-minus-costs figure (equals billedTtc when costs are zero) since
  // that number is genuinely correct and used for "Il te reste X €," which
  // has no equivalent ambiguity.
  const realMarginAmount = billedTtc - totalCosts
  const realMarginPct =
    billedTtc === 0
      ? null
      : totalCosts === 0
        ? project.planned_margin_pct
        : (realMarginAmount / billedTtc) * 100
  const gapPoints = realMarginPct === null ? null : realMarginPct - project.planned_margin_pct

  return {
    billedTtc,
    totalSupplyCost,
    totalLaborCost,
    totalMiscCost,
    totalCosts,
    realMarginAmount,
    realMarginPct,
    plannedMarginPct: project.planned_margin_pct,
    gapPoints,
    remainingAmount,
    overruns,
  }
}

import { roundBankers } from '@/lib/calc/quoteTotals'
import type { OverrunItem } from '@/lib/calc/projectProfitability'

export interface ProposedAvenantLine {
  designation: string
  unit: string
  quantity: number
  unit_price: number
  purchase_price: number
}

/**
 * Derives proposed avenant (change-order) quote lines from a chantier's real
 * cost overruns — docs/03_MasterPrompts.md §10.4 item 2. Editable before
 * send, never auto-sent — this only produces a PROPOSAL, the same as
 * quote-draft-assist's AI proposals never write anything automatically.
 *
 * - A labor_hours overrun becomes an additional labor line priced at the
 *   business's standard rate (the real hourly_rate already logged on that
 *   cost row — not re-derived, since that IS the business's rate for this
 *   job).
 * - A supply/misc overrun becomes an additional supply line at its real
 *   cost, marked up by the chantier's own PLANNED margin percentage (the
 *   project's own historically-accepted margin for this exact job is the
 *   most defensible "normal markup" reference available in this data model
 *   — there is no separate stored markup-percentage field to draw from).
 */
export function deriveAvenantLines(
  overruns: OverrunItem[],
  plannedMarginPct: number,
): ProposedAvenantLine[] {
  const markupMultiplier = 1 / (1 - Math.min(Math.max(plannedMarginPct, 0), 95) / 100)

  return overruns.map((item) => {
    if (item.cost_type === 'labor_hours') {
      return {
        designation: `Avenant — ${item.description}`,
        unit: 'forfait',
        quantity: 1,
        unit_price: roundBankers(item.cost),
        purchase_price: roundBankers(item.cost),
      }
    }
    // supply/misc: real cost marked up by the planned margin so the avenant
    // line doesn't just pass the overrun through at zero margin.
    return {
      designation: `Avenant — ${item.description}`,
      unit: 'forfait',
      quantity: 1,
      unit_price: roundBankers(item.cost * markupMultiplier),
      purchase_price: roundBankers(item.cost),
    }
  })
}

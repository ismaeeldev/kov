/**
 * quote-totals-calc — docs/06_AIPromptRegistry.md §3.1, docs/01_ScopeDocument.md
 * KOV-FR-007 ("les calculs commerciaux sont déterministes" — commercial
 * calculations are deterministic, NEVER delegated to an AI model).
 *
 * Pure, framework-independent TypeScript — zero dependency on React, Supabase,
 * or Claude. Callable identically from the frontend (live UI feedback as the
 * artisan types in the quote editor, Step 8.3) and from a server-side Edge
 * Function (the authoritative persisted calculation) — this dual-use is
 * intentional and required, so no browser-only or Node-only APIs are used
 * here (no `window`, no `Buffer`, no `fs`).
 *
 * Rounding contract (explicit, load-bearing): banker's rounding (round-half-
 * to-even) to two decimal places is applied ONLY at the final totals —
 * subtotal_ht, total_ttc, and the margin percentage. Per-line values
 * (quantity × unit_price) are summed at full floating-point precision first;
 * never round an intermediate per-line amount before summing.
 */

export interface QuoteLineInput {
  quantity: number
  unit_price: number
  /** Used only for the projected-margin calculation, not for subtotal/total. */
  purchase_price: number
  /** Sale price actually charged for this line — normally equals unit_price,
   * kept separate because a future discount/override could diverge from it
   * without this module needing to change. Defaults to unit_price when
   * omitted (the common case: no line has a distinct sale price). */
  sale_price?: number
}

export interface QuoteTotals {
  subtotal_ht: number
  total_ttc: number
  /** Total VAT amount (total_ttc - subtotal_ht), exposed for display/receipts. */
  vat_amount: number
  /** null when subtotal_ht is 0 (zero-line quote) — a margin percentage of
   * "0 sales" is undefined, not zero, so callers must handle null explicitly
   * (e.g. render "—" rather than "0%"). */
  projected_margin_pct: number | null
}

/**
 * Rounds to `decimals` places using round-half-to-even (banker's rounding) —
 * the exact rule required by docs/06_AIPromptRegistry.md §3.1, not the more
 * common round-half-up (`Math.round`/`toFixed`, both of which round .5 away
 * from zero and would silently violate the documented contract on exact
 * half-cent boundaries).
 */
export function roundBankers(value: number, decimals = 2): number {
  const factor = 10 ** decimals
  const scaled = value * factor
  const floor = Math.floor(scaled)
  const diff = scaled - floor

  // Guard against floating-point noise around exact .5 boundaries (e.g.
  // 1.005 * 100 can land on 100.49999999999999 instead of 100.5) — snap
  // anything within a tiny epsilon of .5 to exactly .5 before deciding.
  const EPSILON = 1e-9
  const isExactHalf = Math.abs(diff - 0.5) < EPSILON

  let rounded: number
  if (isExactHalf) {
    // Round to even: if floor is even, keep it; if odd, round up.
    rounded = floor % 2 === 0 ? floor : floor + 1
  } else {
    rounded = Math.round(scaled)
  }

  return rounded / factor
}

/**
 * quote-totals-calc — given a quote's lines and its VAT rate, computes
 * subtotal_ht, total_ttc, vat_amount, and projected_margin_pct.
 *
 * @param lines Quote line inputs. An empty array is valid (a brand-new draft
 *   quote with no lines yet) and produces all-zero/null totals, not a thrown
 *   error — the quote editor must render a coherent "0 €, no margin yet"
 *   state rather than crashing.
 * @param vatRate One of the four legal French VAT rates: 0, 5.5, 10, 20.
 */
export function calculateQuoteTotals(lines: QuoteLineInput[], vatRate: number): QuoteTotals {
  let rawSubtotal = 0
  let rawMarginValue = 0 // sum of (sale_price - purchase_price) * quantity, unrounded

  for (const line of lines) {
    const saleUnitPrice = line.sale_price ?? line.unit_price
    // No per-line rounding — accumulate at full precision.
    rawSubtotal += line.quantity * line.unit_price
    rawMarginValue += (saleUnitPrice - line.purchase_price) * line.quantity
  }

  const subtotal_ht = roundBankers(rawSubtotal)
  const rawTotalTtc = rawSubtotal * (1 + vatRate / 100)
  const total_ttc = roundBankers(rawTotalTtc)
  const vat_amount = roundBankers(total_ttc - subtotal_ht)

  const projected_margin_pct =
    rawSubtotal === 0 ? null : roundBankers((rawMarginValue / rawSubtotal) * 100)

  return { subtotal_ht, total_ttc, vat_amount, projected_margin_pct }
}

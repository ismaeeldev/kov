/**
 * simulatedStock — docs/03_MasterPrompts.md §13.5 item 1's explicit
 * instruction: "use realistic seeded/simulated stock data per the scope
 * note in docs/01_ScopeDocument.md §5.6 — the real supplier integration is
 * explicitly out of scope for this pass" — and the equally explicit
 * instruction to reproduce the STRUCTURE of the example demo-data table
 * without ever shipping its literal rows or any resembling-real-supplier
 * data as production content. This generates a deterministic (same
 * price_item always gets the same simulated state) but clearly-labeled
 * simulated stock state, never a literal example row from the scope doc.
 */

export type StockState = 'available' | 'in_transit' | 'out_of_stock'

export interface SimulatedStock {
  state: StockState
  depotLabel: string | null
  leadTimeDays: number | null
}

const DEPOTS = ['Dépôt local', 'Dépôt régional']

/** A small, stable hash so the same price_item_id always simulates the same
 * stock state within a session — never re-randomized on every render, which
 * would look broken/flickering to the artisan reviewing an order. */
function stableHash(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0
  }
  return hash
}

export function simulateStock(priceItemId: string): SimulatedStock {
  const hash = stableHash(priceItemId)
  const bucket = hash % 10

  if (bucket < 6) {
    // 60% available, split across two simulated depots with 0-1 day lead time.
    return {
      state: 'available',
      depotLabel: DEPOTS[hash % DEPOTS.length],
      leadTimeDays: hash % 2,
    }
  }
  if (bucket < 9) {
    // 30% in transit, 2-6 day lead time.
    return { state: 'in_transit', depotLabel: null, leadTimeDays: 2 + (hash % 5) }
  }
  // 10% out of stock.
  return { state: 'out_of_stock', depotLabel: null, leadTimeDays: null }
}

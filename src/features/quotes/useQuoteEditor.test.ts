import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useQuoteEditor } from './useQuoteEditor'

/**
 * Historical-copy rule regression test — docs/05_DataModel.md §4:
 * quote_lines.unit_price/purchase_price are COPIED at insert-time from
 * whatever the caller passes in, never live-joined back to price_items.
 * This was previously verified only by reading the code/manual testing (a
 * commercial-calculation review flagged the missing automated coverage) —
 * this test guards against a future refactor accidentally introducing a
 * live join or re-derivation.
 *
 * Mocks apiWrite (the one seam every Supabase call in this hook goes
 * through, per src/lib/apiClient.ts's own "every call from Step 5 onward
 * goes through this wrapper" contract) and useAuth, rather than standing up
 * a real Supabase client — this project's existing test suite (e.g.
 * executePlan.test.ts) establishes the same "mock the client boundary,
 * assert on the exact payload written" pattern for testing write-path logic
 * without a live DB.
 */

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'owner-1' },
    session: null,
    isLoading: false,
  }),
}))

const inserts: Array<{ table: string; row: Record<string, unknown> }> = []

vi.mock('@/lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient')
  return {
    ...actual,
    apiRead: vi.fn(async () => ({ data: [], error: null })),
    apiWrite: vi.fn(async (fn: (client: unknown) => unknown) => {
      const mockClient = {
        from(table: string) {
          return {
            insert(row: Record<string, unknown>) {
              inserts.push({ table, row })
              return {
                select() {
                  return {
                    single: async () => ({
                      data:
                        table === 'quotes'
                          ? { id: 'quote-1', owner_id: 'owner-1', vat_rate: 20, status: 'draft' }
                          : { id: 'line-1', ...row },
                      error: null,
                    }),
                  }
                },
              }
            },
          }
        },
      }
      return fn(mockClient)
    }),
  }
})

describe('useQuoteEditor — historical-copy rule', () => {
  it('addLine writes exactly the caller-supplied unit_price/purchase_price, never re-derived from price_item_id', async () => {
    inserts.length = 0
    const { result } = renderHook(() => useQuoteEditor(undefined))

    // A price_items row REAL price at the moment this line is added — the
    // point of this test is that changing this value later must never
    // retroactively change what was already written to quote_lines.
    const originalSalePrice = 145
    const originalPurchasePrice = 90

    await act(async () => {
      await result.current.createDraft('client-1')
    })
    await waitFor(() => expect(result.current.quote).not.toBeNull())

    await act(async () => {
      await result.current.addLine({
        designation: 'Receveur de douche extra-plat 90x90',
        unit: 'unité',
        quantity: 1,
        unit_price: originalSalePrice,
        purchase_price: originalPurchasePrice,
        price_item_id: 'price-item-1',
      })
    })

    const lineInsert = inserts.find((i) => i.table === 'quote_lines')
    expect(lineInsert).toBeDefined()
    // The COPIED values, not a live lookup keyed off price_item_id.
    expect(lineInsert!.row.unit_price).toBe(originalSalePrice)
    expect(lineInsert!.row.purchase_price).toBe(originalPurchasePrice)
    expect(lineInsert!.row.price_item_id).toBe('price-item-1')

    // Simulate the price_items row changing AFTER this line was written —
    // the insert payload above must already be fixed/immutable at this
    // point (asserted above), independent of any later catalogue change.
    // There is no code path in addLine that re-reads price_items at all —
    // this insert call is the entire, one-shot write.
    const changedSalePrice = 260
    expect(lineInsert!.row.unit_price).not.toBe(changedSalePrice)
  })
})

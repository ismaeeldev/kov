import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { roundBankers } from '@/lib/calc/quoteTotals'
import { apiRead, apiWrite, ApiTimeoutError } from '@/lib/apiClient'

/** docs/05_DataModel.md §2.8: quote_lines.line_margin_pct is a per-line
 * margin figure, computed the same way as the quote-level aggregate
 * (sale - purchase versus sale, banker's-rounded) — null when unit_price is
 * 0 (a margin percentage of "0 sale value" is undefined, same convention as
 * quoteTotals.ts's quote-level projected_margin_pct). */
export function computeLineMarginPct(unitPrice: number, purchasePrice: number): number | null {
  if (unitPrice === 0) return null
  return roundBankers(((unitPrice - purchasePrice) / unitPrice) * 100)
}

export interface QuoteRow {
  id: string
  owner_id: string
  client_id: string
  reference: string
  status: 'draft' | 'issued' | 'accepted' | 'declined' | 'expired_cancelled'
  vat_rate: number
  vat_mention_code: 'autoliquidation' | 'franchise' | 'export' | null
  subtotal_ht: number | null
  total_ttc: number | null
  projected_margin_pct: number | null
  current_version_id: string | null
  issued_at: string | null
}

export interface QuoteLineRow {
  id: string
  quote_id: string
  owner_id: string
  price_item_id: string | null
  designation: string
  unit: string
  quantity: number
  unit_price: number
  purchase_price: number
  line_margin_pct: number | null
  sort_order: number
}

export interface PriceItemLookup {
  id: string
  label: string
  unit: string
  sale_price: number
  purchase_price: number
}

export interface ClientOption {
  id: string
  name: string
}

/**
 * Generates a human-readable quote reference — e.g. "DEV-2026-0001" — unique
 * per owner per docs/05_DataModel.md §2.7's `unique (owner_id, reference)`
 * constraint. Uses the current count of this owner's quotes this year as the
 * sequence number; a collision (two quotes created in the same instant) is
 * handled by the caller retrying with a fresh count on insert failure.
 */
export async function generateReference(ownerId: string): Promise<string> {
  const year = new Date().getFullYear()
  const { count } = await apiRead((client) =>
    client
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId)
      .gte('created_at', `${year}-01-01`),
  )

  const sequence = (count ?? 0) + 1
  return `DEV-${year}-${String(sequence).padStart(4, '0')}`
}

/**
 * Loads (or creates, for /quotes/new) the quote being edited, plus its lines
 * and the owner's client list (for Step 1's selector). Every mutation here
 * persists to Supabase immediately — docs/03_MasterPrompts.md §8.3's explicit
 * requirement that quote line data is genuinely persisted as the artisan
 * edits, never held only in local React state until a later "save."
 */
export function useQuoteEditor(quoteId: string | undefined) {
  const { user } = useAuth()
  const [quote, setQuote] = useState<QuoteRow | null>(null)
  const [lines, setLines] = useState<QuoteLineRow[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const initFor = useRef<string | null>(null)
  // Mirrors `quote` synchronously — `setQuote` inside createDraft doesn't
  // flush until the next render, so a caller that does
  // `await createDraft(...)` then immediately `await addLine(...)` in the
  // same function body (never happens across the normal step-by-step wizard,
  // where each call is a separate user interaction/render, but DOES happen
  // in Step 10.4's avenant-send flow, which calls both back-to-back) would
  // otherwise see addLine's STALE closure where `quote` is still null —
  // found live via a real "No quote loaded." error. This ref is read as a
  // fallback only when state hasn't caught up yet.
  const quoteRef = useRef<QuoteRow | null>(null)

  function setQuoteBoth(next: QuoteRow | null) {
    quoteRef.current = next
    setQuote(next)
  }

  const load = useCallback(async () => {
    if (!user) return
    setIsLoading(true)
    setLoadError(null)

    try {
      const { data: clientsData, error: clientsError } = await apiRead((client) =>
        client
          .from('clients')
          .select('id, name')
          .eq('owner_id', user.id)
          .eq('status', 'active')
          .order('name', { ascending: true }),
      )

      if (clientsError) {
        setIsLoading(false)
        setLoadError(clientsError.message)
        return
      }
      setClients((clientsData as ClientOption[]) ?? [])

      if (quoteId && quoteId !== 'new') {
        const [{ data: quoteData, error: quoteError }, { data: linesData }] = await Promise.all([
          apiRead((client) =>
            client.from('quotes').select('*').eq('id', quoteId).eq('owner_id', user.id).single(),
          ),
          apiRead((client) =>
            client
              .from('quote_lines')
              .select('*')
              .eq('quote_id', quoteId)
              .eq('owner_id', user.id)
              .order('sort_order', { ascending: true }),
          ),
        ])

        if (quoteError) {
          setIsLoading(false)
          setLoadError(quoteError.message)
          return
        }
        setQuoteBoth(quoteData as QuoteRow)
        setLines((linesData as QuoteLineRow[]) ?? [])
      }

      setIsLoading(false)
    } catch (err) {
      setIsLoading(false)
      setLoadError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }, [user, quoteId])

  useEffect(() => {
    if (!user) return
    const key = `${user.id}:${quoteId}`
    if (initFor.current === key) return
    initFor.current = key
    load()
  }, [user, quoteId, load])

  /** Creates the draft quotes row on first entry into /quotes/new — called
   * once the artisan picks a client in Step 1, since client_id is required
   * and not-null at the DB level. Returns the new quote's id. */
  const createDraft = useCallback(
    async (clientId: string): Promise<{ id?: string; error?: string }> => {
      if (!user) return { error: 'Not signed in.' }

      let lastError: string | undefined
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          const reference = await generateReference(user.id)
          const { data, error } = await apiWrite((client) =>
            client
              .from('quotes')
              .insert({
                owner_id: user.id,
                client_id: clientId,
                reference,
                vat_rate: 20,
                status: 'draft',
              })
              .select('*')
              .single(),
          )

          if (!error) {
            setQuoteBoth(data as QuoteRow)
            return { id: (data as QuoteRow).id }
          }
          // Unique-constraint collision on reference — retry with a fresh count.
          if (error.code === '23505') {
            lastError = error.message
            continue
          }
          return { error: error.message }
        }
        return { error: lastError ?? 'Impossible de créer le devis.' }
      } catch (err) {
        return { error: err instanceof ApiTimeoutError ? err.message : String(err) }
      }
    },
    [user],
  )

  const updateQuote = useCallback(
    async (
      patch: Partial<Pick<QuoteRow, 'client_id' | 'vat_rate' | 'vat_mention_code' | 'status'>>,
    ) => {
      if (!quote) return { error: 'No quote loaded.' }
      try {
        const { data, error } = await apiWrite((client) =>
          client.from('quotes').update(patch).eq('id', quote.id).select('*').single(),
        )
        if (error) return { error: error.message }
        setQuoteBoth(data as QuoteRow)
        return {}
      } catch (err) {
        return { error: err instanceof ApiTimeoutError ? err.message : String(err) }
      }
    },
    [quote],
  )

  /** Persists computed totals to the quotes row — called after every line
   * mutation so the server-side figures (docs/06_AIPromptRegistry.md §3.1's
   * "totaux affichés = instantané persisté") stay in sync with what the live
   * margin box shows. */
  const persistTotals = useCallback(
    async (totals: {
      subtotal_ht: number
      total_ttc: number
      projected_margin_pct: number | null
    }) => {
      if (!quote) return
      try {
        const { data, error } = await apiWrite((client) =>
          client.from('quotes').update(totals).eq('id', quote.id).select('*').single(),
        )
        if (!error) setQuoteBoth(data as QuoteRow)
      } catch {
        // Matches the pre-existing silent-fail behavior on error: totals
        // persistence failing here does not surface to the UI.
      }
    },
    [quote],
  )

  /** Looks up a single active price_items row by id, scoped to the current
   * user — used by the AI-assist apply flow (Step 9) to populate a proposed
   * line's real unit_price/purchase_price from the matched catalogue row,
   * never from the AI's own text output (docs/06_AIPromptRegistry.md §2.1). */
  const findPriceItemById = useCallback(
    async (priceItemId: string) => {
      if (!user) return { data: null, error: 'No user.' }
      try {
        const { data, error } = await apiRead((client) =>
          client
            .from('price_items')
            .select('id, label, unit, sale_price, purchase_price')
            .eq('id', priceItemId)
            .eq('owner_id', user.id)
            .single(),
        )
        if (error) return { data: null, error: error.message }
        return { data: data as PriceItemLookup, error: null }
      } catch (err) {
        return { data: null, error: err instanceof ApiTimeoutError ? err.message : String(err) }
      }
    },
    [user],
  )

  const addLine = useCallback(
    async (input: {
      designation: string
      unit: string
      quantity: number
      unit_price: number
      purchase_price: number
      price_item_id?: string | null
    }) => {
      // Falls back to quoteRef when `quote` state hasn't flushed yet (see
      // quoteRef's doc comment above — a caller doing createDraft then
      // addLine back-to-back in one function body, like the Step 10.4
      // avenant-send flow, hits this before the component re-renders).
      const currentQuote = quote ?? quoteRef.current
      if (!user || !currentQuote) return { error: 'No quote loaded.' }
      const sort_order = lines.length
      try {
        const { data, error } = await apiWrite((client) =>
          client
            .from('quote_lines')
            .insert({
              quote_id: currentQuote.id,
              owner_id: user.id,
              price_item_id: input.price_item_id ?? null,
              designation: input.designation,
              unit: input.unit,
              quantity: input.quantity,
              unit_price: input.unit_price,
              purchase_price: input.purchase_price,
              line_margin_pct: computeLineMarginPct(input.unit_price, input.purchase_price),
              sort_order,
            })
            .select('*')
            .single(),
        )

        if (error) return { error: error.message }
        setLines((prev) => [...prev, data as QuoteLineRow])
        return { line: data as QuoteLineRow }
      } catch (err) {
        return { error: err instanceof ApiTimeoutError ? err.message : String(err) }
      }
    },
    [user, quote, lines.length],
  )

  const updateLine = useCallback(
    async (lineId: string, patch: Partial<QuoteLineRow>) => {
      // Recompute line_margin_pct whenever a price field changes, using the
      // line's other current value for whichever field isn't part of this
      // patch — keeps the persisted per-line margin in sync without
      // requiring every call site to remember to compute it itself.
      let fullPatch = patch
      if ('unit_price' in patch || 'purchase_price' in patch) {
        const current = lines.find((l) => l.id === lineId)
        const unitPrice = patch.unit_price ?? current?.unit_price ?? 0
        const purchasePrice = patch.purchase_price ?? current?.purchase_price ?? 0
        fullPatch = { ...patch, line_margin_pct: computeLineMarginPct(unitPrice, purchasePrice) }
      }

      try {
        const { data, error } = await apiWrite((client) =>
          client.from('quote_lines').update(fullPatch).eq('id', lineId).select('*').single(),
        )
        if (error) return { error: error.message }
        setLines((prev) => prev.map((l) => (l.id === lineId ? (data as QuoteLineRow) : l)))
        return {}
      } catch (err) {
        return { error: err instanceof ApiTimeoutError ? err.message : String(err) }
      }
    },
    [lines],
  )

  const deleteLine = useCallback(async (lineId: string) => {
    try {
      const { error } = await apiWrite((client) =>
        client.from('quote_lines').delete().eq('id', lineId),
      )
      if (error) return { error: error.message }
      setLines((prev) => prev.filter((l) => l.id !== lineId))
      return {}
    } catch (err) {
      return { error: err instanceof ApiTimeoutError ? err.message : String(err) }
    }
  }, [])

  const reorderLines = useCallback(async (orderedIds: string[]) => {
    setLines((prev) => {
      const byId = new Map(prev.map((l) => [l.id, l]))
      return orderedIds.map((id, i) => ({ ...byId.get(id)!, sort_order: i }))
    })
    try {
      await Promise.all(
        orderedIds.map((id, i) =>
          apiWrite((client) => client.from('quote_lines').update({ sort_order: i }).eq('id', id)),
        ),
      )
    } catch {
      // Matches the pre-existing silent-fail behavior: reorder persistence
      // failing here does not surface to the UI (local state is already
      // updated optimistically above).
    }
  }, [])

  return {
    quote,
    lines,
    clients,
    isLoading,
    loadError,
    reload: load,
    createDraft,
    updateQuote,
    persistTotals,
    addLine,
    updateLine,
    deleteLine,
    reorderLines,
    findPriceItemById,
  }
}

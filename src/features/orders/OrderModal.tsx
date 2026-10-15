import * as React from 'react'
import { Button } from '@/components/ui/Button'
import { InlineError } from '@/components/ui/InlineError'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { StockStateBadge } from '@/components/ui/Badge'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { apiRead, apiWrite, ApiTimeoutError } from '@/lib/apiClient'
import { proposeDeliverySlots } from './deliverySlots'
import { simulateStock } from './simulatedStock'

interface SupplyLine {
  price_item_id: string
  designation: string
  unit: string
  quantity: number
}

interface OrderModalProps {
  projectId: string
  quoteId: string
  onClose: () => void
  onCreated: () => void
}

type DeliveryMode = 'chantier' | 'agence'

/**
 * mo-commande — docs/03_MasterPrompts.md §13.5 item 1, docs/04_ApplicationFlow.md
 * §3.1. Filters the source quote's supply-type lines (excludes labor/flat-fee),
 * shows per-reference simulated stock state/depot/lead-time, delivery mode
 * toggle, delivery slots adapting to the longest lead time among selected
 * references.
 */
export function OrderModal({ projectId, quoteId, onClose, onCreated }: OrderModalProps) {
  const { user } = useAuth()
  const isOnline = useOnlineStatus()
  const [lines, setLines] = React.useState<SupplyLine[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [deliveryMode, setDeliveryMode] = React.useState<DeliveryMode>('chantier')
  const [selectedSlotDate, setSelectedSlotDate] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'error'>('idle')
  const [error, setError] = React.useState<string | null>(null)
  // A ref, not a state check — see SatisfactionPage.tsx's doc comment
  // (module 15 deep audit, 2026-10-08): a state-only guard can still be
  // beaten by two click handlers firing in the same React batch.
  const savingRef = React.useRef(false)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      // quote_lines only carries price_item_id (nullable for free-entry
      // lines) — supply-type filtering requires joining price_items and
      // checking is_supply=true; free-entry lines (no price_item_id) have
      // no catalogue record to check against, so they're excluded from
      // ordering entirely (there's nothing to order against a supplier for
      // a line that was never matched to a real catalogue reference).
      try {
        const { data, error: fetchError } = await apiRead((client) =>
          client
            .from('quote_lines')
            .select('price_item_id, designation, unit, quantity, price_items!inner(is_supply)')
            .eq('quote_id', quoteId)
            .not('price_item_id', 'is', null)
            .eq('price_items.is_supply', true),
        )

        if (cancelled) return
        if (fetchError) {
          setLoadError(fetchError.message)
          return
        }
        const supplyLines = (data ?? []).map((row) => ({
          price_item_id: row.price_item_id as string,
          designation: row.designation,
          unit: row.unit,
          quantity: row.quantity,
        }))
        setLines(supplyLines)
        setSelectedIds(new Set(supplyLines.map((l) => l.price_item_id)))
      } catch (err) {
        if (cancelled) return
        setLoadError(
          err instanceof ApiTimeoutError
            ? err.message
            : 'Impossible de charger les lignes de fournitures.',
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [quoteId])

  const stockByLine = React.useMemo(() => {
    const map = new Map<string, ReturnType<typeof simulateStock>>()
    for (const line of lines ?? []) {
      map.set(line.price_item_id, simulateStock(line.price_item_id))
    }
    return map
  }, [lines])

  const selectedLines = (lines ?? []).filter((l) => selectedIds.has(l.price_item_id))
  const slots = React.useMemo(
    () =>
      proposeDeliverySlots(
        selectedLines.map((l) => stockByLine.get(l.price_item_id)?.leadTimeDays ?? null),
      ),
    [selectedLines, stockByLine],
  )

  function toggleLine(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    if (!user || selectedLines.length === 0 || !selectedSlotDate || savingRef.current) return
    savingRef.current = true
    setStatus('saving')
    setError(null)

    try {
      const { data: order, error: orderError } = await apiWrite((client) =>
        client
          .from('orders')
          .insert({
            owner_id: user.id,
            project_id: projectId,
            delivery_mode: deliveryMode,
            delivery_slot: `[${selectedSlotDate}T08:00:00Z,${selectedSlotDate}T18:00:00Z)`,
            status: 'transmitted_pending',
          })
          .select('id')
          .single(),
      )

      if (orderError || !order) {
        savingRef.current = false
        setStatus('error')
        setError(orderError?.message ?? 'Échec de la création de la commande.')
        return
      }

      const orderLinesPayload = selectedLines.map((line) => {
        const stock = stockByLine.get(line.price_item_id)!
        return {
          order_id: order.id,
          owner_id: user.id,
          price_item_id: line.price_item_id,
          reference_label: line.designation,
          quantity: line.quantity,
          stock_state: stock.state,
          depot_label: stock.depotLabel,
          lead_time_days: stock.leadTimeDays,
        }
      })

      const { error: linesError } = await apiWrite((client) =>
        client.from('order_lines').insert(orderLinesPayload),
      )
      if (linesError) {
        savingRef.current = false
        setStatus('error')
        setError(linesError.message)
        return
      }

      savingRef.current = false
      setStatus('idle')
      onCreated()
    } catch (err) {
      savingRef.current = false
      setStatus('error')
      setError(
        err instanceof ApiTimeoutError ? err.message : 'Échec de la création de la commande.',
      )
    }
  }

  if (loadError) {
    return (
      <Modal onClose={onClose} labelledBy="order-modal-error-title" panelClassName="max-w-sm">
        <h2 id="order-modal-error-title" className="sr-only">
          Erreur de chargement
        </h2>
        <InlineError message={loadError} />
        <Button variant="ghost" className="mt-3 w-full" onClick={onClose}>
          Fermer
        </Button>
      </Modal>
    )
  }

  return (
    <Modal onClose={onClose} labelledBy="order-modal-title">
      <h2 id="order-modal-title" className="font-serif text-[18px] font-black text-text-hi">
        Commander
      </h2>

      {lines === null ? (
        <Skeleton className="h-16 w-full" count={3} />
      ) : lines.length === 0 ? (
        <p className="text-center text-[13px] text-text-mid">
          Aucune fourniture à commander sur ce devis.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lines.map((line) => {
            const stock = stockByLine.get(line.price_item_id)!
            const isSelected = selectedIds.has(line.price_item_id)
            return (
              <li
                key={line.price_item_id}
                className={`rounded-sm border-[1.5px] p-3 ${
                  isSelected ? 'border-brand-500' : 'border-divider'
                }`}
              >
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleLine(line.price_item_id)}
                    className="mt-1 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-text-hi">{line.designation}</p>
                    <p className="text-[11px] text-text-mid">
                      {line.quantity} {line.unit}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <StockStateBadge state={stock.state} />
                      {stock.depotLabel ? (
                        <span className="text-[11px] text-text-low">{stock.depotLabel}</span>
                      ) : null}
                      {stock.leadTimeDays !== null ? (
                        <span className="text-[11px] text-text-low">
                          {stock.leadTimeDays === 0 ? "aujourd'hui" : `${stock.leadTimeDays}j`}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </label>
              </li>
            )
          })}
        </ul>
      )}

      {lines && lines.length > 0 ? (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold tracking-[0.05em] text-text-mid uppercase">
              Livraison
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(['chantier', 'agence'] as DeliveryMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDeliveryMode(mode)}
                  className={`rounded-sm border-[1.5px] px-3 py-2.5 text-[12px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                    deliveryMode === mode
                      ? 'border-brand-500 bg-brand-700 text-white'
                      : 'border-divider bg-surface text-text-hi'
                  }`}
                >
                  {mode === 'chantier' ? 'Sur le chantier' : "À l'agence"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold tracking-[0.05em] text-text-mid uppercase">
              Créneau de livraison
            </span>
            <div className="flex flex-col gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.date}
                  type="button"
                  onClick={() => setSelectedSlotDate(slot.date)}
                  className={`rounded-sm border-[1.5px] px-3 py-2.5 text-left text-[12px] font-bold capitalize outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                    selectedSlotDate === slot.date
                      ? 'border-brand-500 bg-brand-700 text-white'
                      : 'border-divider bg-surface text-text-hi'
                  }`}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {status === 'error' && error ? <InlineError message={error} /> : null}

      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onClose}>
          Annuler
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={
            selectedLines.length === 0 || !selectedSlotDate || status === 'saving' || !isOnline
          }
          onClick={handleSubmit}
        >
          {status === 'saving' ? 'Envoi...' : 'Commander'}
        </Button>
      </div>
    </Modal>
  )
}

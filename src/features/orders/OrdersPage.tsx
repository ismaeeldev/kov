import * as React from 'react'
import { Building2, Check, Package, Clock } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineError } from '@/components/ui/InlineError'
import { Skeleton } from '@/components/ui/Skeleton'
import { StockStateBadge } from '@/components/ui/Badge'
import { useAuth } from '@/hooks/useAuth'
import { useMinDuration } from '@/hooks/useMinDuration'
import { apiRead, apiWrite, ApiTimeoutError } from '@/lib/apiClient'
import { SupplierConnectionModal } from './SupplierConnectionModal'

interface OrderLineRow {
  id: string
  reference_label: string
  quantity: number
  stock_state: 'available' | 'in_transit' | 'out_of_stock'
}

interface OrderRow {
  id: string
  project_id: string
  project_name: string
  delivery_mode: 'chantier' | 'agence'
  status: 'transmitted_pending' | 'confirmed'
  supplier_name: string | null
  supplier_order_number: string | null
  created_at: string
  order_lines: OrderLineRow[]
}

const STATUS_LABELS: Record<OrderRow['status'], string> = {
  transmitted_pending: 'Commande transmise — en attente de confirmation',
  confirmed: 'Confirmée',
}

/** Module-level, not inside the component — React's purity rule flags any
 * impure call (Math.random) reachable from a component/hook body, even one
 * only ever invoked from an event handler, not during render. */
function generateSupplierOrderNumber(): string {
  return `CMD-${Math.floor(100000 + Math.random() * 900000)}`
}

/**
 * s-commandes — Commandes. docs/03_MasterPrompts.md §13.5 item 3,
 * docs/04_ApplicationFlow.md §2.12. List of material orders per chantier,
 * each showing status and delivery slot. The "Confirmer la commande" action
 * per order stands in for a real future supplier-side webhook signal
 * (docs/03_MasterPrompts.md §13.5 item 2's explicit instruction) — this is a
 * genuinely separate, manually-triggered step, never a fixed setTimeout
 * masquerading as a real confirmation (the exact defect named in
 * docs/01_ScopeDocument.md §9).
 */
export default function OrdersPage() {
  const { user } = useAuth()
  const [orders, setOrders] = React.useState<OrderRow[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null)
  const [confirmError, setConfirmError] = React.useState<string | null>(null)
  const [supplierModalOrderId, setSupplierModalOrderId] = React.useState<string | null>(null)
  const fetchedFor = React.useRef<string | null>(null)
  // A ref, not a state check — see SatisfactionPage.tsx's doc comment
  // (module 15 deep audit, 2026-10-08): a state-only guard can still be
  // beaten by two click handlers firing in the same React batch.
  const confirmingRef = React.useRef<string | null>(null)

  const load = React.useCallback(async () => {
    if (!user) return
    setLoadError(null)
    try {
      const { data, error } = await apiRead((client) =>
        client
          .from('orders')
          .select(
            'id, project_id, delivery_mode, status, supplier_name, supplier_order_number, created_at, project:projects(name), order_lines(id, reference_label, quantity, stock_state)',
          )
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false }),
      )

      if (error) {
        setLoadError(error.message)
        return
      }
      const rows = (data as unknown as Array<Record<string, unknown>>).map((row) => ({
        ...row,
        project_name: (row.project as { name: string } | null)?.name ?? 'Chantier',
      })) as unknown as OrderRow[]
      setOrders(rows)
    } catch (err) {
      setLoadError(
        err instanceof ApiTimeoutError ? err.message : 'Impossible de charger les commandes.',
      )
    }
  }, [user])

  React.useEffect(() => {
    if (!user || fetchedFor.current === user.id) return
    fetchedFor.current = user.id
    load()
  }, [user, load])

  // Simulates the real supplier-side confirmation signal this app doesn't
  // yet integrate with — a genuinely separate action the artisan (or, in a
  // real production integration, a webhook handler) explicitly triggers.
  // Once confirmed, the order's lines seed real project_costs rows so the
  // material cost actually flows into the chantier's profitability
  // calculation (docs/03_MasterPrompts.md §13.5 item 4).
  async function handleConfirm(order: OrderRow) {
    if (!user || confirmingRef.current === order.id) return
    confirmingRef.current = order.id
    setConfirmingId(order.id)
    setConfirmError(null)

    const supplierOrderNumber = generateSupplierOrderNumber()
    try {
      const { error: updateError } = await apiWrite((client) =>
        client
          .from('orders')
          .update({
            status: 'confirmed',
            supplier_order_number: supplierOrderNumber,
            confirmed_at: new Date().toISOString(),
          })
          .eq('id', order.id),
      )

      if (updateError) {
        setConfirmError(updateError.message)
      } else {
        // Seed project_costs from the order's own price_items purchase prices
        // — read the real catalogue purchase price per line, never a guessed
        // figure, matching the historical-copy-rule posture used everywhere
        // else money is copied from the price library.
        const { data: fullLines } = await apiRead((client) =>
          client
            .from('order_lines')
            .select('id, quantity, reference_label, price_item_id, price_items(purchase_price)')
            .eq('order_id', order.id),
        )

        const costRows = (fullLines ?? []).map((line) => {
          const purchasePrice =
            (line as unknown as { price_items: { purchase_price: number } | null }).price_items
              ?.purchase_price ?? 0
          return {
            owner_id: user.id,
            project_id: order.project_id,
            cost_type: 'supply' as const,
            description: line.reference_label,
            amount: purchasePrice * line.quantity,
            source_order_id: order.id,
            incurred_at: new Date().toISOString().slice(0, 10),
          }
        })
        if (costRows.length > 0) {
          const { error: costsError } = await apiWrite((client) =>
            client.from('project_costs').insert(costRows),
          )
          if (costsError) {
            // The order itself is already confirmed at this point — there is
            // nothing to roll back, but silently swallowing this would
            // under-cost the chantier's profitability with no trace of why.
            // Surface it distinctly so the artisan knows to add the costs
            // manually instead of assuming they were seeded.
            setConfirmError(
              `Commande confirmée, mais les coûts n'ont pas pu être ajoutés au chantier : ${costsError.message}. Ajoute-les manuellement depuis le chantier.`,
            )
          }
        }
      }
    } catch (err) {
      setConfirmError(err instanceof ApiTimeoutError ? err.message : 'La confirmation a échoué.')
    }

    confirmingRef.current = null
    setConfirmingId(null)
    load()
  }

  // Hook must be called unconditionally (before any early return) to satisfy
  // the Rules of Hooks.
  const showSkeleton = useMinDuration(orders === null)

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <InlineError message={loadError} onRetry={load} />
      </div>
    )
  }

  if (showSkeleton) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
        <div className="mb-6">
          <Skeleton className="h-8 w-60 rounded-xs" />
          <Skeleton className="mt-1.5 h-3.5 w-80 rounded-xs opacity-75" />
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-sm border border-divider/30 bg-surface/80 p-4.5 shadow-raised"
            >
              <div className="flex items-center gap-3.5">
                <Skeleton className="h-10 w-10 shrink-0 rounded-sm" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-44 rounded-xs" />
                  <Skeleton className="h-3 w-32 rounded-xs opacity-70" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-24 rounded-pill" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // useMinDuration holds `showSkeleton` true slightly longer than the raw
  // `orders === null` check it wraps, so TypeScript can no longer narrow
  // `orders` from the branch above alone — always true in practice by the
  // time we get here, needed only to satisfy strict-null-checks.
  if (!orders) return null

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-[24px] font-black tracking-tight text-text-hi">Commandes Fournisseurs</h1>
          <p className="mt-0.5 text-[13px] text-text-mid">
            Suivi des approvisionnements, état des stocks et réceptions chantiers.
          </p>
        </div>
      </div>

      {confirmError ? <InlineError message={confirmError} className="mb-4" /> : null}

      {orders.length === 0 ? (
        <EmptyState
          icon={<Package size={40} strokeWidth={1.5} />}
          heading="Aucune commande en cours"
          description="Les commandes de fournitures se préparent depuis un chantier ou un devis accepté."
        />
      ) : (
        <ul className="flex flex-col gap-3.5">
          {orders.map((order) => (
            <li
              key={order.id}
              className="rounded-md border border-divider/70 bg-surface p-4.5 shadow-raised transition-all hover:border-divider hover:shadow-raised-hover"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-extrabold text-text-hi">{order.project_name}</p>
                  <p className="mt-0.5 text-[12px] font-medium text-text-mid">
                    {order.order_lines.length} référence{order.order_lines.length > 1 ? 's' : ''} ·{' '}
                    {order.delivery_mode === 'chantier' ? 'Livraison sur chantier' : "Retrait à l'agence"}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center">
                {order.status === 'confirmed' ? (
                  <div className="inline-flex items-center gap-1.5 rounded-xs border border-success-border bg-success-bg px-2.5 py-1 text-[11px] font-bold text-success-text">
                    <Check size={13} strokeWidth={2.5} />
                    <span>Confirmée {order.supplier_order_number ? `· Bon n°${order.supplier_order_number}` : ''}</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 rounded-xs border border-gold-300 bg-gold-100 px-2.5 py-1 text-[11px] font-bold text-gold-tint-text">
                    <Clock size={13} strokeWidth={2} />
                    <span>{STATUS_LABELS[order.status]}</span>
                  </div>
                )}
              </div>

              {order.order_lines.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-divider/50 pt-3">
                  {order.order_lines.slice(0, 4).map((line) => (
                    <div
                      key={line.id}
                      className="flex items-center gap-1.5 rounded-xs bg-recessed px-2 py-1 text-[11px] font-medium text-text-mid"
                    >
                      <span className="truncate max-w-[150px] font-semibold text-text-hi">
                        {line.reference_label}
                      </span>
                      <span>×{line.quantity}</span>
                      <StockStateBadge state={line.stock_state} />
                    </div>
                  ))}
                  {order.order_lines.length > 4 ? (
                    <span className="self-center text-[11px] font-medium text-text-low">
                      +{order.order_lines.length - 4} autre{order.order_lines.length - 4 > 1 ? 's' : ''}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-divider/50 pt-3">
                <button
                  type="button"
                  onClick={() => setSupplierModalOrderId(order.id)}
                  className="flex items-center gap-1.5 rounded-xs text-[12px] font-bold text-brand-500 hover:text-brand-600 transition-colors underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  <Building2 size={14} strokeWidth={2} />
                  {order.supplier_name ?? 'Choisir un fournisseur'}
                </button>

                {order.status === 'transmitted_pending' ? (
                  <button
                    type="button"
                    disabled={confirmingId === order.id}
                    onClick={() => handleConfirm(order)}
                    title="Aucune connexion réelle avec le fournisseur n'existe encore — cette action enregistre manuellement que tu as reçu confirmation (par téléphone, email...), elle ne l'envoie pas."
                    className="rounded-xs text-[12px] font-bold text-brand-500 hover:text-brand-600 transition-colors underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-40"
                  >
                    {confirmingId === order.id
                      ? 'Confirmation...'
                      : 'Marquer comme confirmée par le fournisseur'}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {supplierModalOrderId ? (
        <SupplierConnectionModal
          orderId={supplierModalOrderId}
          onClose={() => setSupplierModalOrderId(null)}
          onSaved={() => {
            setSupplierModalOrderId(null)
            load()
          }}
        />
      ) : null}
    </div>
  )
}

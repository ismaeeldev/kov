import * as React from 'react'
import { Building2, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { InlineError } from '@/components/ui/InlineError'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { apiWrite, ApiTimeoutError } from '@/lib/apiClient'

export interface SupplierOption {
  id: string
  name: string
}

// A representative supplier list for the plumbing-heating trade (module
// 6.16's own trade-layer separation — this list belongs to the trade layer,
// not hardcoded into a general-purpose component signature, so a future
// trade can swap it without touching this modal's logic).
const SUPPLIERS: SupplierOption[] = [
  { id: 'pob', name: 'Point.P' },
  { id: 'cedeo', name: 'Cedeo' },
  { id: 'brossette', name: 'Brossette' },
  { id: 'other', name: 'Autre fournisseur' },
]

interface SupplierConnectionModalProps {
  /** When provided, saving here writes `orders.supplier_name` for this one
   * order (the s-commandes entry point). When omitted, this is the
   * business-settings entry point — saves a default supplier preference on
   * the `businesses` row instead. */
  orderId?: string
  onClose: () => void
  onSaved: (supplierName: string) => void
}

/**
 * mo-fournisseur — docs/04_ApplicationFlow.md §3.9. Supplier selection/
 * connection modal, opened from s-commandes (per-order) or business settings
 * (a default preference). A commercial-safety audit (2026-09-26) found this
 * modal was named in the 11-modal spec but never actually built anywhere in
 * the codebase — `orders.supplier_name` existed in the schema since
 * migration 0007 but nothing in the UI ever set it.
 *
 * Scope note (docs/01_ScopeDocument.md §11): the underlying supplier CHANNEL
 * is genuinely simulated at this stage — there is no real API integration
 * with Point.P/Cedeo/Brossette here, and this modal says so honestly. The
 * interface behavior (selection, connection-status display, exit back to
 * the originating screen with status shown) is built exactly as specified
 * so a real integration can be substituted later without a UI rewrite —
 * this modal's only real, persisted side effect today is writing the chosen
 * supplier's name to the real `orders.supplier_name` column (or a business
 * default), never a fake "connected" state with no backing data.
 */
export function SupplierConnectionModal({
  orderId,
  onClose,
  onSaved,
}: SupplierConnectionModalProps) {
  const { user } = useAuth()
  const isOnline = useOnlineStatus()
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = React.useState<string | null>(null)
  // A ref, not a state check — see SatisfactionPage.tsx's doc comment
  // (module 15 deep audit, 2026-10-08): a state-only guard can still be
  // beaten by two click handlers firing in the same React batch.
  const savingRef = React.useRef(false)

  async function handleConnect() {
    if (!user || !selectedId || savingRef.current) return
    const supplier = SUPPLIERS.find((s) => s.id === selectedId)
    if (!supplier) return
    savingRef.current = true
    setStatus('saving')
    setError(null)

    try {
      if (orderId) {
        const { error: updateError } = await apiWrite((client) =>
          client.from('orders').update({ supplier_name: supplier.name }).eq('id', orderId),
        )
        if (updateError) {
          savingRef.current = false
          setStatus('error')
          setError(updateError.message)
          return
        }
      } else {
        const { error: updateError } = await apiWrite((client) =>
          client
            .from('businesses')
            .update({ default_supplier_name: supplier.name })
            .eq('owner_id', user.id),
        )
        if (updateError) {
          savingRef.current = false
          setStatus('error')
          setError(updateError.message)
          return
        }
      }
    } catch (err) {
      savingRef.current = false
      setStatus('error')
      setError(err instanceof ApiTimeoutError ? err.message : String(err))
      return
    }

    savingRef.current = false
    setStatus('saved')
    onSaved(supplier.name)
  }

  return (
    <Modal onClose={onClose} labelledBy="supplier-connection-modal-title" panelClassName="max-w-sm">
      <h2
        id="supplier-connection-modal-title"
        className="font-serif text-[18px] font-black text-text-hi"
      >
        {orderId ? 'Choisir un fournisseur' : 'Fournisseur par défaut'}
      </h2>

      <p className="text-[12px] text-text-mid">
        Le canal de commande réel n'est pas encore connecté à ce fournisseur — cette sélection
        détermine simplement quel nom apparaît sur tes commandes pour l'instant.
      </p>

      <div className="flex flex-col gap-2">
        {SUPPLIERS.map((supplier) => (
          <button
            key={supplier.id}
            type="button"
            onClick={() => setSelectedId(supplier.id)}
            className={`flex items-center gap-2.5 rounded-sm border-[1.5px] px-3 py-2.5 text-left text-[13px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
              selectedId === supplier.id
                ? 'border-brand-500 bg-brand-700 text-white'
                : 'border-divider bg-surface text-text-hi'
            }`}
          >
            <Building2 size={16} strokeWidth={2} className="shrink-0" />
            {supplier.name}
          </button>
        ))}
      </div>

      {status === 'error' && error ? <InlineError message={error} /> : null}

      {status === 'saved' ? (
        <div className="flex items-center gap-2 rounded-sm bg-success-bg p-3 text-[13px] font-bold text-success-text">
          <Check size={16} strokeWidth={2.5} />
          Fournisseur enregistré.
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onClose}>
          {status === 'saved' ? 'Fermer' : 'Annuler'}
        </Button>
        {status !== 'saved' ? (
          <Button
            variant="primary"
            className="flex-1"
            disabled={!selectedId || status === 'saving' || !isOnline}
            onClick={handleConnect}
          >
            {status === 'saving' ? 'Enregistrement...' : 'Connecter'}
          </Button>
        ) : null}
      </div>
    </Modal>
  )
}

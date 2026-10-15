import * as React from 'react'
import { Package, Plus, Search } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineError } from '@/components/ui/InlineError'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useMinDuration } from '@/hooks/useMinDuration'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { apiRead, apiWrite, ApiTimeoutError } from '@/lib/apiClient'

interface PriceItem {
  id: string
  label: string
  unit: string
  purchase_price: number
  sale_price: number
  default_vat_rate: number
  category: string | null
  is_supply: boolean
  active: boolean
}

const VAT_RATES = [0, 5.5, 10, 20] as const

const emptyForm = {
  label: '',
  unit: '',
  purchase_price: '',
  sale_price: '',
  default_vat_rate: 20 as (typeof VAT_RATES)[number],
  category: '',
  is_supply: true,
}

/**
 * Price Library (s-tarifs) — docs/03_MasterPrompts.md §7.2.
 * List, search, create, edit, deactivate (soft delete via active=false, NEVER
 * a hard delete — an existing quote_lines row keeps its own historical copy
 * of label/unit/price regardless, but deactivating still stops an item from
 * being offered for NEW quotes without destroying past reporting data).
 */
export default function PriceLibraryPage() {
  const { user } = useAuth()
  const isOnline = useOnlineStatus()
  const [items, setItems] = React.useState<PriceItem[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [showInactive, setShowInactive] = React.useState(false)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [form, setForm] = React.useState(emptyForm)
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'saving' | 'error'>('idle')
  const [saveError, setSaveError] = React.useState<string | null>(null)
  // Per-row in-flight guard for toggleActive — same pattern as TeamPage.tsx's
  // togglingId (UX audit, 2026-10-03): without this, a fast double-click
  // could fire two toggle requests for the same item and race back to the
  // original value.
  const [togglingId, setTogglingId] = React.useState<string | null>(null)
  const fetchedFor = React.useRef<string | null>(null)
  // Refs, not the state checks alone — see SatisfactionPage.tsx's doc comment
  // (module 15 deep audit, 2026-10-08). `togglingId` is only set AFTER this
  // check, and `saveStatus` only read via a disabled prop — neither closes
  // the same-tick double-click window (module 20 close-out sweep, 2026-10-15).
  const savingRef = React.useRef(false)
  const togglingIdRef = React.useRef<string | null>(null)

  const load = React.useCallback(async () => {
    if (!user) return
    setLoadError(null)
    try {
      const { data, error } = await apiRead((client) =>
        client
          .from('price_items')
          .select('*')
          .eq('owner_id', user.id)
          .order('category', { ascending: true })
          .order('label', { ascending: true }),
      )

      if (error) {
        setLoadError(error.message)
        return
      }
      setItems(data as PriceItem[])
    } catch (err) {
      setLoadError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }, [user])

  React.useEffect(() => {
    if (!user || fetchedFor.current === user.id) return
    fetchedFor.current = user.id
    load()
  }, [user, load])

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setSaveError(null)
    setFormOpen(true)
  }

  function openEdit(item: PriceItem) {
    setEditingId(item.id)
    setForm({
      label: item.label,
      unit: item.unit,
      purchase_price: String(item.purchase_price),
      sale_price: String(item.sale_price),
      default_vat_rate: item.default_vat_rate as (typeof VAT_RATES)[number],
      category: item.category ?? '',
      is_supply: item.is_supply,
    })
    setSaveError(null)
    setFormOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user || savingRef.current) return
    savingRef.current = true
    setSaveStatus('saving')
    setSaveError(null)

    const payload = {
      owner_id: user.id,
      label: form.label,
      unit: form.unit,
      purchase_price: Number(form.purchase_price) || 0,
      sale_price: Number(form.sale_price) || 0,
      default_vat_rate: form.default_vat_rate,
      category: form.category || null,
      is_supply: form.is_supply,
    }

    try {
      const { error } = editingId
        ? await apiWrite((client) => client.from('price_items').update(payload).eq('id', editingId))
        : await apiWrite((client) => client.from('price_items').insert(payload))

      if (error) {
        savingRef.current = false
        setSaveStatus('error')
        setSaveError(error.message)
        return
      }

      savingRef.current = false
      setSaveStatus('idle')
      setFormOpen(false)
      load()
    } catch (err) {
      savingRef.current = false
      setSaveStatus('error')
      setSaveError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }

  async function toggleActive(item: PriceItem) {
    if (togglingIdRef.current) return
    togglingIdRef.current = item.id
    setTogglingId(item.id)
    try {
      const { error } = await apiWrite((client) =>
        client.from('price_items').update({ active: !item.active }).eq('id', item.id),
      )
      if (error) {
        setSaveError(error.message)
        setSaveStatus('error')
        return
      }
    } catch (err) {
      setSaveError(err instanceof ApiTimeoutError ? err.message : String(err))
      setSaveStatus('error')
      return
    } finally {
      togglingIdRef.current = null
      setTogglingId(null)
    }
    load()
  }

  // Hook must be called unconditionally (before any early return) to satisfy
  // the Rules of Hooks.
  const showSkeleton = useMinDuration(items === null)

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
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-8 w-44 rounded-xs" />
          <Skeleton className="h-9 w-24 rounded-sm" />
        </div>
        <Skeleton className="mb-4 h-12 w-full rounded-sm" />
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 rounded-sm bg-surface p-4 shadow-raised"
            >
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-1/3 rounded-xs" />
                <Skeleton className="h-3 w-1/4 rounded-xs opacity-75" />
              </div>
              <Skeleton className="h-6 w-20 rounded-xs" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // useMinDuration holds `showSkeleton` true slightly longer than the raw
  // `items === null` check it wraps, so TypeScript can no longer narrow
  // `items` from the branch above alone — always true in practice by the
  // time we get here, needed only to satisfy strict-null-checks.
  if (!items) return null

  const filtered = items.filter((item) => {
    if (!showInactive && !item.active) return false
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return item.label.toLowerCase().includes(q) || (item.category ?? '').toLowerCase().includes(q)
  })

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-[24px] font-black tracking-tight text-text-hi">Bibliothèque de prix</h1>
          <p className="mt-0.5 text-[12px] font-medium text-text-mid">
            {items.length} article{items.length > 1 ? 's' : ''} enregistré{items.length > 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openCreate} disabled={!isOnline}>
          <Plus size={16} strokeWidth={2.5} />
          Ajouter
        </Button>
      </div>

      {saveStatus === 'error' && saveError && !formOpen ? (
        <InlineError message={saveError} className="mb-4" />
      ) : null}

      {items.length > 0 ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-text-low"
            />
            <Input
              placeholder="Rechercher par désignation ou catégorie..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[12px] font-bold text-text-mid hover:text-text-hi select-none transition-colors">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-[18px] w-[18px] rounded-xs border-[1.5px] border-divider bg-surface text-brand-500 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg cursor-pointer"
            />
            Afficher désactivés
          </label>
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          icon={<Package size={40} strokeWidth={1.5} />}
          heading="Ta bibliothèque est vide"
          description="Ajoute tes prestations et fournitures pour les réutiliser dans tes devis."
          actionLabel="Ajouter un article"
          onAction={openCreate}
        />
      ) : filtered.length === 0 ? (
        <div className="rounded-sm bg-surface p-8 text-center shadow-raised">
          <p className="text-[13px] text-text-mid">
            Aucun résultat pour &ldquo;{search}&rdquo;.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {filtered.map((item) => (
            <li
              key={item.id}
              className="group flex flex-col justify-between gap-3 rounded-sm border border-transparent bg-surface p-4 shadow-raised transition-all duration-150 hover:border-brand-500/40 hover:shadow-floating sm:flex-row sm:items-center"
            >
              <button
                type="button"
                onClick={() => openEdit(item)}
                className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-extrabold text-text-hi transition-colors group-hover:text-brand-400">
                    {item.label}
                  </span>
                  {item.category ? (
                    <span className="rounded-pill bg-recessed px-2 py-0.5 text-[10px] font-bold text-text-mid uppercase">
                      {item.category}
                    </span>
                  ) : null}
                  <span className="rounded-pill bg-recessed px-2 py-0.5 text-[10px] font-bold text-text-low uppercase">
                    {item.is_supply ? 'Fourniture' : "Main d'œuvre"}
                  </span>
                  {!item.active ? (
                    <Badge tone="neutral" className="shrink-0">
                      Désactivé
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[12px] text-text-mid">
                  <span className="font-mono font-bold text-brand-400">
                    {item.sale_price.toFixed(2)} €
                  </span>
                  <span className="text-text-low">/ {item.unit}</span>
                  <span className="text-text-low">·</span>
                  <span className="text-text-low">TVA {item.default_vat_rate}%</span>
                  {item.purchase_price > 0 ? (
                    <>
                      <span className="text-text-low">·</span>
                      <span className="text-text-low">Achat: {item.purchase_price.toFixed(2)} €</span>
                    </>
                  ) : null}
                </div>
              </button>

              <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!isOnline || togglingId === item.id}
                  onClick={() => toggleActive(item)}
                  className="text-[12px] text-text-mid hover:text-text-hi"
                >
                  {togglingId === item.id ? '...' : item.active ? 'Désactiver' : 'Réactiver'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {formOpen ? (
        <Modal
          onClose={() => setFormOpen(false)}
          labelledBy="price-item-modal-title"
          panelClassName="max-w-sm gap-3"
        >
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            <h2
              id="price-item-modal-title"
              className="font-serif text-[18px] font-black text-text-hi"
            >
              {editingId ? "Modifier l'article" : 'Nouvel article'}
            </h2>
            <Input
              label="Désignation"
              required
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Unité"
                required
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              />
              <Input
                label="Catégorie"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Prix d'achat"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={form.purchase_price}
                onChange={(e) => setForm((f) => ({ ...f, purchase_price: e.target.value }))}
              />
              <Input
                label="Prix de vente"
                type="number"
                step="0.01"
                inputMode="decimal"
                required
                value={form.sale_price}
                onChange={(e) => setForm((f) => ({ ...f, sale_price: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold tracking-[0.05em] text-text-mid uppercase">
                TVA
              </span>
              <div className="flex gap-2">
                {VAT_RATES.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, default_vat_rate: rate }))}
                    className={`h-9 flex-1 rounded-sm border-[1.5px] text-[13px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                      form.default_vat_rate === rate
                        ? 'border-brand-500 bg-brand-700 text-white'
                        : 'border-divider bg-surface text-text-hi'
                    }`}
                  >
                    {rate}%
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-[13px] font-medium text-text-hi">
              <input
                type="checkbox"
                checked={form.is_supply}
                onChange={(e) => setForm((f) => ({ ...f, is_supply: e.target.checked }))}
                className="outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              />
              Fourniture (décoché = main d'oeuvre)
            </label>

            {saveStatus === 'error' && saveError ? <InlineError message={saveError} /> : null}

            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant="ghost"
                className="flex-1"
                onClick={() => setFormOpen(false)}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="flex-1"
                disabled={saveStatus === 'saving' || !isOnline}
              >
                {saveStatus === 'saving' ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}

import * as React from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { InlineError } from '@/components/ui/InlineError'
import { Input, MoneyInput } from '@/components/ui/Input'
import { MarginBox } from '@/components/ui/MarginBox'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/hooks/useAuth'
import { apiRead, ApiTimeoutError } from '@/lib/apiClient'
import { calculateQuoteTotals } from '@/lib/calc/quoteTotals'
import { VAT_MENTION_OPTIONS, type VatMentionCode } from '../vatMentions'
import { computeLineMarginPct, type useQuoteEditor } from '../useQuoteEditor'

const VAT_RATES = [0, 5.5, 10, 20] as const

interface PriceItemOption {
  id: string
  label: string
  unit: string
  purchase_price: number
  sale_price: number
}

interface QuoteStepDevisProps {
  editor: ReturnType<typeof useQuoteEditor>
  isOnline: boolean
  onBack: () => void
  onNext: () => void
}

const emptyLineForm = {
  designation: '',
  unit: '',
  quantity: '1',
  unit_price: '',
  purchase_price: '0',
}

/**
 * Step 3 — Devis — docs/04_ApplicationFlow.md §2.5, docs/03_MasterPrompts.md
 * §8.3: the line-item editor. Add from the price library (historical-copy
 * rule — values are COPIED at add-time, never live-joined) or free entry,
 * reorder, delete, VAT selector, and the live MarginBox recalculating via
 * src/lib/calc/quoteTotals.ts on every edit.
 */
export function QuoteStepDevis({ editor, isOnline, onBack, onNext }: QuoteStepDevisProps) {
  const { user } = useAuth()
  const [priceItems, setPriceItems] = React.useState<PriceItemOption[]>([])
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [freeEntryForm, setFreeEntryForm] = React.useState(emptyLineForm)
  const [freeEntryOpen, setFreeEntryOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [draggedId, setDraggedId] = React.useState<string | null>(null)
  // Per-line pending set — guards against a double-fire on the same line
  // (fast double-click on "Supprimer", or a field blur re-triggering while
  // the previous commit for that same line is still in flight). Keyed by
  // line id rather than a single global flag so editing one line never
  // blocks interacting with another.
  //
  // The membership check/add is done through a REF (`pendingLineIdsRef`),
  // not through the `pendingLineIds` state value directly — reading/writing
  // via state here had the same stale-closure gap as every other guard
  // fixed this session (React batches setState, so a second same-tick call
  // could still read the pre-update Set and pass the check). `pendingLineIds`
  // state is kept only to drive the UI's disabled/`"..."` rendering, which
  // doesn't need to be race-free the way the guard itself does (module 20
  // close-out sweep, 2026-10-15).
  const pendingLineIdsRef = React.useRef<Set<string>>(new Set())
  const [pendingLineIds, setPendingLineIds] = React.useState<Set<string>>(new Set())

  function withLinePending(lineId: string, fn: () => Promise<void>) {
    if (pendingLineIdsRef.current.has(lineId)) return
    pendingLineIdsRef.current.add(lineId)
    setPendingLineIds(new Set(pendingLineIdsRef.current))
    fn().finally(() => {
      pendingLineIdsRef.current.delete(lineId)
      setPendingLineIds(new Set(pendingLineIdsRef.current))
    })
  }

  React.useEffect(() => {
    if (!user) return
    let cancelled = false
    apiRead((client) =>
      client
        .from('price_items')
        .select('id, label, unit, purchase_price, sale_price')
        .eq('owner_id', user.id)
        .eq('active', true)
        .order('label', { ascending: true }),
    )
      .then(({ data }) => {
        if (cancelled) return
        setPriceItems((data as PriceItemOption[]) ?? [])
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof ApiTimeoutError ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const totals = React.useMemo(
    () =>
      calculateQuoteTotals(
        editor.lines.map((l) => ({
          quantity: l.quantity,
          unit_price: l.unit_price,
          purchase_price: l.purchase_price,
        })),
        editor.quote?.vat_rate ?? 20,
      ),
    [editor.lines, editor.quote?.vat_rate],
  )

  // Persist server-side totals whenever the computed figures change — the
  // live MarginBox above reads the LOCAL computation for instant feedback,
  // this effect is what keeps quotes.subtotal_ht/total_ttc/projected_margin_pct
  // in sync as the authoritative persisted figure (docs/06_AIPromptRegistry.md
  // §3.1's "totaux affichés = instantané persisté").
  const lastPersisted = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!editor.quote) return
    const key = JSON.stringify(totals)
    if (lastPersisted.current === key) return
    lastPersisted.current = key
    // Pick only the columns that actually exist on `quotes` — calculateQuoteTotals
    // also returns vat_amount (a display-only figure, not a persisted column);
    // spreading the full totals object into the update would 400 against
    // PostgREST's schema cache (found live in Step 8 testing).
    editor.persistTotals({
      subtotal_ht: totals.subtotal_ht,
      total_ttc: totals.total_ttc,
      projected_margin_pct: totals.projected_margin_pct,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals, editor.quote?.id])

  // Guards both add-line entry points below — neither had ANY re-entrancy
  // protection before (no disabled state tied to a pre-write check at all,
  // unlike every other mutation in this file). A fast double-click on a
  // price-library item, or a double-submit of the free-entry form, could
  // insert the same line twice (module 20 close-out sweep, 2026-10-15).
  const addingLineRef = React.useRef(false)

  async function handleAddFromPriceItem(item: PriceItemOption) {
    if (addingLineRef.current) return
    addingLineRef.current = true
    setError(null)
    // Historical-copy rule (docs/05_DataModel.md §4): copy label/unit/prices
    // into the quote_lines row now — never a live join back to price_items.
    const result = await editor.addLine({
      designation: item.label,
      unit: item.unit,
      quantity: 1,
      unit_price: item.sale_price,
      purchase_price: item.purchase_price,
      price_item_id: item.id,
    })
    addingLineRef.current = false
    if (result.error) setError(result.error)
    setPickerOpen(false)
  }

  async function handleAddFreeEntry(e: React.FormEvent) {
    e.preventDefault()
    if (addingLineRef.current) return
    addingLineRef.current = true
    setError(null)
    const result = await editor.addLine({
      designation: freeEntryForm.designation,
      unit: freeEntryForm.unit,
      quantity: Number(freeEntryForm.quantity) || 0,
      unit_price: Number(freeEntryForm.unit_price) || 0,
      purchase_price: Number(freeEntryForm.purchase_price) || 0,
    })
    addingLineRef.current = false
    if (result.error) {
      setError(result.error)
      return
    }
    setFreeEntryForm(emptyLineForm)
    setFreeEntryOpen(false)
  }

  function handleLineFieldCommit(
    lineId: string,
    field: 'quantity' | 'unit_price' | 'purchase_price',
    value: string,
  ) {
    const num = Number(value)
    if (Number.isNaN(num)) return
    withLinePending(lineId, async () => {
      const result = await editor.updateLine(lineId, { [field]: num })
      if (result.error) setError(result.error)
    })
  }

  function handleDeleteLine(lineId: string) {
    withLinePending(lineId, async () => {
      const result = await editor.deleteLine(lineId)
      if (result.error) setError(result.error)
    })
  }

  function handleDragStart(id: string) {
    setDraggedId(id)
  }
  function handleDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault()
    if (!draggedId || draggedId === overId) return
  }
  async function handleDrop(overId: string) {
    if (!draggedId || draggedId === overId) {
      setDraggedId(null)
      return
    }
    const ids = editor.lines.map((l) => l.id)
    const fromIdx = ids.indexOf(draggedId)
    const toIdx = ids.indexOf(overId)
    ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, draggedId)
    setDraggedId(null)
    await editor.reorderLines(ids)
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-serif text-[22px] font-black text-text-hi">Lignes du devis</h1>
        <p className="mt-0.5 text-[13px] text-text-mid">
          Ajuste les quantités et prix pour piloter ta marge en temps réel.
        </p>
      </div>

      <MarginBox marginPct={totals.projected_margin_pct ?? 0} />

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold tracking-[0.05em] text-text-mid uppercase">TVA</span>
        <div className="flex gap-2">
          {VAT_RATES.map((rate) => {
            const isSelected = editor.quote?.vat_rate === rate
            return (
              <button
                key={rate}
                type="button"
                disabled={!isOnline}
                onClick={() => editor.updateQuote({ vat_rate: rate })}
                className={`h-10 flex-1 rounded-card border-[1.5px] text-[13px] font-bold outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg disabled:opacity-40 ${
                  isSelected
                    ? 'border-brand-500 bg-brand-700 text-white shadow-raised'
                    : 'border-divider/60 bg-surface text-text-hi hover:border-brand-500/50'
                }`}
              >
                {rate}%
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="vat-mention"
          className="text-[11px] font-bold tracking-[0.05em] text-text-mid uppercase"
        >
          Mention légale TVA
        </label>
        <select
          id="vat-mention"
          value={editor.quote?.vat_mention_code ?? ''}
          disabled={!isOnline}
          onChange={(e) =>
            editor.updateQuote({
              vat_mention_code: (e.target.value || null) as VatMentionCode,
            })
          }
          className="w-full rounded-card border-[1.5px] border-divider/60 bg-surface px-4 py-3.5 text-[14px] text-text-hi outline-none transition-colors focus:border-brand-500 disabled:opacity-40"
        >
          {VAT_MENTION_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.value ?? ''}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {error ? <InlineError message={error} /> : null}

      {editor.lines.length === 0 ? (
        <p className="rounded-card border border-divider/40 bg-recessed px-4 py-6 text-center text-[13px] text-text-mid">
          Aucune ligne pour l'instant. Ajoute une prestation depuis ta bibliothèque de prix ou en
          saisie libre.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {editor.lines.map((line) => {
            const lineMargin = computeLineMarginPct(line.unit_price, line.purchase_price)
            const linePending = pendingLineIds.has(line.id)
            return (
              <li
                key={line.id}
                draggable
                onDragStart={() => handleDragStart(line.id)}
                onDragOver={(e) => handleDragOver(e, line.id)}
                onDrop={() => handleDrop(line.id)}
                className="flex flex-col gap-2.5 rounded-card border border-divider/60 bg-surface p-3.5 shadow-raised transition-all"
              >
                <div className="flex items-center gap-2">
                  <GripVertical size={16} className="shrink-0 cursor-grab text-text-low hover:text-text-mid" />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-text-hi">
                    {line.designation}
                  </span>
                  <button
                    type="button"
                    aria-label="Supprimer la ligne"
                    onClick={() => handleDeleteLine(line.id)}
                    disabled={!isOnline || linePending}
                    className="shrink-0 rounded-card p-2 text-error-text outline-none transition-colors hover:bg-error-bg/20 focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-40"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    label="Qté"
                    type="number"
                    step="0.001"
                    defaultValue={line.quantity}
                    disabled={!isOnline || linePending}
                    onBlur={(e) => handleLineFieldCommit(line.id, 'quantity', e.target.value)}
                  />
                  <MoneyInput
                    label="Prix vente"
                    defaultValue={line.unit_price}
                    disabled={!isOnline || linePending}
                    onBlur={(e) => handleLineFieldCommit(line.id, 'unit_price', e.target.value)}
                  />
                  <MoneyInput
                    label="Prix achat"
                    defaultValue={line.purchase_price}
                    disabled={!isOnline || linePending}
                    onBlur={(e) => handleLineFieldCommit(line.id, 'purchase_price', e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between border-t border-divider/40 pt-2 text-[11px] font-bold text-text-mid">
                  <span>Marge unitaire</span>
                  <span className={`rounded-pill px-2 py-0.5 text-[11px] font-extrabold ${
                    lineMargin === null
                      ? 'text-text-mid'
                      : lineMargin >= 40
                        ? 'bg-margin-green/10 text-margin-green'
                        : lineMargin >= 25
                          ? 'bg-gold-500/10 text-gold-500'
                          : 'bg-margin-red/10 text-margin-red'
                  }`}>
                    {lineMargin === null ? '—' : `${lineMargin.toFixed(1)} %`}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {freeEntryOpen ? (
        <form
          onSubmit={handleAddFreeEntry}
          className="flex flex-col gap-3 rounded-card border border-divider/60 bg-surface p-4 shadow-raised"
        >
          <h2 className="text-[13px] font-bold tracking-[0.05em] text-text-mid uppercase">
            Nouvelle ligne libre
          </h2>
          <Input
            label="Désignation"
            required
            value={freeEntryForm.designation}
            onChange={(e) => setFreeEntryForm((f) => ({ ...f, designation: e.target.value }))}
            placeholder="Ex : Fourniture et pose parquet..."
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Unité"
              required
              value={freeEntryForm.unit}
              onChange={(e) => setFreeEntryForm((f) => ({ ...f, unit: e.target.value }))}
              placeholder="Ex : m², forfait, u"
            />
            <Input
              label="Quantité"
              type="number"
              step="0.001"
              required
              value={freeEntryForm.quantity}
              onChange={(e) => setFreeEntryForm((f) => ({ ...f, quantity: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MoneyInput
              label="Prix de vente"
              required
              value={freeEntryForm.unit_price}
              onChange={(e) => setFreeEntryForm((f) => ({ ...f, unit_price: e.target.value }))}
            />
            <MoneyInput
              label="Prix d'achat"
              value={freeEntryForm.purchase_price}
              onChange={(e) => setFreeEntryForm((f) => ({ ...f, purchase_price: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={() => setFreeEntryOpen(false)}
            >
              Annuler
            </Button>
            <Button type="submit" variant="primary" className="flex-1" disabled={!isOnline}>
              Ajouter
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="flex-1"
            disabled={!isOnline}
            onClick={() => setPickerOpen(true)}
          >
            <Plus size={16} strokeWidth={2.5} />
            Bibliothèque
          </Button>
          <Button
            variant="ghost"
            className="flex-1"
            disabled={!isOnline}
            onClick={() => setFreeEntryOpen(true)}
          >
            <Plus size={16} strokeWidth={2.5} />
            Saisie libre
          </Button>
        </div>
      )}

      {pickerOpen ? (
        <Modal
          onClose={() => setPickerOpen(false)}
          labelledBy="price-picker-modal-title"
          panelClassName="max-w-sm gap-2"
        >
          <h2
            id="price-picker-modal-title"
            className="mb-1 font-serif text-[18px] font-black text-text-hi"
          >
            Bibliothèque de prix
          </h2>
          {priceItems.length === 0 ? (
            <p className="text-[13px] text-text-mid">Ta bibliothèque de prix est vide.</p>
          ) : (
            <div className="max-h-72 flex flex-col gap-1.5 overflow-y-auto pr-1">
              {priceItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleAddFromPriceItem(item)}
                  className="rounded-card border border-divider/60 bg-surface p-3 text-left outline-none transition-all hover:border-brand-500/60 hover:bg-recessed focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  <div className="text-[14px] font-bold text-text-hi">{item.label}</div>
                  <div className="mt-0.5 font-mono text-[12px] text-text-mid">
                    {item.sale_price.toFixed(2)} € / {item.unit}
                  </div>
                </button>
              ))}
            </div>
          )}
          <Button variant="ghost" onClick={() => setPickerOpen(false)} className="mt-2">
            Fermer
          </Button>
        </Modal>
      ) : null}

      <div className="mt-2 flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onBack}>
          Retour
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={editor.lines.length === 0}
          onClick={onNext}
        >
          Continuer
        </Button>
      </div>
    </div>
  )
}

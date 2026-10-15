import * as React from 'react'
import { ChevronRight, FileText, Link2, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineError } from '@/components/ui/InlineError'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useMinDuration } from '@/hooks/useMinDuration'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { apiRead, apiWrite, ApiTimeoutError } from '@/lib/apiClient'

interface TechnicalSheet {
  id: string
  title: string
  body: string | null
  price_item_id: string | null
}

interface PriceItemOption {
  id: string
  label: string
  active: boolean
}

const emptyForm = { title: '', body: '', priceItemId: '' }

/**
 * Technical Sheets (s-fiches) — docs/03_MasterPrompts.md §7.2 item 3.
 * Browsable/filterable list, each optionally linked to a price_items row.
 */
export default function TechnicalSheetsPage() {
  const { user } = useAuth()
  const isOnline = useOnlineStatus()
  const [sheets, setSheets] = React.useState<TechnicalSheet[] | null>(null)
  const [priceItems, setPriceItems] = React.useState<PriceItemOption[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [form, setForm] = React.useState(emptyForm)
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'saving' | 'error'>('idle')
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const fetchedFor = React.useRef<string | null>(null)
  // A ref, not a state check — a state-only guard doesn't actually prevent a
  // genuine same-tick double-click (React batches setState; a second click
  // handler invoked before the first's update commits can still read the
  // stale value and pass the check too — see SatisfactionPage.tsx's doc
  // comment, module 15 deep audit, 2026-10-08, for the full story). Found
  // here too on final pass (module 20 close-out, 2026-10-15).
  const savingRef = React.useRef(false)

  const load = React.useCallback(async () => {
    if (!user) return
    setLoadError(null)
    try {
      const [{ data: sheetsData, error }, { data: priceItemsData }] = await Promise.all([
        apiRead((client) =>
          client
            .from('technical_sheets')
            .select('id, title, body, price_item_id')
            .eq('owner_id', user.id)
            .order('title', { ascending: true }),
        ),
        // Previously filtered to active=true only — a technical sheet linked
        // to a price item that was later deactivated would then silently
        // look unlinked everywhere (the list view's linked-item pill AND the
        // edit modal's dropdown both read from this same list, so neither
        // could resolve the still-real price_item_id to a label). The FK
        // itself was never actually broken, just invisible in the UI — fixed
        // by loading all items and marking inactive ones distinctly instead
        // of excluding them (module 6 deep audit, 2026-10-07).
        apiRead((client) =>
          client
            .from('price_items')
            .select('id, label, active')
            .eq('owner_id', user.id)
            .order('label', { ascending: true }),
        ),
      ])

      if (error) {
        setLoadError(error.message)
        return
      }
      setSheets(sheetsData as TechnicalSheet[])
      setPriceItems((priceItemsData as PriceItemOption[]) ?? [])
    } catch (err) {
      setLoadError(err instanceof ApiTimeoutError ? err.message : 'Une erreur est survenue.')
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

  function openEdit(sheet: TechnicalSheet) {
    setEditingId(sheet.id)
    setForm({
      title: sheet.title,
      body: sheet.body ?? '',
      priceItemId: sheet.price_item_id ?? '',
    })
    setSaveError(null)
    setFormOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user || savingRef.current) return
    // HTML's `required` on the Titre field only rejects a truly empty
    // string — whitespace-only input ("   ") passes it. Same explicit trim
    // check used elsewhere for required text fields (e.g. TeamPage.tsx's
    // Nom field, ClientDetailPage.tsx's Nom field) — module 20 close-out,
    // 2026-10-15.
    if (!form.title.trim()) {
      setSaveStatus('error')
      setSaveError('Le titre est requis.')
      return
    }
    savingRef.current = true
    setSaveStatus('saving')
    setSaveError(null)

    const payload = {
      owner_id: user.id,
      title: form.title.trim(),
      body: form.body.trim() || null,
      price_item_id: form.priceItemId || null,
    }

    try {
      const { error } = editingId
        ? await apiWrite((client) =>
            client.from('technical_sheets').update(payload).eq('id', editingId),
          )
        : await apiWrite((client) => client.from('technical_sheets').insert(payload))

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
      setSaveError(err instanceof ApiTimeoutError ? err.message : 'Une erreur est survenue.')
    }
  }

  // Hook must be called unconditionally (before any early return) to satisfy
  // the Rules of Hooks.
  const showSkeleton = useMinDuration(sheets === null)

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
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </div>
      </div>
    )
  }

  // useMinDuration holds `showSkeleton` true slightly longer than the raw
  // `sheets === null` check it wraps, so TypeScript can no longer narrow
  // `sheets` from the branch above alone — always true in practice by the
  // time we get here, needed only to satisfy strict-null-checks.
  if (!sheets) return null

  const filtered = sheets.filter(
    (s) => !search.trim() || s.title.toLowerCase().includes(search.trim().toLowerCase()),
  )

  const priceItemMap = new Map(priceItems.map((p) => [p.id, p.label]))

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-[1200px] flex-col p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-[24px] font-black tracking-tight text-text-hi">Fiches techniques</h1>
          <p className="mt-0.5 text-[12px] font-medium text-text-mid">
            {sheets.length} fiche{sheets.length > 1 ? 's' : ''} enregistrée{sheets.length > 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openCreate} disabled={!isOnline}>
          <Plus size={16} strokeWidth={2.5} />
          Ajouter
        </Button>
      </div>

      {sheets.length > 0 ? (
        <div className="relative mb-4">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-text-low"
          />
          <Input
            placeholder="Rechercher une fiche..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      ) : null}

      {sheets.length === 0 ? (
        <EmptyState
          icon={<FileText size={40} strokeWidth={1.5} />}
          heading="Aucune fiche technique pour l'instant"
          description="Crée des fiches réutilisables pour tes prestations récurrentes."
          actionLabel="Ajouter une fiche"
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
          {filtered.map((sheet) => {
            const linkedItemLabel = sheet.price_item_id ? priceItemMap.get(sheet.price_item_id) : null
            return (
              <li key={sheet.id}>
                <button
                  type="button"
                  onClick={() => openEdit(sheet)}
                  className="group flex w-full items-start justify-between gap-4 rounded-sm border border-transparent bg-surface p-4 text-left shadow-raised transition-all duration-150 outline-none hover:border-brand-500/40 hover:shadow-floating active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  <div className="flex min-w-0 items-start gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-brand-500/20 bg-brand-900/30 text-brand-400">
                      <FileText size={18} strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-extrabold text-text-hi transition-colors group-hover:text-brand-400">
                          {sheet.title}
                        </span>
                        {linkedItemLabel ? (
                          <span className="inline-flex items-center gap-1 rounded-pill bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-900 uppercase">
                            <Link2 size={10} strokeWidth={2.5} />
                            {linkedItemLabel}
                          </span>
                        ) : null}
                      </div>
                      {sheet.body ? (
                        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-text-mid">
                          {sheet.body}
                        </p>
                      ) : (
                        <p className="mt-1 text-[12px] italic text-text-low">
                          Aucun contenu rédigé
                        </p>
                      )}
                    </div>
                  </div>

                  <ChevronRight
                    size={16}
                    className="mt-1 shrink-0 text-text-low transition-all group-hover:translate-x-0.5 group-hover:text-brand-400"
                  />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {formOpen ? (
        <Modal
          onClose={() => setFormOpen(false)}
          labelledBy="technical-sheet-modal-title"
          panelClassName="max-w-md gap-3"
        >
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            <h2
              id="technical-sheet-modal-title"
              className="font-serif text-[18px] font-black text-text-hi"
            >
              {editingId ? 'Modifier la fiche' : 'Nouvelle fiche'}
            </h2>
            <Input
              label="Titre"
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="sheet-body"
                className="text-[11px] leading-[1.4] font-bold tracking-[0.05em] text-text-mid uppercase"
              >
                Contenu
              </label>
              <textarea
                id="sheet-body"
                rows={5}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Description détaillée de la prestation..."
                className="w-full rounded-sm border-[1.5px] border-divider bg-surface px-4 py-3 text-[13px] leading-relaxed text-text-hi outline-none transition-colors duration-150 focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="sheet-price-item"
                className="text-[11px] leading-[1.4] font-bold tracking-[0.05em] text-text-mid uppercase"
              >
                Article lié (optionnel)
              </label>
              <select
                id="sheet-price-item"
                value={form.priceItemId}
                onChange={(e) => setForm((f) => ({ ...f, priceItemId: e.target.value }))}
                className="w-full rounded-sm border-[1.5px] border-divider bg-surface px-4 py-3 text-[13px] text-text-hi outline-none transition-colors duration-150 focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg"
              >
                <option value="">Aucun article lié</option>
                {priceItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.active ? item.label : `${item.label} (désactivé)`}
                  </option>
                ))}
              </select>
            </div>

            {saveStatus === 'error' && saveError ? <InlineError message={saveError} /> : null}

            <div className="mt-3 flex gap-2">
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

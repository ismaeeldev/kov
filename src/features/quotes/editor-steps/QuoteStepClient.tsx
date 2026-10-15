import * as React from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineError } from '@/components/ui/InlineError'
import { Input } from '@/components/ui/Input'
import { apiWrite, ApiTimeoutError } from '@/lib/apiClient'
import { useAuth } from '@/hooks/useAuth'
import type { useQuoteEditor } from '../useQuoteEditor'

interface QuoteStepClientProps {
  editor: ReturnType<typeof useQuoteEditor>
  isOnline: boolean
  onNext: () => void
  /** Called after createDraft() succeeds, so the parent can swap the route
   * from /quotes/new to /quotes/:id/edit without remounting the wizard. */
  onCreated: (quoteId: string) => void
}

/**
 * Step 1 — Client — docs/04_ApplicationFlow.md §2.5: select an existing
 * client (search) or create a new one inline (mini version of the
 * client-creation form, per the master prompt).
 */
export function QuoteStepClient({ editor, isOnline, onNext, onCreated }: QuoteStepClientProps) {
  const { user } = useAuth()
  const [search, setSearch] = React.useState('')
  const [creatingInline, setCreatingInline] = React.useState(false)
  const [inlineName, setInlineName] = React.useState('')
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'error'>('idle')
  const [error, setError] = React.useState<string | null>(null)
  // A ref, not a state check — a state-only guard doesn't actually prevent a
  // genuine same-tick double-click (React batches setState; a second click
  // handler invoked before the first's update commits can still read the
  // stale value and pass the check too — see SatisfactionPage.tsx's doc
  // comment, module 15 deep audit, 2026-10-08). Shared by both mutation
  // paths in this step (module 20 close-out sweep, 2026-10-15).
  const savingRef = React.useRef(false)

  const filteredClients = editor.clients.filter(
    (c) => !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  async function selectClient(clientId: string) {
    if (savingRef.current) return
    savingRef.current = true
    setStatus('saving')
    setError(null)

    if (!editor.quote) {
      const result = await editor.createDraft(clientId)
      savingRef.current = false
      setStatus('idle')
      if (result.error) {
        setError(result.error)
        return
      }
      onCreated(result.id!)
      onNext()
      return
    }

    const result = await editor.updateQuote({ client_id: clientId })
    savingRef.current = false
    setStatus('idle')
    if (result.error) {
      setError(result.error)
      return
    }
    onNext()
  }

  async function handleCreateInlineClient(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !inlineName.trim() || savingRef.current) return
    savingRef.current = true
    setStatus('saving')
    setError(null)

    try {
      const { data, error: insertError } = await apiWrite((client) =>
        client
          .from('clients')
          .insert({ owner_id: user.id, name: inlineName.trim() })
          .select('id')
          .single(),
      )

      if (insertError) {
        savingRef.current = false
        setStatus('idle')
        setError(insertError.message)
        return
      }

      // selectClient manages its own savingRef lifecycle internally — reset
      // here first so its own guard check doesn't see this call's lock still
      // held and silently no-op.
      savingRef.current = false
      await selectClient(data!.id)
    } catch (err) {
      savingRef.current = false
      setStatus('idle')
      setError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-serif text-[22px] font-black text-text-hi">Choisir le client</h1>
        <p className="mt-0.5 text-[13px] text-text-mid">
          Sélectionne un client existant ou saisis un nouveau nom.
        </p>
      </div>

      {error ? <InlineError message={error} /> : null}

      {creatingInline ? (
        <form onSubmit={handleCreateInlineClient} className="flex flex-col gap-3 rounded-card border border-divider/60 bg-surface p-4 shadow-raised">
          <h2 className="text-[13px] font-bold tracking-[0.05em] text-text-mid uppercase">
            Nouveau client
          </h2>
          <Input
            label="Nom du client"
            autoFocus
            required
            value={inlineName}
            onChange={(e) => setInlineName(e.target.value)}
            disabled={status === 'saving'}
            placeholder="Ex : M. Dupont, SCI Horizon..."
          />
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={() => setCreatingInline(false)}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              disabled={status === 'saving' || !isOnline}
            >
              {status === 'saving' ? 'Création...' : 'Créer et continuer'}
            </Button>
          </div>
        </form>
      ) : (
        <>
          {editor.clients.length > 0 ? (
            <Input
              placeholder="Rechercher un client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          ) : null}

          {editor.clients.length === 0 ? (
            <EmptyState
              heading="Aucun client pour l'instant"
              description="Crée ton premier client pour commencer ce devis."
              actionLabel="Créer un client"
              onAction={() => setCreatingInline(true)}
            />
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {filteredClients.map((client) => {
                  const isSelected = editor.quote?.client_id === client.id
                  return (
                    <li key={client.id}>
                      <button
                        type="button"
                        disabled={status === 'saving' || !isOnline}
                        onClick={() => selectClient(client.id)}
                        className={`group flex w-full items-center justify-between rounded-card border-[1.5px] p-4 text-left outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg disabled:pointer-events-none disabled:opacity-40 ${
                          isSelected
                            ? 'border-brand-500 bg-brand-500/10 shadow-raised ring-1 ring-brand-500/30'
                            : 'border-divider/60 bg-surface hover:border-brand-500/60 hover:shadow-card'
                        }`}
                      >
                        <span className="text-[14px] font-bold text-text-hi">
                          {client.name}
                        </span>
                        {isSelected ? (
                          <span className="rounded-pill bg-brand-700 px-2 py-0.5 text-[11px] font-extrabold text-white">
                            Sélectionné
                          </span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <Button
                variant="ghost"
                disabled={!isOnline}
                onClick={() => setCreatingInline(true)}
                className="w-full"
              >
                <Plus size={16} strokeWidth={2.5} />
                Nouveau client
              </Button>
            </>
          )}
        </>
      )}

      {editor.quote && !creatingInline ? (
        <Button variant="primary" onClick={onNext} className="mt-2">
          Continuer
        </Button>
      ) : null}
    </div>
  )
}

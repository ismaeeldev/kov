import * as React from 'react'
import { ArrowLeft, Plus, UserCheck, UserRound, UserX } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineError } from '@/components/ui/InlineError'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useMinDuration } from '@/hooks/useMinDuration'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { apiRead, apiWrite, ApiTimeoutError } from '@/lib/apiClient'

interface Employee {
  id: string
  name: string
  role: string | null
  active: boolean
}

const emptyForm = { name: '', role: '' }

/**
 * Employee roster (/profile/team) — docs/03_MasterPrompts.md §7.4.
 * Intentionally lightweight per docs/05_DataModel.md's design note: employees
 * are named resources for planning assignment, not separate authenticated
 * users. Consumed by Planning (Step 13.4) later — this step just builds CRUD.
 */
export default function TeamPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isOnline = useOnlineStatus()
  const [employees, setEmployees] = React.useState<Employee[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [form, setForm] = React.useState(emptyForm)
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'saving' | 'error'>('idle')
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [togglingId, setTogglingId] = React.useState<string | null>(null)
  const fetchedFor = React.useRef<string | null>(null)
  // Refs, not state checks — the 2026-10-01 fix (see `togglingId`'s original
  // comment, now folded into this one) used a state-only guard, which
  // doesn't actually prevent a genuine same-tick double-click: React batches
  // setState, so a second click handler invoked before the first's update
  // commits can still read the stale value and pass the check too. Found
  // live this session (module 15's SatisfactionPage deep audit, 2026-10-08)
  // and corrected everywhere this pattern was used, including here on
  // re-read (module 18 deep audit, 2026-10-08). `savingRef` covers the
  // create/edit form submit, which previously had no re-entrancy guard at
  // all beyond the submit button's own `disabled` prop.
  const togglingRef = React.useRef<string | null>(null)
  const savingRef = React.useRef(false)

  const load = React.useCallback(async () => {
    if (!user) return
    setLoadError(null)
    try {
      const { data, error } = await apiRead((client) =>
        client
          .from('employees')
          .select('id, name, role, active')
          .eq('owner_id', user.id)
          .order('name', { ascending: true }),
      )

      if (error) {
        setLoadError(error.message)
        return
      }
      setEmployees(data as Employee[])
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

  function openEdit(employee: Employee) {
    setEditingId(employee.id)
    setForm({ name: employee.name, role: employee.role ?? '' })
    setSaveError(null)
    setFormOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user || savingRef.current) return
    // HTML's `required` on the Nom field only rejects a truly empty string —
    // whitespace-only input ("   ") passes it, producing a blank-looking
    // employee row (the avatar's initials — `name.slice(0,2)` — would even
    // render as empty). Same explicit trim check ClientDetailPage.tsx's own
    // validate() already applies for its own required name field (module 18
    // deep audit, 2026-10-08).
    if (!form.name.trim()) {
      setSaveStatus('error')
      setSaveError('Le nom est requis.')
      return
    }
    savingRef.current = true
    setSaveStatus('saving')
    setSaveError(null)

    const payload = { owner_id: user.id, name: form.name.trim(), role: form.role.trim() || null }

    try {
      const { error } = editingId
        ? await apiWrite((client) => client.from('employees').update(payload).eq('id', editingId))
        : await apiWrite((client) => client.from('employees').insert(payload))

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

  async function toggleActive(employee: Employee) {
    if (togglingRef.current === employee.id) return
    togglingRef.current = employee.id
    setTogglingId(employee.id)
    setSaveError(null)
    try {
      const { error } = await apiWrite((client) =>
        client.from('employees').update({ active: !employee.active }).eq('id', employee.id),
      )
      if (error) {
        setSaveStatus('error')
        setSaveError(error.message)
        return
      }
    } catch (err) {
      setSaveStatus('error')
      setSaveError(err instanceof ApiTimeoutError ? err.message : 'Une erreur est survenue.')
      return
    } finally {
      togglingRef.current = null
      setTogglingId(null)
    }
    load()
  }

  // Hook must be called unconditionally (before any early return) to satisfy
  // the Rules of Hooks.
  const showSkeleton = useMinDuration(employees === null)

  if (loadError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <InlineError message={loadError} onRetry={load} />
      </div>
    )
  }

  if (showSkeleton) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-4xl flex-col p-4 sm:p-6">
        <Skeleton className="mb-4 h-4 w-16 rounded-xs" />
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-56 rounded-xs" />
            <Skeleton className="mt-1 h-3.5 w-72 rounded-xs opacity-70" />
          </div>
          <Skeleton className="h-9 w-28 rounded-sm" />
        </div>
        <div className="flex flex-col gap-3">
          <SkeletonRow count={3} hasAvatar />
        </div>
      </div>
    )
  }

  // useMinDuration holds `showSkeleton` true slightly longer than the raw
  // `employees === null` check it wraps, so TypeScript can no longer narrow
  // `employees` from the branch above alone — always true in practice by the
  // time we get here, needed only to satisfy strict-null-checks.
  if (!employees) return null

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl lg:max-w-4xl flex-col p-4 sm:p-6">
      <button
        type="button"
        onClick={() => navigate('/profile/business')}
        className="mb-4 inline-flex w-fit items-center gap-1.5 text-[13px] font-bold text-text-mid transition-colors hover:text-text-hi outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page-bg rounded-sm"
      >
        <ArrowLeft size={16} strokeWidth={2.5} />
        Entreprise
      </button>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-[24px] sm:text-[28px] font-black tracking-tight text-text-hi">
            Équipe et intervenants
          </h1>
          <p className="mt-1 text-[13px] text-text-mid">
            Membres de l'équipe assignables aux plannings de chantier
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={openCreate}
          disabled={!isOnline}
          className="font-bold gap-1.5 shadow-sm"
        >
          <Plus size={16} strokeWidth={2.5} />
          Ajouter
        </Button>
      </div>

      {saveStatus === 'error' && saveError && !formOpen ? (
        <InlineError message={saveError} className="mb-4" />
      ) : null}

      {employees.length === 0 ? (
        <EmptyState
          icon={<UserRound size={44} strokeWidth={1.5} className="text-brand-500" />}
          heading="Aucun collaborateur pour l'instant"
          description="Ajoute les membres de ton équipe pour les assigner aux interventions et plannings."
          actionLabel="Ajouter un employé"
          onAction={openCreate}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {employees.map((employee) => (
            <li
              key={employee.id}
              className={`group flex items-center justify-between gap-4 rounded-xl border p-4 shadow-sm transition-all ${
                employee.active
                  ? 'border-divider/60 bg-surface hover:border-brand-500/40'
                  : 'border-dashed border-divider/60 bg-recessed/50 opacity-70'
              }`}
            >
              <button
                type="button"
                onClick={() => openEdit(employee)}
                className="flex min-w-0 flex-1 items-center gap-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-lg"
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-bold text-sm border ${
                    employee.active
                      ? 'bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 border-brand-200/50 dark:border-brand-800/50'
                      : 'bg-recessed text-text-low border-divider/60'
                  }`}
                >
                  {employee.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-extrabold text-text-hi group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                      {employee.name}
                    </span>
                    {!employee.active ? (
                      <span className="rounded-full bg-recessed px-2 py-0.5 text-[10.5px] font-bold text-text-mid">
                        Désactivé
                      </span>
                    ) : null}
                  </div>
                  {employee.role ? (
                    <div className="mt-0.5 text-[12.5px] text-text-mid truncate">
                      {employee.role}
                    </div>
                  ) : (
                    <div className="mt-0.5 text-[12px] text-text-low italic">
                      Aucun rôle spécifié
                    </div>
                  )}
                </div>
              </button>

              <Button
                variant="ghost"
                size="sm"
                disabled={!isOnline || togglingId === employee.id}
                onClick={() => toggleActive(employee)}
                className="font-bold text-xs gap-1.5 shrink-0"
              >
                {togglingId === employee.id ? (
                  '...'
                ) : employee.active ? (
                  <>
                    <UserX size={14} strokeWidth={2} className="text-text-mid" />
                    Désactiver
                  </>
                ) : (
                  <>
                    <UserCheck size={14} strokeWidth={2} className="text-success-text" />
                    Réactiver
                  </>
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {formOpen ? (
        <Modal
          onClose={() => setFormOpen(false)}
          labelledBy="team-modal-title"
          panelClassName="max-w-md gap-4 p-6"
        >
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <h2 id="team-modal-title" className="font-serif text-[20px] font-black text-text-hi">
              {editingId ? "Modifier le collaborateur" : 'Nouveau collaborateur'}
            </h2>
            <Input
              label="Nom et prénom"
              required
              placeholder="ex. Julien Martin"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Input
              label="Rôle / Spécialité"
              placeholder="ex. Électricien N3, Chef de chantier..."
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            />

            {saveStatus === 'error' && saveError ? <InlineError message={saveError} /> : null}

            <div className="mt-2 flex gap-2.5">
              <Button
                type="button"
                variant="ghost"
                className="flex-1 border border-divider/60 font-bold"
                onClick={() => setFormOpen(false)}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="flex-1 font-bold shadow-sm"
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


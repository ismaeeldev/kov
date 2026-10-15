import * as React from 'react'
import { Button } from '@/components/ui/Button'
import { InlineError } from '@/components/ui/InlineError'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { apiWrite, ApiTimeoutError } from '@/lib/apiClient'
import { detectPlanningConflicts, type PlanningConflict, type PlanningProject } from './conflictDetection'

interface EmployeeOption {
  id: string
  name: string
}

interface ConflictModalProps {
  conflict: PlanningConflict
  projectA: PlanningProject
  projectB: PlanningProject
  employees: EmployeeOption[]
  /** The full visible-week project list — needed to re-run conflict
   * detection against the PROPOSED fix before applying it. Without this,
   * the modal only ever knows about the one pair it was opened for: if the
   * same employee is also assigned to a third overlapping chantier (a
   * genuine 3-way conflict), "resolving" A-vs-B by rescheduling A could
   * silently create a brand-new, unresolved conflict with C, with no
   * warning anywhere (module 8 deep audit, 2026-10-07). */
  allProjects: PlanningProject[]
  onClose: () => void
  /** `journalWarning` set when the resolution was genuinely applied but the
   * non-fatal client-notification main-courante write failed — surfaced by
   * the caller, which stays mounted after this modal closes (scope audit,
   * 2026-09-26). */
  onResolved: (journalWarning?: string) => void
}

type Resolution =
  | { kind: 'reassign'; projectId: string; newEmployeeId: string }
  | { kind: 'reschedule'; projectId: string; startDate: string; endDate: string }

/**
 * mo-conflit — docs/03_MasterPrompts.md §13.4 item 3, docs/04_ApplicationFlow.md
 * §3.10. Shows the conflicting chantier/employee pairing clearly, offers
 * reassignment (swap one chantier's assigned employee) or reschedule (shift
 * one chantier's date range) options, with a "notifier le client concerné"
 * toggle.
 */
export function ConflictModal({
  conflict,
  projectA,
  projectB,
  employees,
  allProjects,
  onClose,
  onResolved,
}: ConflictModalProps) {
  const { user } = useAuth()
  const isOnline = useOnlineStatus()
  const [resolution, setResolution] = React.useState<Resolution | null>(null)
  const [rescheduleDraft, setRescheduleDraft] = React.useState<
    Record<string, { start: string; end: string }>
  >({
    [projectA.id]: { start: projectA.start_date ?? '', end: projectA.end_date ?? '' },
    [projectB.id]: { start: projectB.start_date ?? '', end: projectB.end_date ?? '' },
  })
  const [notifyClient, setNotifyClient] = React.useState(false)
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'error'>('idle')
  const [error, setError] = React.useState<string | null>(null)
  // A ref, not a state check — see SatisfactionPage.tsx's doc comment
  // (module 15 deep audit, 2026-10-08): a state-only guard can still be
  // beaten by two click handlers firing in the same React batch.
  const savingRef = React.useRef(false)

  const employeeName = employees.find((e) => e.id === conflict.employeeId)?.name ?? 'Employé'
  const otherEmployees = employees.filter((e) => e.id !== conflict.employeeId)

  /** Builds the project list as it would look AFTER applying `resolution`,
   * without writing anything — used to re-run conflict detection against the
   * proposed fix before it's actually persisted. */
  function simulateResolution(): PlanningProject[] {
    return allProjects.map((p) => {
      if (p.id !== resolution!.projectId) return p
      if (resolution!.kind === 'reassign') {
        return {
          ...p,
          assigned_employee_ids: p.assigned_employee_ids.map((id) =>
            id === conflict.employeeId ? resolution!.newEmployeeId : id,
          ),
        }
      }
      return { ...p, start_date: resolution!.startDate, end_date: resolution!.endDate }
    })
  }

  async function handleApply() {
    if (!resolution || savingRef.current) return
    savingRef.current = true
    setStatus('saving')
    setError(null)

    if (resolution.kind === 'reschedule') {
      if (!resolution.startDate || !resolution.endDate) {
        savingRef.current = false
        setStatus('error')
        setError('Renseigne une date de début et une date de fin.')
        return
      }
      if (resolution.startDate > resolution.endDate) {
        savingRef.current = false
        setStatus('error')
        setError('La date de fin doit être après la date de début.')
        return
      }
    }

    // Re-check the PROPOSED fix against every other visible-week project,
    // not just the pair this modal was opened for — without this, resolving
    // a conflict between A and B could silently create a brand-new one with
    // a third project C that also has this employee assigned over an
    // overlapping range (module 8 deep audit, 2026-10-07).
    const simulated = simulateResolution()
    const remainingConflicts = detectPlanningConflicts(simulated).filter(
      (c) =>
        !(c.projectAId === conflict.projectAId && c.projectBId === conflict.projectBId) &&
        !(c.projectAId === conflict.projectBId && c.projectBId === conflict.projectAId),
    )
    if (remainingConflicts.length > 0) {
      savingRef.current = false
      setStatus('error')
      setError(
        "Cette modification créerait un nouveau conflit de planning avec un autre chantier — vérifie les dates/affectations avant d'appliquer.",
      )
      return
    }

    try {
      if (resolution.kind === 'reassign') {
        const target = resolution.projectId === projectA.id ? projectA : projectB
        const newIds = target.assigned_employee_ids.map((id) =>
          id === conflict.employeeId ? resolution.newEmployeeId : id,
        )
        const { error: updateError } = await apiWrite((client) =>
          client
            .from('projects')
            .update({ assigned_employee_ids: newIds })
            .eq('id', resolution.projectId),
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
            .from('projects')
            .update({ start_date: resolution.startDate, end_date: resolution.endDate })
            .eq('id', resolution.projectId),
        )
        if (updateError) {
          savingRef.current = false
          setStatus('error')
          setError(updateError.message)
          return
        }
      }

      let journalWarning: string | undefined
      if (notifyClient && user) {
        // Real client-facing notification — feeds the main courante, same
        // "the row itself is the send" posture as Step 12's executePlan.ts.
        const project = resolution.projectId === projectA.id ? projectA : projectB
        const { error: journalError } = await apiWrite((client) =>
          client.from('journal').insert({
            owner_id: user.id,
            client_id: project.client_id,
            entry_type: 'note',
            direction: 'outbound',
            title: 'Ajustement du planning',
            body: `Le planning de votre chantier "${project.name}" a été ajusté suite à une réorganisation d'équipe.`,
            related_project_id: project.id,
          }),
        )
        if (journalError) {
          // Non-fatal — the resolution itself is genuinely applied; a missing
          // journal entry is a secondary concern. Still surfaced to the
          // caller (see onResolved's doc comment) rather than only
          // console-logged, per the 2026-09-26 scope audit finding.
          console.error('Failed to auto-feed journal on conflict resolution:', journalError.message)
          journalWarning =
            "Le conflit a bien été résolu, mais le client n'a pas pu être notifié via la main courante."
        }
      }

      savingRef.current = false
      setStatus('idle')
      onResolved(journalWarning)
    } catch (err) {
      savingRef.current = false
      setStatus('error')
      setError(err instanceof ApiTimeoutError ? err.message : String(err))
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="conflict-modal-title" panelClassName="max-w-sm">
      <h2 id="conflict-modal-title" className="font-serif text-[18px] font-black text-text-hi">
        Conflit de planning
      </h2>

      <div className="rounded-sm bg-recessed p-3 text-[13px]">
        <p className="font-bold text-text-hi">{employeeName}</p>
        <p className="mt-1 text-text-mid">
          {projectA.name} ({projectA.start_date} → {projectA.end_date})
        </p>
        <p className="text-text-mid">
          {projectB.name} ({projectB.start_date} → {projectB.end_date})
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-bold tracking-[0.05em] text-text-mid uppercase">
          Réaffecter
        </span>
        {[projectA, projectB].map((project) => (
          <div key={project.id} className="flex flex-col gap-1.5">
            <p className="text-[12px] font-bold text-text-hi">{project.name}</p>
            <div className="flex flex-wrap gap-2">
              {otherEmployees.map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() =>
                    setResolution({
                      kind: 'reassign',
                      projectId: project.id,
                      newEmployeeId: emp.id,
                    })
                  }
                  className={`rounded-sm border-[1.5px] px-2.5 py-1.5 text-[11px] font-bold ${
                    resolution?.kind === 'reassign' &&
                    resolution.projectId === project.id &&
                    resolution.newEmployeeId === emp.id
                      ? 'border-brand-500 bg-brand-700 text-white'
                      : 'border-divider bg-surface text-text-hi'
                  }`}
                >
                  → {emp.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-bold tracking-[0.05em] text-text-mid uppercase">
          Ou reprogrammer
        </span>
        {[projectA, projectB].map((project) => {
          const draft = rescheduleDraft[project.id]
          const isSelected =
            resolution?.kind === 'reschedule' && resolution.projectId === project.id
          return (
            <div key={project.id} className="flex flex-col gap-1.5">
              <p className="text-[12px] font-bold text-text-hi">{project.name}</p>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={draft.start}
                  onChange={(e) =>
                    setRescheduleDraft((prev) => ({
                      ...prev,
                      [project.id]: { ...prev[project.id], start: e.target.value },
                    }))
                  }
                />
                <Input
                  type="date"
                  value={draft.end}
                  onChange={(e) =>
                    setRescheduleDraft((prev) => ({
                      ...prev,
                      [project.id]: { ...prev[project.id], end: e.target.value },
                    }))
                  }
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  setResolution({
                    kind: 'reschedule',
                    projectId: project.id,
                    startDate: draft.start,
                    endDate: draft.end,
                  })
                }
                className={`rounded-sm border-[1.5px] px-2.5 py-1.5 text-[11px] font-bold ${
                  isSelected
                    ? 'border-brand-500 bg-brand-700 text-white'
                    : 'border-divider bg-surface text-text-hi'
                }`}
              >
                Utiliser ces dates
              </button>
            </div>
          )
        })}
      </div>

      <label className="flex items-center gap-2 text-[13px] font-medium text-text-hi">
        <input
          type="checkbox"
          checked={notifyClient}
          onChange={(e) => setNotifyClient(e.target.checked)}
          className="h-[18px] w-[18px] rounded-xs border-[1.5px] border-divider text-brand-500 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        />
        Notifier le client concerné
      </label>

      {status === 'error' && error ? <InlineError message={error} /> : null}

      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onClose}>
          Annuler
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={!resolution || status === 'saving' || !isOnline}
          onClick={handleApply}
        >
          {status === 'saving' ? 'Application...' : 'Appliquer'}
        </Button>
      </div>
    </Modal>
  )
}

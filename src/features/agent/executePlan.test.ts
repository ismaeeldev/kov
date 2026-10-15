import { describe, expect, it } from 'vitest'
import { executePlan, type PlanSteps } from './executePlan'

/** Minimal chainable Supabase mock — records every insert/update call so
 * assertions can check exactly what was written, without a real DB. */
function createMockSupabase(options?: { failInsertOnNthJournal?: number }) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = []
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = []
  let journalIdCounter = 0

  const supabase = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row })
          return {
            select() {
              return {
                single: async () => {
                  if (table === 'journal') {
                    journalIdCounter += 1
                    if (options?.failInsertOnNthJournal === journalIdCounter) {
                      return { data: null, error: { message: 'simulated insert failure' } }
                    }
                    return { data: { id: `journal-${journalIdCounter}` }, error: null }
                  }
                  return { data: { id: 'row-1' }, error: null }
                },
              }
            },
          }
        },
        update(patch: Record<string, unknown>) {
          updates.push({ table, patch })
          return {
            eq: async () => ({ error: null }),
          }
        },
      }
    },
  }

  return { supabase, inserts, updates }
}

const THREE_STEP_PLAN: PlanSteps = {
  plan_summary: 'Relancer le client pour la facture en retard, et noter le retard de livraison.',
  steps: [
    {
      step_id: 'step-1',
      step_type: 'send_message',
      removable: true,
      target_channel: 'sms',
      recipient: '+33612345678',
      message_text: 'Bonjour, votre facture est en retard, merci de régulariser.',
      description: 'Envoyer un SMS de relance',
    },
    {
      step_id: 'step-2',
      step_type: 'send_message',
      removable: true,
      target_channel: 'email',
      recipient: 'client@example.test',
      message_text: 'Bonjour, la livraison a pris du retard, nous vous tenons informé.',
      description: 'Envoyer un email sur le retard de livraison',
    },
    {
      step_id: 'step-3',
      step_type: 'log_note',
      removable: true,
      target_channel: null,
      recipient: null,
      message_text: 'Livraison fournisseur retardée de 3 jours.',
      description: 'Noter le retard de livraison sur le chantier',
    },
  ],
}

describe('executePlan', () => {
  it('executes only non-removed steps, creates a journal row per executed send_message step, and marks the plan partially_confirmed', async () => {
    const { supabase, inserts, updates } = createMockSupabase()

    const result = await executePlan(supabase as never, {
      ownerId: 'owner-1',
      planId: 'plan-1',
      clientId: 'client-1',
      projectId: 'project-1',
      plan: THREE_STEP_PLAN,
      removedStepIds: new Set(['step-2']), // remove 1 of 3 steps
      editedMessages: new Map(),
    })

    // Exactly 2 real actions occurred (step-1 send_message, step-3 log_note).
    const executedResults = result.results.filter((r) => r.executed)
    expect(executedResults).toHaveLength(2)
    expect(executedResults.map((r) => r.step_id)).toEqual(['step-1', 'step-3'])

    // The removed step is reported as not executed.
    const removedResult = result.results.find((r) => r.step_id === 'step-2')
    expect(removedResult?.executed).toBe(false)

    // Exactly 2 journal rows created, not 3 — step-3 (log_note) does not
    // journal-feed (no client-facing effect), and step-2 was removed.
    const journalInserts = inserts.filter((i) => i.table === 'journal')
    expect(journalInserts).toHaveLength(1) // only step-1 is send_message and executed
    expect(journalInserts[0].row.body).toBe(
      'Bonjour, votre facture est en retard, merci de régulariser.',
    )
    expect(journalInserts[0].row.direction).toBe('outbound')
    expect(journalInserts[0].row.entry_type).toBe('agent_message')

    // project_updates row created for the executed log_note step.
    const projectUpdateInserts = inserts.filter((i) => i.table === 'project_updates')
    expect(projectUpdateInserts).toHaveLength(1)

    // Plan status update.
    expect(result.finalStatus).toBe('partially_confirmed')
    const planUpdate = updates.find((u) => u.table === 'agent_action_plans')
    expect(planUpdate?.patch.status).toBe('partially_confirmed')
    expect(planUpdate?.patch.executed_at).toBeTruthy()
  })

  it('marks the plan confirmed (not partially_confirmed) when no steps are removed', async () => {
    const { supabase, updates } = createMockSupabase()

    const result = await executePlan(supabase as never, {
      ownerId: 'owner-1',
      planId: 'plan-2',
      clientId: 'client-1',
      projectId: null,
      plan: THREE_STEP_PLAN,
      removedStepIds: new Set(),
      editedMessages: new Map(),
    })

    expect(result.finalStatus).toBe('confirmed')
    expect(result.results.every((r) => r.executed)).toBe(true)
    const planUpdate = updates.find((u) => u.table === 'agent_action_plans')
    expect(planUpdate?.patch.status).toBe('confirmed')
  })

  it('sends the EDITED message text, not the original model-proposed text, when a step was edited via mo-envoi', async () => {
    const { supabase, inserts } = createMockSupabase()

    const editedText =
      'Bonjour, votre facture est en retard de 20 jours — merci de régulariser rapidement.'
    await executePlan(supabase as never, {
      ownerId: 'owner-1',
      planId: 'plan-3',
      clientId: 'client-1',
      projectId: null,
      plan: THREE_STEP_PLAN,
      removedStepIds: new Set(['step-2', 'step-3']),
      editedMessages: new Map([['step-1', editedText]]),
    })

    const journalInserts = inserts.filter((i) => i.table === 'journal')
    expect(journalInserts).toHaveLength(1)
    expect(journalInserts[0].row.body).toBe(editedText)
    expect(journalInserts[0].row.body).not.toBe(THREE_STEP_PLAN.steps[0].message_text)
  })

  it('journal-feeds exactly the client-facing (send_message) step count across all 4 step types, no more/no less', async () => {
    // Agent safety review (docs/06_AIPromptRegistry.md §2.3's "every executed
    // step... automatically inserts a journal row for any client-facing
    // step"): only send_message is client-facing. This constructs one of
    // EACH step type (send_message/log_note/create_reminder/update_status),
    // all executed (none removed), and asserts the journal-row count is
    // exactly 2 (matching the plan's 2 send_message steps) — never 4 (one
    // per step) and never 0/1 (under-counting a real send).
    const { supabase, inserts } = createMockSupabase()
    const mixedPlan: PlanSteps = {
      plan_summary: 'Plan mixte pour vérifier le compte exact des entrées main courante.',
      steps: [
        {
          step_id: 'm1',
          step_type: 'send_message',
          removable: true,
          target_channel: 'sms',
          recipient: '+33600000001',
          message_text: 'Message client 1',
          description: 'Envoyer SMS 1',
        },
        {
          step_id: 'm2',
          step_type: 'log_note',
          removable: true,
          target_channel: null,
          recipient: null,
          message_text: 'Note interne, jamais visible du client',
          description: 'Ajouter une note interne',
        },
        {
          step_id: 'm3',
          step_type: 'send_message',
          removable: true,
          target_channel: 'email',
          recipient: 'client2@example.test',
          message_text: 'Message client 2',
          description: 'Envoyer email 2',
        },
        {
          step_id: 'm4',
          step_type: 'create_reminder',
          removable: true,
          target_channel: null,
          recipient: null,
          message_text: null,
          description: 'Créer un rappel interne',
        },
        {
          step_id: 'm5',
          step_type: 'update_status',
          removable: true,
          target_channel: null,
          recipient: null,
          message_text: null,
          description: 'Mettre à jour le statut du chantier',
        },
      ],
    }

    const result = await executePlan(supabase as never, {
      ownerId: 'owner-1',
      planId: 'plan-4',
      clientId: 'client-1',
      projectId: 'project-1',
      plan: mixedPlan,
      removedStepIds: new Set(),
      editedMessages: new Map(),
    })

    expect(result.results.every((r) => r.executed)).toBe(true)

    const journalInserts = inserts.filter((i) => i.table === 'journal')
    // Exactly 2 — one per send_message step (m1, m3) — never 5 (one per
    // step) and never fewer than 2.
    expect(journalInserts).toHaveLength(2)
    expect(journalInserts.map((i) => i.row.body)).toEqual(['Message client 1', 'Message client 2'])
  })

  it('persists partially_confirmed (not a silently stuck proposed row) when a later step fails after earlier steps already succeeded', async () => {
    // Regression test for a real bug found in module 12's deep audit
    // (2026-10-07): a step's own write throwing used to abort the whole
    // function BEFORE the plan's status was ever updated, leaving a plan
    // that genuinely partially executed looking identical in the DB to one
    // that never started — and risking a retry re-running step-1 a second
    // time (duplicate journal entry) since nothing recorded it had already
    // succeeded.
    const { supabase, updates } = createMockSupabase({ failInsertOnNthJournal: 2 })

    await expect(
      executePlan(supabase as never, {
        ownerId: 'owner-1',
        planId: 'plan-5',
        clientId: 'client-1',
        projectId: 'project-1',
        plan: THREE_STEP_PLAN, // step-1 send_message, step-2 send_message, step-3 log_note
        removedStepIds: new Set(),
        editedMessages: new Map(),
      }),
    ).rejects.toThrow(/step-2 failed/)

    // step-1 already succeeded (journal row 1) before step-2's journal
    // insert failed (journal row 2) — the plan's status update must still
    // have been attempted with the real partial outcome, not skipped.
    const planUpdate = updates.find((u) => u.table === 'agent_action_plans')
    expect(planUpdate?.patch.status).toBe('partially_confirmed')
  })

  it('leaves the plan at proposed (not partially_confirmed) when the VERY FIRST step fails with nothing yet executed', async () => {
    const { supabase, updates } = createMockSupabase({ failInsertOnNthJournal: 1 })

    await expect(
      executePlan(supabase as never, {
        ownerId: 'owner-1',
        planId: 'plan-6',
        clientId: 'client-1',
        projectId: 'project-1',
        plan: THREE_STEP_PLAN,
        removedStepIds: new Set(),
        editedMessages: new Map(),
      }),
    ).rejects.toThrow(/step-1 failed/)

    // Nothing succeeded — no misleading status write, retrying from scratch
    // is correct and safe.
    const planUpdate = updates.find((u) => u.table === 'agent_action_plans')
    expect(planUpdate).toBeUndefined()
  })
})

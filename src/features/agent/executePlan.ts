import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Plan execution — docs/06_AIPromptRegistry.md §2.3's "Execution contract",
 * implemented entirely in application code, NOT inside any Claude call (the
 * model never executes anything — its only output is a proposed plan).
 *
 * On explicit "OUI" confirm, iterates plan_steps in order, executing only
 * the steps NOT individually removed by the artisan beforehand, using the
 * ARTISAN-EDITED text for any send_message step that was changed via
 * "Lire le message" — never the original model-proposed text once edited.
 * Every client-facing executed step automatically inserts a journal row
 * (module 6.11's automatic-feed rule, entry_type='agent_message').
 *
 * No real SMS/email provider exists anywhere in this codebase yet (the
 * Step 11 dunning flow's "send" is itself just the dunning_events + journal
 * insert, with no external provider call) — a send_message step's real
 * effect is therefore recording it as sent (this table row IS the record of
 * the send), matching that same established posture rather than inventing a
 * new one for this feature alone.
 */

export type PlanStepType = 'send_message' | 'log_note' | 'create_reminder' | 'update_status'
export type PlanStepChannel = 'sms' | 'email' | 'recommande_ar' | null

export interface PlanStep {
  step_id: string
  step_type: PlanStepType
  removable: boolean
  target_channel: PlanStepChannel
  recipient: string | null
  message_text: string | null
  description: string
}

export interface PlanSteps {
  plan_summary: string
  steps: PlanStep[]
}

export interface ExecutePlanInput {
  ownerId: string
  planId: string
  clientId: string
  projectId: string | null
  plan: PlanSteps
  removedStepIds: Set<string>
  /** Maps step_id -> edited message text, only for steps the artisan changed
   * via "Lire le message". A step not present here executes with its
   * original model-proposed message_text unchanged. */
  editedMessages: Map<string, string>
  /**
   * docs/02_ThemeGuideline.md §9.2 "Agent plan-approval sequence": fired
   * once per step immediately after that step's own DB effect completes, so
   * the UI can flash that step's row as it happens, in visible sequence,
   * rather than the whole plan seeming to vanish/complete at once. Optional
   * and purely a UI hook — execution semantics (which steps run, in what
   * order, what they write) are entirely unaffected by whether this is
   * passed, so it never changes executePlan's own testable behavior.
   */
  onStepExecuted?: (result: ExecutedStepResult) => void
}

export interface ExecutedStepResult {
  step_id: string
  executed: boolean
  journalRowId: string | null
  /** Set only when this specific step's own write threw — distinct from
   * `executed: false` on a REMOVED step (the artisan's own deliberate
   * choice). A thrown step previously aborted the whole function before the
   * plan's own status row was ever updated, leaving a plan that had
   * genuinely partially executed looking identical in the DB to one that
   * never started — and risking steps 1-2 re-running a second time (duplicate
   * journal entries) if the artisan retried after the error (module 12 deep
   * audit, 2026-10-07). */
  error?: string
}

export interface ExecutePlanResult {
  results: ExecutedStepResult[]
  /** `agent_action_plans.status` has no 'failed' value (migration 0009) —
   * a plan where every intended step genuinely executed is 'confirmed'; a
   * plan where at least one step was removed OR threw an error (but at
   * least one other step still succeeded) is the existing
   * 'partially_confirmed'; a plan where the very first attempted step threw
   * before anything was written stays 'proposed' (nothing to distinguish it
   * from, so retrying is safe and correct). */
  finalStatus: 'confirmed' | 'partially_confirmed' | 'proposed'
}

/** journal.entry_type accepts 'sms'|'email'|'recommande' for a channel-based
 * send but this feature's executed steps are always agent-originated, so
 * every client-facing step logs as 'agent_message' regardless of channel —
 * matching §2.3's "entry_type='agent_message'" requirement exactly. */
const JOURNAL_ENTRY_TYPE = 'agent_message'

export async function executePlan(
  supabase: SupabaseClient,
  input: ExecutePlanInput,
): Promise<ExecutePlanResult> {
  const {
    ownerId,
    planId,
    clientId,
    projectId,
    plan,
    removedStepIds,
    editedMessages,
    onStepExecuted,
  } = input
  const results: ExecutedStepResult[] = []
  let anyRemoved = false
  let anySucceeded = false
  let stoppedOnError = false

  for (const step of plan.steps) {
    if (removedStepIds.has(step.step_id)) {
      anyRemoved = true
      const result = { step_id: step.step_id, executed: false, journalRowId: null }
      results.push(result)
      onStepExecuted?.(result)
      continue
    }

    const finalMessageText = editedMessages.get(step.step_id) ?? step.message_text

    // Each step's own write is isolated in its own try/catch — a failure on
    // one step must not abort the whole function before the plan's final
    // status is persisted (previously it did: a throw here skipped straight
    // past the status-update call below, leaving a plan that had genuinely
    // partially executed indistinguishable in the DB from one that never
    // started, and risking a retry re-running already-succeeded steps a
    // second time). Execution still stops at the first failure — later
    // steps are not attempted out of order — but what already happened is
    // always recorded, both in `results` and in the plan's persisted status.
    try {
      let journalRowId: string | null = null

      if (step.step_type === 'send_message') {
        // The row itself IS the record of the send — see file-level comment.
        const { data: journalRow, error } = await supabase
          .from('journal')
          .insert({
            owner_id: ownerId,
            client_id: clientId,
            entry_type: JOURNAL_ENTRY_TYPE,
            direction: 'outbound',
            title: step.description,
            body: finalMessageText,
            related_project_id: projectId,
          })
          .select('id')
          .single()
        if (error) throw new Error(error.message)
        journalRowId = journalRow.id
      } else if (step.step_type === 'log_note') {
        if (projectId) {
          const { error } = await supabase.from('project_updates').insert({
            owner_id: ownerId,
            project_id: projectId,
            text_content: finalMessageText ?? step.description,
          })
          if (error) throw new Error(error.message)
        }
        // log_note has no client-facing effect, so no journal auto-feed here
        // per §2.3's "for any client-facing step" scoping.
      }
      // create_reminder / update_status: no dedicated table exists yet for
      // reminders in this schema, and update_status's target isn't specified
      // narrowly enough by the plan-generate schema to safely auto-apply a
      // status change without a confirmed target field — both step types are
      // recorded as executed (their "effect" for now is being visibly checked
      // off in the plan) but perform no additional side effect beyond that,
      // consistent with not inventing a data-model change this step doesn't
      // actually specify.

      const result = { step_id: step.step_id, executed: true, journalRowId }
      results.push(result)
      anySucceeded = true
      onStepExecuted?.(result)
    } catch (err) {
      const result = {
        step_id: step.step_id,
        executed: false,
        journalRowId: null,
        error: err instanceof Error ? err.message : String(err),
      }
      results.push(result)
      onStepExecuted?.(result)
      stoppedOnError = true
      break
    }
  }

  const finalStatus: ExecutePlanResult['finalStatus'] = stoppedOnError
    ? anySucceeded
      ? 'partially_confirmed'
      : 'proposed'
    : anyRemoved
      ? 'partially_confirmed'
      : 'confirmed'

  // Always attempt to persist the real outcome, even on the error path above
  // — this is the exact write that previously never ran when a step threw.
  if (finalStatus !== 'proposed') {
    const { error: updateError } = await supabase
      .from('agent_action_plans')
      .update({ status: finalStatus, executed_at: new Date().toISOString() })
      .eq('id', planId)
    if (updateError && !stoppedOnError) {
      throw new Error(`Failed to update plan status: ${updateError.message}`)
    }
    // If a step already threw, a secondary failure updating the plan status
    // is logged-worthy but must not mask the real step error from the caller
    // — the caller's own catch block is what surfaces this to the artisan.
  }

  if (stoppedOnError) {
    const failedResult = results[results.length - 1]
    throw new Error(
      `Step ${failedResult.step_id} failed: ${failedResult.error}. ` +
        `${results.filter((r) => r.executed).length} step(s) before it already executed and are recorded.`,
    )
  }

  return { results, finalStatus }
}

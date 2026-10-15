// Kōv — Edge Function: agent-plan-expiry-sweep
// Source: docs/06_AIPromptRegistry.md §2.3's "a plan left unconfirmed for a
// defined window (recommended: 24 hours) transitions to status='expired' via
// a scheduled check" — this IS that scheduled check.
//
// A commercial-safety review (2026-09-26) found the 24h expiry sweep was
// previously implemented ONLY as an on-mount effect inside AgentPage.tsx
// (src/features/agent/AgentPage.tsx's expirySweepRan) — an owner who never
// reopened the Kōv Agent screen would have stale 'proposed' plan rows sit
// indefinitely, never marked 'expired' in the database. This was NOT a
// safety bypass (handleConfirmPlan independently re-checks expiry at
// confirm-time regardless, so a stale plan could never actually execute
// either way) but it was a real reliability/data-hygiene gap — this function
// closes it by running on a schedule (see migration 0013), independent of
// any user ever opening the app.
//
// Runs across EVERY owner in one pass (service_role, bypasses RLS by
// design — a per-owner sweep would need one call per owner, which doesn't
// scale and isn't how a scheduled job should work). Authenticated by a
// shared cron secret (CRON_SECRET, set via `supabase secrets set`), never a
// user JWT — pg_cron has no user session to present, and this must not be
// callable by an arbitrary anon-key request either.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')

// Mirrors src/features/agent/planExpiry.ts's PLAN_EXPIRY_WINDOW_MS exactly —
// this Deno function can't import that browser-side TS module directly (no
// bundler step here), so the constant is intentionally duplicated with an
// explicit cross-reference comment rather than silently drifting. If the
// 24h window ever changes, update BOTH this file and planExpiry.ts.
const PLAN_EXPIRY_WINDOW_MS = 24 * 60 * 60 * 1000

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  // Shared-secret auth — not a user JWT (pg_cron has none) and not the anon
  // key (which is public by design and must never authorize a cross-owner
  // sweep). Missing CRON_SECRET server-side config is a hard failure, not a
  // silently-open endpoint.
  if (!CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'CRON_SECRET not configured' }), { status: 500 })
  }
  const providedSecret = req.headers.get('x-cron-secret')
  if (providedSecret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const cutoffIso = new Date(Date.now() - PLAN_EXPIRY_WINDOW_MS).toISOString()

  // Every owner's stale 'proposed' rows in one pass — service_role bypasses
  // RLS by design here, this is the one legitimate cross-owner query in the
  // whole codebase (everything else is owner_id-scoped per docs/05_DataModel.md §3).
  const { data: expiredRows, error: selectError } = await admin
    .from('agent_action_plans')
    .select('id')
    .eq('status', 'proposed')
    .lt('created_at', cutoffIso)

  if (selectError) {
    return new Response(JSON.stringify({ error: selectError.message }), { status: 500 })
  }

  const expiredIds = (expiredRows ?? []).map((r) => r.id)
  if (expiredIds.length === 0) {
    return new Response(JSON.stringify({ swept: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { error: updateError } = await admin
    .from('agent_action_plans')
    .update({ status: 'expired' })
    .in('id', expiredIds)

  if (updateError) {
    return new Response(JSON.stringify({ error: updateError.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ swept: expiredIds.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

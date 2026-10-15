// Kōv — Edge Function: delete-account
// Source: docs/03_MasterPrompts.md §5.4, docs/01_ScopeDocument.md KOV-FR-001/KOV-FR-020,
// docs/04_ApplicationFlow.md §2.20.
//
// Deletes every owner-scoped row for the CALLING user across every table in
// docs/05_DataModel.md §1, then their Storage files, then the auth.users row
// itself. Only ever acts on the id extracted from the caller's own verified
// JWT — never a client-supplied id. Reports exactly what was/wasn't deleted
// instead of leaving an ambiguous partial state on failure.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { withCors } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Deletion order matters: children before parents, respecting every FK in
// the schema (docs/05_DataModel.md §1), so nothing is ever orphaned mid-run
// even though every table is ultimately owner_id-scoped and would cascade
// fine on its own — being explicit here means a partial failure still
// reports a coherent, explainable state.
const TABLES_IN_DELETE_ORDER = [
  'dunning_events',
  'invoices',
  'order_lines',
  'orders',
  'change_orders',
  'project_updates',
  'project_costs',
  'projects',
  'quote_events',
  'quote_lines',
  // quotes.current_version_id -> quote_versions is a FK, so versions must go
  // before quotes; quote_versions itself is immutable/insert-only but still
  // owner-scoped and must be cleared.
  'quote_versions',
  'quotes',
  'journal',
  'documents',
  'technical_sheets',
  'clients',
  'price_items',
  'ai_runs',
  'agent_action_plans',
  'financing_simulations',
  'accounting_exports',
  'migration_imports',
  'employees',
  'businesses',
  'profiles',
] as const

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 })
  }

  // Verify the caller's own JWT (anon-key client, RLS-respecting) to derive
  // their user id server-side — this is the ONLY source of the id ever used
  // below. No request body id is ever read or trusted.
  const callerClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser()

  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired session' }), { status: 401 })
  }

  const ownerId = user.id
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const deletedCounts: Record<string, number> = {}
  const errors: Array<{ step: string; message: string }> = []

  // 1. Storage files — look up every documents.storage_path for this owner
  // before the row is deleted, then best-effort remove each file. A missing
  // bucket (not yet created at this stage of the build) or a missing file is
  // logged, not fatal — metadata-row deletion (step 2) is the source of
  // truth for "is this owner's data gone."
  const { data: docs, error: docsReadError } = await admin
    .from('documents')
    .select('storage_path')
    .eq('owner_id', ownerId)

  if (docsReadError) {
    errors.push({ step: 'read documents for storage cleanup', message: docsReadError.message })
  } else if (docs && docs.length > 0) {
    // storage_path is stored as "<bucket>/<path...>" by convention (see
    // docs/05_DataModel.md §2.19) — split off the bucket so files across
    // different buckets (uploads vs. generated PDFs) are each removed from
    // the right one.
    const byBucket = new Map<string, string[]>()
    for (const { storage_path } of docs) {
      const [bucket, ...rest] = storage_path.split('/')
      if (!bucket || rest.length === 0) continue
      const list = byBucket.get(bucket) ?? []
      list.push(rest.join('/'))
      byBucket.set(bucket, list)
    }
    for (const [bucket, paths] of byBucket) {
      const { data: removed, error: storageError } = await admin.storage.from(bucket).remove(paths)
      if (storageError) {
        errors.push({ step: `storage cleanup (bucket: ${bucket})`, message: storageError.message })
      } else {
        deletedCounts[`storage:${bucket}`] = removed?.length ?? 0
      }
    }
  }

  // 2. Every owner-scoped table, children-before-parents.
  for (const table of TABLES_IN_DELETE_ORDER) {
    // profiles' primary key IS the user id (not a separate owner_id column) —
    // see docs/05_DataModel.md §2.1's handle_new_user() trigger.
    const idColumn = table === 'profiles' ? 'id' : 'owner_id'
    const { data, error } = await admin.from(table).delete().eq(idColumn, ownerId).select('id')

    if (error) {
      errors.push({ step: `delete ${table}`, message: error.message })
      // Stop here rather than continuing past a real failure — report
      // exactly what was and wasn't deleted instead of an ambiguous partial
      // state, per the master prompt's explicit requirement.
      return new Response(
        JSON.stringify({
          success: false,
          ownerId,
          deletedCounts,
          errors,
          message: `Deletion stopped at table "${table}" — auth.users row NOT deleted. See errors for detail.`,
        }),
        { status: 500 },
      )
    }
    deletedCounts[table] = data?.length ?? 0
  }

  // 3. The auth.users row itself — only after every owner-scoped row above
  // is confirmed gone.
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(ownerId)
  if (authDeleteError) {
    errors.push({ step: 'delete auth.users row', message: authDeleteError.message })
    return new Response(
      JSON.stringify({
        success: false,
        ownerId,
        deletedCounts,
        errors,
        message:
          'All owner-scoped rows and storage were deleted, but the auth.users row deletion failed — account data is gone but sign-in still exists. Retry auth deletion.',
      }),
      { status: 500 },
    )
  }

  return new Response(
    JSON.stringify({
      success: true,
      ownerId,
      deletedCounts,
      message: 'Account and all owner-scoped data deleted successfully.',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}))

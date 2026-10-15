// Kōv — Edge Function: export-personal-data
// Source: docs/01_ScopeDocument.md §7 "export and deletion available" (the
// same reliability-requirement line that also names the documented retention
// policy), and the delete-account function this mirrors.
//
// Scope audit finding (2026-09-26): account deletion existed, but there was
// no way for an owner to actually get a copy of their own data first (a
// GDPR-style right-of-access export) — deletion without a prior export
// gives the artisan no way to keep records once they close their account.
//
// Reads every owner-scoped row for the CALLING user across every table in
// docs/05_DataModel.md §1 (the exact same table list as delete-account, since
// "everything that would be deleted" and "everything that should be
// exportable" are the same set by definition), and returns it as one JSON
// document. Read-only — this function never deletes or modifies anything.
// Storage files (documents' actual PDF/photo bytes) are listed by
// storage_path and name but not inlined as binary content in the JSON body;
// each document row still carries enough to identify what exists.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { withCors } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Same table set as delete-account's TABLES_IN_DELETE_ORDER — order doesn't
// matter for a read-only export, so listed here in the same grouping for
// easy side-by-side comparison with that function when either changes.
const EXPORT_TABLES = [
  'profiles',
  'businesses',
  'employees',
  'price_items',
  'clients',
  'quotes',
  'quote_versions',
  'quote_lines',
  'quote_events',
  'projects',
  'project_costs',
  'project_updates',
  'change_orders',
  'orders',
  'order_lines',
  'invoices',
  'journal',
  'dunning_events',
  'documents',
  'technical_sheets',
  'ai_runs',
  'agent_action_plans',
  'financing_simulations',
  'accounting_exports',
  'migration_imports',
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
  // below, exactly matching delete-account's posture.
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

  const data: Record<string, unknown[]> = {}
  const errors: Array<{ table: string; message: string }> = []

  for (const table of EXPORT_TABLES) {
    // profiles' primary key IS the user id (not a separate owner_id column) —
    // see docs/05_DataModel.md §2.1's handle_new_user() trigger, same
    // exception delete-account makes.
    const idColumn = table === 'profiles' ? 'id' : 'owner_id'
    const { data: rows, error } = await admin.from(table).select('*').eq(idColumn, ownerId)

    if (error) {
      errors.push({ table, message: error.message })
      continue
    }
    data[table] = rows ?? []
  }

  if (errors.length > 0) {
    return new Response(
      JSON.stringify({
        success: false,
        ownerId,
        data,
        errors,
        message: 'Export partially failed — see errors for which tables could not be read.',
      }),
      { status: 500 },
    )
  }

  return new Response(
    JSON.stringify({
      success: true,
      ownerId,
      exportedAt: new Date().toISOString(),
      data,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}))

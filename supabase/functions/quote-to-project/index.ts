// Kōv — Edge Function: quote-to-project
// Source: docs/03_MasterPrompts.md §10.2, docs/01_ScopeDocument.md KOV-FR-011,
// docs/05_DataModel.md §2.11.
//
// Idempotent quote-to-chantier conversion: given an ACCEPTED quote, creates
// (or, if one already exists, simply returns) the corresponding `projects`
// row. Idempotency is enforced at TWO layers deliberately, per the master
// prompt's explicit instruction — the app-level pre-check below AND the
// database's own `unique (source_quote_id)` constraint (migration 0005) —
// never rely on only one; a race between two near-simultaneous calls is
// caught by the DB constraint even if the pre-check's read is stale.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { withCors } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 })
  }

  let quoteId: string | undefined
  try {
    const body = await req.json()
    quoteId = body.quoteId
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
  }
  if (!quoteId) {
    return new Response(JSON.stringify({ error: 'Missing quoteId' }), { status: 400 })
  }

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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Layer 1 (app-level idempotency check): does a projects row already exist
  // for this quote? If so, just return it — never error, never duplicate.
  const { data: existingProject } = await admin
    .from('projects')
    .select('*')
    .eq('source_quote_id', quoteId)
    .eq('owner_id', user.id)
    .maybeSingle()

  if (existingProject) {
    return new Response(
      JSON.stringify({ success: true, project: existingProject, created: false }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  const { data: quote, error: quoteError } = await admin
    .from('quotes')
    .select('id, owner_id, client_id, reference, status, current_version_id')
    .eq('id', quoteId)
    .eq('owner_id', user.id)
    .single()

  if (quoteError || !quote) {
    return new Response(JSON.stringify({ error: 'Quote not found or not owned by caller' }), {
      status: 404,
    })
  }

  if (quote.status !== 'accepted') {
    return new Response(
      JSON.stringify({ error: 'Seul un devis accepté peut être converti en chantier.' }),
      { status: 409 },
    )
  }

  if (!quote.current_version_id) {
    return new Response(
      JSON.stringify({ error: 'Ce devis accepté ne référence aucune version émise.' }),
      { status: 409 },
    )
  }

  const { data: version, error: versionError } = await admin
    .from('quote_versions')
    .select('id, snapshot')
    .eq('id', quote.current_version_id)
    .single()

  if (versionError || !version) {
    return new Response(JSON.stringify({ error: 'Version de devis introuvable.' }), { status: 404 })
  }

  const { data: client } = await admin
    .from('clients')
    .select('name')
    .eq('id', quote.client_id)
    .single()

  const snapshot = version.snapshot as { total_ttc: number; projected_margin_pct: number | null }

  const projectName = client?.name ? `${client.name} — ${quote.reference}` : quote.reference

  // Layer 2 (DB-level idempotency): the unique(source_quote_id) constraint
  // catches a race between two near-simultaneous calls that both passed the
  // Layer-1 check above (e.g. a double-tap on "Créer le chantier"). A 23505
  // unique-violation here means someone else's concurrent call won — re-fetch
  // and return THAT row rather than surfacing an error to the caller, since
  // the end state (exactly one project for this quote) is exactly what was
  // asked for either way.
  const { data: newProject, error: insertError } = await admin
    .from('projects')
    .insert({
      owner_id: user.id,
      client_id: quote.client_id,
      source_quote_id: quote.id,
      source_quote_version_id: version.id,
      name: projectName,
      status: 'planned',
      planned_value_ttc: snapshot.total_ttc,
      planned_margin_pct: snapshot.projected_margin_pct ?? 0,
    })
    .select('*')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: raceWinner } = await admin
        .from('projects')
        .select('*')
        .eq('source_quote_id', quoteId)
        .single()
      if (raceWinner) {
        return new Response(
          JSON.stringify({ success: true, project: raceWinner, created: false }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
    }
    return new Response(JSON.stringify({ error: insertError.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ success: true, project: newProject, created: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}))

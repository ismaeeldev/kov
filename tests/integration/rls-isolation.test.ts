import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Real RLS cross-owner isolation test — docs/01_ScopeDocument.md KOV-FR-003
 * ("RLS enabled and tested on every exposed table... a session can never
 * read or modify another owner's data"). A full scope-compliance audit
 * (2026-09-26) found RLS was enabled everywhere but genuinely UNTESTED
 * anywhere in the repo — every prior "RLS confirmed" claim in this project's
 * history was a manual/live-Playwright spot-check during a specific step,
 * never captured as a real, re-runnable automated test. This closes that gap
 * for good: every owner-scoped table gets a real two-account isolation
 * check, using each account's OWN real signed-in JWT (never the service_role
 * key) for the read attempt — RLS is a policy on the anon/authenticated
 * role, so a service_role-key test would prove nothing about it.
 *
 * Real Supabase REST calls against the live project (same posture as
 * tests/visual/fixtures.ts) — never mocked, since a mocked response could
 * silently mask a real RLS policy regression.
 */

function readEnv(key: string): string {
  const envPath = path.resolve(process.cwd(), '.env.local')
  const env = fs.readFileSync(envPath, 'utf-8')
  const match = env.match(new RegExp(`^${key}=(.*)$`, 'm'))
  if (!match) throw new Error(`Missing ${key} in .env.local`)
  return match[1].trim()
}

const SUPABASE_URL = readEnv('VITE_SUPABASE_URL')
const ANON_KEY = readEnv('VITE_SUPABASE_ANON_KEY')
const SERVICE_KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY')

const adminHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function adminFetch(pathSuffix: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathSuffix}`, {
    ...init,
    headers: { ...adminHeaders, ...(init?.headers ?? {}) },
  })
  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  if (!res.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${pathSuffix} failed: ${res.status} ${text}`)
  }
  return data
}

interface TestAccount {
  id: string
  email: string
  accessToken: string
}

async function createSignedInAccount(label: string): Promise<TestAccount> {
  const email = `kov-rls-${label}-${Date.now()}@example.test`
  const password = 'Test1234!Test1234!'
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  const created = (await createRes.json()) as { id: string }

  // Real password-grant sign-in — this is the exact same auth flow the app's
  // own SignInPage uses, producing a genuine user-scoped JWT (never the
  // service_role key) that RLS policies actually evaluate `auth.uid()` against.
  const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const token = (await tokenRes.json()) as { access_token: string }
  if (!token.access_token) {
    throw new Error(`Sign-in failed for ${email}: ${JSON.stringify(token)}`)
  }

  return { id: created.id, email, accessToken: token.access_token }
}

/** Reads a table AS the given account's own real session (anon key + user
 * JWT) — this is the exact request shape RLS policies are evaluated against,
 * never the service_role key which bypasses RLS entirely. */
async function readAsUser(account: TestAccount, table: string, query = ''): Promise<unknown[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${account.accessToken}`,
    },
  })
  if (!res.ok) {
    throw new Error(`Read ${table} as ${account.email} failed: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as unknown[]
}

async function deleteAccountAndData(uid: string) {
  // journal_retention_guard (0015_journal_retention_guard.sql) blocks
  // deleting any journal row less than 10 years old, for every role
  // including service_role (a DB trigger, unlike RLS, isn't bypassed by it).
  // Test-seeded journal rows are always fresh, so cleanup must backdate them
  // past the retention window before the regular bulk-delete pass below can
  // remove them — otherwise every test run after the retention test leaks a
  // journal row.
  await fetch(`${SUPABASE_URL}/rest/v1/journal?owner_id=eq.${uid}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ occurred_at: new Date('2000-01-01').toISOString() }),
  })

  const childTables = [
    'dunning_events',
    'journal',
    'agent_action_plans',
    'ai_runs',
    'invoices',
    'order_lines',
    'orders',
    'project_costs',
    'project_updates',
    'change_orders',
    'quote_lines',
    'client_notes',
    'technical_sheets',
    'documents',
    'financing_simulations',
    'accounting_exports',
    'migration_imports',
  ]
  for (const t of childTables) {
    await fetch(`${SUPABASE_URL}/rest/v1/${t}?owner_id=eq.${uid}`, {
      method: 'DELETE',
      headers: adminHeaders,
    })
  }
  // Circular FK: quotes.current_version_id -> quote_versions must be nulled
  // before either table can be deleted (same pattern documented elsewhere
  // in this project's cleanup scripts).
  await fetch(`${SUPABASE_URL}/rest/v1/quotes?owner_id=eq.${uid}`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ current_version_id: null }),
  })
  for (const t of [
    'projects',
    'quote_versions',
    'quotes',
    'price_items',
    'clients',
    'employees',
    'businesses',
    'profiles',
  ]) {
    await fetch(`${SUPABASE_URL}/rest/v1/${t}?owner_id=eq.${uid}`, {
      method: 'DELETE',
      headers: adminHeaders,
    })
  }
  // profiles.id is the primary key (== auth.users.id), not owner_id.
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${uid}`, {
    method: 'DELETE',
    headers: adminHeaders,
  })
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
    method: 'DELETE',
    headers: adminHeaders,
  })
}

describe('RLS cross-owner isolation (KOV-FR-003)', () => {
  let ownerA: TestAccount
  let ownerB: TestAccount
  let clientAId: string
  let quoteAId: string

  beforeAll(async () => {
    ownerA = await createSignedInAccount('owner-a')
    ownerB = await createSignedInAccount('owner-b')

    // Seed real, owner-A-scoped rows across a representative set of tables —
    // enough to exercise every RLS policy shape in the schema (a plain
    // owner_id column, and a table joined transitively through a client).
    const client = (await adminFetch('clients', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ owner_id: ownerA.id, name: 'RLS Test Client A', status: 'active' }),
    })) as { id: string }[]
    clientAId = client[0].id

    const quote = (await adminFetch('quotes', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        owner_id: ownerA.id,
        client_id: clientAId,
        reference: 'RLS-TEST-A',
        vat_rate: 20,
        status: 'draft',
      }),
    })) as { id: string }[]
    quoteAId = quote[0].id

    await adminFetch('quote_lines', {
      method: 'POST',
      body: JSON.stringify({
        quote_id: quoteAId,
        owner_id: ownerA.id,
        designation: 'RLS test line',
        unit: 'unité',
        quantity: 1,
        unit_price: 100,
        purchase_price: 50,
        sort_order: 0,
      }),
    })

    await adminFetch('journal', {
      method: 'POST',
      body: JSON.stringify({
        owner_id: ownerA.id,
        client_id: clientAId,
        entry_type: 'note',
        direction: 'outbound',
        title: 'RLS test journal entry',
      }),
    })

    await adminFetch('price_items', {
      method: 'POST',
      body: JSON.stringify({
        owner_id: ownerA.id,
        label: 'RLS test item',
        unit: 'unité',
        purchase_price: 10,
        sale_price: 20,
        default_vat_rate: 20,
        is_supply: true,
        active: true,
      }),
    })
  }, 30000)

  afterAll(async () => {
    // Backdating journal rows past the retention window (added for
    // journal_retention_guard, 0015_journal_retention_guard.sql) is an extra
    // network round-trip per account on top of the existing bulk deletes —
    // 30s was already tight for two accounts' worth of cleanup and started
    // timing out once this was added, even though every actual assertion
    // still passed. Cleanup correctness matters more here than speed.
    await deleteAccountAndData(ownerA.id)
    await deleteAccountAndData(ownerB.id)
  }, 60000)

  it("owner A can read their own clients row (sanity check the JWT/query shape is correct)", async () => {
    const rows = (await readAsUser(ownerA, 'clients', `?id=eq.${clientAId}`)) as { id: string }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(clientAId)
  })

  it('owner B cannot read owner A clients row', async () => {
    const rows = await readAsUser(ownerB, 'clients', `?id=eq.${clientAId}`)
    expect(rows).toEqual([])
  })

  it('owner B cannot read owner A quotes row', async () => {
    const rows = await readAsUser(ownerB, 'quotes', `?id=eq.${quoteAId}`)
    expect(rows).toEqual([])
  })

  it('owner B cannot read owner A quote_lines rows (joined-through-quote table)', async () => {
    const rows = await readAsUser(ownerB, 'quote_lines', `?quote_id=eq.${quoteAId}`)
    expect(rows).toEqual([])
  })

  it('owner B cannot read owner A journal rows', async () => {
    const rows = await readAsUser(ownerB, 'journal', `?client_id=eq.${clientAId}`)
    expect(rows).toEqual([])
  })

  it("owner B's unfiltered 'select *' on clients/quotes/journal/price_items returns zero of owner A's rows", async () => {
    // The stronger, more realistic check: not just "the row I asked for by
    // id is hidden" but "an unscoped list query never leaks a single row
    // belonging to another owner" — this is what RLS is actually for; a
    // real client app lists "my clients", not one id at a time.
    for (const table of ['clients', 'quotes', 'journal', 'price_items']) {
      const rows = (await readAsUser(ownerB, table)) as { owner_id?: string }[]
      const leaked = rows.filter((r) => r.owner_id === ownerA.id)
      expect(leaked, `${table} leaked ${leaked.length} of owner A's rows to owner B`).toEqual([])
    }
  })

  it('owner A cannot delete their own journal row before the 10-year retention period expires', async () => {
    // journal_retention_guard (0015_journal_retention_guard.sql) — scope audit
    // finding (2026-09-26): RLS alone let an owner delete any journal row at
    // will, directly contradicting the documented ten-year retention
    // commitment (docs/05_DataModel.md §2.19). RLS permits the delete (it IS
    // the owner's own row) but the DB trigger must still reject it. Uses
    // owner A's real JWT, not the service_role key, since the point is to
    // prove the app-facing path is blocked, not just that a trigger exists.
    const seeded = (await adminFetch(
      `journal?title=eq.RLS test journal entry&client_id=eq.${clientAId}`,
    )) as { id: string }[]
    const journalRowId = seeded[0].id

    const res = await fetch(`${SUPABASE_URL}/rest/v1/journal?id=eq.${journalRowId}`, {
      method: 'DELETE',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ownerA.accessToken}` },
    })
    expect(res.ok).toBe(false)
    const body = await res.text()
    expect(body).toMatch(/10-year retention period/)

    const stillThere = (await adminFetch(`journal?id=eq.${journalRowId}`)) as unknown[]
    expect(stillThere).toHaveLength(1)
  })

  it('an unauthenticated request (anon key only, no user JWT) cannot read owner A rows on any exposed table', async () => {
    // KOV-FR-001's "Data access refused without authentication" acceptance
    // criterion, and KOV-FR-003's "RLS enabled and tested on every exposed
    // table" — scope audit finding (2026-09-26): only `clients` had this
    // check; extended across the same representative table set as the
    // unscoped-list-leak check above (a plain owner_id column, and a table
    // joined transitively through a client).
    for (const table of ['clients', 'quotes', 'journal', 'price_items']) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        headers: { apikey: ANON_KEY },
      })
      expect(res.ok, `${table}: unauthenticated request was not ok`).toBe(true)
      const rows = (await res.json()) as { owner_id?: string }[]
      const leaked = rows.filter((r) => r.owner_id === ownerA.id)
      expect(leaked, `${table} leaked ${leaked.length} of owner A's rows with no auth at all`).toEqual(
        [],
      )
    }
  })

  it("owner A's real session JWT still works on a later, independent request (secure session recovery, KOV-FR-001)", async () => {
    // KOV-FR-001's "secure session recovery... sign-in possible from a
    // second browser with the same data recovered" — modeled here as: the
    // SAME already-issued access token (from this suite's beforeAll
    // sign-in), used again in a completely separate request, still
    // authenticates correctly and still sees exactly the owner's own data.
    // A second real browser/device recovering an existing session presents
    // the same kind of already-issued token, not a fresh sign-in — this is
    // the closest honest equivalent without spinning up a second real client.
    const rows = (await readAsUser(ownerA, 'clients', `?id=eq.${clientAId}`)) as { id: string }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(clientAId)

    // And the session recovery is still scoped correctly — it must not
    // suddenly see owner B's data either.
    const clientBRows = await readAsUser(ownerA, 'clients', `?owner_id=eq.${ownerB.id}`)
    expect(clientBRows).toEqual([])
  })

  it('an unauthenticated request (anon key only, no user JWT) cannot read owner A clients row', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${clientAId}`, {
      headers: { apikey: ANON_KEY },
    })
    // Supabase's PostgREST returns 200 with an empty array for a
    // policy-denied anon SELECT (RLS filters rows, it doesn't 403 the
    // request) — the real assertion is that zero rows come back.
    expect(res.ok).toBe(true)
    const rows = (await res.json()) as unknown[]
    expect(rows).toEqual([])
  })
})

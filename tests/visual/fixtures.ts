import fs from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'

/**
 * Shared seeding/auth helpers for the visual-regression suite —
 * docs/03_MasterPrompts.md §14.2.5. Real Supabase REST calls against the
 * live kov-staging project, same pattern used throughout this project's
 * live-verification passes — never mocked network responses for a VISUAL
 * suite, since a mocked response could silently drift from the real shape
 * and mask a real rendering bug.
 */

function readEnv(key: string): string {
  const envPath = path.resolve(process.cwd(), '.env.local')
  const env = fs.readFileSync(envPath, 'utf-8')
  const match = env.match(new RegExp(`^${key}=(.*)$`, 'm'))
  if (!match) throw new Error(`Missing ${key} in .env.local`)
  return match[1].trim()
}

const SUPABASE_URL = readEnv('VITE_SUPABASE_URL')
const SERVICE_KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY')

const adminHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function adminFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
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
  if (!res.ok)
    throw new Error(
      `${init?.method ?? 'GET'} ${path} failed: ${res.status} ${JSON.stringify(data)}`,
    )
  return data
}

export interface VisualTestUser {
  id: string
  email: string
  password: string
}

/** Creates a real, pre-confirmed, onboarding-complete test account. */
export async function createVisualTestUser(label: string): Promise<VisualTestUser> {
  const email = `kov-visual-${label}-${Date.now()}@example.test`
  const password = 'Test1234!Test1234!'
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  const user = (await res.json()) as { id: string }
  await adminFetch(`profiles?id=eq.${user.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ onboarding_step: 3, onboarding_complete: true, team_mode: 'equipe' }),
  })
  return { id: user.id, email, password }
}

/** Creates a real, pre-confirmed user account with onboarding incomplete (step 0). */
export async function createFreshUserForOnboarding(label: string): Promise<VisualTestUser> {
  const email = `kov-onboarding-${label}-${Date.now()}@example.test`
  const password = 'Test1234!Test1234!'
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  const user = (await res.json()) as { id: string }
  await adminFetch(`profiles?id=eq.${user.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ onboarding_step: 0, onboarding_complete: false }),
  })
  return { id: user.id, email, password }
}

export async function deleteVisualTestUser(uid: string) {
  const tables = [
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
  ]
  for (const t of tables) {
    await fetch(`${SUPABASE_URL}/rest/v1/${t}?owner_id=eq.${uid}`, {
      method: 'DELETE',
      headers: adminHeaders,
    })
  }
  await adminFetch(`quotes?owner_id=eq.${uid}`, {
    method: 'PATCH',
    body: JSON.stringify({ current_version_id: null }),
  })
  for (const t of ['projects', 'quote_versions', 'quotes', 'price_items', 'clients', 'employees']) {
    await fetch(`${SUPABASE_URL}/rest/v1/${t}?owner_id=eq.${uid}`, {
      method: 'DELETE',
      headers: adminHeaders,
    })
  }
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
    method: 'DELETE',
    headers: adminHeaders,
  })
}

export async function signIn(page: Page, user: VisualTestUser) {
  await page.goto('/sign-in')
  if (page.url().includes('/home')) return
  try {
    await page.waitForURL(/\/home/, { timeout: 1500 })
    return
  } catch {
    // not signed in yet, proceed
  }
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Mot de passe').fill(user.password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForURL(/\/home/, { timeout: 15000 })
}

/** Creates a real client, an accepted quote (with a real quote_version) at
 * the given projected_margin_pct, and lines that make that margin true —
 * enough to open the quote editor directly at the Devis step (which
 * auto-resumes there once lines exist) with the MarginBox rendering exactly
 * the requested tier. */
export async function seedQuoteAtMargin(
  uid: string,
  marginPct: number,
): Promise<{ quoteId: string; clientId: string }> {
  const client = (await adminFetch('clients', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      owner_id: uid,
      name: `Visual Test Client ${marginPct}`,
      status: 'active',
    }),
  })) as { id: string }[]

  const salePrice = 1000
  const purchasePrice = salePrice * (1 - marginPct / 100)

  const quote = (await adminFetch('quotes', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      owner_id: uid,
      client_id: client[0].id,
      reference: `DEV-VISUAL-${marginPct}`,
      vat_rate: 20,
      status: 'draft',
      subtotal_ht: salePrice,
      total_ttc: salePrice * 1.2,
      projected_margin_pct: marginPct,
    }),
  })) as { id: string }[]

  await adminFetch('quote_lines', {
    method: 'POST',
    body: JSON.stringify({
      quote_id: quote[0].id,
      owner_id: uid,
      designation: 'Ligne de test visuelle',
      unit: 'unité',
      quantity: 1,
      unit_price: salePrice,
      purchase_price: purchasePrice,
      line_margin_pct: marginPct,
      sort_order: 0,
    }),
  })

  return { quoteId: quote[0].id, clientId: client[0].id }
}

/** Creates a full accepted-quote → chantier chain with a real project_costs
 * row, for the chantier profitability screen's loaded state. */
export async function seedChantierWithProfitability(uid: string) {
  const client = (await adminFetch('clients', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ owner_id: uid, name: 'Visual Chantier Client', status: 'active' }),
  })) as { id: string }[]

  const quote = (await adminFetch('quotes', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      owner_id: uid,
      client_id: client[0].id,
      reference: 'DEV-VISUAL-CHANTIER',
      vat_rate: 20,
      status: 'draft',
      subtotal_ht: 1000,
      total_ttc: 1200,
      projected_margin_pct: 35,
    }),
  })) as { id: string }[]

  const version = (await adminFetch('quote_versions', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      quote_id: quote[0].id,
      owner_id: uid,
      version_number: 1,
      snapshot: { total_ttc: 1200, projected_margin_pct: 35 },
      snapshot_hash: 'visual-test',
    }),
  })) as { id: string }[]

  await adminFetch(`quotes?id=eq.${quote[0].id}`, {
    method: 'PATCH',
    body: JSON.stringify({ current_version_id: version[0].id, status: 'accepted' }),
  })

  const project = (await adminFetch('projects', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      owner_id: uid,
      client_id: client[0].id,
      source_quote_id: quote[0].id,
      source_quote_version_id: version[0].id,
      name: 'Visual Test Chantier',
      status: 'in_progress',
      planned_value_ttc: 1200,
      planned_margin_pct: 35,
    }),
  })) as { id: string }[]

  await adminFetch('project_costs', {
    method: 'POST',
    body: JSON.stringify({
      owner_id: uid,
      project_id: project[0].id,
      cost_type: 'supply',
      description: 'Fourniture test visuel',
      amount: 300,
      incurred_at: new Date().toISOString().slice(0, 10),
    }),
  })

  return { projectId: project[0].id, clientId: client[0].id }
}

export async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t)
  }, theme)
}

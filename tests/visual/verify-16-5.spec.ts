import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import {
  createVisualTestUser,
  deleteVisualTestUser,
} from './fixtures'

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
  if (!res.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status} ${JSON.stringify(data)}`)
  }
  return data
}

async function forceSignIn(page: Page, user: { email: string; password: string }) {
  await page.context().clearCookies()
  await page.goto('/sign-in')
  await page.evaluate(() => localStorage.clear()).catch(() => {})
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Mot de passe').fill(user.password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForURL(/\/home/, { timeout: 15000 })
}

test.describe('16.5 Invoicing, Unpaid, Orders & Planning Redesign Visual Verification', () => {
  const outDir = path.resolve(process.cwd(), '.scratch-a11y/redesign-16-5')
  let user: { id: string; email: string; password: string }
  let emptyUser: { id: string; email: string; password: string }
  let clientId: string
  let quoteId: string
  let overdueInvoiceId: string
  let sentInvoiceId: string
  let projectIdA: string
  let projectIdB: string
  let priceItemId: string
  let employeeId: string
  let orderId: string

  test.beforeAll(async () => {
    fs.mkdirSync(outDir, { recursive: true })
    user = await createVisualTestUser('cluster-16-5-pop')
    emptyUser = await createVisualTestUser('cluster-16-5-empty')

    // Ensure users are in team mode ('equipe') so Planning shows full week grid
    await adminFetch(`profiles?id=eq.${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ team_mode: 'equipe' }),
      headers: { Prefer: 'return=representation' },
    })
    await adminFetch(`profiles?id=eq.${emptyUser.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ team_mode: 'equipe' }),
      headers: { Prefer: 'return=representation' },
    })

    // 1. Seed Client
    const clients = (await adminFetch('clients', {
      method: 'POST',
      body: JSON.stringify([
        {
          owner_id: user.id,
          name: 'Mme Claire Bonnet',
          phone: '06 12 34 56 78',
          email: 'claire.bonnet@example.com',
          address: '14 Rue des Lilas, 69003 Lyon',
        },
      ]),
      headers: { Prefer: 'return=representation' },
    })) as Array<{ id: string }>
    clientId = clients[0].id

    // 2. Seed Quotes & Versions for Projects
    const quotes = (await adminFetch('quotes', {
      method: 'POST',
      body: JSON.stringify([
        {
          owner_id: user.id,
          client_id: clientId,
          reference: 'DEV-2026-0042',
          status: 'accepted',
          vat_rate: 20,
          subtotal_ht: 2666.67,
          total_ttc: 3200.0,
        },
        {
          owner_id: user.id,
          client_id: clientId,
          reference: 'DEV-2026-0043',
          status: 'accepted',
          vat_rate: 20,
          subtotal_ht: 1500.0,
          total_ttc: 1800.0,
        },
      ]),
      headers: { Prefer: 'return=representation' },
    })) as Array<{ id: string }>
    quoteId = quotes[0].id
    const quoteIdB = quotes[1].id

    const versions = (await adminFetch('quote_versions', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          owner_id: user.id,
          quote_id: quoteId,
          version_number: 1,
          snapshot_hash: 'test-hash-dev-2026-0042-v1',
          snapshot: {
            reference: 'DEV-2026-0042',
            issued_at: new Date().toISOString(),
            vat_rate: 20,
            subtotal_ht: 2666.67,
            total_ttc: 3200.0,
            vat_amount: 533.33,
            client: { name: 'Mme Claire Bonnet' },
            lines: [],
          },
        },
        {
          owner_id: user.id,
          quote_id: quoteIdB,
          version_number: 1,
          snapshot_hash: 'test-hash-dev-2026-0043-v1',
          snapshot: {
            reference: 'DEV-2026-0043',
            issued_at: new Date().toISOString(),
            vat_rate: 20,
            subtotal_ht: 1500.0,
            total_ttc: 1800.0,
            vat_amount: 300.0,
            client: { name: 'Mme Claire Bonnet' },
            lines: [],
          },
        },
      ]),
    })) as Array<{ id: string }>
    const quoteVersionIdA = versions[0].id
    const quoteVersionIdB = versions[1].id

    await adminFetch(`quotes?id=eq.${quoteId}`, {
      method: 'PATCH',
      body: JSON.stringify({ current_version_id: quoteVersionIdA }),
    })
    await adminFetch(`quotes?id=eq.${quoteIdB}`, {
      method: 'PATCH',
      body: JSON.stringify({ current_version_id: quoteVersionIdB }),
    })

    // 3. Seed Invoices (one overdue 20 days -> level 2, one sent/current)
    const twentyDaysAgo = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10)
    const thirtyDaysAhead = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    const invoices = (await adminFetch('invoices', {
      method: 'POST',
      body: JSON.stringify([
        {
          owner_id: user.id,
          client_id: clientId,
          quote_id: quoteId,
          invoice_type: 'acompte',
          amount_ttc: 960.0,
          payment_term: 'a_reception',
          status: 'overdue',
          dunning_level: 2,
          issued_at: twentyDaysAgo,
          due_date: twentyDaysAgo,
        },
        {
          owner_id: user.id,
          client_id: clientId,
          quote_id: quoteId,
          invoice_type: 'situation',
          amount_ttc: 1280.0,
          payment_term: '30_jours',
          status: 'sent',
          dunning_level: 0,
          issued_at: new Date().toISOString().slice(0, 10),
          due_date: thirtyDaysAhead,
        },
      ]),
      headers: { Prefer: 'return=representation' },
    })) as Array<{ id: string }>
    overdueInvoiceId = invoices[0].id
    sentInvoiceId = invoices[1].id

    // 4. Seed Employee
    const employees = (await adminFetch('employees', {
      method: 'POST',
      body: JSON.stringify({
        owner_id: user.id,
        name: 'Lucas Martin',
        active: true,
      }),
      headers: { Prefer: 'return=representation' },
    })) as Array<{ id: string }>
    employeeId = employees[0].id

    // Current week ISO dates for planning conflict matching currentWeekBounds()
    const now = new Date()
    const sun = new Date(now)
    sun.setDate(sun.getDate() - sun.getDay())
    const sat = new Date(sun)
    sat.setDate(sun.getDate() + 6)
    const startIso = sun.toISOString().slice(0, 10)
    const endIso = sat.toISOString().slice(0, 10)

    // 5. Seed Projects with overlapping schedule for planning conflict
    const projects = (await adminFetch('projects', {
      method: 'POST',
      body: JSON.stringify([
        {
          owner_id: user.id,
          client_id: clientId,
          source_quote_id: quoteId,
          source_quote_version_id: quoteVersionIdA,
          name: 'Chantier Rénovation SDB Bonnet',
          status: 'in_progress',
          planned_value_ttc: 3200,
          planned_margin_pct: 40,
          start_date: startIso,
          end_date: endIso,
          assigned_employee_ids: [employeeId],
        },
        {
          owner_id: user.id,
          client_id: clientId,
          source_quote_id: quoteIdB,
          source_quote_version_id: quoteVersionIdB,
          name: 'Chantier Remplacement Chauffe-eau',
          status: 'in_progress',
          planned_value_ttc: 1800,
          planned_margin_pct: 40,
          start_date: startIso,
          end_date: endIso,
          assigned_employee_ids: [employeeId],
        },
      ]),
      headers: { Prefer: 'return=representation' },
    })) as Array<{ id: string }>
    projectIdA = projects[0].id
    projectIdB = projects[1].id

    // 6. Seed Price Item & Order with order_lines
    const priceItems = (await adminFetch('price_items', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          owner_id: user.id,
          label: 'Tube Cuivre Ø14mm',
          unit: 'ml',
          purchase_price: 12.5,
          sale_price: 24.0,
          default_vat_rate: 20,
          category: 'Plomberie',
          is_supply: true,
          active: true,
          created_at: new Date().toISOString(),
        },
      ]),
    })) as Array<{ id: string }>
    priceItemId = priceItems[0].id

    const orders = (await adminFetch('orders', {
      method: 'POST',
      body: JSON.stringify([
        {
          owner_id: user.id,
          project_id: projectIdA,
          delivery_mode: 'chantier',
          status: 'transmitted_pending',
          supplier_name: 'Point.P',
        },
      ]),
      headers: { Prefer: 'return=representation' },
    })) as Array<{ id: string }>
    orderId = orders[0].id

    await adminFetch('order_lines', {
      method: 'POST',
      body: JSON.stringify([
        {
          order_id: orderId,
          owner_id: user.id,
          price_item_id: priceItemId,
          reference_label: 'Tube Cuivre Ø14mm (barre 2m)',
          quantity: 6,
          stock_state: 'available',
          depot_label: 'Dépôt Lyon Nord',
          lead_time_days: 0,
        },
        {
          order_id: orderId,
          owner_id: user.id,
          price_item_id: priceItemId,
          reference_label: 'Mitigeur Thermostatique Grohe',
          quantity: 1,
          stock_state: 'in_transit',
          depot_label: null,
          lead_time_days: 2,
        },
      ]),
    })
  })

  test.afterAll(async () => {
    if (orderId) {
      await adminFetch(`order_lines?order_id=eq.${orderId}`, { method: 'DELETE' }).catch(() => {})
      await adminFetch(`orders?id=eq.${orderId}`, { method: 'DELETE' }).catch(() => {})
    }
    if (projectIdA) await adminFetch(`projects?id=eq.${projectIdA}`, { method: 'DELETE' }).catch(() => {})
    if (projectIdB) await adminFetch(`projects?id=eq.${projectIdB}`, { method: 'DELETE' }).catch(() => {})
    if (priceItemId) await adminFetch(`price_items?id=eq.${priceItemId}`, { method: 'DELETE' }).catch(() => {})
    if (employeeId) await adminFetch(`employees?id=eq.${employeeId}`, { method: 'DELETE' }).catch(() => {})
    if (overdueInvoiceId) await adminFetch(`invoices?id=eq.${overdueInvoiceId}`, { method: 'DELETE' }).catch(() => {})
    if (sentInvoiceId) await adminFetch(`invoices?id=eq.${sentInvoiceId}`, { method: 'DELETE' }).catch(() => {})
    if (quoteId) await adminFetch(`quotes?id=eq.${quoteId}`, { method: 'DELETE' }).catch(() => {})
    if (clientId) await adminFetch(`clients?id=eq.${clientId}`, { method: 'DELETE' }).catch(() => {})

    if (user) await deleteVisualTestUser(user.id).catch(() => {})
    if (emptyUser) await deleteVisualTestUser(emptyUser.id).catch(() => {})
  })

  test('Empty states centered at 375px and 1440px across all 4 screens', async ({ page }) => {
    await forceSignIn(page, emptyUser)

    const routes = [
      { path: '/invoices', name: 'invoicing' },
      { path: '/unpaid', name: 'unpaid' },
      { path: '/orders', name: 'orders' },
      { path: '/planning', name: 'planning' },
    ]

    for (const route of routes) {
      // Mobile 375px
      await page.setViewportSize({ width: 375, height: 812 })
      await page.goto(route.path)
      await page.waitForLoadState('networkidle')
      await page.screenshot({
        path: path.join(outDir, `${route.name}-empty-375px.png`),
        fullPage: true,
      })

      // Desktop 1440px
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(route.path)
      await page.waitForLoadState('networkidle')
      await page.screenshot({
        path: path.join(outDir, `${route.name}-empty-1440px.png`),
        fullPage: true,
      })
    }
  })

  test('InvoicingPage: Populated state & click-through navigation split test', async ({ page }) => {
    await forceSignIn(page, user)

    // 1. Mobile & Desktop screenshots
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/invoices')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1').filter({ hasText: 'Facturation' })).toBeVisible()
    await expect(page.locator('text=Mme Claire Bonnet').first()).toBeVisible()
    await page.screenshot({
      path: path.join(outDir, 'invoicing-populated-375px.png'),
      fullPage: true,
    })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/invoices')
    await page.waitForLoadState('networkidle')
    await page.screenshot({
      path: path.join(outDir, 'invoicing-populated-1440px.png'),
      fullPage: true,
    })

    // 2. Click-through split test:
    // Click overdue invoice row -> must navigate to /unpaid
    const overdueRow = page.locator('ul li button').filter({ hasText: 'En retard' }).first()
    await overdueRow.click()
    await page.waitForURL('**/unpaid')
    expect(page.url()).toContain('/unpaid')

    // Go back to /invoices and click sent (non-overdue) invoice row -> must navigate to /clients/:clientId
    await page.goto('/invoices')
    await page.waitForLoadState('networkidle')
    const sentRow = page.locator('ul li button').filter({ hasText: 'Envoyée' }).first()
    await sentRow.click()
    await page.waitForURL(`**/clients/${clientId}`)
    expect(page.url()).toContain(`/clients/${clientId}`)
  })

  test('UnpaidPage: Populated state & DunningModal visual verification', async ({ page }) => {
    await forceSignIn(page, user)

    // 1. Mobile & Desktop screenshots
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/unpaid')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1').filter({ hasText: 'Impayés' })).toBeVisible()
    await expect(page.locator('text=Relance ferme').first()).toBeVisible()
    await page.screenshot({
      path: path.join(outDir, 'unpaid-populated-375px.png'),
      fullPage: true,
    })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/unpaid')
    await page.waitForLoadState('networkidle')
    await page.screenshot({
      path: path.join(outDir, 'unpaid-populated-1440px.png'),
      fullPage: true,
    })

    // 2. Open DunningModal
    const relanceBtn = page.locator('button:has-text("Relancer")').first()
    await relanceBtn.click()
    await expect(page.locator('#dunning-modal-title')).toBeVisible()
    await page.screenshot({
      path: path.join(outDir, 'dunning-modal-1440px.png'),
    })
  })

  test('OrdersPage: Populated state with stock status badges', async ({ page }) => {
    await forceSignIn(page, user)

    // 1. Mobile & Desktop screenshots
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1').filter({ hasText: 'Commandes Fournisseurs' })).toBeVisible()
    await expect(page.locator('text=Tube Cuivre').first()).toBeVisible()
    await page.screenshot({
      path: path.join(outDir, 'orders-populated-375px.png'),
      fullPage: true,
    })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')
    await page.screenshot({
      path: path.join(outDir, 'orders-populated-1440px.png'),
      fullPage: true,
    })
  })

  test('PlanningPage: Populated state with conflict detection & ConflictModal', async ({ page }) => {
    await forceSignIn(page, user)

    // 1. Mobile & Desktop screenshots
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/planning')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1').filter({ hasText: 'Planning Hebdomadaire' })).toBeVisible()
    await expect(page.locator('text=Lucas Martin').first()).toBeVisible()
    await page.screenshot({
      path: path.join(outDir, 'planning-populated-375px.png'),
      fullPage: true,
    })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/planning')
    await page.waitForLoadState('networkidle')
    await page.screenshot({
      path: path.join(outDir, 'planning-populated-1440px.png'),
      fullPage: true,
    })

    // 2. Open ConflictModal
    const conflictBtn = page.locator('button[aria-label="Voir le conflit"]').first()
    await conflictBtn.click()
    await expect(page.locator('#conflict-modal-title')).toBeVisible()
    await page.screenshot({
      path: path.join(outDir, 'planning-conflict-modal-1440px.png'),
    })
  })
})

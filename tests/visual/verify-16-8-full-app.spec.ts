import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import path from 'node:path'
import {
  createVisualTestUser,
  deleteVisualTestUser,
  seedChantierWithProfitability,
  seedQuoteAtMargin,
  type VisualTestUser,
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

async function scanAxe(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const critical = results.violations.filter((v) => v.impact === 'critical')
  const serious = results.violations.filter((v) => v.impact === 'serious')
  const blocking = [...critical, ...serious]
  expect(
    blocking,
    `${label}: ${blocking.length} critical/serious violation(s) — ${blocking
      .map((v) => `${v.id} (${v.impact}): ${v.help} [${v.nodes.length}x]`)
      .join(' | ')}`,
  ).toEqual([])
}

test.describe('16.8 Full App Consistency, Visual Audit & Accessibility Sweep', () => {
  test.setTimeout(120000)
  const outDir = path.resolve(process.cwd(), '.scratch-a11y/redesign-16-8')
  let user: VisualTestUser
  let quoteId: string
  let clientId: string
  let projectId: string

  test.beforeAll(async () => {
    fs.mkdirSync(outDir, { recursive: true })
    user = await createVisualTestUser('cluster-16-8-final')

    // Upsert business details
    await adminFetch('businesses', {
      method: 'POST',
      body: JSON.stringify({
        owner_id: user.id,
        legal_name: 'Atelier Kōv Rénovation',
        siren: '889900112',
        address: { street: '40 Rue du Faubourg Saint-Antoine', postal_code: '75012', city: 'Paris' },
        phone: '01 43 00 12 34',
        email: 'contact@atelier-kov.fr',
        default_vat_rate: 20,
        legal_mentions: { text: 'SASU au capital de 15 000€ - RCS Paris 889 900 112' },
        legal_fields_complete: true,
        accountant_email: 'comptable@cabinet-fiduciaire.fr',
        default_supplier_name: 'Point.P Matériaux',
      }),
      headers: { Prefer: 'resolution=merge-duplicates' },
    })

    // Seed quote with lines
    const quote = await seedQuoteAtMargin(user.id, 35)
    quoteId = quote.quoteId
    clientId = quote.clientId

    // Seed project with profitability
    const chantier = await seedChantierWithProfitability(user.id)
    projectId = chantier.projectId

    // Seed team members
    await adminFetch('employees', {
      method: 'POST',
      body: JSON.stringify([
        { owner_id: user.id, name: 'Julien Laurent', role: 'Chef de chantier', active: true },
        { owner_id: user.id, name: 'Emma Moreau', role: 'Menuisière', active: true },
      ]),
    })

    // Seed messages
    await adminFetch('journal', {
      method: 'POST',
      body: JSON.stringify([
        {
          owner_id: user.id,
          client_id: clientId,
          entry_type: 'sms',
          direction: 'inbound',
          title: 'SMS reçu du client',
          body: 'Bonjour, confirmez-vous le démarrage des travaux lundi ?',
          occurred_at: new Date(Date.now() - 3600000).toISOString(),
        },
      ]),
    })
  })

  test.afterAll(async () => {
    try {
      if (user) {
        await adminFetch(`employees?owner_id=eq.${user.id}`, { method: 'DELETE' }).catch(() => {})
        await adminFetch(`accounting_exports?owner_id=eq.${user.id}`, { method: 'DELETE' }).catch(() => {})
        await adminFetch(`project_costs?owner_id=eq.${user.id}`, { method: 'DELETE' }).catch(() => {})
        await adminFetch(`projects?id=eq.${projectId}`, { method: 'DELETE' }).catch(() => {})
        await adminFetch(`quote_lines?quote_id=eq.${quoteId}`, { method: 'DELETE' }).catch(() => {})
        await adminFetch(`quotes?id=eq.${quoteId}`, { method: 'DELETE' }).catch(() => {})
        await adminFetch(`clients?id=eq.${clientId}`, { method: 'DELETE' }).catch(() => {})
        await deleteVisualTestUser(user.id).catch(() => {})
      }
    } catch (e) {
      console.error('Cleanup error in verify-16-8:', e)
    }
  })

  test('Full App Desktop Pass (1440px): 12 primary & secondary screens + Axe a11y', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.setViewportSize({ width: 1440, height: 900 })
    await forceSignIn(page, user)

    const desktopRoutes = [
      { path: '/home', name: '01-home-1440px.png', label: 'Home' },
      { path: '/quotes', name: '02-quotes-list-1440px.png', label: 'Quotes List' },
      { path: `/quotes/${quoteId}/edit`, name: '03-quote-editor-1440px.png', label: 'Quote Editor' },
      { path: '/clients', name: '04-clients-list-1440px.png', label: 'Clients List' },
      { path: `/clients/${clientId}`, name: '05-client-detail-1440px.png', label: 'Client Detail' },
      { path: `/projects/${projectId}`, name: '06-chantier-detail-1440px.png', label: 'Chantier Detail' },
      { path: '/planning', name: '07-planning-1440px.png', label: 'Planning' },
      { path: '/invoices', name: '08-invoices-1440px.png', label: 'Invoices' },
      { path: '/orders', name: '09-orders-1440px.png', label: 'Orders' },
      { path: '/unpaid', name: '10-unpaid-1440px.png', label: 'Unpaid' },
      { path: '/messages', name: '11-messages-1440px.png', label: 'Messages' },
      { path: '/agent', name: '12-agent-1440px.png', label: 'Kōv Agent' },
    ]

    for (const r of desktopRoutes) {
      await page.goto(r.path)
      await page.waitForLoadState('networkidle')
      await page.screenshot({ path: path.join(outDir, r.name), fullPage: true })
      await scanAxe(page, `${r.label} (1440px)`)
    }

    expect(consoleErrors).toEqual([])
  })

  test('Full App Desktop Profile & Secondary Pass (1440px): Profile cluster + Axe a11y', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.setViewportSize({ width: 1440, height: 900 })
    await forceSignIn(page, user)

    const profileRoutes = [
      { path: '/profile', name: '13-profile-1440px.png', label: 'Profile' },
      { path: '/profile/business', name: '14-business-1440px.png', label: 'Business Settings' },
      { path: '/profile/price-library', name: '15-price-library-1440px.png', label: 'Price Library' },
      { path: '/profile/technical-sheets', name: '16-technical-sheets-1440px.png', label: 'Technical Sheets' },
      { path: '/profile/team', name: '17-team-1440px.png', label: 'Team' },
      { path: '/profile/accounting-export', name: '18-accounting-1440px.png', label: 'Accounting Export' },
      { path: '/profile/migration', name: '19-migration-1440px.png', label: 'Migration' },
      { path: '/profile/financing', name: '20-financing-1440px.png', label: 'Financing' },
      { path: '/profile/satisfaction', name: '21-satisfaction-1440px.png', label: 'Satisfaction' },
    ]

    for (const r of profileRoutes) {
      await page.goto(r.path)
      await page.waitForLoadState('networkidle')
      await page.screenshot({ path: path.join(outDir, r.name), fullPage: true })
      await scanAxe(page, `${r.label} (1440px)`)
    }

    expect(consoleErrors).toEqual([])
  })

  test('Full App Mobile Pass (375px): 12 core screens + Axe a11y', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.setViewportSize({ width: 375, height: 812 })
    await forceSignIn(page, user)

    const mobileRoutes = [
      { path: '/home', name: '01-home-375px.png', label: 'Home' },
      { path: '/quotes', name: '02-quotes-list-375px.png', label: 'Quotes List' },
      { path: `/quotes/${quoteId}/edit`, name: '03-quote-editor-375px.png', label: 'Quote Editor' },
      { path: '/clients', name: '04-clients-list-375px.png', label: 'Clients List' },
      { path: `/clients/${clientId}`, name: '05-client-detail-375px.png', label: 'Client Detail' },
      { path: `/projects/${projectId}`, name: '06-chantier-detail-375px.png', label: 'Chantier Detail' },
      { path: '/planning', name: '07-planning-375px.png', label: 'Planning' },
      { path: '/invoices', name: '08-invoices-375px.png', label: 'Invoices' },
      { path: '/orders', name: '09-orders-375px.png', label: 'Orders' },
      { path: '/unpaid', name: '10-unpaid-375px.png', label: 'Unpaid' },
      { path: '/messages', name: '11-messages-375px.png', label: 'Messages' },
      { path: '/agent', name: '12-agent-375px.png', label: 'Kōv Agent' },
      { path: '/profile', name: '13-profile-375px.png', label: 'Profile' },
    ]

    for (const r of mobileRoutes) {
      await page.goto(r.path)
      await page.waitForLoadState('networkidle')
      await page.screenshot({ path: path.join(outDir, r.name), fullPage: true })
      await scanAxe(page, `${r.label} (375px)`)
    }

    expect(consoleErrors).toEqual([])
  })

  test('Public / Auth Screens (375px + 1440px) + Axe a11y', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    const authScreens = [
      { path: '/sign-in', name: 'auth-signin', label: 'Sign In' },
      { path: '/sign-up', name: 'auth-signup', label: 'Sign Up' },
      { path: '/forgot-password', name: 'auth-forgot', label: 'Forgot Password' },
    ]

    for (const s of authScreens) {
      // 1440px
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(s.path)
      await page.waitForLoadState('networkidle')
      await page.screenshot({ path: path.join(outDir, `${s.name}-1440px.png`), fullPage: true })
      await scanAxe(page, `${s.label} (1440px)`)

      // 375px
      await page.setViewportSize({ width: 375, height: 812 })
      await page.goto(s.path)
      await page.waitForLoadState('networkidle')
      await page.screenshot({ path: path.join(outDir, `${s.name}-375px.png`), fullPage: true })
      await scanAxe(page, `${s.label} (375px)`)
    }

    expect(consoleErrors).toEqual([])
  })
})

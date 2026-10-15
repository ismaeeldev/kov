import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import {
  createVisualTestUser,
  deleteVisualTestUser,
  signIn,
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

test.describe('16.4 Quotes & Projects Redesign Visual Verification', () => {
  const outDir = path.resolve(process.cwd(), '.scratch-a11y/redesign-16-4')
  let user: { id: string; email: string; password: string }
  let clientId: string
  let draftQuoteId: string
  let issuedQuoteId: string
  let projectId: string
  let changeOrderId: string

  test.beforeAll(async () => {
    fs.mkdirSync(outDir, { recursive: true })
    user = await createVisualTestUser('cluster-16-4')

    // 1. Seed Client
    const clients = (await adminFetch('clients', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          owner_id: user.id,
          name: 'Cabinet Médical Dr. Rousseau',
          address: { street: '42 Avenue de la République', postal_code: '75011', city: 'Paris' },
          phone: '06 12 34 56 78',
          email: 'contact@rousseau-sante.fr',
          siren: '123456789',
          status: 'active',
          created_at: new Date().toISOString(),
        },
      ]),
    })) as Array<{ id: string }>
    clientId = clients[0].id

    // 2. Seed Price Item
    const priceItems = (await adminFetch('price_items', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          owner_id: user.id,
          label: 'Chauffe-eau thermodynamique 200L',
          unit: 'u',
          purchase_price: 950,
          sale_price: 1850,
          default_vat_rate: 20,
          category: 'Plomberie',
          is_supply: true,
          active: true,
          created_at: new Date().toISOString(),
        },
      ]),
    })) as Array<{ id: string }>

    // 3. Seed Draft Quote with Lines
    const quotes = (await adminFetch('quotes', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          owner_id: user.id,
          client_id: clientId,
          reference: 'DEV-2026-0042',
          status: 'draft',
          vat_rate: 20,
          subtotal_ht: 1850,
          total_ttc: 2220,
          projected_margin_pct: 48.6,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]),
    })) as Array<{ id: string }>
    draftQuoteId = quotes[0].id

    await adminFetch('quote_lines', {
      method: 'POST',
      body: JSON.stringify([
        {
          owner_id: user.id,
          quote_id: draftQuoteId,
          price_item_id: priceItems[0].id,
          designation: 'Chauffe-eau thermodynamique 200L',
          quantity: 1,
          unit: 'u',
          unit_price: 1850,
          purchase_price: 950,
          line_margin_pct: 48.6,
          sort_order: 1,
        },
      ]),
    })

    // 4. Seed Issued Quote with Snapshot Version
    const issuedQuotes = (await adminFetch('quotes', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          owner_id: user.id,
          client_id: clientId,
          reference: 'DEV-2026-0038',
          status: 'issued',
          vat_rate: 20,
          subtotal_ht: 3700,
          total_ttc: 4440,
          projected_margin_pct: 48.6,
          created_at: new Date(Date.now() - 86400000).toISOString(),
          updated_at: new Date(Date.now() - 86400000).toISOString(),
        },
      ]),
    })) as Array<{ id: string }>
    issuedQuoteId = issuedQuotes[0].id

    const versions = (await adminFetch('quote_versions', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          owner_id: user.id,
          quote_id: issuedQuoteId,
          version_number: 1,
          snapshot_hash: 'test-hash-dev-2026-0038-v1',
          snapshot: {
            reference: 'DEV-2026-0038',
            issued_at: new Date().toISOString(),
            vat_rate: 20,
            subtotal_ht: 3700,
            total_ttc: 4440,
            vat_amount: 740,
            client: { name: 'Cabinet Médical Dr. Rousseau' },
            lines: [
              {
                designation: 'Chauffe-eau thermodynamique 200L',
                quantity: 2,
                unit: 'u',
                unit_price: 1850,
              },
            ],
          },
        },
      ]),
    })) as Array<{ id: string }>

    await adminFetch(`quotes?id=eq.${issuedQuoteId}`, {
      method: 'PATCH',
      body: JSON.stringify({ current_version_id: versions[0].id }),
    })

    // 5. Seed Project with Costs & Updates
    const projects = (await adminFetch('projects', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          owner_id: user.id,
          client_id: clientId,
          source_quote_id: issuedQuoteId,
          source_quote_version_id: versions[0].id,
          name: 'Rénovation Sanitaire & Chauffage Cabinet',
          status: 'in_progress',
          planned_value_ttc: 4440,
          planned_margin_pct: 48.6,
          start_date: new Date(Date.now() - 604800000).toISOString().slice(0, 10),
          created_at: new Date().toISOString(),
        },
      ]),
    })) as Array<{ id: string }>
    projectId = projects[0].id

    await adminFetch('project_costs', {
      method: 'POST',
      body: JSON.stringify([
        {
          owner_id: user.id,
          project_id: projectId,
          cost_type: 'supply',
          description: 'Raccords cuivre et vannes d’arrêt 1/4',
          amount: 240,
          hours: null,
          hourly_rate: null,
          incurred_at: new Date().toISOString().slice(0, 10),
        },
        {
          owner_id: user.id,
          project_id: projectId,
          cost_type: 'labor_hours',
          description: 'Pose et purge circuit primaire',
          amount: null,
          hours: 8,
          hourly_rate: 45,
          incurred_at: new Date().toISOString().slice(0, 10),
        },
      ]),
    })

    await adminFetch('project_updates', {
      method: 'POST',
      body: JSON.stringify([
        {
          owner_id: user.id,
          project_id: projectId,
          text_content: 'Dépose de l’ancien cumulus effectuée. Arrivées d’eau sécurisées et circuit purgé.',
          progress_pct: 40,
          input_method: 'typed',
          sent_to_client: true,
          created_at: new Date().toISOString(),
        },
      ]),
    })

    // 6. Seed Change Order
    const changeOrders = (await adminFetch('change_orders', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          owner_id: user.id,
          project_id: projectId,
          status: 'draft',
          generated_from_cost_ids: [],
          lines: [
            {
              designation: 'Remplacement vanne générale grippée (imprévu)',
              quantity: 1,
              unit: 'forfait',
              unit_price: 180,
              purchase_price: 60,
              cost_type: 'supply',
            },
          ],
          created_at: new Date().toISOString(),
        },
      ]),
    })) as Array<{ id: string }>
    changeOrderId = changeOrders[0].id
  })

  test.afterAll(async () => {
    if (user?.id) {
      await deleteVisualTestUser(user.id)
    }
  })

  test('Quotes List & Filters — 375px and 1440px', async ({ page }) => {
    await signIn(page, user)

    // Mobile (375px)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/quotes')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=DEV-2026-0042')).toBeVisible()
    await page.screenshot({
      path: path.join(outDir, '01-quotes-list-375px.png'),
      fullPage: true,
    })

    // Desktop (1440px)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/quotes')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=DEV-2026-0042')).toBeVisible()
    await page.screenshot({
      path: path.join(outDir, '02-quotes-list-1440px.png'),
      fullPage: true,
    })
  })

  test('Quote Wizard Step 1 Client — 375px and 1440px', async ({ page }) => {
    await signIn(page, user)

    // Mobile (375px)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/quotes/new')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Choisir le client')).toBeVisible()
    await page.screenshot({
      path: path.join(outDir, '03-quote-wizard-step1-client-375px.png'),
      fullPage: true,
    })

    // Desktop (1440px)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/quotes/new')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Choisir le client')).toBeVisible()
    await page.screenshot({
      path: path.join(outDir, '04-quote-wizard-step1-client-1440px.png'),
      fullPage: true,
    })
  })

  test('Quote Wizard Step 3 Devis & MarginBox — 375px and 1440px', async ({ page }) => {
    await signIn(page, user)

    // Mobile (375px)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/quotes/${draftQuoteId}/edit`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Lignes du devis')).toBeVisible()
    await expect(page.locator('text=Chauffe-eau thermodynamique 200L')).toBeVisible()
    await page.screenshot({
      path: path.join(outDir, '05-quote-wizard-step3-devis-375px.png'),
      fullPage: true,
    })

    // Desktop (1440px)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/quotes/${draftQuoteId}/edit`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Lignes du devis')).toBeVisible()
    await page.screenshot({
      path: path.join(outDir, '06-quote-wizard-step3-devis-1440px.png'),
      fullPage: true,
    })
  })

  test('Quote Wizard Step 4 Envoyer Preview — 375px and 1440px', async ({ page }) => {
    await signIn(page, user)

    // Mobile (375px)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/quotes/${draftQuoteId}/edit`)
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Continuer' }).click()
    await expect(page.locator('text=Aperçu du devis')).toBeVisible()
    await page.screenshot({
      path: path.join(outDir, '07-quote-wizard-step4-envoyer-375px.png'),
      fullPage: true,
    })

    // Desktop (1440px)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/quotes/${draftQuoteId}/edit`)
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Continuer' }).click()
    await expect(page.locator('text=Aperçu du devis')).toBeVisible()
    await page.screenshot({
      path: path.join(outDir, '08-quote-wizard-step4-envoyer-1440px.png'),
      fullPage: true,
    })
  })

  test('Issued Quote Document View — 375px and 1440px', async ({ page }) => {
    await signIn(page, user)

    // Mobile (375px)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/quotes/${issuedQuoteId}/edit`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=DEV-2026-0038')).toBeVisible()
    await expect(page.locator('text=Acceptation du devis')).toBeVisible()
    await page.screenshot({
      path: path.join(outDir, '09-issued-quote-view-375px.png'),
      fullPage: true,
    })

    // Desktop (1440px)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/quotes/${issuedQuoteId}/edit`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=DEV-2026-0038')).toBeVisible()
    await page.screenshot({
      path: path.join(outDir, '10-issued-quote-view-1440px.png'),
      fullPage: true,
    })
  })

  test('Project Detail & Profitability MarginBox — 375px and 1440px', async ({ page }) => {
    await signIn(page, user)

    // Mobile (375px)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/projects/${projectId}`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Rénovation Sanitaire & Chauffage Cabinet')).toBeVisible()
    await page.screenshot({
      path: path.join(outDir, '11-project-detail-375px.png'),
      fullPage: true,
    })

    // Desktop (1440px)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/projects/${projectId}`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Rénovation Sanitaire & Chauffage Cabinet')).toBeVisible()
    await page.screenshot({
      path: path.join(outDir, '12-project-detail-1440px.png'),
      fullPage: true,
    })
  })

  test('Change Order Review Page — 375px and 1440px', async ({ page }) => {
    await signIn(page, user)

    // Mobile (375px)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/projects/change-order/${changeOrderId}`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Avenant — Rénovation Sanitaire')).toBeVisible()
    await expect(page.getByRole('button', { name: "Envoyer l'avenant" })).toBeVisible()
    await page.screenshot({
      path: path.join(outDir, '13-change-order-review-375px.png'),
      fullPage: true,
    })

    // Desktop (1440px)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/projects/change-order/${changeOrderId}`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Avenant — Rénovation Sanitaire')).toBeVisible()
    await expect(page.getByRole('button', { name: "Envoyer l'avenant" })).toBeVisible()
    await page.screenshot({
      path: path.join(outDir, '14-change-order-review-1440px.png'),
      fullPage: true,
    })
  })
})

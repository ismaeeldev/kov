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

test.describe('16.3 Home, Clients, Pricing, Technical Sheets Redesign Verification', () => {
  const outDir = path.resolve(process.cwd(), '.scratch-a11y/redesign-16-3')
  let user: { id: string; email: string; password: string }
  let seededClientId = ''

  test.beforeAll(async () => {
    fs.mkdirSync(outDir, { recursive: true })
    user = await createVisualTestUser('cluster-16-3')

    // Seed 3+ clients
    const clients = (await adminFetch('clients', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          owner_id: user.id,
          name: 'Dupont Rénovation',
          address: { street: '14 Rue de la Paix', postal_code: '75002', city: 'Paris' },
          phone: '+33 1 42 68 55 00',
          email: 'contact@dupont-renov.fr',
          siren: '512345678',
          status: 'active',
          next_followup_reminder: '2026-11-15',
        },
        {
          owner_id: user.id,
          name: 'Martin Électricité & Chauffage',
          address: { street: '8 Avenue Thiers', postal_code: '69006', city: 'Lyon' },
          phone: '+33 4 78 90 12 34',
          email: 'info@martin-elec.fr',
          siren: null,
          status: 'active',
          next_followup_reminder: null,
        },
        {
          owner_id: user.id,
          name: 'Sophie Durand (Archivée)',
          address: { street: '22 Boulevard Gambetta', postal_code: '06000', city: 'Nice' },
          phone: null,
          email: null,
          siren: null,
          status: 'archived',
          next_followup_reminder: null,
        },
      ]),
    })) as { id: string }[]

    seededClientId = clients[0].id

    // Seed 3+ price items
    const priceItems = (await adminFetch('price_items', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          owner_id: user.id,
          label: 'Pose carrelage grand format 60x60',
          unit: 'm²',
          purchase_price: 18.5,
          sale_price: 55.0,
          default_vat_rate: 10,
          category: 'Revêtement',
          is_supply: false,
          active: true,
        },
        {
          owner_id: user.id,
          label: 'Chauffe-eau thermodynamique 250L',
          unit: 'unité',
          purchase_price: 1150.0,
          sale_price: 1890.0,
          default_vat_rate: 5.5,
          category: 'Plomberie',
          is_supply: true,
          active: true,
        },
        {
          owner_id: user.id,
          label: 'Main d’œuvre électricité spécialisée',
          unit: 'heure',
          purchase_price: 25.0,
          sale_price: 65.0,
          default_vat_rate: 20,
          category: 'Électricité',
          is_supply: false,
          active: true,
        },
        {
          owner_id: user.id,
          label: 'Radiateur fonte ancien (Désactivé)',
          unit: 'unité',
          purchase_price: 120.0,
          sale_price: 280.0,
          default_vat_rate: 20,
          category: 'Chauffage',
          is_supply: true,
          active: false,
        },
      ]),
    })) as { id: string }[]

    // Seed 2+ technical sheets
    await adminFetch('technical_sheets', {
      method: 'POST',
      body: JSON.stringify([
        {
          owner_id: user.id,
          title: 'Protocole de pose carrelage sol 60x60',
          body: 'Vérification planéité support (tolérance 3mm sous règle de 2m). Primaire d’accrochage, double encollage mortier-colle C2S1.',
          price_item_id: priceItems[0].id,
        },
        {
          owner_id: user.id,
          title: 'Mise en service chauffe-eau thermodynamique',
          body: 'Contrôle étanchéité circuit frigorifique, purge groupe de sécurité, réglage consigne 55°C et paramétrage plages heures creuses.',
          price_item_id: priceItems[1].id,
        },
      ]),
    })

    // Seed quote and quote_version for client so invoices and projects have valid FKs
    const quote = (await adminFetch('quotes', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        owner_id: user.id,
        client_id: seededClientId,
        reference: 'DEV-2026-001',
        vat_rate: 20,
        status: 'accepted',
        subtotal_ht: 4308.33,
        total_ttc: 5170.0,
        projected_margin_pct: 38,
      }),
    })) as { id: string }[]

    const version = (await adminFetch('quote_versions', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        quote_id: quote[0].id,
        owner_id: user.id,
        version_number: 1,
        snapshot: { total_ttc: 5170.0, projected_margin_pct: 38 },
        snapshot_hash: 'visual-test-16-3',
      }),
    })) as { id: string }[]

    await adminFetch(`quotes?id=eq.${quote[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ current_version_id: version[0].id }),
    })

    // Seed linked items for Client Detail: invoices (CA cumulé), project, journal, note
    await adminFetch('invoices', {
      method: 'POST',
      body: JSON.stringify([
        {
          owner_id: user.id,
          client_id: seededClientId,
          quote_id: quote[0].id,
          invoice_type: 'acompte',
          issued_at: '2026-08-01',
          due_date: '2026-08-31',
          amount_ttc: 3850.0,
          payment_term: '30_jours',
          status: 'paid',
        },
        {
          owner_id: user.id,
          client_id: seededClientId,
          quote_id: quote[0].id,
          invoice_type: 'solde',
          issued_at: '2026-09-01',
          due_date: '2026-09-15',
          amount_ttc: 1320.0,
          payment_term: 'a_reception',
          status: 'sent',
        },
      ]),
    })

    await adminFetch('projects', {
      method: 'POST',
      body: JSON.stringify({
        owner_id: user.id,
        client_id: seededClientId,
        source_quote_id: quote[0].id,
        source_quote_version_id: version[0].id,
        name: 'Rénovation Salle de Bain Dupont',
        status: 'in_progress',
        planned_value_ttc: 5170.0,
        planned_margin_pct: 38.0,
      }),
    })

    await adminFetch('journal', {
      method: 'POST',
      body: JSON.stringify({
        owner_id: user.id,
        client_id: seededClientId,
        entry_type: 'note',
        direction: 'inbound',
        title: 'Appel client — Validation date d’intervention',
        body: 'Le client confirme sa présence pour le démarrage des travaux lundi 8h.',
        occurred_at: new Date().toISOString(),
      }),
    })

    await adminFetch('client_notes', {
      method: 'POST',
      body: JSON.stringify({
        owner_id: user.id,
        client_id: seededClientId,
        text_content: 'Digicode portail : 4829B. Prévenir 30min avant pour le chien.',
        tags: ['accès', 'important'],
        input_method: 'typed',
      }),
    })
  })

  test.afterAll(async () => {
    if (user?.id) {
      await deleteVisualTestUser(user.id)
    }
  })

  test('Verify Home, Clients list/detail, Pricing, Technical Sheets at 375px & 1440px', async ({
    page,
  }) => {
    const unhandledErrors: string[] = []
    page.on('pageerror', (err) => unhandledErrors.push(err.message))

    // 1. Sign In
    await signIn(page, user)

    // 2. Home Page (populated state with action items)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('http://localhost:5173/home')
    await page.waitForSelector('h1:has-text("Accueil")')
    await page.screenshot({ path: path.join(outDir, '01-home-populated-1440px.png') })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.screenshot({ path: path.join(outDir, '02-home-populated-375px.png') })

    // 3. Clients List Page (populated)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('http://localhost:5173/clients')
    await page.waitForSelector('h1:has-text("Clients")')
    await page.waitForSelector('text=Dupont Rénovation')
    await page.screenshot({ path: path.join(outDir, '03-clients-list-1440px.png') })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.screenshot({ path: path.join(outDir, '04-clients-list-375px.png') })

    // Search and filter test
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByPlaceholder('Rechercher par nom ou ville...').fill('Lyon')
    await expect(page.locator('text=Martin Électricité & Chauffage')).toBeVisible()
    await expect(page.locator('text=Dupont Rénovation')).not.toBeVisible()
    await page.screenshot({ path: path.join(outDir, '05-clients-search-filter-1440px.png') })
    await page.getByPlaceholder('Rechercher par nom ou ville...').clear()

    // 4. Client Detail Page (two-column desktop, real computed metrics)
    await page.goto(`http://localhost:5173/clients/${seededClientId}`)
    await page.waitForSelector('h1:has-text("Dupont Rénovation")')
    await expect(page.locator('text=Chiffre d\'affaires cumulé')).toBeVisible()
    await expect(page.locator('text=5170.00 €')).toBeVisible() // 3850 + 1320
    await expect(page.locator('text=Digicode portail : 4829B')).toBeVisible()
    await page.screenshot({ path: path.join(outDir, '06-client-detail-1440px.png') })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.screenshot({ path: path.join(outDir, '07-client-detail-375px.png') })

    // 5. Price Library Page
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('http://localhost:5173/profile/price-library')
    await page.waitForSelector('h1:has-text("Bibliothèque de prix")')
    await page.waitForSelector('text=Pose carrelage grand format 60x60')
    await page.screenshot({ path: path.join(outDir, '08-price-library-1440px.png') })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.screenshot({ path: path.join(outDir, '09-price-library-375px.png') })

    // Open Price Item modal
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('button', { name: 'Ajouter' }).click()
    await page.waitForSelector('h2:has-text("Nouvel article")')
    await page.screenshot({ path: path.join(outDir, '10-price-library-modal-1440px.png') })
    await page.getByRole('button', { name: 'Annuler' }).click()

    // 6. Technical Sheets Page
    await page.goto('http://localhost:5173/profile/technical-sheets')
    await page.waitForSelector('h1:has-text("Fiches techniques")')
    await page.waitForSelector('text=Protocole de pose carrelage sol 60x60')
    await page.screenshot({ path: path.join(outDir, '11-technical-sheets-1440px.png') })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.screenshot({ path: path.join(outDir, '12-technical-sheets-375px.png') })

    // Open Technical Sheet modal
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('button', { name: 'Ajouter' }).click()
    await page.waitForSelector('h2:has-text("Nouvelle fiche")')
    await page.screenshot({ path: path.join(outDir, '13-technical-sheets-modal-1440px.png') })
    await page.getByRole('button', { name: 'Annuler' }).click()

    expect(unhandledErrors).toEqual([])
  })
})

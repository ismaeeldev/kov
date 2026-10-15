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

test.describe('16.7 Secondary Screens Premium UI Redesign Visual Verification', () => {
  const outDir = path.resolve(process.cwd(), '.scratch-a11y/redesign-16-7')
  let user: { id: string; email: string; password: string }
  let clientId: string

  test.beforeAll(async () => {
    fs.mkdirSync(outDir, { recursive: true })
    user = await createVisualTestUser('cluster-16-7-sec')

    // Upsert business details
    await adminFetch('businesses', {
      method: 'POST',
      body: JSON.stringify({
        owner_id: user.id,
        legal_name: 'BatiPro Rénovation SAS',
        siren: '901234567',
        address: { street: '15 rue de la Paix', postal_code: '75002', city: 'Paris' },
        phone: '01 42 68 55 00',
        email: 'contact@batipro-reno.fr',
        default_vat_rate: 20,
        legal_mentions: { text: 'SAS au capital de 10 000€ - RCS Paris 901 234 567 - Garantie décennale AXA n° 987654321' },
        legal_fields_complete: true,
        accountant_email: 'comptable@cabinet-fiduciaire.fr',
        default_supplier_name: 'Rexel Distribution',
      }),
      headers: { Prefer: 'resolution=merge-duplicates' },
    })

    // Seed a real client with reminder
    const clients = (await adminFetch('clients', {
      method: 'POST',
      body: JSON.stringify([
        {
          owner_id: user.id,
          name: 'Mme Claire Fontaine',
          phone: '06 12 34 56 78',
          email: 'claire.fontaine@example.com',
          status: 'active',
          next_followup_reminder: new Date(Date.now() + 86400000 * 5).toISOString(),
        },
      ]),
      headers: { Prefer: 'return=representation' },
    })) as Array<{ id: string }>
    clientId = clients[0].id

    // Seed team members
    await adminFetch('employees', {
      method: 'POST',
      body: JSON.stringify([
        { owner_id: user.id, name: 'Lucas Martin', role: 'Électricien N3', active: true },
        { owner_id: user.id, name: 'Sarah Benali', role: 'Apprentie plomberie', active: true },
        { owner_id: user.id, name: 'Marc Dupont', role: 'Plâtrier plaquiste', active: false },
      ]),
    })

    // Seed inbound/outbound messages
    await adminFetch('journal', {
      method: 'POST',
      body: JSON.stringify([
        {
          owner_id: user.id,
          client_id: clientId,
          entry_type: 'sms',
          direction: 'inbound',
          title: 'SMS reçu de Mme Claire Fontaine',
          body: 'Bonjour, avez-vous pu finaliser le devis pour la salle de bain ?',
          occurred_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          owner_id: user.id,
          client_id: clientId,
          entry_type: 'email',
          direction: 'outbound',
          title: 'Email envoyé à Mme Claire Fontaine',
          body: 'Bonjour Claire, voici notre proposition détaillée avec la documentation.',
          occurred_at: new Date(Date.now() - 86400000).toISOString(),
        },
      ]),
    })
  })

  test.afterAll(async () => {
    try {
      if (user) {
        await adminFetch(`employees?owner_id=eq.${user.id}`, { method: 'DELETE' }).catch(() => {})
        await adminFetch(`accounting_exports?owner_id=eq.${user.id}`, { method: 'DELETE' }).catch(() => {})
        await adminFetch(`clients?id=eq.${clientId}`, { method: 'DELETE' }).catch(() => {})
        await deleteVisualTestUser(user.id).catch(() => {})
      }
    } catch (e) {
      console.error('Cleanup error in verify-16-7:', e)
    }
  })

  test('Messages & Financing (375px + 1440px)', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await forceSignIn(page, user)

    // 1. Messages Page
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/messages')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible()
    await page.screenshot({ path: path.join(outDir, '01-messages-375px.png'), fullPage: true })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/messages')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: path.join(outDir, '01-messages-1440px.png'), fullPage: true })

    // 2. Financing Page & Modal
    await page.goto('/profile/financing')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Financement' })).toBeVisible()
    await page.screenshot({ path: path.join(outDir, '02-financing-1440px.png'), fullPage: true })

    // Open simulation modal
    await page.getByRole('button', { name: 'Nouvelle simulation' }).click()
    await expect(page.getByRole('heading', { name: 'Simulation de financement' })).toBeVisible()
    await page.screenshot({ path: path.join(outDir, '02-financing-modal-1440px.png') })
    await page.getByRole('button', { name: 'Annuler' }).click()

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/profile/financing')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: path.join(outDir, '02-financing-375px.png'), fullPage: true })

    expect(consoleErrors).toEqual([])
  })

  test('Satisfaction & Accounting (375px + 1440px)', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await forceSignIn(page, user)

    // 3. Satisfaction Page
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/profile/satisfaction')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Satisfaction client' })).toBeVisible()
    await expect(page.getByText('Mme Claire Fontaine')).toBeVisible()
    await page.screenshot({ path: path.join(outDir, '03-satisfaction-375px.png'), fullPage: true })

    // Exercise mark sent
    await page.getByRole('button', { name: 'Marquer envoyé' }).click()
    await page.waitForTimeout(1000)
    await expect(page.getByText('Rien à suivre pour le moment')).toBeVisible()

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/profile/satisfaction')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: path.join(outDir, '03-satisfaction-empty-1440px.png'), fullPage: true })

    // 4. Accounting Export Page
    await page.goto('/profile/accounting-export')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Export comptable' })).toBeVisible()
    await page.screenshot({ path: path.join(outDir, '04-accounting-1440px.png'), fullPage: true })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/profile/accounting-export')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: path.join(outDir, '04-accounting-375px.png'), fullPage: true })

    expect(consoleErrors).toEqual([])
  })

  test('Migration, Team, Profile & Business Settings (375px + 1440px)', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await forceSignIn(page, user)

    // 5. Migration Page
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/profile/migration')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Reprendre mes données' })).toBeVisible()
    // Click on Tolteck software source
    await page.getByRole('button', { name: 'Tolteck' }).click()
    await expect(page.getByText('Comment exporter depuis Tolteck')).toBeVisible()
    await page.screenshot({ path: path.join(outDir, '05-migration-1440px.png'), fullPage: true })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/profile/migration')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: path.join(outDir, '05-migration-375px.png'), fullPage: true })

    // 6. Team Page
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/profile/team')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Équipe et intervenants' })).toBeVisible()
    await expect(page.getByText('Lucas Martin')).toBeVisible()
    await page.screenshot({ path: path.join(outDir, '06-team-1440px.png'), fullPage: true })

    // Exercise toggle active
    const deactBtn = page.getByRole('button', { name: 'Désactiver' }).first()
    await deactBtn.click()
    await page.waitForTimeout(500)

    // Open create employee modal
    await page.getByRole('button', { name: 'Ajouter' }).click()
    await expect(page.getByRole('heading', { name: 'Nouveau collaborateur' })).toBeVisible()
    await page.screenshot({ path: path.join(outDir, '06-team-modal-1440px.png') })
    await page.getByRole('button', { name: 'Annuler' }).click()

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/profile/team')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: path.join(outDir, '06-team-375px.png'), fullPage: true })

    // 7. Profile Page
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/profile')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('BatiPro Rénovation SAS')).toBeVisible()
    await page.screenshot({ path: path.join(outDir, '07-profile-1440px.png'), fullPage: true })

    // Open delete account modal
    await page.getByRole('button', { name: 'Supprimer définitivement mon compte' }).click()
    await expect(page.getByRole('heading', { name: 'Supprimer définitivement ton compte ?' })).toBeVisible()
    await page.screenshot({ path: path.join(outDir, '07-profile-delete-modal-1440px.png') })
    await page.getByRole('button', { name: 'Annuler' }).click()

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/profile')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: path.join(outDir, '07-profile-375px.png'), fullPage: true })

    // 8. Business Settings Page
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/profile/business')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Informations entreprise' })).toBeVisible()
    await expect(page.getByPlaceholder('cabinet-comptable@exemple.fr')).toHaveValue('comptable@cabinet-fiduciaire.fr')
    await page.screenshot({ path: path.join(outDir, '08-business-1440px.png'), fullPage: true })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/profile/business')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: path.join(outDir, '08-business-375px.png'), fullPage: true })

    expect(consoleErrors).toEqual([])
  })
})

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

test.describe('16.6 Kōv Agent Flagship Redesign Visual Verification', () => {
  const outDir = path.resolve(process.cwd(), '.scratch-a11y/redesign-16-6')
  let user: { id: string; email: string; password: string }
  let clientId: string

  test.beforeAll(async () => {
    fs.mkdirSync(outDir, { recursive: true })
    user = await createVisualTestUser('cluster-16-6-agent')

    // Seed a real client
    const clients = (await adminFetch('clients', {
      method: 'POST',
      body: JSON.stringify([
        {
          owner_id: user.id,
          name: 'M. Laurent Dubois',
          phone: '06 98 76 54 32',
          email: 'laurent.dubois@example.com',
          address: '22 Avenue Jean Jaurès, 69007 Lyon',
        },
      ]),
      headers: { Prefer: 'return=representation' },
    })) as Array<{ id: string }>
    clientId = clients[0].id
  })

  test.afterAll(async () => {
    try {
      if (clientId) {
        await adminFetch(`agent_action_plans?owner_id=eq.${user.id}`, { method: 'DELETE' }).catch(() => {})
        await adminFetch(`ai_runs?owner_id=eq.${user.id}`, { method: 'DELETE' }).catch(() => {})
        await adminFetch(`clients?id=eq.${clientId}`, { method: 'DELETE' }).catch(() => {})
      }
      if (user) {
        await deleteVisualTestUser(user.id).catch(() => {})
      }
    } catch (e) {
      console.error('Cleanup error in verify-16-6:', e)
    }
  })

  test('Kōv Agent: Idle state with background ambient depth and watermark (375px + 1440px)', async ({
    page,
  }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await forceSignIn(page, user)

    // Navigate to /agent
    await page.goto('/agent')
    await page.waitForSelector('main[data-slot="agent-surface"]')
    await page.waitForSelector('div[data-slot="agent-response-bubble"]')

    // 1440px viewport
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(outDir, 'agent-idle-1440px.png') })

    // 375px viewport
    await page.setViewportSize({ width: 375, height: 812 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(outDir, 'agent-idle-375px.png') })

    expect(consoleErrors).toEqual([])
  })

  test('Kōv Agent: Disambiguation state with gold IntentConfirmationChip and action pills', async ({
    page,
  }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await forceSignIn(page, user)

    // Mock intent-extract for disambiguation state
    await page.route('**/functions/v1/agent-intent-extract', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          detected_intent: null,
          intent_confidence: 0.45,
          second_best_confidence: 0.4,
          matched_client: {
            id: clientId,
            name_as_understood: 'M. Laurent Dubois',
            match_confidence: 0.95,
          },
          matched_project: { id: null, name_as_understood: '', match_confidence: 0 },
          needs_disambiguation: true,
          fallback_suggestions: [
            { label: 'Rapport de chantier terminé', intent: 'rapport_termine' },
            { label: 'Relance client', intent: 'relance' },
            { label: 'Résumé de la journée', intent: 'journee' },
          ],
        }),
      })
    })

    await page.goto('/agent')
    await page.waitForSelector('main[data-slot="agent-surface"]')

    // Fill utterance
    const input = page.getByPlaceholder('Écris ou dicte ta demande...')
    await input.fill('J’ai fini le chantier Dubois aujourd’hui')
    await page.getByRole('button', { name: 'Envoyer' }).click()

    // Wait for disambiguation state
    await page.waitForSelector('div[data-slot="intent-confirmation-chip"]')
    await expect(page.getByText('Client : M. Laurent Dubois')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Rapport de chantier terminé' })).toBeVisible()

    // 1440px
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(outDir, 'agent-disambiguation-1440px.png') })

    // 375px
    await page.setViewportSize({ width: 375, height: 812 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(outDir, 'agent-disambiguation-375px.png') })

    expect(consoleErrors).toEqual([])
  })

  test('Kōv Agent: Full PlanReviewCard with step removal, MoEnvoiModal, and live execution', async ({
    page,
  }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    // Seed ai_runs first (required by agent_action_plans FK)
    const aiRuns = (await adminFetch('ai_runs', {
      method: 'POST',
      body: JSON.stringify([
        {
          owner_id: user.id,
          run_type: 'agent_plan',
          model_id: 'claude-3-5-sonnet',
          prompt_version: 'v1',
          status: 'completed',
        },
      ]),
      headers: { Prefer: 'return=representation' },
    })) as Array<{ id: string }>
    const aiRunId = aiRuns[0].id

    // Seed a real agent_action_plan in DB for live test
    const planRows = (await adminFetch('agent_action_plans', {
      method: 'POST',
      body: JSON.stringify([
        {
          owner_id: user.id,
          ai_run_id: aiRunId,
          source_utterance: 'Clôturer le chantier Dubois',
          status: 'proposed',
          plan_steps: {
            plan_summary: 'Clôture du chantier et envoi du rapport à M. Laurent Dubois',
            steps: [
              {
                step_id: 'step-1',
                step_type: 'send_message',
                description: 'Envoyer un SMS de fin de chantier à M. Laurent Dubois',
                target_channel: 'sms',
                recipient: '06 98 76 54 32',
                message_text:
                  'Bonjour M. Dubois, les travaux de plomberie sont terminés. Merci de votre confiance !',
                removable: true,
              },
              {
                step_id: 'step-2',
                step_type: 'update_status',
                description: 'Mettre à jour le statut du chantier en Terminé',
                removable: true,
              },
              {
                step_id: 'step-3',
                step_type: 'create_journal_entry',
                description: 'Enregistrer une note de clôture dans la main courante',
                removable: false,
              },
            ],
          },
        },
      ]),
      headers: { Prefer: 'return=representation' },
    })) as Array<{ id: string }>
    const planId = planRows[0].id

    // Setup routes
    await page.route('**/functions/v1/agent-intent-extract', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          detected_intent: 'rapport_termine',
          intent_confidence: 0.96,
          second_best_confidence: 0.2,
          matched_client: {
            id: clientId,
            name_as_understood: 'M. Laurent Dubois',
            match_confidence: 0.98,
          },
          matched_project: { id: null, name_as_understood: '', match_confidence: 0 },
          needs_disambiguation: false,
          fallback_suggestions: [],
        }),
      })
    })

    await page.route('**/functions/v1/agent-plan-generate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: planId,
          status: 'proposed',
          created_at: new Date().toISOString(),
          plan_steps: {
            plan_summary: 'Clôture du chantier et envoi du rapport à M. Laurent Dubois',
            steps: [
              {
                step_id: 'step-1',
                step_type: 'send_message',
                description: 'Envoyer un SMS de fin de chantier à M. Laurent Dubois',
                target_channel: 'sms',
                recipient: '06 98 76 54 32',
                message_text:
                  'Bonjour M. Dubois, les travaux de plomberie sont terminés. Merci de votre confiance !',
                removable: true,
              },
              {
                step_id: 'step-2',
                step_type: 'update_status',
                description: 'Mettre à jour le statut du chantier en Terminé',
                removable: true,
              },
              {
                step_id: 'step-3',
                step_type: 'create_journal_entry',
                description: 'Enregistrer une note de clôture dans la main courante',
                removable: false,
              },
            ],
          },
        }),
      })
    })

    await forceSignIn(page, user)
    await page.goto('/agent')
    await page.waitForSelector('main[data-slot="agent-surface"]')

    // Send utterance
    const input = page.getByPlaceholder('Écris ou dicte ta demande...')
    await input.fill('Clôturer le chantier Dubois')
    await page.getByRole('button', { name: 'Envoyer' }).click()

    // Wait for PlanReviewCard
    await page.waitForSelector('div[data-slot="plan-review-card"]')
    await expect(page.getByText("Clôture du chantier et envoi du rapport à M. Laurent Dubois")).toBeVisible()
    await expect(page.getByText('Rien n’est envoyé avant validation')).toBeVisible()

    // 1. Remove step 2 via its remove button
    const removeBtn = page.getByRole('button', { name: 'Retirer cette étape' }).nth(1)
    await removeBtn.click()

    // Screenshot PlanReviewCard with step removed (at 1440px & 375px)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(outDir, 'agent-plan-card-1440px.png') })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(outDir, 'agent-plan-card-375px.png') })

    // 2. Open "Lire le message" modal
    await page.getByRole('button', { name: 'Lire le message' }).click()
    await page.waitForSelector('h2:has-text("Lire le message")')
    await expect(page.getByText('Canal : SMS')).toBeVisible()

    // Screenshot MoEnvoiModal
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(outDir, 'agent-mo-envoi-modal-1440px.png') })

    // Edit message and save
    const textarea = page.locator('textarea')
    await textarea.fill(
      'Bonjour M. Dubois, vos travaux sont validés et terminés ! Cordialement, votre artisan.'
    )
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    // Confirm that (modifié) tag appears
    await expect(page.getByText('(modifié)')).toBeVisible()

    // 3. Confirm the plan: "OUI, confirmer"
    const confirmBtn = page.getByRole('button', { name: 'OUI, confirmer' })
    await confirmBtn.click()

    // Wait for execution summary
    await expect(page.getByText('2 actions exécutées.', { exact: true })).toBeVisible()

    // Screenshot executed state
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(outDir, 'agent-executed-1440px.png') })

    expect(consoleErrors).toEqual([])
  })
})

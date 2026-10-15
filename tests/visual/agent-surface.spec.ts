import { test, expect } from '@playwright/test'
import {
  createVisualTestUser,
  deleteVisualTestUser,
  setTheme,
  signIn,
  type VisualTestUser,
} from './fixtures'

/**
 * Kōv Agent conversation surface + plan-review card — docs/03_MasterPrompts.md
 * §14.2.5 item 2's explicit named highest-risk screen (the flagship
 * differentiator, per docs/02_ThemeGuideline.md §6.9). The agent-intent-extract
 * and agent-plan-generate Edge Functions are undeployed (known, documented
 * blocker) — mocked at the network level here ONLY because there is no
 * deployed real endpoint to call at all, matching the exact same mocking
 * posture already used for Step 12's live UI verification (every other
 * layer — real sign-in, real render, real DOM — stays real).
 */

const VIEWPORTS = [
  { name: '320', width: 320, height: 900 },
  { name: '375', width: 375, height: 900 },
  { name: '768', width: 768, height: 1000 },
  { name: '1024', width: 1024, height: 1000 },
  { name: '1440', width: 1440, height: 1000 },
]

test.describe('Kōv Agent surface — empty state and plan-review card', () => {
  let user: VisualTestUser

  test.beforeAll(async () => {
    user = await createVisualTestUser('agent')
  })

  test.afterAll(async () => {
    await deleteVisualTestUser(user.id)
  })

  test('empty conversation surface — all breakpoints × modes', async ({ page }) => {
    await signIn(page, user)
    await page.goto('/agent')
    await page.waitForSelector('text=Agent Kōv', { timeout: 15000 })

    for (const viewport of VIEWPORTS) {
      for (const theme of ['dark', 'light'] as const) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await setTheme(page, theme)
        await page.waitForTimeout(300)
        await expect(page).toHaveScreenshot(`agent-empty-${viewport.name}-${theme}.png`)
      }
    }
  })

  test('plan-review card — all breakpoints × modes', async ({ page }) => {
    await page.route('**/functions/v1/agent-intent-extract', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          detected_intent: 'livraison',
          intent_confidence: 0.92,
          second_best_confidence: 0.1,
          matched_client: {
            id: 'fake-client-id',
            name_as_understood: 'Client Visuel',
            match_confidence: 1,
          },
          matched_project: { id: null, name_as_understood: null, match_confidence: 0 },
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
          id: 'fake-plan-id',
          status: 'proposed',
          created_at: new Date().toISOString(),
          plan_steps: {
            plan_summary: 'Informer le client du retard de livraison des matériaux.',
            steps: [
              {
                step_id: 'step-1',
                step_type: 'send_message',
                removable: true,
                target_channel: 'sms',
                recipient: '+33612345678',
                message_text:
                  'Bonjour, la livraison de vos matériaux est retardée de 3 jours, nous vous tenons informé.',
                description: 'Envoyer un SMS au client pour l’informer du retard',
              },
              {
                step_id: 'step-2',
                step_type: 'log_note',
                removable: true,
                target_channel: null,
                recipient: null,
                message_text: 'Retard fournisseur constaté.',
                description: 'Noter le retard sur le chantier',
              },
            ],
          },
        }),
      })
    })

    await signIn(page, user)
    await page.goto('/agent')
    await page.waitForSelector('text=Agent Kōv', { timeout: 15000 })
    await page.getByPlaceholder(/demande/).fill('Le fournisseur a du retard sur la livraison.')
    await page.getByRole('button', { name: 'Envoyer' }).click()
    await page.waitForSelector('text=Informer le client', { timeout: 10000 })

    for (const viewport of VIEWPORTS) {
      for (const theme of ['dark', 'light'] as const) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await setTheme(page, theme)
        await page.waitForTimeout(300)
        await expect(page).toHaveScreenshot(`agent-plan-review-${viewport.name}-${theme}.png`)
      }
    }
  })
})

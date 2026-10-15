import { test, expect } from '@playwright/test'
import {
  createVisualTestUser,
  deleteVisualTestUser,
  seedQuoteAtMargin,
  setTheme,
  signIn,
  type VisualTestUser,
} from './fixtures'

/**
 * MarginBox at each of the four tier colors — docs/03_MasterPrompts.md
 * §14.2.5 item 2's explicit named highest-risk screen. Four seeded test
 * quotes, one landing in each tier (green >30%, steelBlue >20%, gold >10%
 * down through 0-10%, red <=0% — exact boundaries from src/lib/calc/marginTier.ts),
 * so the diff suite genuinely exercises all four, not just whichever tier a
 * random seed happens to produce.
 *
 * One sign-in + one seeded quote per tier (not per viewport/theme
 * combination) — viewport and theme are changed in-page within the same
 * session, keeping the suite's real network/seeding cost proportional to
 * the number of DISTINCT fixtures needed, not the full breakpoint×mode
 * matrix.
 */

const TIERS: Array<{ name: string; marginPct: number }> = [
  { name: 'green', marginPct: 35 },
  { name: 'steel-blue', marginPct: 25 },
  { name: 'gold', marginPct: 5 },
  { name: 'red', marginPct: -10 },
]

const VIEWPORTS = [
  { name: '320', width: 320, height: 900 },
  { name: '375', width: 375, height: 900 },
  { name: '768', width: 768, height: 1000 },
  { name: '1024', width: 1024, height: 1000 },
  { name: '1440', width: 1440, height: 1000 },
]

test.describe('MarginBox — quote editor Devis step, all four tiers', () => {
  let user: VisualTestUser

  test.beforeAll(async () => {
    user = await createVisualTestUser('marginbox')
  })

  test.afterAll(async () => {
    await deleteVisualTestUser(user.id)
  })

  for (const tier of TIERS) {
    test(`${tier.name} tier — all breakpoints × modes`, async ({ page }) => {
      const { quoteId } = await seedQuoteAtMargin(user.id, tier.marginPct)
      await signIn(page, user)
      await page.goto(`/quotes/${quoteId}/edit`)
      await page.waitForSelector('[data-slot="margin-box"]', { timeout: 15000 })

      for (const viewport of VIEWPORTS) {
        for (const theme of ['dark', 'light'] as const) {
          await page.setViewportSize({ width: viewport.width, height: viewport.height })
          await setTheme(page, theme)
          await page.waitForTimeout(300) // settle resize/theme transition
          await expect(page).toHaveScreenshot(
            `margin-box-${tier.name}-${viewport.name}-${theme}.png`,
          )
        }
      }
    })
  }
})

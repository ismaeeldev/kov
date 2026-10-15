import { test, expect } from '@playwright/test'
import {
  createVisualTestUser,
  deleteVisualTestUser,
  setTheme,
  signIn,
  type VisualTestUser,
} from './fixtures'

/**
 * Home action list (morning/evening variants) and the bottom-tab-nav/
 * side-rail breakpoint boundary — docs/03_MasterPrompts.md §14.2.5 item 2's
 * explicit named highest-risk screens. Time-of-day is forced deterministically
 * WITHOUT Playwright's page.clock API — page.clock (install/setFixedTime alike)
 * fakes the browser's global Date, which this app's real Supabase auth client
 * reads to validate its JWT's `exp` claim against; faking it makes every
 * session look perpetually expired, so GoTrueClient loops on token refresh
 * and the app never finishes its initial data fetch (confirmed live: 3
 * refresh calls in 3s, page stuck on its loading skeleton forever). Instead,
 * `page.addInitScript` patches ONLY `Date.prototype.getHours()` — the one
 * method HomePage.tsx's `isEvening` check actually reads — leaving every
 * other Date behavior (epoch/getTime, used by JWT validation) untouched.
 */
async function forceHour(page: import('@playwright/test').Page, hour: number) {
  await page.addInitScript((h) => {
    const OriginalDate = Date
    class PatchedDate extends OriginalDate {
      getHours() {
        return h
      }
    }
    // @ts-expect-error narrow test-only global override
    window.Date = PatchedDate
  }, hour)
}

const VIEWPORTS = [
  { name: '320', width: 320, height: 900 },
  { name: '375', width: 375, height: 900 },
  { name: '768', width: 768, height: 1000 },
  { name: '1024', width: 1024, height: 1000 },
  { name: '1440', width: 1440, height: 1000 },
]

test.describe('Home action list — morning and evening variants', () => {
  let user: VisualTestUser

  test.beforeAll(async () => {
    user = await createVisualTestUser('home')
  })

  test.afterAll(async () => {
    await deleteVisualTestUser(user.id)
  })

  for (const [variant, hour] of [
    ['morning', 9],
    ['evening', 19],
  ] as const) {
    test(`${variant} variant — all breakpoints × modes`, async ({ page }) => {
      await forceHour(page, hour)
      await signIn(page, user)
      await page.goto('/home')
      await page.getByRole('heading', { name: 'Accueil' }).waitFor({ timeout: 15000 })

      for (const viewport of VIEWPORTS) {
        for (const theme of ['dark', 'light'] as const) {
          await page.setViewportSize({ width: viewport.width, height: viewport.height })
          await setTheme(page, theme)
          await page.waitForTimeout(300)
          await expect(page).toHaveScreenshot(`home-${variant}-${viewport.name}-${theme}.png`)
        }
      }
    })
  }
})

test.describe('Nav — bottom-tab-nav / side-rail breakpoint boundary', () => {
  let user: VisualTestUser

  test.beforeAll(async () => {
    user = await createVisualTestUser('nav')
  })

  test.afterAll(async () => {
    await deleteVisualTestUser(user.id)
  })

  test('boundary just below/at/above 1024px', async ({ page }) => {
    await signIn(page, user)
    await page.goto('/home')
    await page.getByRole('heading', { name: 'Accueil' }).waitFor({ timeout: 15000 })

    for (const width of [1023, 1024, 1025]) {
      await page.setViewportSize({ width, height: 900 })
      await page.waitForTimeout(200)
      await expect(page).toHaveScreenshot(`nav-boundary-${width}.png`)
    }
  })
})

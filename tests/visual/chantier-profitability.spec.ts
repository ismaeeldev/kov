import { test, expect } from '@playwright/test'
import {
  createVisualTestUser,
  deleteVisualTestUser,
  seedChantierWithProfitability,
  setTheme,
  signIn,
  type VisualTestUser,
} from './fixtures'

/**
 * Chantier profitability screen — docs/03_MasterPrompts.md §14.2.5 item 2's
 * explicit named highest-risk screen, both the loading SKELETON and the
 * loaded/revealed state (the skeleton must be sized to exactly match the
 * eventual layout to avoid a layout-shift jump, per §14.2 item 2 — this
 * suite's skeleton screenshot is what future changes get diffed against to
 * catch a skeleton/loaded mismatch regression).
 */

const VIEWPORTS = [
  { name: '320', width: 320, height: 900 },
  { name: '375', width: 375, height: 900 },
  { name: '768', width: 768, height: 1000 },
  { name: '1024', width: 1024, height: 1000 },
  { name: '1440', width: 1440, height: 1000 },
]

test.describe('Chantier profitability — skeleton and loaded states', () => {
  let user: VisualTestUser
  let projectId: string

  test.beforeAll(async () => {
    user = await createVisualTestUser('chantier')
    const seeded = await seedChantierWithProfitability(user.id)
    projectId = seeded.projectId
  })

  test.afterAll(async () => {
    await deleteVisualTestUser(user.id)
  })

  test('loaded/revealed state — all breakpoints × modes', async ({ page }) => {
    await signIn(page, user)
    await page.goto(`/projects/${projectId}`)
    await page.waitForSelector('text=Fournitures', { timeout: 15000 })

    for (const viewport of VIEWPORTS) {
      for (const theme of ['dark', 'light'] as const) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await setTheme(page, theme)
        await page.waitForTimeout(400) // settle the profitability-reveal motion moment
        await expect(page).toHaveScreenshot(`chantier-loaded-${viewport.name}-${theme}.png`)
      }
    }
  })

  test('loading skeleton state — mobile + desktop', async ({ page }) => {
    test.setTimeout(60_000) // two viewports × 8s artificial route delay + screenshot stabilization
    await signIn(page, user)
    // Throttle to genuinely capture the skeleton before data arrives —
    // ProjectDetailPage.tsx's Promise.all fires three parallel requests
    // (projects, project_costs, project_updates); the glob must match ONLY
    // the /projects endpoint's exact query-string shape, not incidentally
    // also match /project_costs or /project_updates (an earlier version of
    // this pattern, `**/rest/v1/projects*`, did exactly that ambiguous
    // over-match, and — combined with a silently-swallowed wait timeout —
    // produced a screenshot of the fully-loaded page instead of the
    // skeleton, a real bug in this test file, not the app). Delaying only
    // the /projects request is sufficient: the skeleton branch renders
    // whenever `project === null`, regardless of whether the other two
    // requests have resolved.
    // Delay must comfortably outlast toHaveScreenshot's own stabilization
    // retry loop (up to ~5s of repeated captures waiting for two identical
    // consecutive frames) — 1500ms let the real data arrive and replace the
    // skeleton mid-comparison, so the "actual" capture ended up showing the
    // fully loaded page diffed against the skeleton baseline (a real bug,
    // caught only once the diff threshold was tightened in Step 14.2.5's
    // deliberate-regression validation).
    await page.route(
      (url) => url.pathname === '/rest/v1/projects' && url.searchParams.has('id'),
      async (route) => {
        await new Promise((r) => setTimeout(r, 8000))
        await route.continue()
      },
    )

    for (const viewport of [VIEWPORTS[1], VIEWPORTS[3]]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto(`/projects/${projectId}`)
      // No .catch() swallow — if the skeleton never appears, this test
      // SHOULD fail loudly (it would mean the delay/selector stopped
      // working), not silently screenshot whatever happened to be on
      // screen and diff it against a skeleton baseline.
      await page.waitForSelector('[data-slot="skeleton"]', { timeout: 5000 })
      await expect(page).toHaveScreenshot(`chantier-skeleton-${viewport.name}.png`)
    }
  })
})

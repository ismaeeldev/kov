import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  createVisualTestUser,
  deleteVisualTestUser,
  seedChantierWithProfitability,
  seedQuoteAtMargin,
  signIn,
  type VisualTestUser,
} from './fixtures'

/**
 * Full-route axe-core accessibility sweep — docs/03_MasterPrompts.md §14.2's
 * "full per-route axe DevTools accessibility scan across ALL routes at ALL
 * breakpoints" item, and most of §14.5's dedicated accessibility pass (ARIA
 * labels, contrast, focus — axe-core's WCAG2A/AA ruleset covers all three).
 * Real automated scan (@axe-core/playwright) against the live dev server +
 * live Supabase backend, not a manual DevTools click-through — gives the
 * same coverage, reproducibly, in CI going forward.
 *
 * Every route asserts zero 'critical' or 'serious' violations. 'moderate'/
 * 'minor' violations are logged (console.log) but not asserted on — per
 * §14.7's own testing checklist wording ("axe DevTools shows 0 critical or
 * serious violations"), moderate/minor are worth knowing about but not a
 * hard gate.
 */

const VIEWPORTS = [
  { name: '375 (mobile)', width: 375, height: 900 },
  { name: '1440 (desktop)', width: 1440, height: 1000 },
]

async function scanAndAssert(page: import('@playwright/test').Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()

  const critical = results.violations.filter((v) => v.impact === 'critical')
  const serious = results.violations.filter((v) => v.impact === 'serious')
  const other = results.violations.filter((v) => v.impact !== 'critical' && v.impact !== 'serious')

  if (other.length > 0) {
    console.log(
      `[a11y-sweep] ${label}: ${other.length} moderate/minor violation(s) — ${other
        .map((v) => `${v.id} (${v.impact}, ${v.nodes.length}x)`)
        .join(', ')}`,
    )
  }

  const blocking = [...critical, ...serious]
  expect(
    blocking,
    `${label}: ${blocking.length} critical/serious violation(s) — ${blocking
      .map((v) => `${v.id} (${v.impact}): ${v.help} [${v.nodes.length}x]`)
      .join(' | ')}`,
  ).toEqual([])
}

test.describe('Full-route accessibility sweep (axe-core, WCAG2 A/AA)', () => {
  let user: VisualTestUser
  let quoteId: string
  let projectId: string

  let clientId: string

  test.beforeAll(async () => {
    user = await createVisualTestUser('a11y')
    const quote = await seedQuoteAtMargin(user.id, 35)
    quoteId = quote.quoteId
    clientId = quote.clientId
    const chantier = await seedChantierWithProfitability(user.id)
    projectId = chantier.projectId
  })

  test.afterAll(async () => {
    await deleteVisualTestUser(user.id)
  })

  const ROUTES = [
    { path: '/home', label: 'Home' },
    { path: '/planning', label: 'Planning' },
    { path: '/quotes', label: 'Quotes list' },
    { path: () => `/quotes/${quoteId}/edit`, label: 'Quote editor' },
    { path: '/clients', label: 'Clients list' },
    { path: () => `/clients/${clientId}`, label: 'Client detail' },
    { path: '/projects/:id', label: 'Chantier detail', resolve: () => `/projects/${projectId}` },
    { path: '/agent', label: 'Agent' },
    { path: '/unpaid', label: 'Unpaid' },
    { path: '/invoices', label: 'Invoices' },
    { path: '/orders', label: 'Orders' },
    { path: '/messages', label: 'Messages' },
    { path: '/profile', label: 'Profile' },
    { path: '/profile/business', label: 'Profile — business info' },
    { path: '/profile/price-library', label: 'Profile — price library' },
    { path: '/profile/technical-sheets', label: 'Profile — technical sheets' },
    { path: '/profile/team', label: 'Profile — team' },
    { path: '/profile/accounting-export', label: 'Profile — accounting export' },
    { path: '/profile/migration', label: 'Profile — migration' },
    { path: '/profile/financing', label: 'Profile — financing' },
    { path: '/profile/satisfaction', label: 'Profile — satisfaction' },
  ]

  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`${route.label} — ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await signIn(page, user)
        const target =
          typeof route.path === 'function'
            ? route.path()
            : 'resolve' in route && route.resolve
              ? route.resolve()
              : route.path
        await page.goto(target as string)
        await page.waitForLoadState('networkidle')
        await scanAndAssert(page, `${route.label} (${viewport.name})`)
      })
    }
  }

  test('Sign-in (unauthenticated) — 375 (mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 })
    await page.goto('/sign-in')
    await page.waitForLoadState('networkidle')
    await scanAndAssert(page, 'Sign-in (375 mobile)')
  })

  test('Sign-in (unauthenticated) — 1440 (desktop)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/sign-in')
    await page.waitForLoadState('networkidle')
    await scanAndAssert(page, 'Sign-in (1440 desktop)')
  })
})

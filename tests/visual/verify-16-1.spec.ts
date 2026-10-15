import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import {
  createVisualTestUser,
  deleteVisualTestUser,
  signIn,
} from './fixtures'

test.describe('16.1 Shared component & design-token layer verification', () => {
  let user: { id: string; email: string; password: string }
  const outDir = path.resolve(process.cwd(), '.scratch-a11y/redesign-16-1')

  test.beforeAll(async () => {
    fs.mkdirSync(outDir, { recursive: true })
    user = await createVisualTestUser('shared-16-1')
  })

  test.afterAll(async () => {
    if (user?.id) {
      await deleteVisualTestUser(user.id)
    }
  })

  test('Component Preview renders all shared component states at 375px and 1440px with zero errors', async ({
    page,
  }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    // Mobile viewport (375px)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('http://localhost:5174/__dev/components')
    await page.waitForSelector('[data-slot="bottom-tab-nav"]')
    await page.screenshot({ path: path.join(outDir, '01-component-preview-375px.png'), fullPage: true })

    // Desktop viewport (1440px)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('http://localhost:5174/__dev/components')
    await page.waitForSelector('[data-slot="side-nav-rail"]')
    await page.screenshot({ path: path.join(outDir, '02-component-preview-1440px.png'), fullPage: true })

    expect(consoleErrors).toEqual([])
  })

  test('Nav chrome (bottom tabs & side rail) is visible during loading throttle', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    // Sign in first
    await page.setViewportSize({ width: 375, height: 812 })
    await signIn(page, user)

    // Delay Supabase rest calls by 2 seconds to capture loading state
    await page.route('**/rest/v1/**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500))
      await route.continue()
    })

    // Navigate to /quotes on mobile
    await page.goto('http://localhost:5174/quotes')
    // Check bottom tab nav is rendered during loading
    const bottomNav = page.locator('[data-slot="bottom-tab-nav"]')
    await expect(bottomNav).toBeVisible()
    await page.screenshot({ path: path.join(outDir, '03-loading-chrome-375px.png') })

    // Check desktop viewport
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('http://localhost:5174/quotes')
    const sideRail = page.locator('[data-slot="side-nav-rail"]')
    await expect(sideRail).toBeVisible()
    await page.screenshot({ path: path.join(outDir, '04-loading-chrome-1440px.png') })

    expect(consoleErrors).toEqual([])
  })

  test('BottomTabNav and SideNavRail interactive states switch cleanly', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('http://localhost:5174/__dev/components')

    // Test tab selection on SideNavRail
    const sideRail = page.locator('[data-slot="side-nav-rail"]').first()
    const clientsBtn = sideRail.locator('button:has-text("Clients")')
    await clientsBtn.click()
    await expect(clientsBtn).toHaveClass(/text-brand-300/)

    // Mobile BottomTabNav
    await page.setViewportSize({ width: 375, height: 812 })
    const bottomNav = page.locator('[data-slot="bottom-tab-nav"]').first()
    const devisTab = bottomNav.locator('button:has-text("Devis")')
    await devisTab.click()
    await expect(devisTab).toHaveClass(/text-brand-300/)
    await page.screenshot({ path: path.join(outDir, '05-nav-active-tabs-375px.png') })
  })
})

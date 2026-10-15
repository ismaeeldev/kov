import { defineConfig, devices } from '@playwright/test'

/**
 * Visual-regression config — docs/03_MasterPrompts.md §14.2.5. Playwright is
 * the primary pixel-perfect tool for this project (free, local/CI-friendly,
 * no recurring SaaS cost) — see tests/visual/ for the actual suite.
 */
export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: false, // seeded fixtures share one test account per file — avoid cross-test races
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,
  expect: {
    // Lowered from the master prompt's starting 0.01 after the deliberate-
    // regression validation step proved 0.01 too coarse: a full-page
    // 1440×1000 screenshot is 1.44M px, so a small text-only change (e.g.
    // MarginBox's advisory line, ~7k px) never crosses a 1% (14.4k px)
    // threshold. 0.001 (1.44k px on that same viewport) still tolerates
    // anti-aliasing/font-hinting noise but catches small text regressions.
    toHaveScreenshot: { maxDiffPixelRatio: 0.001 },
  },
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})

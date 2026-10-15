import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import {
  createFreshUserForOnboarding,
  deleteVisualTestUser,
} from './fixtures'

test.describe('16.2 Auth & Onboarding redesign verification', () => {
  const outDir = path.resolve(process.cwd(), '.scratch-a11y/redesign-16-2')
  let createdUserId: string | null = null

  test.beforeAll(async () => {
    fs.mkdirSync(outDir, { recursive: true })
  })

  test.afterAll(async () => {
    if (createdUserId) {
      await deleteVisualTestUser(createdUserId)
    }
  })

  test('Screenshots of SignIn, SignUp, ForgotPassword at 375px and 1440px', async ({ page }) => {
    const unhandledErrors: string[] = []
    page.on('pageerror', (err) => unhandledErrors.push(err.message))

    // 1. Sign In (375px)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('http://localhost:5174/sign-in')
    await page.evaluate(() => localStorage.clear())
    await page.goto('http://localhost:5174/sign-in')
    await page.waitForSelector('h1:has-text("Bon retour")')
    await page.screenshot({ path: path.join(outDir, '01-sign-in-375px.png') })

    // 1. Sign In (1440px)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('http://localhost:5174/sign-in')
    await page.waitForSelector('h1:has-text("Bon retour")')
    await page.screenshot({ path: path.join(outDir, '02-sign-in-1440px.png') })

    // Test error state on sign-in
    await page.getByLabel('Email').fill('nonexistent-user@example.test')
    await page.getByLabel('Mot de passe').fill('WrongPassword123!')
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await page.waitForSelector('text=Email ou mot de passe incorrect.')
    await page.screenshot({ path: path.join(outDir, '03-sign-in-error-1440px.png') })

    // 2. Sign Up (375px & 1440px)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('http://localhost:5174/sign-up')
    await page.waitForSelector('h1:has-text("Créer un compte")')
    await page.screenshot({ path: path.join(outDir, '04-sign-up-375px.png') })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('http://localhost:5174/sign-up')
    await page.waitForSelector('h1:has-text("Créer un compte")')
    await page.screenshot({ path: path.join(outDir, '05-sign-up-1440px.png') })

    // 3. Forgot Password (375px & 1440px)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('http://localhost:5174/forgot-password')
    await page.waitForSelector('h1:has-text("Mot de passe oublié")')
    await page.screenshot({ path: path.join(outDir, '06-forgot-password-375px.png') })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('http://localhost:5174/forgot-password')
    await page.waitForSelector('h1:has-text("Mot de passe oublié")')
    await page.screenshot({ path: path.join(outDir, '07-forgot-password-1440px.png') })

    expect(unhandledErrors).toEqual([])
  })

  test('Full Onboarding flow walkthrough (Step 0 → Step 1 → Step 2 → Home)', async ({ page }) => {
    const unhandledErrors: string[] = []
    page.on('pageerror', (err) => unhandledErrors.push(err.message))

    // Create a fresh test account with onboarding_step = 0, onboarding_complete = false
    const freshUser = await createFreshUserForOnboarding('auth-flow')
    createdUserId = freshUser.id

    // Sign in to start onboarding
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('http://localhost:5174/sign-in')
    await page.evaluate(() => localStorage.clear())
    await page.goto('http://localhost:5174/sign-in')
    await page.waitForSelector('h1:has-text("Bon retour")')
    await page.getByLabel('Email').fill(freshUser.email)
    await page.getByLabel('Mot de passe').fill(freshUser.password)
    await page.getByRole('button', { name: 'Se connecter' }).click()

    // ProtectedRoute detects onboarding incomplete and navigates to /onboarding
    await page.waitForURL(/\/onboarding/, { timeout: 15000 })
    await page.waitForSelector('h1:has-text("Ton métier")')
    await page.screenshot({ path: path.join(outDir, '08-onboarding-step1-trade-1440px.png') })

    // Mobile screenshot for Step 1
    await page.setViewportSize({ width: 375, height: 812 })
    await page.screenshot({ path: path.join(outDir, '09-onboarding-step1-trade-375px.png') })

    // Select Trade
    await page.getByRole('button', { name: /Plomberie \/ Chauffage/ }).click()

    // Wait for Step 2 (Organisation)
    await page.waitForSelector('h1:has-text("Ton organisation")', { timeout: 10000 })
    await page.screenshot({ path: path.join(outDir, '10-onboarding-step2-team-375px.png') })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.screenshot({ path: path.join(outDir, '11-onboarding-step2-team-1440px.png') })

    // Select Team Mode
    await page.getByRole('button', { name: /Équipe/ }).click()

    // Wait for Step 3 (Entreprise)
    await page.waitForSelector('h1:has-text("Ton entreprise")', { timeout: 10000 })
    await page.screenshot({ path: path.join(outDir, '12-onboarding-step3-business-1440px.png') })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.screenshot({ path: path.join(outDir, '13-onboarding-step3-business-375px.png') })

    // Fill Business Info Form
    await page.getByLabel('Raison sociale').fill('Martin Plomberie EURL')
    await page.getByLabel('SIREN').fill('123456789')
    await page.getByLabel('Adresse').fill('14 Rue des Artisans')
    await page.getByLabel('Code postal').fill('75011')
    await page.getByLabel('Ville').fill('Paris')
    await page.getByLabel('Téléphone').fill('0612345678')
    await page.getByLabel('Email professionnel').fill(freshUser.email)
    await page.getByLabel('Mentions légales obligatoires').fill('Assurance décennale MMA Pro n°987654321')

    // Submit and finish
    await page.getByRole('button', { name: 'Terminer la configuration' }).click()

    // Confirms landing on /home
    await page.waitForURL(/\/home/, { timeout: 15000 })
    await page.waitForSelector('[data-slot="bottom-tab-nav"]')

    expect(unhandledErrors).toEqual([])
  })
})

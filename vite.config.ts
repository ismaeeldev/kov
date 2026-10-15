/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    // Windows dev paths containing spaces (e.g. "D:\WEB DEV\...") break Vitest's default
    // `forks` worker pool (worker startup times out) — `threads` works correctly here.
    pool: 'threads',
    // tests/visual/ holds Playwright specs (test:visual script) — they use
    // @playwright/test's own test.describe/test runner, not vitest's, and
    // must not be picked up by vitest's default glob.
    // tests/integration/ holds live Supabase tests requiring active network.
    exclude: ['**/node_modules/**', '**/tests/visual/**', '**/tests/integration/**'],
  },
})

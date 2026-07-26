import path from 'node:path'

import { defineConfig, devices } from '@playwright/test'

/**
 * The suite runs on DEDICATED PORTS (3100/8100), not the app's usual 3000/8000.
 * `reuseExistingServer` cannot tell our dev server from someone else's — point
 * it at an occupied port and Playwright silently tests whatever is already
 * listening (ADR-010). Isolating the ports also means `make dev` can stay up
 * while the suite runs.
 *
 * `globalSetup` builds a freshly migrated and seeded database first, so every
 * run starts identical (T-39.5).
 */

const FRONTEND_PORT = process.env.E2E_FRONTEND_PORT ?? '3100'
const BACKEND_PORT = process.env.E2E_BACKEND_PORT ?? '8100'

const FRONTEND_URL = process.env.E2E_BASE_URL ?? `http://localhost:${FRONTEND_PORT}`
const BACKEND_URL = process.env.E2E_API_URL ?? `http://localhost:${BACKEND_PORT}`

/** Pinned so "Today" means the same day the seeder anchored on. */
export const ANCHOR_DATE = '2026-07-26T09:00:00Z'

export default defineConfig({
  testDir: './tests',
  globalSetup: path.resolve(__dirname, 'global-setup.ts'),

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,

  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['list'], ['github']]
    : [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: FRONTEND_URL,
    // A failing CI run must produce something you can actually debug from.
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],

  // Playwright owns the server lifecycle, so `npm test` works from a cold clone.
  webServer: [
    {
      command: `cd ../backend && uv run uvicorn app.main:app --port ${BACKEND_PORT}`,
      url: `${BACKEND_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        DATABASE_URL: 'sqlite:///./e2e.db',
        SEED_ANCHOR_DATE: ANCHOR_DATE,
        CORS_ORIGINS: FRONTEND_URL,
      },
    },
    {
      command: `cd ../frontend && npm run dev -- --port ${FRONTEND_PORT}`,
      url: FRONTEND_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NEXT_PUBLIC_API_URL: BACKEND_URL,
      },
    },
  ],
})

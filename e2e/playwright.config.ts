import { defineConfig, devices } from '@playwright/test'

/**
 * Minimal configuration (T-01.10) — enough for CI to run a real end-to-end
 * check against both servers. T-39 expands this with the visual project,
 * the frozen clock, page objects and custom fixtures.
 *
 * The suite runs on DEDICATED PORTS (3100/8100), not the app's usual 3000/8000.
 * `reuseExistingServer` cannot tell our dev server from someone else's — point
 * it at an occupied port and Playwright silently tests whatever is already
 * listening. Isolating the ports means the suite is unaffected by whatever else
 * the developer happens to be running, and `make dev` can stay up while tests run.
 */

const FRONTEND_PORT = process.env.E2E_FRONTEND_PORT ?? '3100'
const BACKEND_PORT = process.env.E2E_BACKEND_PORT ?? '8100'

const FRONTEND_URL = process.env.E2E_BASE_URL ?? `http://localhost:${FRONTEND_PORT}`
const BACKEND_URL = process.env.E2E_API_URL ?? `http://localhost:${BACKEND_PORT}`

export default defineConfig({
  testDir: './tests',
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
        // T-39.5 points this at a disposable test database.
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

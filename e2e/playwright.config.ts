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

  /*
   * 10s rather than Playwright's 5s default.
   *
   * `/meeting/[id]` is the one route rendered ON DEMAND, so the first
   * assertion after navigating to it waits for a server render as well as for
   * the data — and with four workers competing, five seconds is genuinely
   * tight. Raising it here rather than sprinkling per-assertion timeouts
   * keeps the intent in one place: this suite tolerates a slow machine, it
   * does not tolerate a wrong answer.
   */
  expect: { timeout: 10_000 },

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

  /*
   * TWO PROJECTS, because there is ONE database.
   *
   * Until T-09 every test only read, so four workers sharing a seeded database
   * was safe. Delete-and-undo broke that: while `T09-A` has a meeting deleted,
   * `03-shell`'s "renders seeded meetings end to end" is asserting there are
   * exactly eight — and which one wins depends on scheduling. It passed alone
   * and failed in the suite, which is the signature of this class of bug.
   *
   * So tests that write are tagged `@mutates`, run in their own project, and
   * that project `dependsOn` the read-only one — Playwright finishes every
   * reader before the first writer starts. `fullyParallel: false` then keeps
   * the writers from racing each other.
   *
   * The alternative, a database per worker, needs a backend process per worker
   * too. That is the right answer for a suite ten times this size; here it
   * would cost more startup time than the whole run.
   */
  projects: [
    {
      name: 'read-only',
      grepInvert: /@mutates/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mutations',
      grep: /@mutates/,
      dependencies: ['read-only'],
      fullyParallel: false,
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
      /*
       * A PRODUCTION build, not `next dev`.
       *
       * The dev server compiles routes and RSC payloads on demand, so the first
       * client navigation in each worker took many seconds — which surfaced as
       * a debounced write to the URL "not happening" and cost an afternoon
       * before the cause was clear. Warming the routes with a plain fetch did
       * not help, because the flight path is compiled separately.
       *
       * Building first removes that entire class of flakiness AND means the
       * suite exercises what actually ships: minified, with production React
       * and no StrictMode double-invocation. It costs ~40s of build time once
       * per run, against several seconds of compile stalls per worker.
       */
      command: `cd ../frontend && npm run build && npm run start -- --port ${FRONTEND_PORT}`,
      url: FRONTEND_URL,
      reuseExistingServer: false,
      // Generous: the build is inside this budget.
      timeout: 300_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NEXT_PUBLIC_API_URL: BACKEND_URL,
        // The /dev/* surfaces are what several specs exercise, and they are
        // closed in a production build unless asked for. A real deployment
        // never sets this.
        NEXT_PUBLIC_ENABLE_DEV_SURFACES: 'true',
      },
    },
  ],
})

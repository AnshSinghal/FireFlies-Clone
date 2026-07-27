import fs from 'node:fs'
import path from 'node:path'

import { expect, test, type Page } from '@playwright/test'

/**
 * Screenshot capture for the side-by-side comparison harness (T-41.7) — @visual
 *
 * Writes one PNG per mapped surface to `docs/screenshots/`, using the keys
 * `docs/visual-comparison.html` looks for. It asserts nothing beyond "the
 * surface rendered" — it is a camera, not a test.
 *
 * NEVER part of a normal run, twice over:
 *   1. The `@visual` tag keeps it out of the read-only/mutations projects once
 *      the `visual` project greps for it.
 *   2. The `CAPTURE` guard below skips every test unless explicitly asked,
 *      so even invoking this file directly cannot dirty `docs/screenshots/`
 *      as a side effect of an ordinary suite run.
 *
 * Run it on purpose:
 *   CAPTURE=1 npx playwright test tests/99-capture.spec.ts
 *
 * Determinism matches the visual-regression rules (T-41.3): 1440×900,
 * `deviceScaleFactor: 1`, light scheme, the frozen seed clock, fonts awaited,
 * animations disabled at screenshot time.
 */

/** Must equal the seeder's SEED_ANCHOR_DATE (see ANCHOR_DATE in playwright.config.ts). */
const ANCHOR_DATE = '2026-07-26T09:00:00Z'

const OUT_DIR = path.resolve(__dirname, '../../docs/screenshots')

async function capture(page: Page, key: string): Promise<void> {
  // Font swap mid-screenshot is the classic phantom diff; wait it out, then
  // let the network settle so spinners and skeletons are gone.
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle')
  await page.screenshot({
    path: path.join(OUT_DIR, `${key}.png`),
    animations: 'disabled',
    caret: 'hide',
  })
}

test.describe('visual comparison capture @visual', () => {
  test.skip(
    !process.env.CAPTURE,
    'Capture-only spec — run deliberately with CAPTURE=1 to refresh docs/screenshots/.',
  )

  test.use({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  })

  test.beforeAll(() => {
    fs.mkdirSync(OUT_DIR, { recursive: true })
  })

  test.beforeEach(async ({ page }) => {
    // Seed dates are relative to the anchor; without this, "Today" drifts and
    // every capture after midnight disagrees with the last one.
    await page.clock.setFixedTime(new Date(ANCHOR_DATE))
  })

  test('01-home · notebook as the home hub', async ({ page }) => {
    // Fireflies' Home is a recent-meetings hub; our `/` redirects to the
    // Notebook, which is the closest surface we have to a hub.
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible()
    await capture(page, '01-home')
  })

  test('02-meetings-list · the All Meetings channel view', async ({ page }) => {
    // Same route as 01 but through the explicit "All Meetings" channel, so the
    // pair shows the list-as-list rather than the list-as-hub.
    await page.goto('/notebook?channel=all-meetings')
    await expect(page.getByTestId('meeting-list')).toBeVisible()
    await capture(page, '02-meetings-list')
  })

  test('03-meeting-status · no equivalent surface', async () => {
    test.skip(
      true,
      'Fireflies "Meeting Status" is the notetaker-bot join feed (Completed / Not allowed in). ' +
        'This clone ingests transcripts and has no bot, so there is no honest equivalent to ' +
        'photograph — the harness shows the reference with an out-of-scope badge instead.',
    )
  })

  test('04-uploads · create modal, upload tab', async ({ page }) => {
    await page.goto('/upload?tab=upload')
    await expect(page.getByTestId('create-modal')).toBeVisible()
    await expect(page.getByTestId('create-dropzone')).toBeVisible()
    await capture(page, '04-uploads')
  })

  test('05-analytics · placeholder with chart preview', async ({ page }) => {
    await page.goto('/analytics')
    await expect(page.getByTestId('coming-soon-analytics')).toBeVisible()
    await expect(page.getByTestId('analytics-charts')).toBeVisible()
    await capture(page, '05-analytics')
  })

  test('06-profile-menu · topbar avatar menu open', async ({ page }) => {
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible()
    await page.getByTestId('topbar-avatar').click()
    await expect(page.getByTestId('topbar-avatar-menu')).toBeVisible()
    await capture(page, '06-profile-menu')
  })

  test('07-settings-recording · nearest built tab is Preferences', async ({ page }) => {
    // Our "Recording & Privacy" tab is a deliberate T-30 soon-panel; the
    // Preferences tab is the nearest functional settings surface to compare
    // shell, sub-nav and form layout against.
    await page.goto('/settings?tab=preferences')
    await expect(page.getByTestId('settings-view')).toBeVisible()
    await capture(page, '07-settings-recording')
  })

  test('08-settings-ai · nearest built tab is Appearance', async ({ page }) => {
    await page.goto('/settings?tab=appearance')
    await expect(page.getByTestId('settings-view')).toBeVisible()
    await capture(page, '08-settings-ai')
  })

  test('dark theme set · pending T-38', async () => {
    test.skip(
      true,
      'The theme mechanism exists on this branch (ThemeApplier + [data-theme="dark"] tokens), ' +
        'but T-38 — the dark-mode audit — has not merged; capturing now would enshrine ' +
        'unreviewed surfaces as evidence. The harness renders "<key>-dark.png" slots as ' +
        'placeholders until those captures exist.',
    )
  })
})

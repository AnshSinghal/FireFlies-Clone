import fs from 'node:fs'
import path from 'node:path'

import { expect, test, type Page } from '@playwright/test'

/**
 * Screenshot capture for the side-by-side comparison harness (T-41.7) — @visual
 *
 * Writes one PNG per mapped surface per theme to `docs/screenshots/`, using the
 * keys `docs/visual-comparison.html` looks for: `<key>.png` for light,
 * `<key>-dark.png` for dark. It asserts nothing beyond "the surface rendered"
 * — it is a camera, not a test.
 *
 * NEVER part of a normal run, twice over:
 *   1. The `@visual` tag keeps it out of the read-only/mutations projects once
 *      the `visual` project greps for it.
 *   2. The `CAPTURE` guard below skips every test unless explicitly asked,
 *      so even invoking this file directly cannot dirty `docs/screenshots/`
 *      as a side effect of an ordinary suite run.
 *
 * Run it on purpose:
 *   CAPTURE=1 npx playwright test tests/99-capture.spec.ts --project=visual
 *
 * Determinism matches the visual-regression rules (T-41.3): 1440×900,
 * `deviceScaleFactor: 1`, the frozen seed clock, fonts awaited, animations
 * disabled at screenshot time.
 *
 * DARK (ADR-118 follow-through): the dark half waited on T-38 deliberately —
 * capturing unreviewed dark surfaces would have enshrined them as evidence in
 * a document whose whole purpose is evidence. T-38 has since merged, so both
 * themes are captured here and the harness's `-dark` slots fill themselves.
 */

/** Must equal the seeder's SEED_ANCHOR_DATE (see ANCHOR_DATE in playwright.config.ts). */
const ANCHOR_DATE = '2026-07-26T09:00:00Z'

const OUT_DIR = path.resolve(__dirname, '../../docs/screenshots')

type Theme = 'light' | 'dark'
const THEMES: readonly Theme[] = ['light', 'dark']

/** `01-home.png` in light, `01-home-dark.png` in dark — the harness's slots. */
function fileFor(key: string, theme: Theme): string {
  return path.join(OUT_DIR, theme === 'light' ? `${key}.png` : `${key}-dark.png`)
}

async function capture(page: Page, key: string, theme: Theme): Promise<void> {
  // A font swap mid-screenshot is the classic phantom diff; wait it out, then
  // wait for every image so no avatar is caught half-painted.
  await page.evaluate(() => document.fonts.ready.then(() => true))
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete))
  await page.screenshot({
    path: fileFor(key, theme),
    animations: 'disabled',
    caret: 'hide',
  })
}

for (const theme of THEMES) {
  test.describe(`visual comparison capture · ${theme} @visual`, () => {
    test.skip(
      !process.env.CAPTURE,
      'Capture-only spec — run deliberately with CAPTURE=1 to refresh docs/screenshots/.',
    )

    test.use({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    })

    test.beforeAll(() => {
      fs.mkdirSync(OUT_DIR, { recursive: true })
    })

    test.beforeEach(async ({ page }) => {
      // Seed dates are relative to the anchor; without this, "Today" drifts and
      // every capture after midnight disagrees with the last one.
      await page.clock.setFixedTime(new Date(ANCHOR_DATE))

      /*
       * The T-38 mechanism: the boot script inlined in <head> reads `ff.theme`
       * before first paint, so seeding storage before navigation means the
       * FIRST paint is already in the theme being photographed — there is no
       * white flash to catch. `emulateMedia` is set to match so anything
       * reading the OS preference directly agrees with the stored value.
       */
      await page.addInitScript(
        (value) => localStorage.setItem('ff.theme', JSON.stringify(value)),
        theme,
      )
      await page.emulateMedia({ colorScheme: theme })
    })

    test(`01-home · notebook as the home hub · ${theme}`, async ({ page }) => {
      // Fireflies' Home is a recent-meetings hub; our `/` redirects to the
      // Notebook, which is the closest surface we have to a hub.
      await page.goto('/notebook')
      await expect(page.getByTestId('meeting-list')).toBeVisible()
      await capture(page, '01-home', theme)
    })

    test(`02-meetings-list · a channel-scoped list · ${theme}`, async ({ page }) => {
      /*
       * `?channel=customer-calls`, NOT `?channel=all-meetings`.
       *
       * Two reasons, and the first one expired: this capture originally failed
       * because the built-in "All Meetings" and "My Meetings" items are
       * PSEUDO-channels with no `channels.slug` row, so the backend matched
       * nothing and the view rendered empty. That is fixed on main — the
       * built-ins resolve client-side now — so the URL works.
       *
       * The surviving reason is differentiation: with the fix, "All Meetings"
       * shows exactly what `/notebook` shows, which is already key 01, and two
       * identical photographs teach the evaluator nothing. `customer-calls` is
       * a real seeded channel, so this captures the structure the reference
       * actually shows — rail item active, scoped count, a narrowed list.
       */
      await page.goto('/notebook?channel=customer-calls')
      await expect(page.getByTestId('meeting-list')).toBeVisible()
      await capture(page, '02-meetings-list', theme)
    })

    test(`03-meeting-status · no equivalent surface · ${theme}`, async () => {
      test.skip(
        true,
        'Fireflies "Meeting Status" is the notetaker-bot join feed (Completed / Not allowed in). ' +
          'This clone ingests transcripts and has no bot, so there is no honest equivalent to ' +
          'photograph — the harness shows the reference with an out-of-scope badge instead.',
      )
    })

    test(`04-uploads · create modal, upload tab · ${theme}`, async ({ page }) => {
      await page.goto('/upload?tab=upload')
      await expect(page.getByTestId('create-modal')).toBeVisible()
      await expect(page.getByTestId('create-dropzone')).toBeVisible()
      await capture(page, '04-uploads', theme)
    })

    test(`05-analytics · placeholder with chart preview · ${theme}`, async ({ page }) => {
      await page.goto('/analytics')
      await expect(page.getByTestId('coming-soon-analytics')).toBeVisible()
      await expect(page.getByTestId('analytics-charts')).toBeVisible()
      await capture(page, '05-analytics', theme)
    })

    test(`06-profile-menu · topbar avatar menu open · ${theme}`, async ({ page }) => {
      await page.goto('/notebook')
      await expect(page.getByTestId('meeting-list')).toBeVisible()
      await page.getByTestId('topbar-avatar').click()
      await expect(page.getByTestId('topbar-avatar-menu')).toBeVisible()
      await capture(page, '06-profile-menu', theme)
    })

    test(`07-settings-recording · nearest built tab is Preferences · ${theme}`, async ({
      page,
    }) => {
      // Our "Recording & Privacy" tab is a deliberate T-30 soon-panel; the
      // Preferences tab is the nearest functional settings surface to compare
      // shell, sub-nav and form layout against.
      await page.goto('/settings?tab=preferences')
      await expect(page.getByTestId('settings-view')).toBeVisible()
      await capture(page, '07-settings-recording', theme)
    })

    test(`08-settings-ai · nearest built tab is Appearance · ${theme}`, async ({ page }) => {
      await page.goto('/settings?tab=appearance')
      await expect(page.getByTestId('settings-view')).toBeVisible()
      await capture(page, '08-settings-ai', theme)
    })
  })
}

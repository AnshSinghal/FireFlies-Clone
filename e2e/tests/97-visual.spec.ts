import type { Locator, Page } from '@playwright/test'

import { expect, test } from '../fixtures'
import {
  CreateModal,
  FiltersPanel,
  NotebookPage,
  NotepadPage,
  PlayerComponent,
  TranscriptComponent,
} from '../pages'

/**
 * Visual regression baselines (T-41) — @visual
 *
 * Sixteen named surfaces in both themes (T-41.1/.2 = 32 snapshots), the
 * fourteen component-gallery sections in both themes (T-41.6 = 28), and the
 * two hero screens across four widths (T-41.10 = 8). 68 baselines total.
 *
 * Runs ONLY in the `visual` project — the `@visual` tag in the describe title
 * is both the grep the project selects on and the grepInvert the read-only and
 * mutations projects use to stay out of it. That project pins the determinism
 * knobs a config can own: 1440×900, `deviceScaleFactor: 1`, `reducedMotion`.
 *
 * The knobs a config CANNOT own are here (T-41.3):
 *   - the frozen clock, from the auto-fixture — without it "Today" drifts at
 *     midnight and every date-bearing baseline rots overnight;
 *   - `document.fonts.ready`, awaited before every shot — a font swap halfway
 *     through a capture is the classic phantom diff, and it shows up as a few
 *     hundred anti-aliased pixels rather than an obvious break;
 *   - `animations: 'disabled'` and `caret: 'hide'` on every shot, explicit
 *     rather than relying on the defaults, because the whole file's claim is
 *     that nothing moves;
 *   - the pseudo-waveform, which is already seeded from the meeting id
 *     (`pseudoPeaks(meetingId)`) and stays put because the seed ships no audio
 *     to decode — so the strip is the same 400 bars on every run.
 *
 * Nothing here writes: the delete dialog is opened and never confirmed, the
 * grid toggle and the theme both live in localStorage. It is safe in a project
 * with no `dependencies` on the mutation ordering.
 *
 * Updating: `npm run test:update-snapshots`, then READ the diff images before
 * committing. A blanket update to make CI green deletes the only evidence the
 * suite exists to produce (T-41.8).
 */

type Theme = 'light' | 'dark'
const THEMES: readonly Theme[] = ['light', 'dark']

/**
 * Component shots keep a ratio, at 1%, and that is a weaker claim than the
 * comment here used to make.
 *
 * It said "a primitive occupies few enough pixels that 1% is still only a
 * handful". True at the small end and not at the large: these frames span 21x.
 *
 *   toast            380×49   =  18,620 px  ->   186 px budget
 *   player           535×142  =  75,970 px  ->   759 px
 *   topbar          1440×56   =  80,640 px  ->   806 px
 *   sidebar          239×842  = 201,238 px  -> 2,012 px
 *   settings panel   548×736  = 403,328 px  -> 4,033 px
 *
 * So the settings panel gets a four-thousand-pixel budget from a rule written
 * for a toast. It still catches what it was added for — the `p-4` → `p-6` change
 * moves 10,592 — but a defect between 4,033 and 10,592 pixels would pass on that
 * one element while failing on every other.
 *
 * So both are set. The ratio keeps small frames tight — a toast still only gets
 * 186 pixels — and `maxDiffPixels: 2000` caps the large ones, so the settings
 * panel can no longer collect a four-thousand-pixel allowance from a rule
 * written for a toast.
 *
 * **Playwright applies both as independent limits — the stricter one wins.**
 * That was the open question and it is now tested rather than assumed: with
 * `maxDiffPixelRatio: 0.05` (≈20,000 px, would pass) against
 * `maxDiffPixels: 500` (would fail), a real 10,592-pixel diff FAILED. Had the
 * looser won, combining them would have been pointless.
 *
 * 2000 sits above the measured cross-machine variance (under 6000 for a whole
 * 1440×900 page, so far less for any element here) and well below the 10,592 a
 * real 8px padding change produces.
 *
 * **The cap is principle, not a fix for a demonstrated miss — say so plainly.**
 * The obvious worry was a defect between 4,033 (the old budget) and 10,592
 * hiding on this one element. Trying to build one: dropping the padding by a
 * SINGLE pixel, 16px → 17px, already moves **9,461** pixels, because every card
 * below the first shifts. On a frame this dense the smallest realistic layout
 * change is an order of magnitude past either budget, so the old ratio was very
 * likely not hiding anything here in practice.
 *
 * Kept anyway because it costs nothing and removes a footgun: the ratio hands
 * out a budget proportional to frame size, so the NEXT large element added here
 * inherits a large allowance silently. But it is a guard against a future
 * mistake, not evidence of a past one, and the difference is worth writing down
 * — the whole reason the page budget needed replacing is that its comment
 * asserted a measurement nobody had taken.
 */
const COMPONENT_SHOT = {
  animations: 'disabled',
  caret: 'hide',
  maxDiffPixelRatio: 0.01,
  maxDiffPixels: 2000,
} as const

/**
 * An ABSOLUTE budget, not a ratio — measured, after the ratio was caught hiding
 * a real defect.
 *
 * A ratio scales with the area you photograph, so the same defect passes or
 * fails depending on how much empty page surrounds it. Measured on the settings
 * panel: changing card padding `p-4` → `p-6` moves **10,592 pixels**. As a
 * fraction of the 548×736 element that is 0.026 and fails the 0.01 component
 * budget; as a fraction of a 1440×900 page it is 0.008 and passed the 0.015
 * page budget. One defect, one pixel count, two verdicts.
 *
 * The old comment here claimed "sub-pixel text rendering alone moves a few
 * thousand pixels between otherwise identical runs". That was never measured
 * and is not true on this harness: regenerating all 165 baselines three times
 * produced **zero** differing files. The clock is frozen, animations are off,
 * fonts are awaited and `deviceScaleFactor` is 1, which is what determinism
 * looks like when it works.
 *
 * 6000 is chosen against both numbers: comfortably under the 10,592 a real
 * 8px shift produces, and far above the zero this machine actually varies by.
 * The margin is for CROSS-MACHINE rendering, and that has now been measured
 * too: CI runs these same `-visual-linux` baselines on a GitHub runner and
 * passes at this budget, so the host-to-host difference is under 6000 pixels.
 * Both numbers the old comment guessed at are wrong — it claimed "sub-pixel
 * text rendering alone moves a few thousand pixels between otherwise identical
 * runs", and the real figures are zero locally and under 6000 across machines.
 *
 * If CI ever reddens here, its failure message prints the exact pixel count.
 * That number IS the measurement: raise the budget just above it, and keep it
 * absolute. Returning to a ratio reintroduces the bug this replaced — a budget
 * that grows with the empty space around the thing you are testing.
 */
const PAGE_SHOT = {
  animations: 'disabled',
  caret: 'hide',
  maxDiffPixels: 6000,
} as const

/**
 * The T-38 mechanism, unchanged from `28-a11y` and `25-dark-mode`: the boot
 * script inlined in <head> reads `ff.theme` before first paint, so seeding
 * storage before navigation is exactly what a returning user with a saved
 * preference looks like — and, unlike clicking the toggle, it means the very
 * first paint is already in the theme being photographed.
 */
async function inTheme(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript(
    (value) => localStorage.setItem('ff.theme', JSON.stringify(value)),
    theme,
  )
}

/**
 * Everything that must be true before the shutter opens.
 *
 * Three waits, each for a specific phantom diff:
 *
 * 1. `document.fonts.ready` — a font swap mid-capture repaints every glyph on
 *    the page. It resolves to a FontFaceSet, which does not survive
 *    serialisation, so it is mapped to a boolean to keep `evaluate` honest
 *    instead of silently returning `{}`.
 * 2. every `<img>` complete — the seed ships local SVG avatars rather than
 *    hotlinked ones, but "local" still means a request, and a row captured
 *    with three of eight avatars painted is a 2% diff that looks like a
 *    layout bug.
 * 3. two animation frames — the waveform canvas paints in an effect, so the
 *    frame after mount is the first one that has it.
 *
 * `waitForLoadState('networkidle')` would cover (1) and (2) at once and is
 * what the capture spec uses, but the suite's lint bans it: it is a guess
 * about the network rather than a statement about the DOM, and it hangs on any
 * page that keeps a connection open.
 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => true))
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete))
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )
}

/** The notebook, with real rows on screen rather than skeletons. */
async function openNotebook(page: Page, query = ''): Promise<NotebookPage> {
  const notebook = new NotebookPage(page)
  await notebook.goto(query)
  await expect(notebook.list).toBeVisible({ timeout: 20_000 })
  await expect(notebook.rows.first()).toBeVisible()
  await settle(page)
  return notebook
}

/**
 * The notepad, waiting on the SUMMARY panel rather than the transcript: below
 * 1024px the two panels become tabs and summary is the one on top, so this is
 * the single readiness signal that holds at all four responsive widths.
 */
async function openNotepad(page: Page, meetingId: number): Promise<NotepadPage> {
  const notepad = new NotepadPage(page)
  await notepad.goto(meetingId)
  await expect(notepad.summaryPanel).toBeVisible({ timeout: 25_000 })
  await settle(page)
  return notepad
}

test.describe('visual baselines @visual', () => {
  for (const theme of THEMES) {
    test.describe(`${theme} theme`, () => {
      test.beforeEach(async ({ page }) => {
        await inTheme(page, theme)
      })

      // ── Shell ─────────────────────────────────────────────────────────────

      test(`sidebar · ${theme}`, async ({ page }) => {
        await openNotebook(page)
        // 1440px is above the xl breakpoint, so the rail is the 240px expanded
        // form — the one worth having a baseline of.
        await expect(page.getByTestId('sidebar')).toHaveScreenshot(
          `sidebar-${theme}.png`,
          COMPONENT_SHOT,
        )
      })

      test(`topbar · ${theme}`, async ({ page }) => {
        await openNotebook(page)
        await expect(page.getByTestId('topbar')).toHaveScreenshot(
          `topbar-${theme}.png`,
          COMPONENT_SHOT,
        )
      })

      // ── Notebook ──────────────────────────────────────────────────────────

      test(`notebook-list · ${theme}`, async ({ page }) => {
        await openNotebook(page)
        await expect(page).toHaveScreenshot(`notebook-list-${theme}.png`, PAGE_SHOT)
      })

      test(`notebook-grid · ${theme}`, async ({ page }) => {
        const notebook = await openNotebook(page)
        /*
         * Clicked rather than seeded into localStorage. The view preference is
         * stored through `useLocalStorage`, so writing the key directly would
         * work — but it would also encode this spec's guess about that hook's
         * serialisation, and the toggle is one click away.
         */
        await page.getByTestId('notebook-view-grid').click()
        await expect(notebook.grid).toBeVisible()
        await settle(page)
        await expect(page).toHaveScreenshot(`notebook-grid-${theme}.png`, PAGE_SHOT)
      })

      test(`notebook-empty · ${theme}`, async ({ page, emptyDb }) => {
        await emptyDb()
        await page.goto('/notebook')
        const empty = page.getByTestId('notebook-empty')
        await expect(empty).toBeVisible({ timeout: 20_000 })
        // The three empty states differ (ADR: one message per cause); this is
        // the "nothing at all" one.
        await expect(empty).toHaveAttribute('data-variant', 'empty')
        await settle(page)
        await expect(page).toHaveScreenshot(`notebook-empty-${theme}.png`, PAGE_SHOT)
      })

      test(`notebook-filtered-empty · ${theme}`, async ({ page }) => {
        // Real filters against the real seed, not a stub: the panel echoes the
        // active chips back, and that echo is part of what this shot proves.
        await page.goto('/notebook?min_duration=3600&has_action_items=true')
        const empty = page.getByTestId('notebook-empty')
        await expect(empty).toBeVisible({ timeout: 20_000 })
        await expect(empty).toHaveAttribute('data-variant', 'no-matches')
        await settle(page)
        await expect(page).toHaveScreenshot(`notebook-filtered-empty-${theme}.png`, PAGE_SHOT)
      })

      test(`filters-panel · ${theme}`, async ({ page }) => {
        await openNotebook(page)
        const filters = new FiltersPanel(page)
        await filters.open()
        await expect(filters.panel).toBeVisible()
        await settle(page)
        await expect(filters.panel).toHaveScreenshot(
          `filters-panel-${theme}.png`,
          COMPONENT_SHOT,
        )
      })

      // ── Notepad ───────────────────────────────────────────────────────────

      /*
       * Settings had NO visual coverage until 2026-07-28, which is how a
       * restructure left Preferences rendering cards while Appearance stayed a
       * bare radio list — two tabs of one screen looking like different
       * products, caught only by putting `docs/screenshots/` side by side.
       *
       * Both tabs, because the defect was the DIFFERENCE between them: a
       * baseline on one alone would have gone green while they diverged. It is
       * also the surface whose measure and card anatomy are the T-46.1
       * findings, so it is the one most likely to be edited again.
       */
      test(`settings-preferences · ${theme}`, async ({ page }) => {
        await page.goto('/settings?tab=preferences')
        const panel = page.getByTestId('settings-preferences')
        await expect(panel).toBeVisible()
        await settle(page)
        /*
         * The PANEL, not the page, and `COMPONENT_SHOT` rather than
         * `PAGE_SHOT`. Written as a full-page shot first, and it did not work:
         * changing the card padding from `p-4` to `p-6` — a visible 8px shift
         * on every card — still passed. `maxDiffPixelRatio: 0.015` is ~19,400
         * pixels of a 1440x900 page, and Settings is mostly whitespace, so the
         * cards are a small enough fraction of the frame to hide inside the
         * budget.
         *
         * A ratio scales with the area you photograph. Shooting the panel keeps
         * the same ratio while shrinking the absolute budget to something that
         * can actually fail, which is the fix `docs/interview-notes.md` §9
         * argues for. Verified by re-running the p-4 -> p-6 edit against these
         * baselines and watching them fail.
         */
        await expect(panel).toHaveScreenshot(`settings-preferences-${theme}.png`, COMPONENT_SHOT)
      })

      test(`settings-appearance · ${theme}`, async ({ page }) => {
        await page.goto('/settings?tab=appearance')
        const panel = page.getByTestId('settings-appearance')
        await expect(panel).toBeVisible()
        await settle(page)
        await expect(panel).toHaveScreenshot(`settings-appearance-${theme}.png`, COMPONENT_SHOT)
      })

      test(`notepad-full · ${theme}`, async ({ page, seededMeeting }) => {
        await openNotepad(page, seededMeeting.id)
        const transcript = new TranscriptComponent(page)
        await expect(transcript.rows.first()).toBeVisible({ timeout: 15_000 })
        await settle(page)
        await expect(page).toHaveScreenshot(`notepad-full-${theme}.png`, PAGE_SHOT)
      })

      test(`summary-panel · ${theme}`, async ({ page, seededMeeting }) => {
        const notepad = await openNotepad(page, seededMeeting.id)
        await expect(page.getByTestId('summary-overview')).toBeVisible({ timeout: 15_000 })
        await settle(page)
        await expect(notepad.summaryPanel).toHaveScreenshot(
          `summary-panel-${theme}.png`,
          COMPONENT_SHOT,
        )
      })

      test(`transcript-panel · ${theme}`, async ({ page, seededMeeting }) => {
        const notepad = await openNotepad(page, seededMeeting.id)
        const transcript = new TranscriptComponent(page)
        await expect(transcript.rows.first()).toBeVisible({ timeout: 15_000 })
        await settle(page)
        await expect(notepad.transcriptPanel).toHaveScreenshot(
          `transcript-panel-${theme}.png`,
          COMPONENT_SHOT,
        )
      })

      test(`player · ${theme}`, async ({ page, seededMeeting }) => {
        await openNotepad(page, seededMeeting.id)
        const player = new PlayerComponent(page)
        await expect(player.root).toBeVisible({ timeout: 15_000 })
        // Waveform present means the canvas has painted; without this the shot
        // can catch the strip one frame before its first draw.
        await expect(player.waveform).toBeVisible()
        await settle(page)
        /*
         * NOT playing, so the time readout and the seekbar fill are static and
         * stay UNMASKED — masking them here would blind the baseline to the
         * one component whose typography (tabular-nums) is a hard rule. The
         * "current time during playback" T-41.4 warns about never enters a
         * shot in this file.
         */
        await expect(player.root).toHaveScreenshot(`player-${theme}.png`, COMPONENT_SHOT)
      })

      // ── Overlays ──────────────────────────────────────────────────────────

      test(`create-modal · ${theme}`, async ({ page }) => {
        const modal = new CreateModal(page)
        await modal.open('upload')
        await expect(modal.modal).toBeVisible({ timeout: 20_000 })
        await expect(modal.dropzone).toBeVisible()
        await settle(page)
        await expect(modal.modal).toHaveScreenshot(`create-modal-${theme}.png`, COMPONENT_SHOT)
      })

      test(`delete-dialog · ${theme}`, async ({ page }) => {
        const notebook = await openNotebook(page)
        const row = notebook.row(0)
        await row.hover()
        await notebook.kebabOf(row).click()
        await page.getByTestId('meeting-row-delete').click()
        const dialog = page.getByTestId('delete-dialog')
        await expect(dialog).toBeVisible()
        await settle(page)
        // Opened, never confirmed — this spec runs in a project with no write
        // ordering, so it must leave the seeded database exactly as it found it.
        await expect(dialog).toHaveScreenshot(`delete-dialog-${theme}.png`, COMPONENT_SHOT)
      })

      test(`toast-success · ${theme}`, async ({ page }) => {
        await page.goto('/dev/toasts')
        await expect(page.getByTestId('toast-harness')).toBeVisible({ timeout: 20_000 })
        await page.getByTestId('fire-success').click()

        const toast = page.getByTestId('toast').first()
        await expect(toast).toBeVisible()
        /*
         * Hovered to PAUSE the 4s auto-dismiss (T-09.6). Without it a retry
         * inside expect's 10s budget photographs an element that has already
         * left the DOM, and the failure reads as "element not found" rather
         * than as a diff. The toast root carries no hover styling of its own —
         * only its action and dismiss buttons do, and neither is under the
         * centre point `hover()` targets.
         */
        await toast.hover()
        await settle(page)

        await expect(toast).toHaveScreenshot(`toast-success-${theme}.png`, {
          ...COMPONENT_SHOT,
          /*
           * T-41.4: the one genuinely dynamic region in this whole file. The
           * hairline countdown bar is driven by a 50ms interval, so its
           * `scaleX` depends on how long the click-to-shutter path took —
           * milliseconds that are not the suite's to control. Masked, rather
           * than met by loosening the threshold for the whole toast.
           */
          mask: [page.getByTestId('toast-progress')],
        })
      })

      // ── Dev surfaces ──────────────────────────────────────────────────────

      test(`components-gallery · ${theme}`, async ({ page }) => {
        await page.goto('/dev/components')
        const gallery = page.getByTestId('component-gallery')
        await expect(gallery).toBeVisible({ timeout: 20_000 })
        await settle(page)
        /*
         * An ELEMENT shot, not `fullPage`. The app shell is `h-screen` with
         * `<main>` owning the scroll, so the document never scrolls and
         * `fullPage: true` would return the viewport and quietly drop
         * two-thirds of the gallery.
         */
        await expect(gallery).toHaveScreenshot(`components-gallery-${theme}.png`, PAGE_SHOT)
      })

      test(`tokens-page · ${theme}`, async ({ page }) => {
        await page.goto('/dev/tokens')
        const tokens = page.getByTestId('tokens-page')
        await expect(tokens).toBeVisible({ timeout: 20_000 })

        /*
         * `/dev/tokens` OWNS `data-theme` — it writes the attribute from its
         * own `useState('light')` on mount, so the seeded `ff.theme` this
         * describe block relies on is overwritten a frame after hydration.
         * Its in-page toggle is therefore the only way to photograph the dark
         * swatches, and clicking it is the honest reproduction of what a
         * reader of that page does.
         */
        if (theme === 'dark') {
          await page.getByTestId('tokens-theme-toggle').click()
          await expect
            .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
            .toBe('dark')
        }

        await settle(page)
        /*
         * This baseline stops at the fold (1200×900) and that is a property of
         * the page, not a shortcut here. `/dev/tokens` renders a
         * `min-h-screen` <main> inside the shell's `h-full` flex wrapper, so
         * its BOX is always exactly one viewport tall while its content
         * overflows into the shell's scroll container. An element shot can
         * only capture the box. Raising the viewport does not help — the box
         * grows with it and the trailing blank grows too.
         *
         * The 900px it does cover is the colour half — accent, brand,
         * surfaces, borders — which is where T41-B's "change a token, watch
         * several baselines fail" signal actually comes from. The type scale
         * and spacing tokens below the fold are covered by the
         * `components-gallery` shot instead, which captures its full 3192px
         * because it is a plain block, not a flex item.
         */
        await expect(tokens).toHaveScreenshot(`tokens-page-${theme}.png`, PAGE_SHOT)
      })
    })
  }
})

/**
 * Component-level shots (T-41.6) — @visual
 *
 * The point is LOCALISATION. When a token or a padding value moves, the
 * notebook baseline says "the notebook changed"; these say "Button changed",
 * and the diff image is small enough to read.
 *
 * One test per theme rather than one per section: the gallery is a single
 * navigation and fourteen element shots off it, so splitting them would pay
 * for the page load fourteen times over for no extra signal — each snapshot
 * is still named and diffed independently.
 */
const GALLERY_SECTIONS = [
  'buttons',
  'icon-buttons',
  'inputs',
  'search',
  'chips',
  'avatars',
  'controls',
  'tabs',
  'overlays',
  'feedback',
  'rows',
  'empty',
  'pagination',
  'panels',
] as const

test.describe('component baselines @visual', () => {
  for (const theme of THEMES) {
    test(`gallery sections · ${theme}`, async ({ page }) => {
      await inTheme(page, theme)
      await page.goto('/dev/components')
      await expect(page.getByTestId('component-gallery')).toBeVisible({ timeout: 20_000 })
      await settle(page)

      for (const section of GALLERY_SECTIONS) {
        /*
         * Scoped to the `<section>` element, not `getByTestId` alone: the
         * SearchInput inside the `search` section carries `gallery-search`
         * itself, so the bare testid resolves to two nodes and strict mode —
         * correctly — refuses to guess. The tag is the disambiguator the
         * suite's locator grammar allows for exactly this case.
         */
        const region: Locator = page.locator(`section[data-testid="gallery-${section}"]`)
        await expect(region).toBeVisible()
        await expect(region).toHaveScreenshot(
          `component-${section}-${theme}.png`,
          COMPONENT_SHOT,
        )
      }
    })
  }
})

/**
 * Responsive baselines (T-41.10) — @visual
 *
 * The two hero screens at the four widths the Definition of Done names, plus
 * the assertion a screenshot cannot make: that the page does not scroll
 * sideways. A horizontally overflowing layout still photographs fine — the
 * shot is clipped to the viewport — so the pixel diff would stay green while
 * the layout was visibly broken. `scrollWidth <= clientWidth` on the document
 * element is the same check ADR-020 was written for.
 */
const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 800 },
  { width: 768, height: 900 },
  // 393×852 is the Pixel-7 viewport the `chromium-mobile` project already uses,
  // so the mobile baseline and the mobile suite describe the same layout.
  { width: 393, height: 852 },
] as const

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const box = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(
    box.scrollWidth,
    `document scrolls sideways: scrollWidth ${box.scrollWidth} > clientWidth ${box.clientWidth}`,
  ).toBeLessThanOrEqual(box.clientWidth)
}

test.describe('responsive baselines @visual', () => {
  test('notebook across four widths', async ({ page }) => {
    for (const size of WIDTHS) {
      // Sized BEFORE navigating: the shell reads its breakpoint in CSS, but the
      // sidebar drawer and the notepad tabs are React state seeded on mount, and
      // resizing after the fact leaves them one render behind.
      await page.setViewportSize(size)
      await openNotebook(page)
      await expectNoHorizontalOverflow(page)
      await expect(page).toHaveScreenshot(`notebook-w${size.width}.png`, PAGE_SHOT)
    }
  })

  test('notepad across four widths', async ({ page, seededMeeting }) => {
    for (const size of WIDTHS) {
      await page.setViewportSize(size)
      await openNotepad(page, seededMeeting.id)
      await expectNoHorizontalOverflow(page)
      await expect(page).toHaveScreenshot(`notepad-w${size.width}.png`, PAGE_SHOT)
    }
  })
})

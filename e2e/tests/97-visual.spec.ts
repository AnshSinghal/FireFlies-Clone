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
 * Component shots get the tighter ratio: a primitive occupies few enough
 * pixels that 1% is still only a handful, so a real padding change cannot hide
 * under it (T-41.5).
 */
const COMPONENT_SHOT = {
  animations: 'disabled',
  caret: 'hide',
  maxDiffPixelRatio: 0.01,
} as const

/**
 * Full pages get 1.5%: a 1440×900 shot is 1.3M pixels, and sub-pixel text
 * rendering alone moves a few thousand of them between otherwise identical
 * runs. Tighter than this is flaky; looser stops catching real regressions.
 */
const PAGE_SHOT = {
  animations: 'disabled',
  caret: 'hide',
  maxDiffPixelRatio: 0.015,
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

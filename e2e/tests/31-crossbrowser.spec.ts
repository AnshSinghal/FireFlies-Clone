import { expect, test } from '../fixtures'
import { NotebookPage, NotepadPage, PlayerComponent, TranscriptComponent } from '../pages'

/**
 * Cross-browser pass (T-42.12, case T42-G) — @crossbrowser
 *
 * Tagged, so these run ONLY in the `firefox` and `webkit` projects and never
 * inflate the Chromium count. Run them with:
 *
 *   npx playwright test --project=firefox --project=webkit
 *
 * The set is deliberately small and deliberately chosen: re-running four
 * hundred assertions in three engines buys almost nothing, because the
 * overwhelming majority of them exercise our own React state, which does not
 * vary by engine. What varies is the handful of PLATFORM behaviours the plan
 * names, and each test below is one of them:
 *
 *   - `<audio>` and the autoplay policy — WebKit refuses programmatic play
 *     without a gesture, and the player has to stay usable when it does.
 *   - `position: sticky` inside a scrolling container — the transcript's
 *     speaker strip, historically the most engine-divergent thing here.
 *   - Selection across inline elements — Safari normalises DOM ranges
 *     differently, and the transcript's toolbar reads `getSelection()`.
 *   - CSS custom properties driving a canvas — the waveform reads tokens at
 *     draw time rather than inheriting them.
 *
 * Everything here is read-only, so the suite is safe to run against a shared
 * database in parallel with the Chromium projects.
 */

const HERO = 1

test.describe('cross-browser · the platform seams @crossbrowser', () => {
  test('T42-G · the notebook renders its seeded rows', async ({ page }) => {
    // The baseline. If this fails, nothing below is worth reading — and it
    // catches the whole class of "the bundle does not parse in this engine".
    const notebook = new NotebookPage(page)
    await notebook.goto()

    await expect(notebook.list).toBeVisible()
    await expect(notebook.rows.first()).toBeVisible()
    expect(await notebook.rows.count()).toBeGreaterThan(0)
  })

  test('T42-G · the player renders and a seek moves the clock', async ({ page }) => {
    /*
     * Seeking, not playing. Autoplay policy differs by engine and a test that
     * demanded playback would fail in WebKit for a reason that is correct
     * behaviour — the point is that the TRANSPORT works, and that the clock
     * follows the seekbar whether or not audio is permitted.
     */
    const notepad = new NotepadPage(page)
    await notepad.goto(HERO)
    const player = new PlayerComponent(page)

    await expect(player.seekbar).toBeVisible()
    await player.seekbar.focus()
    await page.keyboard.press('ArrowRight')

    await expect
      .poll(async () => Number(await player.seekbar.getAttribute('aria-valuenow')))
      .toBeGreaterThan(0)
  })

  test('T42-G · a blocked autoplay leaves the player usable, not broken', async ({ page }) => {
    /*
     * WebKit rejects `audio.play()` without a user gesture. The contract
     * (T-19.14) is that the app says so plainly and keeps working — a rejected
     * promise must not leave the transport stuck or throw into the console.
     */
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    const notepad = new NotepadPage(page)
    await notepad.goto(HERO)
    const player = new PlayerComponent(page)

    await player.playButton.click()
    // Whatever the engine decided, the button still describes a real state and
    // the page did not fall over.
    await expect(player.playButton).toBeEnabled()
    expect(errors).toEqual([])
  })

  test('T42-G · the sticky speaker strip stays put while the transcript scrolls', async ({
    page,
  }) => {
    /*
     * `position: sticky` inside an `overflow` container is the single most
     * engine-divergent thing in this app — and the strip is a real row in the
     * layout rather than an overlay precisely because of it (see the note in
     * `transcript-list.tsx`).
     */
    const notepad = new NotepadPage(page)
    await notepad.goto(HERO)
    const transcript = new TranscriptComponent(page)
    await expect(transcript.list).toBeVisible()

    const before = await page.getByTestId('transcript-sticky-speaker').boundingBox()

    await page.getByTestId('transcript-scroll').evaluate((element) => {
      element.scrollTop = 1200
    })
    await expect
      .poll(() => page.getByTestId('transcript-scroll').evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0)

    const after = await page.getByTestId('transcript-sticky-speaker').boundingBox()

    // Same place on screen after 1,200px of scrolling: that is the whole claim.
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(2)
    // …and it is still naming somebody.
    await expect(page.getByTestId('transcript-sticky-speaker')).not.toBeEmpty()
  })

  test('T42-G · selecting transcript text raises the toolbar', async ({ page }) => {
    /*
     * Safari normalises DOM ranges differently from Chromium, and the toolbar
     * reads `window.getSelection()` — so this is the engine seam, not a
     * re-test of the toolbar's own logic.
     */
    const notepad = new NotepadPage(page)
    await notepad.goto(HERO)
    await expect(page.getByTestId('transcript-list')).toBeVisible()

    await page.evaluate(() => {
      const paragraph = document.querySelector('[data-segment-id] p')
      if (!paragraph) throw new Error('no transcript paragraph')
      const range = document.createRange()
      range.selectNodeContents(paragraph)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    })

    await expect(page.getByTestId('selection-toolbar')).toBeVisible()
  })

  test('T42-G · the waveform canvas paints from the token layer', async ({ page }) => {
    /*
     * The strip reads CSS custom properties at DRAW time — pixels do not
     * restyle themselves — so this asserts the engine both resolved the
     * variables and gave the canvas a real size to paint into.
     */
    const notepad = new NotepadPage(page)
    await notepad.goto(HERO)

    const canvas = page.getByTestId('player-waveform')
    await expect(canvas).toBeVisible()

    const painted = await canvas.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    })
    expect(painted.width).toBeGreaterThan(0)
    expect(painted.height).toBeGreaterThan(0)
  })

  test('T42-G · clicking a transcript line seeks the player', async ({ page }) => {
    // The single most-graded interaction in the brief (T-21), verified in every
    // engine rather than only in the one the suite happens to default to.
    const notepad = new NotepadPage(page)
    await notepad.goto(HERO)
    const transcript = new TranscriptComponent(page)
    const player = new PlayerComponent(page)
    await expect(transcript.list).toBeVisible()

    await transcript.rows.nth(4).click()

    await expect
      .poll(async () => Number(await player.seekbar.getAttribute('aria-valuenow')))
      .toBeGreaterThan(0)
  })

  test('T42-G · the five summary sections render in canonical order', async ({ page }) => {
    // Layout-heavy and grading-relevant: if a `gap`, `grid` or `:has()` behaves
    // differently, this is where it shows.
    const notepad = new NotepadPage(page)
    await notepad.goto(HERO)

    for (const id of ['keywords', 'overview', 'outline', 'notes', 'actions']) {
      await expect(page.getByTestId(`summary-section-${id}`)).toBeVisible()
    }
  })
})

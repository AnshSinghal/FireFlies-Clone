import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Transcript ↔ player sync (T-21, cases T21-A → T21-N).
 *
 * The assignment names this interaction explicitly, so these tests assert it in
 * BOTH directions and at the edges — before the first line, inside a gap, past
 * the end — where a naive implementation flickers to nothing.
 */

const HERO = 1
/** The longest seeded meeting: 159 segments over seventeen minutes. */
const LONG = 4

async function openTranscript(page: Page, meetingId = HERO, query = ''): Promise<void> {
  await page.goto(`/meeting/${meetingId}${query}`)
  await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 20_000 })
}

const segmentRow = (page: Page) =>
  page.locator('[data-testid^="transcript-segment-"]:not([data-testid*="actions"])')

const activeLine = (page: Page) =>
  page.getByTestId('transcript-list').locator('[data-active="true"]')

/** The playhead in seconds, from the value a screen reader is given. */
function position(page: Page): Promise<number> {
  return page
    .getByTestId('player-seekbar')
    .getAttribute('aria-valuenow')
    .then(Number)
}

function duration(page: Page): Promise<number> {
  return page.getByTestId('player-seekbar').getAttribute('aria-valuemax').then(Number)
}

/** The `MM:SS` a row displays, as seconds. */
async function rowSeconds(row: Locator): Promise<number> {
  const text = await row.locator('[data-testid^="transcript-timestamp-"]').innerText()
  const [minutes, seconds] = text.trim().split(':').map(Number)
  return minutes! * 60 + seconds!
}

test.describe('transcript ↔ player sync', () => {
  test('T21-A · clicking a line seeks the player to it', async ({ page }) => {
    await openTranscript(page)

    const row = segmentRow(page).nth(6)
    const expected = await rowSeconds(row)
    expect(expected).toBeGreaterThan(0)

    await row.click()

    // ±1s, which is the resolution the display and the ARIA value carry.
    await expect.poll(() => position(page)).toBeGreaterThanOrEqual(expected - 1)
    expect(await position(page)).toBeLessThanOrEqual(expected + 1)
  })

  test('T21-B · clicking while paused stays paused and moves the highlight', async ({ page }) => {
    await openTranscript(page)
    await expect(page.getByTestId('player-play')).toHaveAttribute('aria-label', 'Play')

    const row = segmentRow(page).nth(5)
    const id = await row.getAttribute('data-testid')
    await row.click()

    // Still paused: a line is a place to look at, not a command to play.
    await expect(page.getByTestId('player-play')).toHaveAttribute('aria-label', 'Play')
    await expect(activeLine(page)).toHaveAttribute('data-testid', id!)
  })

  test('T21-C · clicking while playing keeps playing from there', async ({ page }) => {
    await openTranscript(page)

    await page.getByTestId('player-play').click()
    await expect(page.getByTestId('player-play')).toHaveAttribute('aria-label', 'Pause')

    /*
     * Stop the list moving before clicking into it.
     *
     * While playing, the panel follows the playhead — so between Playwright's
     * stability check and the click itself, the row can scroll out from under
     * the pointer and a different line gets clicked. CI found this; a faster
     * machine hides it. One wheel notch suspends the follow for five seconds,
     * which is also exactly what a real user does before clicking a line.
     */
    const list = page.getByTestId('transcript-scroll')
    await list.hover()
    await page.mouse.wheel(0, 1)
    await page.waitForTimeout(150)

    /*
     * Resolved to a STABLE id before clicking.
     *
     * `nth(8)` is positional over the rendered window, and Playwright
     * re-evaluates a locator at click time — so after it scrolls the list to
     * bring the row into view, the eighth rendered row is a DIFFERENT segment
     * from the one just measured. That is what made this fail on CI with the
     * player landing on 7s instead of 73s.
     */
    const rowId = (await segmentRow(page).nth(8).getAttribute('data-testid'))!
    const row = page.getByTestId(rowId)
    const expected = await rowSeconds(row)
    await row.click()

    await expect(page.getByTestId('player-play')).toHaveAttribute('aria-label', 'Pause')
    // Playing ON from the new position, not restarted and not stuck.
    await expect.poll(() => position(page), { timeout: 8000 }).toBeGreaterThan(expected)
  })

  test('T21-D · clicking a timestamp seeks and starts playback', async ({ page }) => {
    await openTranscript(page)
    await expect(page.getByTestId('player-play')).toHaveAttribute('aria-label', 'Play')

    const row = segmentRow(page).nth(4)
    const expected = await rowSeconds(row)
    await row.locator('[data-testid^="transcript-timestamp-"]').click()

    await expect(page.getByTestId('player-play')).toHaveAttribute('aria-label', 'Pause')
    await expect.poll(() => position(page)).toBeGreaterThanOrEqual(expected - 1)
  })

  test('T21-E · playing moves the highlight, one line at a time', async ({ page }) => {
    await openTranscript(page)

    await page.getByTestId('player-play').click()
    await expect.poll(() => activeLine(page).count(), { timeout: 10_000 }).toBe(1)

    const seen = new Set<string>()
    const deadline = Date.now() + 30_000

    while (seen.size < 3 && Date.now() < deadline) {
      const id = await activeLine(page).getAttribute('data-testid')
      if (id) seen.add(id)
      // Never two at once, checked throughout rather than only at the end.
      expect(await activeLine(page).count()).toBe(1)
      await page.waitForTimeout(500)
    }

    expect(seen.size).toBeGreaterThanOrEqual(3)
  })

  test('T21-F · seeking to 90% activates a line near the end and shows it', async ({ page }) => {
    await openTranscript(page)

    const total = await duration(page)
    await page.locator('body').click({ position: { x: 5, y: 300 } })
    // `9` is the shortcut for 90% (T-19.11) — the same seek path as everything
    // else, reached from the keyboard.
    await page.keyboard.press('9')

    await expect.poll(() => position(page)).toBeGreaterThan(total * 0.85)

    const active = activeLine(page)
    await expect(active).toBeVisible()
    await expect(active).toBeInViewport()
    expect(await rowSeconds(active)).toBeGreaterThan(total * 0.8)
  })

  test('T21-G · seeking to zero activates the first line', async ({ page }) => {
    await openTranscript(page)

    await page.getByTestId('player-seekbar').focus()
    await page.keyboard.press('End')
    await expect.poll(() => position(page)).toBeGreaterThan(0)

    await page.keyboard.press('Home')
    await expect.poll(() => position(page)).toBe(0)

    const first = segmentRow(page).first()
    await expect(first).toHaveAttribute('data-active', 'true')
  })

  test('T21-H · a gap between lines keeps the previous one active', async ({ page }) => {
    await openTranscript(page)

    /*
     * Positioned one second before a line starts — which is inside the gap
     * after the previous one, since segments do not abut. The honest answer
     * there is still what was just said; flickering to nothing is the bug.
     */
    const row = segmentRow(page).nth(3)
    const start = await rowSeconds(row)
    const previous = segmentRow(page).nth(2)
    const previousId = await previous.getAttribute('data-testid')

    await page.goto(`/meeting/${HERO}?t=${start - 1}`)
    await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 20_000 })

    await expect(activeLine(page)).toHaveAttribute('data-testid', previousId!)
    expect(await activeLine(page).count()).toBe(1)
  })

  test('T21-I · seeking past the end leaves the last line active', async ({ page }) => {
    await openTranscript(page)

    const total = await duration(page)
    // Beyond the recording entirely: the player clamps and the transcript
    // settles on its last line rather than on none.
    await page.goto(`/meeting/${HERO}?t=${total + 600}`)
    await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 20_000 })

    await expect.poll(() => position(page)).toBe(total)
    await expect(activeLine(page)).toBeVisible()
    expect(await activeLine(page).count()).toBe(1)

    const scroll = page.getByTestId('transcript-scroll')
    await scroll.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await page.waitForTimeout(300)
    await expect(segmentRow(page).last()).toHaveAttribute('data-active', 'true')
  })

  test('T21-J · an outline chapter seeks, plays and reveals the line', async ({ page }) => {
    await openTranscript(page)

    // Scrolled away first, so "reveals" is a claim with something to prove:
    // an outline click overrides the auto-scroll suspension.
    const scroll = page.getByTestId('transcript-scroll')
    await scroll.hover()
    await page.mouse.wheel(0, 3000)
    await page.waitForTimeout(200)

    const chapter = page.getByTestId('outline-timestamp-2')
    const label = (await chapter.getAttribute('aria-label'))!
    const [minutes, seconds] = label.split('from ').at(-1)!.split(':').map(Number)
    const expected = minutes! * 60 + seconds!

    await chapter.click()

    await expect.poll(() => position(page)).toBeGreaterThanOrEqual(expected - 1)
    await expect(page.getByTestId('player-play')).toHaveAttribute('aria-label', 'Pause')
    await expect(activeLine(page)).toBeInViewport()
  })

  test('T21-K · following the playhead costs almost nothing', async ({ page }) => {
    await openTranscript(page, LONG)

    /*
     * Measured as a DIFFERENCE, not against a fixed budget.
     *
     * Long-task time on a machine running several browsers at once says as
     * much about the machine as about the page — the same code measured 222ms
     * alone and 549ms with three copies of this test competing. Comparing an
     * idle window against a playing window of the same length cancels that
     * out: whatever the runner is doing, it is doing it during both.
     */
    const measure = async (ms: number): Promise<number> => {
      await page.evaluate(() => {
        const store = ((window as unknown as { __long: number[] }).__long = [])
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) store.push(entry.duration)
        })
        observer.observe({ entryTypes: ['longtask'] })
        ;(window as unknown as { __obs: PerformanceObserver }).__obs = observer
      })
      await page.waitForTimeout(ms)
      return page.evaluate(() => {
        ;(window as unknown as { __obs: PerformanceObserver }).__obs.disconnect()
        return (window as unknown as { __long: number[] }).__long.reduce((sum, d) => sum + d, 0)
      })
    }

    const idle = await measure(8000)

    await page.getByTestId('player-play').click()
    await expect.poll(() => activeLine(page).count(), { timeout: 10_000 }).toBe(1)
    const playing = await measure(8000)

    /*
     * Eight seconds of following a 159-line transcript — eighty clock commits,
     * each resolving the active line and, every few seconds, scrolling to it.
     * A naive implementation re-renders every row on every commit and adds
     * seconds, not milliseconds.
     *
     * Two eight-second windows rather than two fifteen-second ones: the whole
     * test has to finish inside the thirty-second per-test timeout, and eighty
     * commits is already far more than enough to see a per-tick cost.
     */
    expect(playing - idle).toBeLessThan(300)
  })

  test('T21-L · following the playhead does not suspend itself', async ({ page }) => {
    await openTranscript(page)

    await page.getByTestId('player-play').click()
    await expect.poll(() => activeLine(page).count(), { timeout: 10_000 }).toBe(1)

    // Long enough for several automatic scrolls. If any of them were mistaken
    // for the user scrolling, the pill would appear and the panel would stop
    // following — the single most common bug in this feature.
    await page.waitForTimeout(20_000)

    await expect(page.getByTestId('transcript-jump-to-current')).toBeHidden()
    await expect(activeLine(page)).toBeInViewport()
  })

  test('T21-M · a deep link opens the long meeting at the right line, in view', async ({
    page,
  }) => {
    // 900s rather than the plan's 1500: the longest seeded meeting runs 17
    // minutes, and 1500s is past the end of it (see ADR-063 on the same gap).
    await openTranscript(page, LONG, '?t=900')

    await expect.poll(() => position(page)).toBe(900)

    const active = activeLine(page)
    await expect(active).toBeVisible()
    await expect(active).toBeInViewport()
    expect(await rowSeconds(active)).toBeLessThanOrEqual(900)

    // Centred, not merely on screen: a deep link that lands the target one
    // pixel inside the bottom edge is technically correct and useless.
    const box = (await active.boundingBox())!
    const view = (await page.getByTestId('transcript-scroll').boundingBox())!
    const centreOffset = Math.abs(box.y + box.height / 2 - (view.y + view.height / 2))
    expect(centreOffset).toBeLessThan(view.height / 3)
  })

  test('T21-N · leaving and coming back restores the scroll position', async ({ page }) => {
    await openTranscript(page)

    const scroll = page.getByTestId('transcript-scroll')
    await scroll.hover()
    await page.mouse.wheel(0, 2500)
    await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(1000)
    const before = await scroll.evaluate((el) => el.scrollTop)

    await page.getByTestId('notepad-back').click()
    await expect(page.getByTestId('meeting-list')).toBeVisible({ timeout: 15_000 })

    await page.goBack()
    await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 20_000 })

    // Within a row's height of where it was: the virtualiser restores an
    // offset, and the rows below it re-measure as they mount.
    await expect
      .poll(() => page.getByTestId('transcript-scroll').evaluate((el) => el.scrollTop))
      .toBeGreaterThan(before - 150)
  })
})

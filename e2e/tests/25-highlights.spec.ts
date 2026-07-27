import { expect, test, type Page } from '@playwright/test'

import { API_BASE } from '../api-base'

/**
 * Highlights & bookmarks (T-32, cases T32-A → T32-K).
 *
 * Every test in this file writes, so the whole file is `@mutates` — a stray
 * highlight left behind by a reader test would change what a later one sees,
 * and the read-only project runs four ways in parallel.
 *
 * Selections are made with the KEYBOARD (`Shift+ArrowRight`) rather than by
 * dragging with the mouse. A mouse drag across text is expressed in pixels,
 * and pixels are where the flakiness lives: a line wrap moves the target, a
 * font metric shifts by half a character, and the assertion "exactly these
 * characters" starts failing for reasons that have nothing to do with the
 * feature. Keyboard selection names the characters directly.
 */

test.describe.configure({ mode: 'serial' })

const HERO = 1

async function openTranscript(page: Page): Promise<void> {
  await page.goto(`/meeting/${HERO}`)
  await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 20_000 })
}

/** The element whose text content is exactly one segment's text. */
function segmentText(page: Page, segmentId: number) {
  return page.locator(`[data-segment-text="${segmentId}"]`)
}

/** The first rendered segment's id, and its text. */
async function firstSegment(page: Page): Promise<{ id: number; text: string }> {
  const row = page.locator('[data-testid^="transcript-segment-"]').first()
  const testId = await row.getAttribute('data-testid')
  const id = Number(testId?.replace('transcript-segment-', ''))
  const text = (await segmentText(page, id).innerText()).trim()
  return { id, text }
}

/**
 * Select `length` characters starting at `start` inside one segment's text.
 *
 * Done through the DOM Selection API, because that is exactly what the feature
 * reads — driving the real thing rather than a proxy for it means the test
 * fails when the feature does and not when the layout moves.
 */
async function selectRange(
  page: Page,
  segmentId: number,
  start: number,
  end: number,
): Promise<void> {
  await page.evaluate(
    ({ segmentId, start, end }) => {
      const root = document.querySelector(`[data-segment-text="${segmentId}"]`)
      if (!root) throw new Error(`no segment ${segmentId}`)

      // Walk the text nodes to find where the requested offsets land — the
      // paragraph may already contain marks, so it is not one node.
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let consumed = 0
      let startNode: Node | null = null
      let startOffset = 0
      let endNode: Node | null = null
      let endOffset = 0

      while (walker.nextNode()) {
        const node = walker.currentNode
        const length = node.textContent?.length ?? 0
        if (startNode === null && consumed + length >= start) {
          startNode = node
          startOffset = start - consumed
        }
        if (endNode === null && consumed + length >= end) {
          endNode = node
          endOffset = end - consumed
        }
        consumed += length
      }

      if (!startNode || !endNode) throw new Error('offsets out of range')

      const range = document.createRange()
      range.setStart(startNode, startOffset)
      range.setEnd(endNode, endOffset)

      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    },
    { segmentId, start, end },
  )

  await expect(page.getByTestId('selection-toolbar')).toBeVisible()
}

/** Highlight the given range, returning the new highlight's test id. */
async function highlight(
  page: Page,
  segmentId: number,
  start: number,
  end: number,
  color?: string,
): Promise<void> {
  await selectRange(page, segmentId, start, end)

  if (color) {
    await page.getByTestId('selection-highlight-colors').click()
    await page.getByTestId(`highlight-color-${color}`).click()
  } else {
    await page.getByTestId('selection-highlight').click()
  }

  await expect(page.getByTestId('selection-toolbar')).toBeHidden()
}

/** How many bookmarks the SERVER currently holds for the hero meeting. */
async function bookmarkCount(page: Page): Promise<number> {
  const response = await page.request.get(`${API_BASE}/api/v1/meetings/${HERO}/bookmarks`)
  return ((await response.json()) as unknown[]).length
}

async function clearHighlights(page: Page): Promise<void> {
  /*
   * Through the API, not the UI: teardown that goes through the interface is
   * teardown that fails for the same reasons the test does.
   *
   * LOOPED, because a Playwright click resolves when the click lands, not when
   * the request it fired comes back. A single read-then-delete pass therefore
   * misses anything still in flight, and the residue turns up in the NEXT
   * test — which is how this suite produced failures that moved around
   * depending on which test ran before them.
   */
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rows = (await (
      await page.request.get(`${API_BASE}/api/v1/meetings/${HERO}/highlights`)
    ).json()) as { id: number }[]

    if (rows.length === 0) return
    for (const row of rows) {
      await page.request.delete(`${API_BASE}/api/v1/meetings/${HERO}/highlights/${row.id}`)
    }
  }
}

test.describe('highlights @mutates', () => {
  test.afterEach(async ({ page }) => {
    await clearHighlights(page)
  })

  test('T32-A · exactly the selected characters are highlighted, and they persist', async ({
    page,
  }) => {
    await openTranscript(page)
    const segment = await firstSegment(page)
    const expected = segment.text.slice(4, 18)

    await highlight(page, segment.id, 4, 18)

    const mark = page.locator('[data-highlight-id]').first()
    await expect(mark).toHaveText(expected)

    // The real assertion: a reload proves the OFFSETS were stored, not a
    // client-side decoration that happened to look right.
    await page.reload()
    await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-highlight-id]').first()).toHaveText(expected)
  })

  test('T32-B · two highlights in one segment both render, non-overlapping', async ({ page }) => {
    await openTranscript(page)
    const segment = await firstSegment(page)

    await highlight(page, segment.id, 0, 6)
    await highlight(page, segment.id, 10, 20, 'green')

    const marks = segmentText(page, segment.id).locator('[data-highlight-id]')
    await expect(marks).toHaveCount(2)
    await expect(marks.nth(0)).toHaveText(segment.text.slice(0, 6))
    await expect(marks.nth(1)).toHaveText(segment.text.slice(10, 20))

    // No characters lost or duplicated by the split.
    await expect(segmentText(page, segment.id)).toHaveText(segment.text)
  })

  test('T32-C · a highlight and a search mark coexist without breaking either', async ({
    page,
  }) => {
    await openTranscript(page)
    const segment = await firstSegment(page)

    // A word long enough to be a meaningful search, taken from the range about
    // to be highlighted so the two channels are guaranteed to collide.
    const word = segment.text.slice(0, 40).split(' ').find((part) => part.length > 4)
    expect(word, 'first segment has no word long enough to search for').toBeTruthy()

    const at = segment.text.indexOf(word as string)
    await highlight(page, segment.id, at, at + (word as string).length + 6)

    await page.getByTestId('transcript-find-open').click()
    await page.getByTestId('transcript-find-input').fill(word as string)
    await expect.poll(() => new URL(page.url()).searchParams.get('find')).toBe(word)

    const paragraph = segmentText(page, segment.id)
    // Both channels still present…
    await expect(paragraph.locator('[data-highlight-id]').first()).toBeVisible()
    await expect(paragraph.locator('[data-match-index]').first()).toBeVisible()
    // …no nesting…
    await expect(paragraph.locator('mark').locator('mark')).toHaveCount(0)
    // …and not one character lost at the seam.
    await expect(paragraph).toHaveText(segment.text)
  })

  test('T32-D · clicking a highlight opens its popover', async ({ page }) => {
    await openTranscript(page)
    const segment = await firstSegment(page)
    await highlight(page, segment.id, 4, 18)

    await page.locator('[data-highlight-id]').first().click()

    const popover = page.getByTestId('highlight-popover')
    await expect(popover).toBeVisible()
    await expect(popover.getByTestId('highlight-note')).toBeVisible()
    await expect(popover.getByTestId('highlight-remove')).toBeVisible()
  })

  test('T32-E · changing colour updates immediately and persists', async ({ page }) => {
    await openTranscript(page)
    const segment = await firstSegment(page)
    await highlight(page, segment.id, 4, 18)

    await page.locator('[data-highlight-id]').first().click()
    await page.getByTestId('highlight-popover-color-blue').click()

    const mark = page.locator('[data-highlight-id]').first()
    await expect(mark).toHaveClass(/bg-hl-blue/)

    await page.reload()
    await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-highlight-id]').first()).toHaveClass(/bg-hl-blue/)
  })

  test('T32-F · removing a highlight leaves the text intact and unmarked', async ({ page }) => {
    await openTranscript(page)
    const segment = await firstSegment(page)
    await highlight(page, segment.id, 4, 18)

    await page.locator('[data-highlight-id]').first().click()
    await page.getByTestId('highlight-remove').click()

    await expect(page.locator('[data-highlight-id]')).toHaveCount(0)
    // No residual markup: the paragraph is back to exactly its own text.
    await expect(segmentText(page, segment.id)).toHaveText(segment.text)
  })

  test('a note survives a reload and shows in the flyout', async ({ page }) => {
    await openTranscript(page)
    const segment = await firstSegment(page)
    await highlight(page, segment.id, 4, 18)

    await page.locator('[data-highlight-id]').first().click()
    await page.getByTestId('highlight-note').fill('Follow up with Finance')
    await page.getByTestId('highlight-save').click()

    await page.getByTestId('icon-rail-highlights').click()
    await expect(page.getByTestId('highlights-flyout')).toContainText('Follow up with Finance')
  })

  test('T32-I · a highlight survives scrolling far away and back', async ({ page }) => {
    await openTranscript(page)
    const segment = await firstSegment(page)
    const expected = segment.text.slice(4, 18)
    await highlight(page, segment.id, 4, 18)

    // Far enough that the row is unmounted by the virtualiser, then back.
    await page.getByTestId('transcript-scroll').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect(segmentText(page, segment.id)).toHaveCount(0)

    await page.getByTestId('transcript-scroll').evaluate((element) => {
      element.scrollTop = 0
    })
    await expect(segmentText(page, segment.id).locator('[data-highlight-id]')).toHaveText(expected)
  })

  test('a selection spanning two segments is refused with an explanation', async ({ page }) => {
    await openTranscript(page)

    const ids = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('[data-segment-text]')]
      return nodes.slice(0, 2).map((node) => Number(node.getAttribute('data-segment-text')))
    })
    expect(ids).toHaveLength(2)

    await page.evaluate(([first, second]) => {
      const a = document.querySelector(`[data-segment-text="${first}"]`)
      const b = document.querySelector(`[data-segment-text="${second}"]`)
      if (!a || !b) throw new Error('need two segments')

      const range = document.createRange()
      range.setStart(a.firstChild ?? a, 0)
      range.setEnd(b.firstChild ?? b, 5)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    }, ids)

    await page.getByTestId('selection-highlight').click()

    await expect(page.getByTestId('toast-container')).toContainText('within one line')
    await expect(page.locator('[data-highlight-id]')).toHaveCount(0)
  })
})

test.describe('bookmarks @mutates', () => {
  /** Leaves the meeting with no bookmarks, whatever the test did. */
  async function clearBookmarks(page: Page): Promise<void> {
    /*
     * Looped for the same reason `clearHighlights` is: a click resolves when
     * it lands, not when the request it fired returns, so one read-then-clear
     * pass misses anything still in flight — and the residue then breaks
     * whichever test happens to run next, which is why the failures in this
     * file moved around instead of staying put.
     */
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const rows = (await (
        await page.request.get(`${API_BASE}/api/v1/meetings/${HERO}/bookmarks`)
      ).json()) as { segment_id: number }[]

      if (rows.length === 0) return

      // Toggled off rather than DELETEd, so the teardown exercises the same
      // endpoint the UI does and cannot drift from it.
      for (const row of rows) {
        await page.request.post(`${API_BASE}/api/v1/meetings/${HERO}/bookmarks`, {
          data: { segment_id: row.segment_id },
        })
      }
    }
  }

  test.afterEach(async ({ page }) => {
    await clearBookmarks(page)
  })

  test('T32-G · starring a segment fills the star, lists it, and ticks the seekbar', async ({
    page,
  }) => {
    await openTranscript(page)
    const segment = await firstSegment(page)

    await page.getByTestId(`bookmark-toggle-${segment.id}`).click()

    await expect(page.getByTestId(`bookmark-toggle-${segment.id}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByTestId('player-bookmark-marks').locator('button')).toHaveCount(1)

    await page.getByTestId('icon-rail-bookmarks').click()
    await expect(page.getByTestId(`bookmark-entry-${segment.id}`)).toBeVisible()
  })

  test('T32-H · clicking a flyout bookmark seeks the player', async ({ page }) => {
    await openTranscript(page)

    // A segment well into the meeting, so "seeked" is unambiguous.
    const rows = page.locator('[data-testid^="transcript-segment-"]')
    const target = rows.nth(4)
    const testId = await target.getAttribute('data-testid')
    const segmentId = Number(testId?.replace('transcript-segment-', ''))

    await page.getByTestId(`bookmark-toggle-${segmentId}`).click()
    await page.getByTestId('icon-rail-bookmarks').click()

    const stamp = await page.getByTestId(`bookmark-time-${segmentId}`).innerText()

    await page.getByTestId(`bookmark-entry-${segmentId}`).click()

    await expect(page.getByTestId('player-time')).toContainText(stamp)
  })

  test('`B` toggles the bookmark on the line under the playhead', async ({ page }) => {
    await openTranscript(page)

    // Clicking the first line seeks to it, which is what makes "the line under
    // the playhead" a known segment rather than whatever the clock says.
    await page.getByTestId('transcript-scroll').click({ position: { x: 5, y: 5 } })

    await page.keyboard.press('b')
    await expect(page.getByTestId('player-bookmark-marks').locator('button')).toHaveCount(1)
    /*
     * Waits for the SERVER before pressing again.
     *
     * The star appears optimistically, so the assertion above passes while the
     * POST is still on the wire — and a second press landing in that window is
     * two requests racing, which is a different behaviour (covered by the
     * backend's race test) than the toggle this case is about.
     */
    await expect.poll(() => bookmarkCount(page)).toBe(1)

    await page.keyboard.press('b')
    await expect(page.getByTestId('player-bookmark-marks')).toHaveCount(0)
    await expect.poll(() => bookmarkCount(page)).toBe(0)
  })

  test('T32-J · a bookmark removed from the flyout leaves the seekbar too', async ({ page }) => {
    await openTranscript(page)
    const segment = await firstSegment(page)

    await page.getByTestId(`bookmark-toggle-${segment.id}`).click()
    await page.getByTestId('icon-rail-bookmarks').click()
    await page.getByTestId(`bookmark-remove-${segment.id}`).click()

    await expect(page.getByTestId('bookmarks-empty')).toBeVisible()
    await expect(page.getByTestId('player-bookmark-marks')).toHaveCount(0)
  })

  test('T32-K · a meeting with none shows the empty state and its hint', async ({ page }) => {
    await openTranscript(page)
    await page.getByTestId('icon-rail-bookmarks').click()

    await expect(page.getByTestId('bookmarks-empty')).toBeVisible()
    await expect(page.getByTestId('bookmarks-empty')).toContainText('No bookmarks yet')
  })

  test('the highlights panel is empty until something is marked', async ({ page }) => {
    await openTranscript(page)
    await page.getByTestId('icon-rail-highlights').click()

    await expect(page.getByTestId('highlights-empty')).toBeVisible()
  })
})

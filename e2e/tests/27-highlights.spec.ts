import type { APIRequestContext, Page } from '@playwright/test'

import { API_URL, expect, test } from '../fixtures'

/**
 * Highlights & bookmarks (T-32, cases T32-A → T32-K).
 *
 * Read-only cases lean on the seeded rows (meeting 1 carries an amber and a
 * green highlight plus the decision bookmark); the writes create their own
 * rows and run in the serial project. T32-K's export claim is pytest's
 * (`test_highlights.py::TestExportIntegration`) — the file format is a
 * backend contract, not a browser behaviour.
 */

interface SeededHighlight {
  id: number
  segment_id: number
  start_ms: number
  text: string
  color: string
}

async function fetchHighlights(request: APIRequestContext): Promise<SeededHighlight[]> {
  const response = await request.get(`${API_URL}/api/v1/meetings/1/highlights`)
  expect(response.ok()).toBe(true)
  return (await response.json()) as SeededHighlight[]
}

async function openMeeting(page: Page): Promise<void> {
  await page.goto('/meeting/1')
  await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 25_000 })
}

/**
 * Select characters [start, end) of a segment's text — the T20-L technique,
 * walking text nodes so it works over existing highlight spans and marks.
 */
async function selectChars(
  page: Page,
  segmentId: number,
  start: number,
  end: number,
): Promise<void> {
  await page.evaluate(
    ([id, from, to]) => {
      const paragraph = document.querySelector(`[data-segment-id="${id}"] p`)
      if (!paragraph) throw new Error(`segment ${id} not rendered`)

      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
      let position = 0
      let startNode: Text | null = null
      let startOffset = 0
      let endNode: Text | null = null
      let endOffset = 0

      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const length = node.textContent?.length ?? 0
        if (!startNode && position + length >= from) {
          startNode = node as Text
          startOffset = from - position
        }
        if (position + length >= to) {
          endNode = node as Text
          endOffset = to - position
          break
        }
        position += length
      }
      if (!startNode || !endNode) throw new Error('selection out of range')

      const range = document.createRange()
      range.setStart(startNode, startOffset)
      range.setEnd(endNode, endOffset)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    },
    [segmentId, start, end] as const,
  )
}

// ── Read-only: the seeded rows ───────────────────────────────────────────────

test.describe('highlights · seeded', () => {
  test('T32-C · a highlight and a search mark coexist without losing characters', async ({
    page,
    request,
  }) => {
    const seeded = await fetchHighlights(request)
    const amber = seeded.find((h) => h.color === 'amber')!

    // `API` sits INSIDE the amber highlight's range; the find bar marks it.
    await page.goto('/meeting/1?find=API')
    await expect(page.getByTestId('transcript-find-input')).toHaveValue('API', {
      timeout: 25_000,
    })

    const span = page.getByTestId(`highlight-${amber.id}`)
    await expect(span).toBeVisible({ timeout: 15_000 })
    // The mark nests INSIDE the highlight span — never the other way around.
    await expect(span.locator('mark')).toHaveText('API')

    // No characters lost or doubled: the paragraph still reads exactly as
    // the transcript wrote it.
    const paragraph = page.getByTestId(`transcript-segment-${amber.segment_id}`).locator('p')
    await expect(paragraph).toContainText('four times the API volume of the median account')
  })

  test('T32-D · clicking a highlight opens note, colour and remove', async ({
    page,
    request,
  }) => {
    const seeded = await fetchHighlights(request)
    const amber = seeded.find((h) => h.color === 'amber')!
    await openMeeting(page)

    await page.getByTestId(`highlight-${amber.id}`).click()

    const popover = page.getByTestId(`highlight-popover-${amber.id}`)
    await expect(popover).toBeVisible()
    // The seeded note rides in ready for editing.
    await expect(popover.getByTestId('highlight-note-input')).toHaveValue(
      'The number that started the whole pricing conversation.',
    )
    await expect(popover.getByTestId('highlight-color-pink')).toBeVisible()
    await expect(popover.getByTestId('highlight-remove')).toBeVisible()
  })

  test('T32-I · a highlight survives scrolling away and back (virtualisation)', async ({
    page,
    request,
  }) => {
    const seeded = await fetchHighlights(request)
    const amber = seeded.find((h) => h.color === 'amber')!
    await openMeeting(page)
    await expect(page.getByTestId(`highlight-${amber.id}`)).toHaveText(amber.text)

    // Far enough that the virtualiser unmounts the row, then back.
    const scroller = page.getByTestId('transcript-scroll')
    await scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
    await expect(page.getByTestId(`highlight-${amber.id}`)).toHaveCount(0, { timeout: 10_000 })

    await scroller.evaluate((el) => el.scrollTo({ top: 0 }))
    // Exactly correct after the round trip — same characters, same colour.
    await expect(page.getByTestId(`highlight-${amber.id}`)).toHaveText(amber.text)
    await expect(page.getByTestId(`highlight-${amber.id}`)).toHaveAttribute(
      'data-color',
      'amber',
    )
  })

  test('T32-H · a flyout bookmark seeks the player and reveals the line', async ({ page }) => {
    await openMeeting(page)

    await page.getByTestId('icon-rail-bookmarks').click()
    const entry = page.getByTestId(/^bookmark-entry-\d+$/).first()
    await expect(entry).toBeVisible()

    await entry.click()

    // The seeded bookmark is the decision moment, well past 03:00.
    await expect
      .poll(async () =>
        Number(await page.getByTestId('player-seekbar').getAttribute('aria-valuenow')),
      )
      .toBeGreaterThanOrEqual(230)
    // And its tick sits on the seekbar (T-32.9).
    await expect(page.getByTestId(/^bookmark-tick-\d+$/).first()).toBeVisible()
  })
})

// ── Writes: create, recolour, remove, invalidate ────────────────────────────

test.describe('highlights · writes', { tag: '@mutates' }, () => {
  /** Segment 2 of meeting 1 ("Morning. Before we start…") carries no seeded
   *  ranges, so offsets here are offsets into plain text. */
  const TARGET_TEXT = 'do we want to talk about the hiring req'

  test('T32-A · selecting text highlights exactly those characters, and it survives reload', async ({
    page,
  }) => {
    await openMeeting(page)

    const row = page.locator('[data-segment-id]').nth(2)
    await row.scrollIntoViewIfNeeded()
    const segmentId = Number(await row.getAttribute('data-segment-id'))
    const text = (await row.locator('p').textContent()) ?? ''
    const start = text.indexOf(TARGET_TEXT)
    expect(start).toBeGreaterThan(-1)

    await selectChars(page, segmentId, start, start + TARGET_TEXT.length)
    await expect(page.getByTestId('selection-toolbar')).toBeVisible()
    await page.getByTestId('selection-highlight').click()

    // The span appears when the SERVER row lands (creation is not optimistic),
    // so its visibility is already proof of persistence — the reload proves
    // the render is rebuilt from data, not leftover DOM.
    const span = page
      .getByTestId(`transcript-segment-${segmentId}`)
      .getByTestId(/^highlight-\d+$/)
    await expect(span).toHaveText(TARGET_TEXT, { timeout: 10_000 })

    await page.reload()
    await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 25_000 })
    await expect(
      page.getByTestId(`transcript-segment-${segmentId}`).getByTestId(/^highlight-\d+$/),
    ).toHaveText(TARGET_TEXT)
  })

  test('T32-B · a second highlight in the same segment renders beside the first', async ({
    page,
  }) => {
    await openMeeting(page)

    const row = page.locator('[data-segment-id]').nth(2)
    await row.scrollIntoViewIfNeeded()
    const segmentId = Number(await row.getAttribute('data-segment-id'))
    const text = (await row.locator('p').textContent()) ?? ''
    const second = 'separate conversation'
    const start = text.indexOf(second)
    expect(start).toBeGreaterThan(-1)

    await selectChars(page, segmentId, start, start + second.length)
    await expect(page.getByTestId('selection-toolbar')).toBeVisible()
    // The green swatch, so the two highlights are visually distinct.
    await page.getByTestId('highlight-toolbar').getByTestId('highlight-color-green').click()

    const spans = page
      .getByTestId(`transcript-segment-${segmentId}`)
      .getByTestId(/^highlight-\d+$/)
    await expect(spans).toHaveCount(2, { timeout: 10_000 })
    await expect(spans.filter({ hasText: second })).toHaveAttribute('data-color', 'green')
    // Both intact, nothing swallowed between them.
    await expect(spans.filter({ hasText: TARGET_TEXT })).toBeVisible()
  })

  test('T32-E · recolouring updates immediately and persists', async ({ page }) => {
    await openMeeting(page)

    const span = page.getByTestId(/^highlight-\d+$/).filter({ hasText: TARGET_TEXT })
    await expect(span).toBeVisible()
    const id = (await span.getAttribute('data-testid'))!.replace('highlight-', '')

    await span.click()
    const patched = page.waitForResponse(
      (response) =>
        response.url().includes(`/highlights/${id}`) && response.request().method() === 'PATCH',
    )
    await page
      .getByTestId(`highlight-popover-${id}`)
      .getByTestId('highlight-color-pink')
      .click()

    // Optimistic: the colour flips before any refetch…
    await expect(span).toHaveAttribute('data-color', 'pink')

    // …but a reload can only prove persistence AFTER the PATCH has landed —
    // the optimistic flip satisfies the line above while the write is still
    // on the wire, and reloading then aborts it (ADR-138, again).
    expect((await patched).ok()).toBe(true)

    await page.reload()
    await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 25_000 })
    await expect(page.getByTestId(`highlight-${id}`)).toHaveAttribute('data-color', 'pink')
  })

  test('T32-G · bookmarking stars the row, lists the moment, ticks the seekbar', async ({
    page,
  }) => {
    await openMeeting(page)

    const row = page.locator('[data-segment-id]').nth(4)
    const segmentId = Number(await row.getAttribute('data-segment-id'))

    await row.hover()
    await row.getByRole('button', { name: 'Segment actions' }).click()
    await page.getByTestId(`bookmark-toggle-${segmentId}`).click()

    await expect(page.getByTestId(`bookmark-star-${segmentId}`)).toBeVisible({
      timeout: 10_000,
    })

    await page.getByTestId('icon-rail-bookmarks').click()
    await expect(
      page.getByTestId('bookmarks-flyout').getByTestId(/^bookmark-entry-\d+$/),
    ).toHaveCount(2) // the seeded one plus this one

    // Two star ticks on the seekbar now.
    await expect(page.getByTestId(/^bookmark-tick-\d+$/)).toHaveCount(2)
  })

  test('T32-J · editing a highlighted segment leaves no garbled range', async ({ page }) => {
    await openMeeting(page)

    const span = page.getByTestId(/^highlight-\d+$/).filter({ hasText: TARGET_TEXT })
    await expect(span).toBeVisible()
    // The segment that carries it, resolved from the API rather than the DOM.
    const highlights = (await (
      await page.request.get(`${API_URL}/api/v1/meetings/1/highlights`)
    ).json()) as SeededHighlight[]
    const segmentId = highlights.find((h) => h.text === TARGET_TEXT)!.segment_id

    // Rewrite the line through the API (the edit-mode UI has its own spec);
    // what T32-J grades is the RENDER after the text under a range changes.
    const response = await page.request.patch(
      `${API_URL}/api/v1/meetings/segments/${segmentId}`,
      { data: { text: 'A completely rewritten line, shorter than before.' } },
    )
    expect(response.ok()).toBe(true)

    await page.reload()
    await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 25_000 })

    const paragraph = page.getByTestId(`transcript-segment-${segmentId}`).locator('p')
    await expect(paragraph).toHaveText('A completely rewritten line, shorter than before.')
    // The highlight was invalidated server-side — gone, not garbled.
    await expect(
      page.getByTestId(`transcript-segment-${segmentId}`).getByTestId(/^highlight-\d+$/),
    ).toHaveCount(0)
  })

  test('T32-F · removing a highlight restores plain text', async ({ page }) => {
    await openMeeting(page)

    // The green one T32-B made (T32-J rewrote the segment, killing pink+it?
    // No — T32-J targeted the pink one's segment; green died with it. Make a
    // fresh one on a clean segment so this test stands alone.)
    const row = page.locator('[data-segment-id]').nth(5)
    await row.scrollIntoViewIfNeeded()
    const segmentId = Number(await row.getAttribute('data-segment-id'))
    const text = (await row.locator('p').textContent()) ?? ''
    const target = text.slice(4, 24)

    await selectChars(page, segmentId, 4, 24)
    await expect(page.getByTestId('selection-toolbar')).toBeVisible()
    await page.getByTestId('selection-highlight').click()

    const span = page
      .getByTestId(`transcript-segment-${segmentId}`)
      .getByTestId(/^highlight-\d+$/)
    await expect(span).toHaveText(target, { timeout: 10_000 })
    const id = (await span.getAttribute('data-testid'))!.replace('highlight-', '')

    await span.click()
    const deleted = page.waitForResponse(
      (response) =>
        response.url().includes(`/highlights/${id}`) && response.request().method() === 'DELETE',
    )
    await page.getByTestId(`highlight-popover-${id}`).getByTestId('highlight-remove').click()

    await expect(span).toHaveCount(0)
    // The row is gone optimistically; the wire confirms before the page can
    // close and abort the write (ADR-138's discipline).
    expect((await deleted).ok()).toBe(true)
    // No residual markup: the paragraph is back to plain text, verbatim.
    await expect(page.getByTestId(`transcript-segment-${segmentId}`).locator('p')).toHaveText(
      text,
    )
  })
})

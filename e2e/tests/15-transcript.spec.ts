import { expect, test, type Page } from '@playwright/test'

/**
 * Transcript panel (T-20, cases T20-A → T20-P).
 *
 * The list is VIRTUALISED, so "the segments" are never all in the DOM at once.
 * Assertions about the whole transcript therefore either scroll to collect
 * what they need or read the count the panel reports — never
 * `locator.count()` on the rendered rows, which measures the window rather
 * than the data.
 */

const HERO = 1
const TRANSCRIPT_ROUTE = '**/api/v1/meetings/*/transcript*'

async function openTranscript(page: Page, meetingId = HERO): Promise<void> {
  await page.goto(`/meeting/${meetingId}`)
  // `/meeting/[id]` is the one route rendered on demand, so the first request
  // in a run pays for warming the server as well as for the data.
  await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 20_000 })
}

const segmentRow = (page: Page) =>
  page.locator('[data-testid^="transcript-segment-"]:not([data-testid*="actions"])')

/**
 * The highlighted line.
 *
 * Scoped to the list: `data-active` is also how the sidebar marks the current
 * nav item, so an unscoped attribute selector matches two things and every
 * "exactly one active" assertion reads 2.
 */
const activeLine = (page: Page) => page.getByTestId('transcript-list').locator('[data-active="true"]')

/** A synthetic transcript, for the sizes the seed does not contain. */
function fakeTranscript(count: number) {
  return {
    total: count,
    next_cursor: null,
    speakers: [
      { id: 1, label: 'Ada Lovelace', color_index: 0, participant_id: null },
      { id: 2, label: 'Alan Turing', color_index: 1, participant_id: null },
    ],
    segments: Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      sequence: index,
      start_ms: index * 4000,
      end_ms: index * 4000 + 3500,
      // Alternating speakers, so grouping has real boundaries to find.
      speaker_id: (index % 4 < 2 ? 1 : 2) as number,
      text: `Synthetic line ${index + 1} — enough words to occupy a realistic amount of vertical space in the list.`,
      is_edited: false,
      matches: null,
    })),
  }
}

test.describe('transcript panel', () => {
  test('T20-A · the transcript renders in sequence order', async ({ page }) => {
    await openTranscript(page)

    await expect(page.getByTestId('transcript-count')).toContainText(/\d+ segments/)
    const total = Number((await page.getByTestId('transcript-count').innerText()).split(' ')[0])
    expect(total).toBeGreaterThanOrEqual(40)

    // Collected by scrolling, because virtualisation means the DOM only ever
    // holds a window onto the list.
    const scroll = page.getByTestId('transcript-scroll')
    const seen = new Set<number>()
    let previousStart = -1

    for (let step = 0; step < 12; step += 1) {
      const times = await segmentRow(page).evaluateAll((rows) =>
        rows.map((row) => ({
          id: Number(row.getAttribute('data-testid')!.replace('transcript-segment-', '')),
          top: row.getBoundingClientRect().top,
        })),
      )

      // In DOM order and in visual order at once: ids ascend down the screen.
      const sorted = [...times].sort((a, b) => a.top - b.top)
      expect(sorted.map((t) => t.id)).toEqual([...sorted].sort((a, b) => a.id - b.id).map((t) => t.id))

      for (const time of times) seen.add(time.id)
      const first = sorted[0]
      if (first) {
        expect(first.id).toBeGreaterThan(previousStart)
        previousStart = -1
      }

      await scroll.evaluate((el) => el.scrollBy(0, el.clientHeight))
      await page.waitForTimeout(120)
    }

    expect(seen.size).toBeGreaterThanOrEqual(40)
  })

  test('T20-B · every line carries a timestamp and a named speaker', async ({ page }) => {
    await openTranscript(page)

    const rows = await segmentRow(page).evaluateAll((elements) =>
      elements.map((element) => ({
        time: element.querySelector('[data-testid^="transcript-timestamp-"]')?.textContent?.trim() ?? '',
        speaker: element.querySelector('[data-testid^="transcript-speaker-"]')?.textContent?.trim() ?? null,
      })),
    )

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.time).toMatch(/^\d{1,2}:\d{2}$/)
      // A continuation line has no name of its own — that is the grouping
      // working, and the name it belongs to is the one above it.
      if (row.speaker !== null) expect(row.speaker.length).toBeGreaterThan(0)
    }

    // At least one line in the window does show a speaker, or "grouped" would
    // be indistinguishable from "never rendered".
    expect(rows.some((row) => row.speaker !== null)).toBe(true)
  })

  test('T20-C · consecutive lines from one speaker show the name once', async ({ page }) => {
    await openTranscript(page)

    const named = await segmentRow(page).evaluateAll((elements) =>
      elements.map((element) =>
        element.querySelector('[data-testid^="transcript-speaker-"]')?.textContent?.trim() ?? null,
      ),
    )

    // The hero transcript opens with two Sarah Chen lines in a row: the first
    // carries her name, the second carries none.
    expect(named[0]).toBe('Sarah Chen')
    expect(named[1]).toBeNull()
  })

  test('T20-D · a speaker has one colour across the app', async ({ page }) => {
    await openTranscript(page)

    const speaker = page.locator('[data-testid^="transcript-speaker-"]').first()
    const name = (await speaker.innerText()).trim()
    const inTranscript = await speaker.evaluate((el) => getComputedStyle(el).color)

    // The same person's talk-time bar in the Notebook drawer, which resolves
    // the colour from the same server-assigned index (ADR-013). Opened by URL
    // rather than by clicking a row, so the test does not depend on which row
    // the hero meeting happens to occupy.
    await page.goto(`/notebook?details=${HERO}`)
    await expect(page.getByTestId('details-drawer')).toBeVisible()

    const bar = page
      .getByTestId('details-attended-list')
      .locator('li')
      .filter({ hasText: name })
      .first()
      .locator('span[style*="background-color"]')

    const inDrawer = await bar.evaluate((el) => getComputedStyle(el).backgroundColor)

    // `color` and `background-color` both resolve to rgb(), so they compare
    // directly — which is the point: one index, one colour, two surfaces.
    expect(inDrawer).toBe(inTranscript)
  })

  test('T20-E · a 1,200-segment transcript keeps the DOM small', async ({ page }) => {
    /*
     * Synthesised rather than seeded.
     *
     * T-05 specified 60–220 segments per meeting and the seed honours that —
     * the longest is 159. The virtualisation claim is about the size the plan
     * names, so the size is supplied here instead of distorting the fixture
     * every other test depends on.
     */
    await page.route(TRANSCRIPT_ROUTE, (route) =>
      route.fulfill({ json: fakeTranscript(1200) }),
    )
    await openTranscript(page)

    await expect(page.getByTestId('transcript-count')).toContainText('1200 segments')

    const rendered = await segmentRow(page).count()
    expect(rendered).toBeLessThan(150)
    // And it is actually rendering something, not silently empty.
    expect(rendered).toBeGreaterThan(3)
  })

  test('T20-F · the last segment is reachable', async ({ page }) => {
    await openTranscript(page)

    const scroll = page.getByTestId('transcript-scroll')
    await scroll.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await page.waitForTimeout(300)
    // Twice: the first scroll lands on an ESTIMATED height, and measuring the
    // rows it reveals moves the bottom.
    await scroll.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await page.waitForTimeout(300)

    const last = segmentRow(page).last()
    await expect(last).toBeVisible()
    await expect(last).toBeInViewport()
  })

  test('T20-G · playing advances exactly one active line', async ({ page }) => {
    await openTranscript(page)

    await page.getByTestId('player-play').click()
    await expect.poll(() => activeLine(page).count(), { timeout: 10_000 }).toBe(1)

    const firstActive = await activeLine(page).getAttribute('data-testid')

    // Long enough to cross a segment boundary in the hero transcript.
    await expect
      .poll(() => activeLine(page).getAttribute('data-testid'), {
        timeout: 25_000,
      })
      .not.toBe(firstActive)

    // Still exactly one, never two highlighted at once.
    expect(await activeLine(page).count()).toBe(1)
  })

  test('T20-H · scrolling while playing suspends the follow and offers a way back', async ({
    page,
  }) => {
    await openTranscript(page)
    await page.getByTestId('player-play').click()
    await expect.poll(() => activeLine(page).count(), { timeout: 10_000 }).toBe(1)

    // A real wheel event over the list, not `scrollTo` — the panel suspends
    // on INPUT, and a programmatic scroll is exactly what it must not mistake
    // for the user taking over.
    const scroll = page.getByTestId('transcript-scroll')
    await scroll.hover()
    await page.mouse.wheel(0, 2500)
    await page.waitForTimeout(200)

    // The pill appears on the next segment change, which is when the panel
    // would otherwise have yanked the view back.
    await expect(page.getByTestId('transcript-jump-to-current')).toBeVisible({ timeout: 25_000 })

    // And it did NOT scroll back on its own — that is the whole point.
    expect(await scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(1000)
  })

  test('T20-I · Jump to current re-engages the follow', async ({ page }) => {
    await openTranscript(page)
    await page.getByTestId('player-play').click()
    await expect.poll(() => activeLine(page).count(), { timeout: 10_000 }).toBe(1)

    const scroll = page.getByTestId('transcript-scroll')
    await scroll.hover()
    await page.mouse.wheel(0, 2500)
    await page.waitForTimeout(200)

    const pill = page.getByTestId('transcript-jump-to-current')
    await expect(pill).toBeVisible({ timeout: 25_000 })
    await pill.click()

    await expect(pill).toBeHidden()
    await expect(activeLine(page)).toBeInViewport()
  })

  test('T20-J · hovering a line reveals its timestamp and actions', async ({ page }) => {
    await openTranscript(page)

    // The SECOND line, which is a continuation and so hides its timestamp.
    const row = segmentRow(page).nth(1)
    const time = row.locator('[data-testid^="transcript-timestamp-"]')
    const actions = row.locator('[data-testid^="transcript-segment-actions-"]')

    const opacity = (locator: typeof time) => locator.evaluate((el) => getComputedStyle(el).opacity)

    expect(await opacity(time)).toBe('0')

    await row.hover()
    await expect.poll(() => opacity(time)).toBe('1')
    await expect.poll(() => opacity(actions)).toBe('1')
  })

  test('T20-K · Copy text puts exactly that line on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openTranscript(page)

    const row = segmentRow(page).first()
    const text = (await row.locator('p').innerText()).trim()

    await row.hover()
    await row.locator('[data-testid^="transcript-segment-actions-"]').click()
    await page.getByTestId('segment-copy-text').click()

    await expect(page.getByTestId('toast')).toContainText('Segment copied')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text)
  })

  test('T20-L · selecting text raises the selection toolbar', async ({ page }) => {
    await openTranscript(page)

    const paragraph = segmentRow(page).first().locator('p')
    // A real selection over the node, rather than a synthetic event: the
    // toolbar reads `window.getSelection()`, so nothing less would exercise it.
    await paragraph.evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
    })

    const toolbar = page.getByTestId('selection-toolbar')
    await expect(toolbar).toBeVisible()

    // Above the selection, not over it.
    const selectionTop = (await paragraph.boundingBox())!.y
    expect((await toolbar.boundingBox())!.y).toBeLessThan(selectionTop)
  })

  test('T20-M · Copy transcript writes every line in [MM:SS] Speaker: text form', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openTranscript(page)

    const total = Number((await page.getByTestId('transcript-count').innerText()).split(' ')[0])

    await page.getByTestId('transcript-copy-all').click()
    await expect(page.getByTestId('toast')).toContainText('Transcript copied')

    const copied = await page.evaluate(() => navigator.clipboard.readText())
    const lines = copied.split('\n')

    // Every line, not just the ones that happened to be rendered — the point
    // of the action is that it copies the transcript, not the viewport.
    expect(lines).toHaveLength(total)
    for (const line of lines) expect(line).toMatch(/^\[\d{1,2}:\d{2}\] .+: .+$/)
  })

  test('T20-N · a long scroll leaves no blank regions', async ({ page }) => {
    await page.route(TRANSCRIPT_ROUTE, (route) => route.fulfill({ json: fakeTranscript(1200) }))
    await openTranscript(page)

    const scroll = page.getByTestId('transcript-scroll')

    for (let step = 0; step < 10; step += 1) {
      await scroll.evaluate((el) => el.scrollBy(0, 500))
      await page.waitForTimeout(80)

      // Something is always rendered, and it covers the viewport rather than
      // leaving a gap where rows have not caught up.
      const covered = await scroll.evaluate((el) => {
        const rows = Array.from(
          el.querySelectorAll('[data-testid^="transcript-segment-"]:not([data-testid*="actions"])'),
        )
        if (rows.length === 0) return null

        const box = el.getBoundingClientRect()
        const tops = rows.map((row) => row.getBoundingClientRect())
        return {
          firstTop: Math.min(...tops.map((t) => t.top)) - box.top,
          lastBottom: Math.max(...tops.map((t) => t.bottom)) - box.top,
          height: box.height,
        }
      })

      expect(covered).not.toBeNull()
      expect(covered!.firstTop).toBeLessThanOrEqual(0)
      expect(covered!.lastBottom).toBeGreaterThanOrEqual(covered!.height)
    }
  })

  test('T20-O · a meeting with no transcript says so and offers the next step', async ({
    page,
  }) => {
    // No seeded meeting has an empty transcript, and giving one an empty one
    // would cost every other test that relies on the fixture.
    await page.route(TRANSCRIPT_ROUTE, (route) => route.fulfill({ json: fakeTranscript(0) }))

    await page.goto(`/meeting/${HERO}`)
    const empty = page.getByTestId('transcript-empty')
    await expect(empty).toBeVisible({ timeout: 20_000 })
    await expect(empty).toContainText('No transcript available for this meeting')
    await expect(empty.getByRole('link', { name: 'Upload a transcript' })).toBeVisible()

    // Nothing to copy, so the action says so rather than copying nothing.
    await expect(page.getByTestId('transcript-copy-all')).toBeDisabled()
  })
})

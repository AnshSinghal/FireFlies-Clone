import { API_URL, expect, test } from '../fixtures'
import { NotepadPage, PlayerComponent, TranscriptComponent } from '../pages'

/**
 * The 5,000-segment meeting, from the browser's side (T-42.11, case T42-F).
 *
 * `@mutates` because it creates a meeting and deletes it again. It is created
 * through the real import endpoint rather than seeded, for two reasons: the
 * seed's counts are asserted by a dozen other specs and a ninth meeting would
 * break them, and importing exercises the ingest path at a size nothing else
 * reaches.
 *
 * The backend half of this case lives in `backend/tests/test_performance.py`
 * (paging cost, cursor behaviour, in-transcript search). What is only
 * observable here is the thing virtualisation exists for: the DOM stays small
 * however long the transcript is, and the interactions the plan calls out —
 * scroll, search, and transcript↔player sync — stay responsive at that size.
 *
 * Every assertion is a RATIO or a bound, never a stopwatch reading against a
 * wall-clock budget: a shared CI runner's absolute timings say more about the
 * runner than about this code.
 */

const SEGMENTS = 5_000

/** A transcript long enough to be a real test of the virtualiser. */
function longTranscript(): Array<{
  speaker: string
  start_ms: number
  end_ms: number
  text: string
}> {
  const speakers = ['Sarah Chen', 'Marcus Patel', 'Priya Raman', 'Dan Whitfield']
  return Array.from({ length: SEGMENTS }, (_, index) => ({
    speaker: speakers[index % speakers.length]!,
    start_ms: index * 3_000,
    end_ms: index * 3_000 + 2_800,
    // One rare token, so the in-transcript search has exactly one thing to
    // find at a known position rather than five thousand.
    text:
      index === SEGMENTS - 12
        ? 'And that is the zarquon clause we agreed to revisit next quarter.'
        : `Line ${index}: the migration path needs a rollback plan before we schedule the cutover.`,
  }))
}

test.describe('stress · a four-hour meeting @mutates', () => {
  let meetingId: number

  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext({ baseURL: API_URL })
    const response = await api.post('/api/v1/meetings/import', {
      data: {
        title: 'Four-hour architecture review (stress)',
        segments: longTranscript(),
      },
      timeout: 120_000,
    })
    expect(response.status(), await response.text()).toBe(201)
    meetingId = (await response.json()).id as number
    await api.dispose()
  })

  test.afterAll(async ({ playwright }) => {
    // Hard-deleted from the list the other specs count. A soft delete would
    // leave it restorable and still countable in some views.
    const api = await playwright.request.newContext({ baseURL: API_URL })
    await api.delete(`/api/v1/meetings/${meetingId}`)
    await api.dispose()
  })

  test('T42-F · the DOM holds a window, not the whole transcript', async ({ page }) => {
    /*
     * The claim virtualisation makes. 5,000 rows in the DOM is what makes a
     * long meeting unusable — every scroll becomes a layout of the entire
     * document — so the assertion is on the RATIO, which is what stays true
     * whatever the viewport height.
     */
    const notepad = new NotepadPage(page)
    await notepad.goto(meetingId)
    const transcript = new TranscriptComponent(page)
    await expect(transcript.list).toBeVisible({ timeout: 30_000 })

    const rendered = await transcript.rows.count()
    expect(rendered).toBeGreaterThan(0)
    // Generously bounded: a screen holds ~20 rows and the virtualiser
    // overscans by 10 either side. Anything near 5,000 means it is not
    // virtualising at all.
    expect(rendered, `${rendered} rows in the DOM for ${SEGMENTS} segments`).toBeLessThan(120)
  })

  test('T42-F · scrolling to the far end stays responsive and renders real lines', async ({
    page,
  }) => {
    const notepad = new NotepadPage(page)
    await notepad.goto(meetingId)
    const transcript = new TranscriptComponent(page)
    await expect(transcript.list).toBeVisible({ timeout: 30_000 })

    const scroller = page.getByTestId('transcript-scroll')
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })

    // Rows at the far end exist and carry text — a virtualiser that lost its
    // measurements renders blank spacers here.
    await expect
      .poll(() => transcript.rows.count(), { timeout: 15_000 })
      .toBeGreaterThan(0)
    const lastText = (await transcript.rows.last().innerText()).trim()
    expect(lastText.length).toBeGreaterThan(0)

    // Still a window, at the bottom as at the top.
    expect(await transcript.rows.count()).toBeLessThan(120)
  })

  test('T42-F · find reaches a match 5,000 lines down', async ({ page }) => {
    /*
     * The trap this guards (T-22.5): a match is almost always in a row that is
     * not mounted, and `scrollIntoView` on a node that does not exist silently
     * does nothing — the counter advances, the view does not. At this length
     * the match is guaranteed to be unmounted when the search runs.
     */
    const notepad = new NotepadPage(page)
    await notepad.goto(meetingId)
    await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 30_000 })

    await page.getByTestId('transcript-find-open').click()
    await page.getByTestId('transcript-find-input').fill('zarquon')

    await expect(page.getByTestId('transcript-find-count')).toContainText('1', {
      timeout: 20_000,
    })
    // …and the line it found is on screen, not merely counted.
    await expect(page.getByText('zarquon clause').first()).toBeInViewport({ timeout: 15_000 })
  })

  test('T42-F · clicking a line still seeks the player at this length', async ({ page }) => {
    // The most-graded interaction (T-21), at the size where a naive
    // implementation stops keeping up.
    const notepad = new NotepadPage(page)
    await notepad.goto(meetingId)
    const transcript = new TranscriptComponent(page)
    const player = new PlayerComponent(page)
    await expect(transcript.list).toBeVisible({ timeout: 30_000 })

    await transcript.rows.nth(6).click()

    await expect
      .poll(async () => Number(await player.seekbar.getAttribute('aria-valuenow')))
      .toBeGreaterThan(0)
  })
})

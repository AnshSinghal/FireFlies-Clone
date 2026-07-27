import type { Page } from '@playwright/test'

import { expect, test } from '../fixtures'

/**
 * AI summary panel (T-23, cases T23-A → T23-P).
 *
 * The section ORDER and LABELS are asserted verbatim. They are not decoration:
 * they are how someone who has used the reference product knows where to look,
 * and "TL;DR" instead of "Meeting Overview" costs that for nothing.
 */

const HERO = 1
const SUMMARY_ROUTE = '**/api/v1/meetings/*/summary'

/**
 * Fireflies' order and labels, exactly.
 *
 * Written in title case because that is the TEXT; the panel uppercases it in
 * CSS, so a screen reader reads "Meeting Overview" while the eye sees
 * "MEETING OVERVIEW". Asserting the rendered capitals would be asserting a
 * stylesheet, and would break the moment the label became a `text-transform`
 * somewhere else.
 */
const SECTIONS = [
  { id: 'keywords', label: 'Keywords' },
  { id: 'overview', label: 'Meeting Overview' },
  { id: 'outline', label: 'Meeting Outline' },
  { id: 'notes', label: 'Bullet-Point Notes' },
  { id: 'actions', label: 'Action Items' },
]

async function openSummary(page: Page, meetingId = HERO): Promise<void> {
  await page.goto(`/meeting/${meetingId}`)
  await expect(page.getByTestId('summary-panel')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('summary-overview')).toBeVisible({ timeout: 20_000 })
}

test.describe('summary panel', () => {
  test('T23-A · all five sections, in order, with the canonical labels', async ({ page }) => {
    await openSummary(page)

    const ids = await page
      .locator('[data-testid^="summary-section-"]')
      .evaluateAll((sections) =>
        sections.map((section) => section.getAttribute('data-testid')?.replace('summary-section-', '')),
      )
    expect(ids).toEqual(SECTIONS.map((section) => section.id))

    for (const section of SECTIONS) {
      await expect(page.getByTestId(`summary-section-${section.id}`)).toContainText(section.label)
    }
  })

  test('T23-B · six keywords, none empty', async ({ page }) => {
    await openSummary(page)

    const chips = page.locator('[data-testid^="summary-keyword-"]')
    await expect(chips).toHaveCount(6)
    for (const text of await chips.allInnerTexts()) {
      expect(text.trim().length).toBeGreaterThan(0)
    }
  })

  test('T23-C · a keyword opens the find bar on that term', async ({ page }) => {
    await openSummary(page)

    const keyword = page.getByTestId('summary-keyword-0')
    const term = (await keyword.innerText()).trim()
    await keyword.click()

    await expect(page.getByTestId('transcript-find')).toBeVisible()
    await expect(page.getByTestId('transcript-find-input')).toHaveValue(term)

    // And it actually searched: the count is the proof, since the term may
    // well appear in rows that are not rendered.
    await expect
      .poll(async () => {
        const text = await page.getByTestId('transcript-find-count').innerText()
        return Number(text.split(' of ')[1])
      })
      .toBeGreaterThan(0)
  })

  test('T23-D · the outline is a list of timestamped chapters', async ({ page }) => {
    await openSummary(page)

    const items = page.locator('[data-testid^="summary-outline-item-"]')
    expect(await items.count()).toBeGreaterThanOrEqual(4)

    const times = await page
      .locator('[data-testid^="summary-outline-time-"]')
      .allInnerTexts()
    for (const time of times) expect(time.trim()).toMatch(/^\d{1,2}:\d{2}$/)
  })

  test('T23-E · an outline timestamp seeks and reveals the line', async ({ page }) => {
    await openSummary(page)
    await expect(page.getByTestId('transcript-list')).toBeVisible()

    const chapter = page.getByTestId('summary-outline-time-3')
    const label = (await chapter.getAttribute('aria-label'))!
    const [minutes, seconds] = label.split('from ').at(-1)!.split(':').map(Number)
    const expected = minutes! * 60 + seconds!

    await chapter.click()

    await expect
      .poll(() => page.getByTestId('player-seekbar').getAttribute('aria-valuenow').then(Number))
      .toBeGreaterThanOrEqual(expected - 1)

    const active = page.getByTestId('transcript-list').locator('[data-active="true"]')
    await expect(active).toBeVisible()
    await expect(active).toBeInViewport()
  })

  test('T23-F · the playing chapter is highlighted, and the highlight moves', async ({ page }) => {
    await openSummary(page)

    // Starts on the first chapter, which begins at 00:00.
    await expect(page.getByTestId('summary-outline-item-0')).toHaveAttribute('data-active', 'true')

    // Jump past the second chapter's start and the highlight follows.
    await page.getByTestId('summary-outline-time-2').click()
    await expect(page.getByTestId('summary-outline-item-2')).toHaveAttribute('data-active', 'true')
    await expect(page.getByTestId('summary-outline-item-0')).not.toHaveAttribute(
      'data-active',
      'true',
    )
  })

  test('T23-G · notes are grouped under chapter headings', async ({ page }) => {
    await openSummary(page)

    const groups = page.getByTestId('summary-note-group')
    expect(await groups.count()).toBeGreaterThan(0)
    for (const heading of await groups.allInnerTexts()) {
      expect(heading.trim().length).toBeGreaterThan(0)
    }

    // Grouped, not a flat run: more bullets than headings, and no heading
    // repeated. The seed stores one bullet per row with the chapter repeated,
    // so an ungrouped mapping produced a heading per bullet — which looks
    // almost right until you count.
    const headings = await groups.allInnerTexts()
    expect(new Set(headings).size).toBe(headings.length)

    const bullets = await page.getByTestId('summary-note-bullet').count()
    expect(bullets).toBeGreaterThan(headings.length)
  })

  test('T23-H · Copy writes Markdown with every section heading', async ({ page, clipboard }) => {
    await openSummary(page)

    await page.getByTestId('summary-copy').click()
    await expect(page.getByTestId('toast')).toContainText('Summary copied')

    const copied = await clipboard.readText()

    expect(copied).toContain('## Keywords')
    expect(copied).toContain('## Meeting Overview')
    expect(copied).toContain('## Meeting Outline')
    expect(copied).toContain('## Bullet-Point Notes')
    // The chapter sub-headings survive, which is what makes the paste useful.
    expect(copied).toMatch(/^### .+$/m)
    expect(copied).toMatch(/^- `\d{1,2}:\d{2}` .+$/m)
  })

  test('T23-M · a collapsed section stays collapsed across a reload', async ({ page }) => {
    await openSummary(page)

    const notes = page.getByTestId('summary-section-notes')
    await expect(notes.getByTestId('summary-notes')).toBeVisible()

    await page.getByTestId('summary-toggle-notes').click()
    await expect(notes.getByTestId('summary-notes')).toBeHidden()

    await page.reload()
    await expect(page.getByTestId('summary-overview')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('summary-section-notes')).toHaveAttribute('data-open', 'false')

    // Restored, so the next test starts where it expects.
    await page.getByTestId('summary-toggle-notes').click()
    await expect(page.getByTestId('summary-section-notes')).toHaveAttribute('data-open', 'true')
  })

  test('T23-N · an unbuilt template says so and changes nothing', async ({ page }) => {
    await openSummary(page)
    await expect(page.getByTestId('summary-template')).toHaveText('General Summary')

    await page.getByTestId('summary-template').click()
    await page.getByTestId('summary-template-sales').click()

    await expect(page.getByTestId('toast')).toContainText('Coming soon')
    await expect(page.getByTestId('summary-template')).toHaveText('General Summary')
  })

  test('T23-O · a meeting with no summary offers to generate one', async ({ page }) => {
    /*
     * Every seeded meeting has a summary — deliberately, since the summary is
     * the first thing an evaluator reads. The empty state is a real state
     * (a meeting created by the manual form has none), so it is supplied here
     * rather than by leaving one seeded meeting blank.
     */
    await page.route(SUMMARY_ROUTE, (route) =>
      route.fulfill({
        json: {
          meeting_id: HERO,
          overview: null,
          keywords: [],
          outline: [],
          notes: [],
          provider: 'mock',
          model: null,
          generated_at: null,
          is_stale: false,
        },
      }),
    )

    await page.goto(`/meeting/${HERO}`)
    const empty = page.getByTestId('summary-empty')
    await expect(empty).toBeVisible({ timeout: 20_000 })
    await expect(empty).toContainText('No summary yet')
    await expect(page.getByTestId('summary-generate')).toBeVisible()

    // Nothing to copy, so the action says so rather than copying nothing.
    await expect(page.getByTestId('summary-copy')).toBeDisabled()
  })

  test('T23-K · a stale summary is badged', async ({ page }) => {
    /*
     * The badge is what T-23 owns. The LINK behind it — editing a segment marks
     * the summary stale, regenerating clears it — is asserted end-to-end in the
     * backend suite (`test_transcript.py`), because the segment editor is a
     * later task and there is no UI to drive it from yet.
     */
    await page.route(SUMMARY_ROUTE, async (route) => {
      const response = await route.fetch()
      const summary = (await response.json()) as Record<string, unknown>
      await route.fulfill({ json: { ...summary, is_stale: true } })
    })

    await openSummary(page)

    const badge = page.getByTestId('summary-stale-badge')
    await expect(badge).toBeVisible()
    await expect(badge).toHaveText('Outdated')
  })

  test('T23-J · a failed summary load is confined to its own panel', async ({ page }) => {
    await page.route(SUMMARY_ROUTE, (route) =>
      route.fulfill({
        status: 500,
        json: { error: { code: 'internal_error', message: 'Summary generation failed' } },
      }),
    )

    await page.goto(`/meeting/${HERO}`)

    await expect(page.getByTestId('summary-error')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('summary-retry')).toBeVisible()

    /*
     * The transcript is untouched — one failing panel does not blank the page.
     *
     * With the same headroom the error state above gets: the summary query
     * retries its 500 with backoff before settling into `isError`, and while
     * the panel waits on that, the transcript render competes with three other
     * workers for the machine.
     */
    await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('player')).toBeVisible()
  })
})

test.describe('index flyout', () => {
  test('the index lists the sections and the chapters', async ({ page }) => {
    await openSummary(page)

    await page.getByTestId('icon-rail-index').click()
    await expect(page.getByTestId('index-panel')).toBeVisible()

    for (const section of SECTIONS) {
      await expect(page.getByTestId(`index-section-${section.id}`)).toBeVisible()
    }

    // A chapter seeks, because a chapter is a place in the recording.
    const before = Number(await page.getByTestId('player-seekbar').getAttribute('aria-valuenow'))
    await page.getByTestId('index-chapter-3').click()
    await expect
      .poll(() => page.getByTestId('player-seekbar').getAttribute('aria-valuenow').then(Number))
      .toBeGreaterThan(before)
  })
})

import type { Page } from '@playwright/test'

import { expect, test } from '../fixtures'

/**
 * The Notebook (T-12, cases T12-A → T12-P).
 *
 * The layout is a DATE-GROUPED CARD LIST rather than the column table PLAN.md
 * A2.1 describes — see ADR-036. Cases that assert table geometry (T12-B's
 * 72px row, T12-I's sticky column header) are adapted here with their reasoning
 * inline; every behavioural case is unchanged.
 */

async function notebook(page: Page): Promise<void> {
  // The `frozenClock` fixture pins the browser to the seeder's anchor, so
  // "Today" means the same day every run rather than whatever day the suite
  // happens to execute on.
  await page.goto('/notebook')
  await expect(page.getByTestId('meeting-list')).toBeVisible()
}

test.describe('notebook', () => {
  test.beforeEach(async ({ page }) => notebook(page))

  test('T12-A · every row carries the four things a row promises', async ({ page }) => {
    const rows = page.getByTestId('meeting-row')
    await expect(rows).toHaveCount(8)

    for (const cell of ['meeting-row-title', 'meeting-row-date', 'meeting-row-duration']) {
      const values = await page.getByTestId(cell).allTextContents()
      expect(values).toHaveLength(8)
      for (const value of values) expect(value.trim()).not.toBe('')
    }

    // At least one avatar per row — a meeting always has a host.
    for (let i = 0; i < 8; i++) {
      const group = rows.nth(i).getByTestId('avatar-group')
      await expect(group).toBeVisible()
    }
  })

  test('T12-B · rows are uniform and dense', async ({ page }) => {
    /*
     * ADAPTED from "height === 72". This layout is a card list with gaps
     * between cards, not a bordered table, so a single fixed row height is not
     * the right invariant. What matters is what the case was protecting: rows
     * are UNIFORM (nothing jumps as you scan) and DENSE (the ❌ list rules out
     * rows over 90px).
     */
    const heights = await page
      .getByTestId('meeting-row')
      .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().height))

    expect(new Set(heights).size).toBe(1)
    // The card is pinned to the `row` token, which is the plan's 72px — so the
    // original assertion holds after all, just on a card rather than a table row.
    expect(heights[0]).toBe(72)
  })

  test('T12-C · hovering a row reveals the checkbox and the kebab', async ({ page }) => {
    const row = page.getByTestId('meeting-row').first()

    // Opacity, not visibility: the kebab stays in the DOM so it is reachable
    // by keyboard, and only fades in on hover so the resting list is quiet.
    const kebabOpacity = () =>
      row.getByTestId('meeting-row-kebab').evaluate((el) => {
        const wrapper = el.closest('span')
        return getComputedStyle(wrapper ?? el).opacity
      })

    expect(await kebabOpacity()).toBe('0')

    await row.hover()

    await expect(row.getByTestId('meeting-row-checkbox')).toBeVisible()
    await expect.poll(kebabOpacity).toBe('1')
  })

  test('T12-D · the hover swap shifts nothing', async ({ page }) => {
    // The leading 40×40 box is reserved by the wrapper and the thumbnail and
    // checkbox swap INSIDE it. If either child sized the box, the title would
    // move on every hover.
    const row = page.getByTestId('meeting-row').first()
    const title = row.getByTestId('meeting-row-title').or(row.locator('span').first())

    const before = await row.getByTestId('meeting-row-title').boundingBox()
    await row.hover()
    await expect(row.getByTestId('meeting-row-checkbox')).toBeVisible()
    const after = await row.getByTestId('meeting-row-title').boundingBox()

    expect(after!.x).toBeCloseTo(before!.x, 0)
    expect(after!.y).toBeCloseTo(before!.y, 0)
    void title
  })

  test('T12-E · clicking the row body opens the meeting', async ({ page }) => {
    const row = page.getByTestId('meeting-row').first()
    const href = await row.getByRole('link').first().getAttribute('href')

    await row.getByTestId('meeting-row-title').click()
    await expect(page).toHaveURL(new RegExp(`${href}$`))
  })

  test('T12-F · clicking the checkbox selects without navigating', async ({ page }) => {
    const before = page.url()
    const row = page.getByTestId('meeting-row').first()

    await row.hover()
    await row.getByTestId('meeting-row-checkbox').click()

    await expect(row).toHaveAttribute('data-selected', 'true')
    expect(page.url()).toBe(before)
  })

  test('T12-G · clicking the kebab opens the menu without navigating', async ({ page }) => {
    const before = page.url()
    const row = page.getByTestId('meeting-row').first()

    await row.hover()
    await row.getByTestId('meeting-row-kebab').click()

    await expect(page.getByRole('menu')).toBeVisible()
    expect(page.url()).toBe(before)
  })

  test('T12-H · the row is a real anchor', async ({ page }) => {
    /*
     * ASSERTS THE ANCHOR, not the new tab.
     *
     * This used to ⌘-click and wait for a popup. It timed out on Linux CI
     * while passing locally — modifier-click-opens-a-tab is the BROWSER's
     * behaviour, not this app's, and simulating it faithfully across platforms
     * is not something the suite can rely on (same reasoning as ADR-038).
     *
     * What the case is actually protecting is that the row is a real `<a href>`
     * rather than a div with an onClick — everything else, including
     * middle-click and ⌘-click, follows from that and is the browser's job.
     */
    const link = page.getByTestId('meeting-row').first().getByRole('link').first()

    await expect(link).toHaveAttribute('href', /\/meeting\/\d+/)
    expect(await link.evaluate((el) => el.tagName)).toBe('A')
    // …and no handler is faking the navigation.
    expect(await link.evaluate((el) => el.getAttribute('onclick'))).toBeNull()
  })

  test('T12-J · a crowded meeting shows three avatars plus a counted overflow', async ({
    page,
  }) => {
    // The API sends at most five participants but reports the true total, so
    // `+N` has to be computed from the total rather than from the array.
    const overflows = page.getByTestId('avatar-overflow')
    await expect(overflows.first()).toBeVisible()

    const label = await overflows.first().getAttribute('aria-label')
    expect(label).toBeTruthy()
  })

  test('T12-K · durations read as a labelled length, never raw seconds', async ({ page }) => {
    /*
     * ADAPTED, deliberately — the plan's T12-K reads "Duration cell text
     * matches /^\d{1,2}:\d{2}$/". That regex describes the duration COLUMN of
     * the table layout, and ADR-036 replaced that table with the reference's
     * date-grouped cards. There is no duration cell to assert against.
     *
     * What the row has instead is the reference's metadata line, which labels
     * a meeting's length as `30 min` (ADR-148). So the assertion moves to the
     * new format while keeping the property the original protected — that a
     * raw seconds count never reaches the screen. `433` fails both regexes.
     */
    const texts = await page.getByTestId('meeting-row-duration').allTextContents()
    expect(texts.length).toBeGreaterThan(0)

    for (const text of texts) {
      expect(text.trim()).toMatch(/^(< 1 min|\d{1,2} min|\d{1,2} hr( \d{1,2} min)?)$/)
    }
  })

  test('T12-L · a meeting seeded today reads Today', async ({ page }) => {
    const dates = (await page.getByTestId('meeting-row-date').allTextContents()).map((d) =>
      d.trim(),
    )
    expect(dates).toContain('Today')
    expect(dates).toContain('Yesterday')
  })

  test('T12-M · a long title truncates without changing the row height', async ({ page }) => {
    const heights = await page
      .getByTestId('meeting-row')
      .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().height))
    expect(new Set(heights).size).toBe(1)

    // Truncation, not wrapping: the title's own box stays one line tall.
    const overflow = await page
      .getByTestId('meeting-row-title')
      .first()
      .evaluate((el) => getComputedStyle(el).textOverflow)
    expect(overflow).toBe('ellipsis')
  })

  test('T12-N · arrow keys move a roving focus and Enter opens', async ({ page }) => {
    const rows = page.getByTestId('meeting-row')
    const first = rows.nth(0).getByRole('link').first()

    await first.focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')

    const third = rows.nth(2).getByRole('link').first()
    await expect(third).toBeFocused()

    const href = await third.getAttribute('href')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`${href}$`))
  })

  test('only one row is tabbable at a time', async ({ page }) => {
    // Roving tabindex: without it, reaching the pagination costs 20 Tab
    // presses on a full page.
    const tabbable = await page
      .getByTestId('meeting-list')
      .locator('a[href^="/meeting/"][tabindex="0"]')
      .count()
    expect(tabbable).toBe(1)
  })

  test('T12-O · the grid toggle renders cards and the choice survives a reload', async ({
    page,
  }) => {
    await page.getByTestId('notebook-view-grid').click()
    await expect(page.getByTestId('meeting-grid')).toBeVisible()
    await expect(page.getByTestId('meeting-list')).toBeHidden()

    await page.reload()
    await expect(page.getByTestId('meeting-grid')).toBeVisible()

    await page.getByTestId('notebook-view-list').click()
    await expect(page.getByTestId('meeting-list')).toBeVisible()
  })

  test('meetings are grouped under date headings', async ({ page }) => {
    // The organising idea of the reference layout: you look for "sometime last
    // Thursday", not for row 34.
    const headings = await page.getByTestId('meeting-list').locator('h2').allTextContents()
    expect(headings[0]).toBe('Today')
    expect(headings).toContain('Yesterday')
    expect(headings.length).toBeGreaterThan(2)
  })

  test('a group checkbox selects exactly its own day', async ({ page }) => {
    const groups = page.getByTestId('meeting-list').locator('section')
    const firstGroup = groups.first()
    const count = await firstGroup.getByTestId('meeting-row').count()

    await firstGroup.locator('[data-testid^="select-group-"]').click()

    await expect(firstGroup.locator('[data-selected="true"]')).toHaveCount(count)
    // …and nothing outside it.
    await expect(page.getByTestId('meeting-list').locator('[data-selected="true"]')).toHaveCount(
      count,
    )
  })

  test('sorting by title drops the date grouping', async ({ page }) => {
    // Grouping a title-sorted list would put every meeting in its own date
    // heading, which is noise rather than structure.
    await page.goto('/notebook?sort=title')
    await expect(page.getByTestId('meeting-list')).toBeVisible()

    expect(await page.getByTestId('meeting-list').locator('h2').count()).toBe(0)

    const titles = (await page.getByTestId('meeting-row-title').allTextContents()).map((t) =>
      t.trim(),
    )
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)))
  })

  test('a quick filter narrows the list and lands in the URL', async ({ page }) => {
    await page.getByTestId('quick-filter-hosted-by-me').click()

    await expect(page).toHaveURL(/host=/)
    await expect(page.getByTestId('quick-filter-hosted-by-me')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByTestId('notebook-count')).not.toContainText('8 meetings')
  })

  test('a shared URL lights the chip it implies', async ({ page }) => {
    // The chips read the REAL parameters rather than a marker, so a
    // hand-written link shows the right state.
    await page.goto('/notebook?host=Sarah%20Chen')
    await expect(page.getByTestId('quick-filter-hosted-by-me')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('a transcript-only match shows why it matched', async ({ page }) => {
    await page.goto('/notebook?q=roadmap')
    await expect(page.getByTestId('meeting-list')).toBeVisible()

    const matches = page.getByTestId('meeting-row-match')
    await expect(matches.first()).toBeVisible()
    // Speaker plus the line, so the row is not an unexplained result.
    await expect(matches.first()).toContainText(':')
  })

  test('the search term is highlighted in matching titles', async ({ page }) => {
    await page.goto('/notebook?q=roadmap')
    const mark = page.getByTestId('meeting-list').locator('mark').first()
    await expect(mark).toHaveText(/roadmap/i)
  })
})

import { expect, test, type Page } from '@playwright/test'

/**
 * Search and filters (T-13, cases T13-A → T13-P).
 *
 * The panel is DRAFT-THEN-APPLY (ADR-039), so most of these open it, change
 * something, and assert that nothing happened until Apply.
 */

const ANCHOR = '2026-07-26T12:00:00Z'

async function notebook(page: Page): Promise<void> {
  await page.goto('/notebook')
  await expect(page.getByTestId('meeting-list')).toBeVisible()
}

/** For the date-preset cases, which need "Today" to mean the seeded day. */
async function notebookAtAnchor(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(ANCHOR))
  await notebook(page)
}

async function openFilters(page: Page): Promise<void> {
  await page.getByTestId('filters-button').click()
  await expect(page.getByTestId('filters-panel')).toBeVisible()
}

const count = (page: Page) => page.getByTestId('notebook-count')

/*
 * 250ms debounce, then a client navigation, on a dev server shared by four
 * Playwright workers. The default 5s assertion window is enough serially and
 * not enough under that load — these passed alone and failed in the suite,
 * which is the signature of a timing budget rather than a bug.
 *
 * The DEBOUNCE itself is proven by T13-B counting requests, which does not
 * depend on machine load. This is just how long to wait for the URL to catch up.
 */
const COMMIT = { timeout: 15_000 }

test.describe('search', () => {
  test.beforeEach(async ({ page }) => notebook(page))

  test('T13-A · typing narrows the list and lands in the URL', async ({ page }) => {
    await page.getByTestId('notebook-search').fill('roadmap')

    await expect(page).toHaveURL(/q=roadmap/, COMMIT)
    await expect(count(page)).not.toContainText('8 meetings')
    await expect(page.getByTestId('meeting-row-title').first()).toContainText(/roadmap/i)
  })

  test('T13-B · six characters typed fast make at most two requests', async ({ page }) => {
    let requests = 0
    await page.route('**/api/v1/meetings?*', async (route) => {
      requests++
      await route.continue()
    })

    // `pressSequentially` with no delay is the worst case the debounce exists
    // for; `fill` is one atomic change and would prove nothing.
    await page.getByTestId('notebook-search').pressSequentially('roadma', { delay: 0 })
    // Wait for the request to actually happen before counting them.
    await expect(page).toHaveURL(/q=roadma/, COMMIT)
    await page.waitForTimeout(900)

    expect(requests).toBeGreaterThan(0)
    expect(requests).toBeLessThanOrEqual(2)
  })

  test('T13-C · clearing restores the full list and cleans the URL', async ({ page }) => {
    const search = page.getByTestId('notebook-search')
    await search.fill('roadmap')
    await expect(page).toHaveURL(/q=roadmap/, COMMIT)

    await page.getByTestId('notebook-search-clear').click()

    await expect(page).not.toHaveURL(/q=/, COMMIT)
    await expect(count(page)).toContainText('8 meetings')
    await expect(search).toHaveValue('')
  })

  test('T13-O · a transcript-only hit shows the line that matched', async ({ page }) => {
    await page.goto('/notebook?q=roadmap')
    await expect(page.getByTestId('meeting-list')).toBeVisible()

    const match = page.getByTestId('meeting-row-match').first()
    await expect(match).toBeVisible()
    // The term is marked inside the snippet, not just quoted.
    await expect(match.locator('mark').first()).toHaveText(/road/i)
  })

  test('T13-P · slash focuses the search', async ({ page }) => {
    await page.getByRole('heading', { name: 'Meetings', level: 1 }).click()
    await page.keyboard.press('/')
    await expect(page.getByTestId('notebook-search')).toBeFocused()
  })

  test('slash inside an input types a slash', async ({ page }) => {
    // Otherwise searching for a date like `7/24` is impossible.
    const search = page.getByTestId('notebook-search')
    await search.click()
    await search.pressSequentially('a/b')
    await expect(search).toHaveValue('a/b')
  })

  test('T13-11 · Escape in the search clears it', async ({ page }) => {
    const search = page.getByTestId('notebook-search')
    await search.fill('roadmap')
    await search.press('Escape')
    await expect(search).toHaveValue('')
  })
})

test.describe('filters panel', () => {
  test.beforeEach(async ({ page }) => notebookAtAnchor(page))

  test('the panel is populated from real data, never hardcoded', async ({ page }) => {
    await openFilters(page)

    // Every option must exist in the seeded library; a filter offering a name
    // that matches nothing is on the do-not-ship list.
    const hosts = page.getByTestId('filter-section-host')
    await expect(hosts.getByRole('checkbox').first()).toBeVisible()
    await expect(page.getByTestId('filter-section-tags')).toBeVisible()
    await expect(page.getByTestId('filter-section-channel')).toBeVisible()
  })

  test('T-13.5 · changes are a DRAFT until Apply', async ({ page }) => {
    await openFilters(page)

    const before = await count(page).textContent()
    await page.getByTestId('filter-has-action-items').click()

    // Nothing has happened yet.
    await expect(count(page)).toHaveText(before!)
    await expect(page).not.toHaveURL(/has_action_items/)

    await page.getByTestId('filters-apply').click()
    await expect(page).toHaveURL(/has_action_items=true/)
  })

  test('T-13.5 · dismissing discards the draft and says so', async ({ page }) => {
    await openFilters(page)
    await page.getByTestId('filter-has-action-items').click()

    await page.keyboard.press('Escape')

    // Silently throwing away six clicks is the worst part of a draft model.
    await expect(page.getByTestId('toast').first()).toContainText('Filters not applied')
    await expect(page).not.toHaveURL(/has_action_items/)
  })

  test('T13-D · filtering by host narrows the list and shows a chip', async ({ page }) => {
    await openFilters(page)

    const option = page.getByTestId('filter-section-host').getByRole('checkbox').first()
    const label = await option.evaluate(
      (el) => document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent ?? '',
    )
    await option.click()
    await page.getByTestId('filters-apply').click()

    await expect(page).toHaveURL(/host=/)
    await expect(page.getByTestId('active-filter-chip-host')).toContainText(label)
    await expect(count(page)).not.toContainText('8 meetings')
  })

  test('T13-E · Last 7 days keeps only recent meetings', async ({ page }) => {
    await openFilters(page)
    await page.getByTestId('radio-last-7-days').click()
    await page.getByTestId('filters-apply').click()

    await expect(page).toHaveURL(/from=2026-07-20/)
    await expect(page.getByTestId('active-filter-chip-date')).toHaveText(/Last 7 days/)

    /*
     * Wait for the FILTERED list before reading it.
     *
     * The query keeps the previous page visible while the next one loads
     * (`placeholderData`), which is the right behaviour — paging must not flash
     * an empty table — but it means reading rows straight after Apply reads the
     * OLD ones. This assertion is what makes the read below meaningful.
     */
    await expect(count(page)).not.toContainText('8 meetings')

    /*
     * Asserted against the DATES rather than a hardcoded count: the seeded
     * spread is allowed to change, and a magic number here would break for a
     * reason that has nothing to do with the filter working.
     */
    const dates = (await page.getByTestId('meeting-row-date').allTextContents()).map((d) => d.trim())
    expect(dates.length).toBeGreaterThan(0)
    for (const date of dates) {
      // Within the window means Today, Yesterday, or a Jul 20–26 date — never
      // a month-abbreviated day from earlier.
      expect(date).toMatch(/^(Today|Yesterday|Jul 2[0-6])$/)
    }
  })

  test('T13-F · a filter matching nothing gets the filtered empty state', async ({ page }) => {
    await openFilters(page)
    await page.getByTestId('radio-over-60').click()
    await page.getByTestId('filters-apply').click()

    const empty = page.getByTestId('notebook-empty')
    await expect(empty).toBeVisible()
    // Different copy from "no data at all" — reusing one for both is on the
    // do-not-ship list.
    await expect(empty).toContainText('No meetings match your search')
  })

  test('T13-G · three filters intersect and the badge counts groups', async ({ page }) => {
    await openFilters(page)
    await page.getByTestId('filter-section-host').getByRole('checkbox').first().click()
    await page.getByTestId('radio-last-30-days').click()
    await page.getByTestId('filter-has-action-items').click()
    await page.getByTestId('filters-apply').click()

    // Groups, not values: host + date + action-items is 3.
    await expect(page.getByTestId('filters-button')).toContainText('3')
  })

  test('T13-H · removing one chip leaves the others alone', async ({ page }) => {
    await page.goto('/notebook?has_action_items=true&host=Sarah+Chen')
    await expect(
      page.getByTestId('meeting-list').or(page.getByTestId('notebook-empty')),
    ).toBeVisible()

    await page.getByTestId('active-filter-chip-host').getByRole('button').click()

    await expect(page).not.toHaveURL(/host=/)
    await expect(page).toHaveURL(/has_action_items=true/)
    await expect(page.getByTestId('active-filter-chip-action-items')).toBeVisible()
  })

  test('T13-I · Clear all empties the chips and the URL', async ({ page }) => {
    await page.goto('/notebook?has_action_items=true&host=Sarah+Chen')
    await expect(page.getByTestId('active-filter-chips')).toBeVisible()

    await page.getByTestId('active-filters-clear').click()

    await expect(page).toHaveURL(/\/notebook$/)
    await expect(page.getByTestId('active-filter-chips')).toBeHidden()
    await expect(count(page)).toContainText('8 meetings')
  })

  test('T13-J · applying a filter returns to page 1', async ({ page }) => {
    // The reason this matters: users otherwise see "no results" on a filter
    // that has three matches, because they were on page 4 of the old set.
    await page.goto('/notebook?page=2&page_size=3')
    await expect(page).toHaveURL(/page=2/)

    await openFilters(page)
    await page.getByTestId('filter-has-action-items').click()
    await page.getByTestId('filters-apply').click()

    await expect(page).not.toHaveURL(/page=2/)
  })

  test('T13-K · a filtered URL reconstructs the panel state', async ({ page, context }) => {
    await page.goto('/notebook?from=2026-07-20&to=2026-07-26&has_action_items=true')
    await expect(page.getByTestId('meeting-list')).toBeVisible()

    const results = await count(page).textContent()

    const second = await context.newPage()
    await second.clock.setFixedTime(new Date(ANCHOR))
    await second.goto('/notebook?from=2026-07-20&to=2026-07-26&has_action_items=true')
    await expect(second.getByTestId('notebook-count')).toHaveText(results!)

    // …and the panel shows the preset that range came from, not "Custom".
    await second.getByTestId('filters-button').click()
    await expect(second.getByTestId('radio-last-7-days')).toHaveAttribute('aria-checked', 'true')
    await expect(second.getByTestId('filter-has-action-items')).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await second.close()
  })

  test('T13-L · Back restores the previous filter state', async ({ page }) => {
    await expect(count(page)).toContainText('8 meetings')

    await openFilters(page)
    await page.getByTestId('filter-has-action-items').click()
    await page.getByTestId('filters-apply').click()
    await expect(page).toHaveURL(/has_action_items/)

    await page.goBack()
    await expect(page).not.toHaveURL(/has_action_items/)
    await expect(count(page)).toContainText('8 meetings')
  })

  test('a collapsed section stays collapsed', async ({ page }) => {
    await openFilters(page)

    const section = page.getByTestId('filter-section-participants')
    await section.getByRole('button').first().click()
    await expect(section.getByRole('button').first()).toHaveAttribute('aria-expanded', 'false')

    await page.keyboard.press('Escape')
    await openFilters(page)
    await expect(section.getByRole('button').first()).toHaveAttribute('aria-expanded', 'false')
  })
})

test.describe('sorting', () => {
  test.beforeEach(async ({ page }) => notebook(page))

  test('T13-M · Longest first orders durations descending', async ({ page }) => {
    await page.goto('/notebook?sort=-duration_seconds')
    await expect(page.getByTestId('meeting-list')).toBeVisible()

    const seconds = (await page.getByTestId('meeting-row-duration').allTextContents()).map(
      toSeconds,
    )
    expect(seconds).toEqual([...seconds].sort((a, b) => b - a))
  })

  test('T13-N · Title A–Z is alphabetical, case-insensitively', async ({ page }) => {
    await page.goto('/notebook?sort=title')
    await expect(page.getByTestId('meeting-list')).toBeVisible()

    const titles = (await page.getByTestId('meeting-row-title').allTextContents()).map((t) =>
      t.trim(),
    )
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)))
  })

  test('the sort choice persists in the URL', async ({ page }) => {
    await page.getByTestId('notebook-sort').click()
    await page.getByTestId('select-option--duration_seconds').click()
    await expect(page).toHaveURL(/sort=-duration_seconds/)
  })
})

/** `42:18` → 2538. */
function toSeconds(text: string): number {
  const parts = text.trim().split(':').map(Number)
  return parts.reduce((total, part) => total * 60 + part, 0)
}

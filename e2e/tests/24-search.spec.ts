import { expect, test, type Page } from '@playwright/test'

/**
 * Global cross-meeting search (T-35, cases T35-G → T35-M).
 *
 * The syntax, ranking and index-usage claims are pytest's (T35-A → T35-F) —
 * they are properties of the endpoint. What is tested here is the page: the
 * deep link into the exact moment, the filters, and the affordances around
 * an empty answer.
 */

async function openSearch(page: Page, query: string): Promise<void> {
  await page.goto(`/search?q=${encodeURIComponent(query)}`)
  await expect(page.getByTestId('search-page')).toBeVisible({ timeout: 20_000 })
  /*
   * Waits for the ANSWER, not the header: the header renders "0 results"
   * while the first page is still in flight, and a test that reads the total
   * then is comparing against a placeholder.
   */
  await expect(
    page
      .getByTestId('search-results')
      .locator('[data-testid^="search-result-"], [data-testid="search-zero"]')
      .first(),
  ).toBeVisible({ timeout: 20_000 })
}

test.describe('global search', () => {
  test('T35-G · the topbar hands off to the full page', async ({ page }) => {
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible({ timeout: 20_000 })

    await page.getByTestId('topbar-search').click()
    await page.getByTestId('topbar-search').fill('pricing')

    // The dropdown's last row is the bridge to the page.
    await expect(page.getByTestId('search-row-all')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('search-row-all').hover()
    await page.getByTestId('search-row-all').click()

    await page.waitForURL(/\/search\?q=pricing/, { timeout: 15_000 })
    await expect(page.getByTestId('search-total')).toContainText(/\d+ results for/)
    await expect(page.getByTestId('search-results')).toContainText('pricing', {
      ignoreCase: true,
    })
  })

  test('T35-H · a snippet lands on the exact moment with the find bar primed', async ({
    page,
  }) => {
    await openSearch(page, 'pricing')

    // The first snippet link inside the first transcript group.
    const snippet = page.getByTestId('search-results').locator('a[href*="?t="]').first()
    const href = (await snippet.getAttribute('href'))!
    const url = new URL(href, 'http://localhost')
    const seconds = Number(url.searchParams.get('t'))
    expect(url.searchParams.get('find')).toBe('pricing')

    await snippet.click()
    await page.waitForURL(/\/meeting\/\d+\?/, { timeout: 20_000 })

    // The player is AT the moment…
    await expect
      .poll(() => page.getByTestId('player-seekbar').getAttribute('aria-valuenow').then(Number), {
        timeout: 20_000,
      })
      .toBe(seconds)

    // …the matched line is active and visible…
    // The article, not the `<mark data-active>` the highlighter renders
    // inside it — both carry the attribute.
    const active = page
      .getByTestId('transcript-list')
      .locator('[data-testid^="transcript-segment-"][data-active="true"]')
    await expect(active).toBeVisible()
    await expect(active).toBeInViewport()

    // …and the find bar arrived primed with the query (T-22.11 meets T-35.5).
    await expect(page.getByTestId('transcript-find-input')).toHaveValue('pricing')
  })

  test('T35-I · the host filter narrows the results', async ({ page }) => {
    await openSearch(page, 'pricing')
    const before = Number(
      (await page.getByTestId('search-total').innerText()).match(/\d+/)![0],
    )

    await page.getByTestId('search-filter-host').click()
    // Any specific host narrows relative to "anyone" for a term this common.
    const option = page.getByRole('option').nth(1)
    const hostName = (await option.innerText()).trim()
    await option.click()

    await expect
      .poll(async () =>
        Number((await page.getByTestId('search-total').innerText()).match(/\d+/)![0]),
      )
      .toBeLessThan(before)

    // And the filter is in the URL, so the narrowed view is shareable.
    expect(new URL(page.url()).searchParams.get('shost')).toBe(hostName)
  })

  test('T35-J · a nonsense term offers suggestions that actually run', async ({ page }) => {
    await openSearch(page, 'zzqqxxyy')

    const zero = page.getByTestId('search-zero')
    await expect(zero).toBeVisible()
    await expect(zero).toContainText('fewer words')

    await page.getByTestId('search-suggestion-pricing').click()

    await expect(page.getByTestId('search-total')).toContainText('for “pricing”', {
      timeout: 15_000,
    })
    await expect(page.getByTestId('search-zero')).toHaveCount(0)
  })

  test('T35-K · history appears in the topbar and is removable', async ({ page }) => {
    // Two searches, remembered through the topbar's own path.
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible({ timeout: 20_000 })

    const input = page.getByTestId('topbar-search')
    for (const term of ['pricing', 'onboarding']) {
      await input.click()
      await input.fill(term)
      /*
       * Through "See all results" explicitly. A bare Enter selects the
       * HIGHLIGHTED row — the first meeting hit — which also records history
       * but lands on that meeting; clicking the bridge row keeps this test
       * about one path.
       */
      await expect(page.getByTestId('search-row-all')).toBeVisible({ timeout: 15_000 })
      await page.getByTestId('search-row-all').click()
      await page.waitForURL(/\/search/, { timeout: 15_000 })
      await page.goto('/notebook')
      await expect(page.getByTestId('meeting-list')).toBeVisible({ timeout: 20_000 })
    }

    // Focus with an empty box shows the history, most recent first.
    await input.click()
    await expect(page.getByTestId('search-row-recent-0')).toContainText('onboarding')
    await expect(page.getByTestId('search-row-recent-1')).toContainText('pricing')

    // The ✕ removes one entry without running it.
    await page.getByTestId('search-row-recent-0').hover()
    await page.getByTestId('search-row-recent-0-remove').click()
    await expect(page.getByTestId('search-row-recent-0')).toContainText('pricing')
    expect(page.url()).toContain('/notebook')

    // Clear history removes the section entirely.
    await page.getByTestId('search-row-clear').hover()
    await page.getByTestId('search-row-clear').click()
    await expect(page.locator('[data-testid^="search-row-recent-"]')).toHaveCount(0)
  })

  test('T35-L · grouping toggles between per-meeting and flat', async ({ page }) => {
    await openSearch(page, 'pricing')

    // Grouped: cards per meeting, each capped at three snippets.
    const grouped = await page.locator('[data-testid^="search-result-"]').count()
    expect(grouped).toBeGreaterThan(1)

    await page.getByTestId('search-group-toggle').click()

    /*
     * Flat: one list, every loaded hit visible, each naming its meeting. The
     * COUNT header does not change — grouping is presentation, not a filter.
     */
    const flatRows = page.getByTestId('search-results').locator('li')
    await expect
      .poll(() => flatRows.count())
      .toBeGreaterThanOrEqual(grouped)

    await page.getByTestId('search-group-toggle').click()
    await expect
      .poll(() => page.locator('[data-testid^="search-result-"]').count())
      .toBe(grouped)
  })

  test('T35-M · Load more appends without duplicating', async ({ page }) => {
    await openSearch(page, 'pricing')

    const loadMore = page.getByTestId('search-load-more')
    await expect(loadMore).toBeVisible()

    const idsBefore = await snippetIds(page)
    await loadMore.click()

    await expect.poll(async () => (await snippetIds(page)).length).toBeGreaterThan(
      idsBefore.length,
    )

    const idsAfter = await snippetIds(page)
    // Strictly appended: everything from page one is still there, once.
    expect(new Set(idsAfter).size).toBe(idsAfter.length)
    for (const id of idsBefore) expect(idsAfter).toContain(id)
  })
})

/** The deep-link hrefs currently rendered — a stable identity per snippet. */
async function snippetIds(page: Page): Promise<string[]> {
  return page
    .getByTestId('search-results')
    .locator('a[href*="?t="]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
}

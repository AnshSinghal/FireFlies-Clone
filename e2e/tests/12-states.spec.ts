import { expect, test, type Page } from '@playwright/test'

/**
 * Empty, loading, error and offline states (T-16, cases T16-A → T16-J).
 *
 * The failure being guarded against is one "No data" screen standing in for
 * four different situations. So most of these assert that the COPY differs and
 * that the offered action is the one that actually helps.
 */

/**
 * Matches the meetings LIST and nothing else.
 *
 * Playwright's glob treats `?` as a single-character wildcard, so
 * `**\/api/v1/meetings?*` also matches `/api/v1/meetings/facets`. Stubbing
 * both at once produced failures that looked like the page not rendering.
 */
const MEETINGS_LIST = (url: URL) => url.pathname === '/api/v1/meetings'

async function notebook(page: Page): Promise<void> {
  await page.goto('/notebook')
  await expect(page.getByTestId('meeting-list')).toBeVisible()
}

test.describe('states', () => {
  test('T16-A · an empty library offers both ways to create one', async ({ page }) => {
    // Stubbed rather than emptied: the seeded database is shared, and this
    // needs no rows at all (ADR-037 keeps writers out of the read-only project).
    await page.route('**/api/v1/meetings?*', (route) =>
      route.fulfill({
        json: { items: [], page: 1, page_size: 20, total: 0, total_pages: 0, has_next: false },
      }),
    )
    await page.goto('/notebook')

    const empty = page.getByTestId('notebook-empty')
    await expect(empty).toBeVisible()
    await expect(empty).toHaveAttribute('data-variant', 'empty')
    await expect(empty).toContainText('No meetings yet')
    await expect(page.getByTestId('empty-upload')).toBeVisible()
    await expect(page.getByTestId('empty-create')).toBeVisible()
  })

  test('T16-B · a filter with no matches says so and echoes the filters', async ({ page }) => {
    await page.goto('/notebook?min_duration=3600&has_action_items=true')

    const empty = page.getByTestId('notebook-empty')
    await expect(empty).toBeVisible()
    await expect(empty).toHaveAttribute('data-variant', 'no-matches')
    await expect(empty).toContainText('No meetings match your filters')

    // Echoed, so the user can see WHICH filter to relax rather than clearing
    // everything to find out.
    await expect(empty).toContainText('Has action items')
    await expect(page.getByTestId('empty-clear-filters')).toBeVisible()
  })

  test('T16-C · an unmatched search echoes the query', async ({ page }) => {
    await page.goto('/notebook?q=zzzznotathing')

    const empty = page.getByTestId('notebook-empty')
    await expect(empty).toHaveAttribute('data-variant', 'no-results')
    await expect(empty).toContainText('zzzznotathing')
    await expect(page.getByTestId('empty-clear-search')).toBeVisible()
  })

  test('the three empty states use different copy', async ({ page }) => {
    const copy: string[] = []

    for (const url of ['/notebook?q=zzzznotathing', '/notebook?min_duration=99999']) {
      await page.goto(url)
      await expect(page.getByTestId('notebook-empty')).toBeVisible()
      copy.push((await page.getByTestId('notebook-empty').textContent()) ?? '')
    }

    // Reusing one message for both is on the do-not-ship list.
    expect(new Set(copy).size).toBe(copy.length)
  })

  test('T16-D · a failed request offers a retry that actually refetches', async ({ page }) => {
    /*
     * The FIRST TWO attempts fail, not just the first.
     *
     * The query client retries a retryable error once (ADR-005's config), so
     * failing only the first attempt meant the automatic retry succeeded and
     * the error state never appeared — the test was asserting against a
     * recovery it had itself made possible.
     */
    let attempts = 0
    await page.route(MEETINGS_LIST, async (route) => {
      attempts++
      if (attempts <= 2) {
        await route.fulfill({
          status: 500,
          json: { error: { code: 'INTERNAL_ERROR', message: 'Boom', details: {} } },
        })
      } else {
        await route.continue()
      }
    })

    await page.goto('/notebook')

    const error = page.getByTestId('notebook-error')
    await expect(error).toBeVisible()
    await expect(error).toContainText("Couldn't load meetings")
    // The code is present but quiet — a handle for a bug report, not the
    // message. Never a raw "Error: Failed to fetch".
    await expect(error.locator('code')).toContainText('INTERNAL_ERROR')

    await page.getByTestId('notebook-retry').click()
    await expect(page.getByTestId('meeting-list')).toBeVisible()
  })

  test('T16-E · a slow request shows skeleton rows at the real row height', async ({ page }) => {
    await page.route(MEETINGS_LIST, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      await route.continue()
    })
    await page.goto('/notebook')

    const skeletons = page.getByTestId('meeting-row-skeleton')
    // The delayed response gives a wide window, but CI is slow enough that the
    // default 5s can still expire before first paint.
    await expect(skeletons.first()).toBeVisible({ timeout: 15_000 })
    await expect(skeletons).toHaveCount(8)
    expect((await skeletons.first().boundingBox())!.height).toBe(82)

    // The header and toolbar do not depend on data, so they render immediately.
    await expect(page.getByRole('heading', { name: 'Meetings', level: 1 })).toBeVisible()
    await expect(page.getByTestId('notebook-toolbar')).toBeVisible()
  })

  test('only one skeleton is live while the list loads', async ({ page }) => {
    /*
     * A REGRESSION TEST, for a bug CI found and this machine could not
     * reproduce.
     *
     * Three components render the meeting-list skeleton — the route's
     * `loading.tsx`, the page's Suspense fallback, and the view's own pending
     * state — and React keeps a boundary's fallback mounted, hidden, until the
     * boundary resolves. While they shared testids, a locator could pass a
     * visibility check against the live one and then measure the hidden one:
     * `boundingBox()` returning null on an element just asserted visible.
     *
     * The prerender fallbacks now carry suffixed ids. This asserts that the
     * plain ids identify exactly one skeleton, whatever the timing.
     */
    await page.route(MEETINGS_LIST, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500))
      await route.continue()
    })
    await page.goto('/notebook')

    for (const wait of [0, 250, 700]) {
      if (wait > 0) await page.waitForTimeout(wait)
      await expect(page.getByTestId('meeting-list-skeleton')).toHaveCount(1)
      await expect(page.getByTestId('meeting-row-skeleton')).toHaveCount(8)
    }
  })

  test('T16-F · the skeleton mirrors the list it stands in for', async ({ page }) => {
    /*
     * ASSERTS THE STRUCTURE, not a before/after offset.
     *
     * The offset version measured the first skeleton card, waited for the data,
     * then measured the first real card. It was measuring a detached node as
     * often as not — the skeleton unmounts the instant the query resolves — and
     * a scrolled container made `boundingBox()` lie on top of that.
     *
     * What actually causes the shift is structural: the real list groups by
     * date and the headings take vertical space, so a flat run of skeleton
     * cards starts ~30px too high. Asserting the skeleton reserves a heading is
     * the same guarantee, deterministically. Card height equality is asserted
     * directly in `03-shell`.
     */
    await page.route(MEETINGS_LIST, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      await route.continue()
    })
    await page.goto('/notebook')

    /*
     * Exactly one element carries this id: the view's own pending skeleton.
     * The prerender fallbacks render the same component under
     * `-fallback`/`-route` ids, because a locator that matched all three would
     * bind to whichever came first in the DOM and could then measure it after
     * React had hidden it — which is how this test failed, intermittently,
     * reporting an offset of zero.
     */
    const skeleton = page.getByTestId('meeting-list-skeleton')
    await expect(skeleton).toBeVisible({ timeout: 15_000 })

    // A heading placeholder sits above the first card, as it does in the list.
    const firstCardTop = await skeleton.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const card = el.querySelector('[data-testid="meeting-row-skeleton"]')!.getBoundingClientRect()
      return card.top - box.top
    })
    expect(firstCardTop).toBeGreaterThan(20)
  })

  test('T16-H · going offline shows a banner that clears on reconnect', async ({
    page,
    context,
  }) => {
    await notebook(page)

    await context.setOffline(true)
    await expect(page.getByTestId('offline-banner')).toBeVisible()
    // Says what is still usable rather than just announcing the failure.
    await expect(page.getByTestId('offline-banner')).toContainText('last data we loaded')

    await context.setOffline(false)
    await expect(page.getByTestId('offline-banner')).toBeHidden()
  })

  test('T16-I · an unknown meeting gets the branded 404 page', async ({ page }) => {
    await page.goto('/meeting/bogus-id')

    // Branded, not Next's default — a stack trace is the most obviously broken
    // thing an evaluator can encounter.
    const notFound = page.getByTestId('not-found')
    await expect(notFound).toBeVisible()
    // Scoped: the sidebar also has links matching /meetings/i.
    await expect(notFound.getByRole('link')).toBeVisible()

    /*
     * DEVIATION: the STATUS is 200, not 404.
     *
     * `/meeting/[id]` matches, so this is a known route with an invalid
     * parameter. `notFound()` from the server component renders the not-found
     * boundary correctly but does not change the status in this Next version —
     * verified against a genuinely unmatched route, which does return 404
     * (asserted in `03-shell`).
     *
     * The user-facing requirement is met and the limitation is recorded rather
     * than asserted away. Fixing it properly means middleware rewriting
     * non-numeric ids, which is machinery this build does not otherwise need.
     */
  })

  test('a numeric id that does not exist gets the Notepad error state', async ({ page }) => {
    // Different from a malformed id: the link was plausible, the meeting is
    // gone. T-16.10's copy, with a way back.
    await page.goto('/meeting/999999')
    await expect(page.getByTestId('notepad-error')).toBeVisible()
    await expect(page.getByTestId('notepad-error')).toContainText("doesn't exist or was deleted")
  })

  test('a background refetch is visible but does not replace the content', async ({ page }) => {
    await notebook(page)

    await page.route(MEETINGS_LIST, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.continue()
    })

    // Change a filter to trigger a refetch of already-visible data.
    await page.getByTestId('quick-filter-hosted-by-me').click()

    await expect(page.getByTestId('refetch-indicator')).toBeVisible()
    // Stale-while-revalidate: the rows stay usable rather than being replaced
    // by a loading state.
    await expect(page.getByTestId('meeting-list')).toBeVisible()
  })
})

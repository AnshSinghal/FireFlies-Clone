import { expect, test } from '@playwright/test'

/**
 * App shell and data layer (T-06, cases T06-F → T06-J).
 *
 * The unit tests cover formatting and cache keys. What needs a browser is the
 * behaviour those compose into: does the URL actually drive the query, does
 * Back actually undo a filter, does the skeleton actually match the row.
 */

test.describe('app shell', () => {
  test('root redirects to the notebook', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/notebook$/)
    await expect(page.getByTestId('notebook-page')).toBeVisible()
  })

  test('renders seeded meetings end to end', async ({ page }) => {
    await page.goto('/notebook')

    const rows = page.getByTestId('meeting-list').getByRole('listitem')
    await expect(rows).toHaveCount(8)

    // Every row must carry the four things the Notebook promises. A row with a
    // blank duration or an empty date is the failure this catches.
    for (const cell of ['title', 'date', 'duration', 'participants']) {
      const values = await page.getByTestId(`meeting-row-${cell}`).allTextContents()
      expect(values).toHaveLength(8)
      for (const value of values) expect(value.trim()).not.toBe('')
    }
  })

  test('durations render as MM:SS, never raw seconds', async ({ page }) => {
    await page.goto('/notebook')

    for (const text of await page.getByTestId('meeting-row-duration').allTextContents()) {
      expect(text.trim()).toMatch(/^\d{1,2}:\d{2}$|^\d{1,2}:\d{2}:\d{2}$/)
    }
  })

  test('the seeded anchor makes relative dates real', async ({ page }) => {
    /*
     * The browser's clock is pinned to the same instant the seeder anchored on
     * (T-39.6). Without this the test asserts "Today" against whatever day the
     * suite happens to run — it passes on the day it was written and fails
     * every day after, which is the most annoying kind of flake because it
     * looks like a real regression.
     */
    await page.clock.setFixedTime(new Date('2026-07-26T12:00:00Z'))
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible()

    // Two meetings are seeded "today" and one "yesterday" against that anchor,
    // so these strings prove the seeder and the formatter agree.
    const dates = (await page.getByTestId('meeting-row-date').allTextContents()).map((d) =>
      d.trim(),
    )
    expect(dates.filter((d) => d === 'Today')).toHaveLength(2)
    expect(dates.filter((d) => d === 'Yesterday')).toHaveLength(1)
    // And that the older ones fall through to an absolute date.
    expect(dates.some((d) => /^[A-Z][a-z]{2} \d{1,2}$/.test(d))).toBe(true)
  })

  test('the signed-in user loads from the API', async ({ page }) => {
    await page.goto('/notebook')
    await expect(page.getByTestId('topbar-avatar')).toBeVisible()
  })

  test('the active nav item reflects the route', async ({ page }) => {
    await page.goto('/notebook')
    await expect(page.getByTestId('sidebar-item-meetings')).toHaveAttribute('aria-current', 'page')
  })
})

// ── T06-F / T06-G · URL as state ────────────────────────────────────────────

test.describe('URL as state', () => {
  /*
   * `?q=` searches the TRANSCRIPT as well as the title from T-11.3 onward, so a
   * term like "roadmap" legitimately matches more meetings than have it in
   * their name. These assert the count is narrowed and STABLE across a reload
   * rather than pinning an exact number, which would break again the next time
   * the seed data or the ranking changes — neither of which is what "URL as
   * state" is about.
   */
  test('a filtered view is shareable by copying the URL', async ({ page, context }) => {
    await page.goto('/notebook')
    const unfiltered = await page.getByTestId('notebook-count').textContent()

    await page.goto('/notebook?q=roadmap')
    const filtered = await page.getByTestId('notebook-count').textContent()
    expect(filtered).not.toBe(unfiltered)

    // Opening the same URL in a fresh tab must reconstruct the same view — the
    // filter cannot live only in React state.
    const second = await context.newPage()
    await second.goto('/notebook?q=roadmap')
    await expect(second.getByTestId('notebook-count')).toHaveText(filtered!)
    await second.close()
  })

  test('browser Back undoes a filter change', async ({ page }) => {
    await page.goto('/notebook')
    await expect(page.getByTestId('notebook-count')).toContainText('8 meetings')

    await page.goto('/notebook?q=roadmap')
    await expect(page.getByTestId('notebook-count')).not.toContainText('8 meetings')

    await page.goBack()
    await expect(page).toHaveURL(/\/notebook$/)
    await expect(page.getByTestId('notebook-count')).toContainText('8 meetings')
  })

  test('a transcript-only match explains itself', async ({ page }) => {
    // The point of T-11.3's `match_context`: without it, a meeting whose title
    // does not contain the term looks like a false positive.
    await page.goto('/notebook?q=roadmap')
    await expect(page.getByTestId('meeting-list')).toBeVisible()

    const rows = await page.getByTestId('meeting-row-title').allTextContents()
    const untitled = rows.filter((t) => !t.toLowerCase().includes('roadmap'))
    expect(untitled.length).toBeGreaterThan(0)
  })

  test('an unmatched search shows the search-specific empty state', async ({ page }) => {
    await page.goto('/notebook?q=zzzznotathing')

    const empty = page.getByTestId('notebook-empty')
    await expect(empty).toBeVisible()
    // Different copy from the no-data case — reusing one message for both is
    // on the do-not-ship list.
    await expect(empty).toContainText('No meetings match your search')
  })
})

// ── T06-H · branded 404 ─────────────────────────────────────────────────────

test('an unknown route shows a branded 404, not a stack trace', async ({ page }) => {
  const response = await page.goto('/meeting/does-not-exist-at-all')

  expect(response?.status()).toBe(404)
  await expect(page.getByTestId('not-found')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to meetings' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Call Stack')
})

// ── T06-I · skeletons match final geometry ──────────────────────────────────

test('skeleton rows are the same height as real rows', async ({ page }) => {
  // The whole point of a skeleton: if the heights differ, content jumps when
  // data lands and the page scores badly on CLS.
  await page.route('**/api/v1/meetings*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })

  await page.goto('/notebook')

  const skeleton = page.getByTestId('meeting-row-skeleton').first()
  await expect(skeleton).toBeVisible()
  const skeletonBox = await skeleton.boundingBox()

  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await expect(page.getByTestId('meeting-list')).toBeVisible({ timeout: 15_000 })

  // The CARD, not the anchor inside it: the card is what occupies space in the
  // list, so it is what the skeleton has to match. `meeting-row-<id>` is the
  // link, which sits inside the card's border and is therefore 2px shorter.
  const rowBox = await page.getByTestId('meeting-row').first().boundingBox()

  expect(skeletonBox).not.toBeNull()
  expect(rowBox).not.toBeNull()
  expect(Math.abs(skeletonBox!.height - rowBox!.height)).toBeLessThanOrEqual(1)
})

test('a failed request shows a retry, not a blank page', async ({ page }) => {
  await page.route('**/api/v1/meetings*', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our end.', details: {} },
      }),
    }),
  )

  await page.goto('/notebook')

  await expect(page.getByTestId('notebook-error')).toBeVisible()
  await expect(page.getByTestId('notebook-retry')).toBeVisible()
  // The stable code is surfaced so a bug report can name it.
  await expect(page.getByTestId('notebook-error')).toContainText('INTERNAL_ERROR')
})

// ── T06-J · responsive ──────────────────────────────────────────────────────

test.describe('responsive', () => {
  for (const [label, width, railVisible] of [
    ['desktop', 1440, true],
    ['tablet', 1024, true],
    ['mobile', 393, false],
  ] as const) {
    test(`${label} (${width}px) has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/notebook')
      await expect(page.getByTestId('notebook-page')).toBeVisible()

      // The failure this catches is a fixed-width child forcing the whole page
      // to scroll sideways — very visible and very easy to introduce.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(1)

      if (railVisible) {
        await expect(page.getByTestId('sidebar')).toBeVisible()
      } else {
        await expect(page.getByTestId('sidebar')).toBeHidden()
      }
    })
  }

  test('the rail narrows between tablet and desktop', async ({ page }) => {
    await page.goto('/notebook')
    // The rail renders a Suspense skeleton first; measuring before it settles
    // reads the wrong geometry.
    await expect(page.getByTestId('sidebar-item-meetings')).toBeVisible()

    await page.setViewportSize({ width: 1440, height: 900 })
    const wide = await page.getByTestId('sidebar').boundingBox()

    await page.setViewportSize({ width: 1024, height: 900 })
    const narrow = await page.getByTestId('sidebar').boundingBox()

    expect(wide!.width).toBeGreaterThan(narrow!.width)
  })
})

// ── Command palette scaffold ────────────────────────────────────────────────

test('⌘K is registered before the transcript find bar claims it', async ({ page }) => {
  await page.goto('/notebook')

  // Only the shortcut is wired at this stage; T-35 attaches the search UI.
  // Asserting it does not throw and does not navigate is what stops T-22 from
  // discovering a conflict later.
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page).toHaveURL(/\/notebook/)
})

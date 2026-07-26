import { expect, test, type Page } from '@playwright/test'

/**
 * Topbar and global search (T-08, cases T08-A → T08-L).
 *
 * The search dropdown is the first thing in this app with real asynchrony —
 * debounce, in-flight requests and keyboard state all at once — so most of
 * these assert timing and ordering rather than markup.
 */

const SEARCH = '[data-testid="topbar-search"]'

/*
 * 250ms debounce + a request + a render. The plan's T08-B budget is 600ms,
 * which is the right UX target but not a measurable one here: four Playwright
 * workers share one dev server, and this went flaky the moment the suite grew
 * past 100 tests. The DEBOUNCE is proven by T08-D counting requests, which does
 * not depend on machine load; this waits long enough to assert what it is
 * actually about — the grouping and the highlighting.
 */
const DROPDOWN_TIMEOUT = 3000

/** The topbar renders before its data; waiting on the avatar proves /me landed. */
async function topbarReady(page: Page): Promise<void> {
  await expect(page.getByTestId('topbar')).toBeVisible()
  await expect(page.getByTestId('topbar-avatar')).toBeVisible()
}

/** Focus the field the way a user would, and wait for the dropdown. */
async function openSearch(page: Page): Promise<void> {
  await page.locator(SEARCH).click()
  await expect(page.getByTestId('topbar-search-results')).toBeVisible()
}

test.describe('topbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/notebook')
    await topbarReady(page)
  })

  test('T08-A · ⌘K focuses the search and opens the dropdown', async ({ page }) => {
    // From the page body, not from the input — the point is that it works from
    // anywhere. The H1 rather than the container's centre: the Notebook is now
    // a list of cards, and clicking the middle of it navigates to a meeting.
    await page.getByRole('heading', { name: 'Meetings', level: 1 }).click()
    await expect(page.locator(SEARCH)).not.toBeFocused()

    await page.keyboard.press('ControlOrMeta+k')

    await expect(page.locator(SEARCH)).toBeFocused()
    await expect(page.getByTestId('topbar-search-results')).toBeVisible()
  })

  test('T08-B · typing shows grouped results with the match highlighted', async ({ page }) => {
    await openSearch(page)
    await page.locator(SEARCH).fill('road')

    const results = page.getByTestId('topbar-search-results')
    await expect(results.getByRole('group', { name: 'Meetings' })).toBeVisible({
      timeout: DROPDOWN_TIMEOUT,
    })

    const row = page.getByTestId('search-row-meeting-0')
    await expect(row).toContainText('Q3 Product Roadmap Sync')

    // Highlighted as a real <mark>, which is what proves the Highlighter ran
    // rather than the row rendering plain text.
    const mark = row.locator('mark').first()
    await expect(mark).toHaveText(/road/i)
  })

  test('T08-B · transcript hits are grouped separately and deep-link to a timestamp', async ({
    page,
  }) => {
    await openSearch(page)
    await page.locator(SEARCH).fill('roadmap')

    const transcripts = page.getByTestId('topbar-search-results').getByRole('group', {
      name: 'Transcripts',
    })
    await expect(transcripts).toBeVisible({ timeout: DROPDOWN_TIMEOUT })

    // A transcript hit that dropped its `?t=` is useless — it lands the user at
    // the top of an hour-long meeting.
    const href = await transcripts.getByRole('link').first().getAttribute('href')
    expect(href).toMatch(/^\/meeting\/\d+\?t=\d+$/)
  })

  test('T08-C · an unmatched query echoes itself in the empty state', async ({ page }) => {
    await openSearch(page)
    await page.locator(SEARCH).fill('zzzqqq')

    const empty = page.getByTestId('search-empty')
    await expect(empty).toBeVisible({ timeout: DROPDOWN_TIMEOUT })
    await expect(empty).toContainText('zzzqqq')
    // Never a blank floating box (T-08.8).
    await expect(empty.getByRole('link', { name: 'Search all meetings' })).toBeVisible()
  })

  test('T08-D · five rapid keystrokes make at most two requests', async ({ page }) => {
    let requests = 0
    await page.route('**/api/v1/search*', async (route) => {
      requests++
      await route.continue()
    })

    await openSearch(page)
    // `pressSequentially` with no delay is the worst case the debounce exists
    // for. `fill` would be one atomic change and would prove nothing.
    await page.locator(SEARCH).pressSequentially('roadm', { delay: 0 })

    await expect(page.getByTestId('topbar-search-results')).toBeVisible()
    await page.waitForTimeout(700)

    expect(requests).toBeGreaterThan(0)
    expect(requests).toBeLessThanOrEqual(2)
  })

  test('T08-E · ↓ ↓ Enter opens the second result', async ({ page }) => {
    await openSearch(page)
    await page.locator(SEARCH).fill('road')
    await expect(page.getByTestId('search-row-meeting-0')).toBeVisible({
      timeout: DROPDOWN_TIMEOUT,
    })

    const rows = page.getByTestId('topbar-search-results').getByRole('option')
    await expect(rows.nth(1)).toBeVisible()
    const secondHref = await rows.nth(1).getByRole('link').getAttribute('href')

    // First ↓ moves off the implicit first row onto the second.
    await page.keyboard.press('ArrowDown')
    await expect(rows.nth(1)).toHaveAttribute('data-active', 'true')

    // The highlight must be exposed to assistive tech, not just painted.
    const activeId = await rows.nth(1).getAttribute('id')
    await expect(page.locator(SEARCH)).toHaveAttribute('aria-activedescendant', activeId!)

    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(escapeForRegExp(secondHref!)))
  })

  test('T08-F · Escape closes and blurs but keeps the query', async ({ page }) => {
    await openSearch(page)
    await page.locator(SEARCH).fill('roadmap')
    await expect(page.getByTestId('search-row-meeting-0')).toBeVisible({
      timeout: DROPDOWN_TIMEOUT,
    })

    await page.keyboard.press('Escape')

    await expect(page.getByTestId('topbar-search-results')).toBeHidden()
    await expect(page.locator(SEARCH)).not.toBeFocused()
    // Clearing here would throw away a long query on a mis-hit.
    await expect(page.locator(SEARCH)).toHaveValue('roadmap')
  })

  test('T08-G · clicking outside closes the dropdown', async ({ page }) => {
    await openSearch(page)
    await page.getByRole('heading', { name: 'Meetings', level: 1 }).click()
    await expect(page.getByTestId('topbar-search-results')).toBeHidden()
  })

  test('T08-H · focus swaps the resting style for the accent one', async ({ page }) => {
    const input = page.locator(SEARCH)

    const resting = await input.evaluate((el) => getComputedStyle(el).backgroundColor)
    await expect(page.getByTestId('topbar-search-hint')).toBeVisible()

    await input.click()

    await expect(page.getByTestId('topbar-search-hint')).toBeHidden()

    /*
     * Polled, not read once. The field carries `transition-colors duration-fast`,
     * so an immediate read lands mid-animation — the first version of this test
     * saw the border 5% of the way from transparent to accent
     * (`rgba(106,57,239,0.05)`) and the background still on its old value, and
     * called that a styling bug.
     */
    await expect
      .poll(() => input.evaluate((el) => getComputedStyle(el).borderTopColor))
      .toBe('rgb(106, 57, 239)') // --ff-accent, #6A39EF

    const focused = await input.evaluate((el) => ({
      background: getComputedStyle(el).backgroundColor,
      shadow: getComputedStyle(el).boxShadow,
    }))
    expect(focused.background).not.toBe(resting)
    expect(focused.shadow).not.toBe('none')
  })

  test('T08-I · + New offers the three create paths', async ({ page }) => {
    await page.getByTestId('topbar-new-button').click()
    const menu = page.getByTestId('topbar-new-menu')
    await expect(menu).toBeVisible()

    await expect(menu.getByTestId('new-upload')).toHaveText('Upload transcript')
    await expect(menu.getByTestId('new-paste')).toHaveText('Paste transcript')
    await expect(menu.getByTestId('new-manual')).toHaveText('Create manually')

    /*
     * T-08's test table says "Upload modal opens". The create modal is T-26.1's
     * deliverable, and it is opened from this menu, the /upload route and both
     * empty states — so until it exists these rows navigate, carrying the
     * intended tab. T-26 replaces the assertion below with the modal.
     */
    await menu.getByTestId('new-upload').click()
    await expect(page).toHaveURL(/\/upload\?tab=upload$/)
  })

  test('T08-J · Sign out raises a toast and does not navigate', async ({ page }) => {
    const before = page.url()

    await page.getByTestId('topbar-avatar').click()
    await expect(page.getByTestId('topbar-avatar-menu')).toBeVisible()
    await page.getByTestId('avatar-sign-out').click()

    const toast = page.getByTestId('toast')
    await expect(toast).toBeVisible()
    await expect(toast).toContainText('Authentication is out of scope')
    expect(page.url()).toBe(before)
  })

  test('T08-K · the topbar survives a long scroll', async ({ page }) => {
    // Eight seeded meetings fit a 720px-tall viewport, so at the default size
    // there is nothing to scroll and the assertion would pass vacuously.
    await page.setViewportSize({ width: 1280, height: 400 })
    await expect(page.getByTestId('meeting-list')).toBeVisible()

    // The shell's grid gives `main` the overflow, so scrolling the window does
    // nothing — this has to scroll the region that actually owns it.
    await page.getByTestId('main-content').evaluate((el) => el.scrollTo(0, 2000))
    await expect
      .poll(() => page.getByTestId('main-content').evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0)

    const box = await page.getByTestId('topbar').boundingBox()
    expect(box!.y).toBe(0)
    expect(box!.height).toBe(56)
  })

  test('the avatar menu shows the seeded user and marks Profile as Soon', async ({ page }) => {
    await page.getByTestId('topbar-avatar').click()
    const menu = page.getByTestId('topbar-avatar-menu')

    await expect(menu).toContainText('@')
    // A `Soon` row is clickable and explains itself (T-09.10). It was inert
    // when T-08 shipped; T-09 made silence the worse of the two options.
    await expect(menu.getByTestId('avatar-profile')).toContainText('Soon')
    await expect(menu.getByTestId('avatar-settings')).toHaveAttribute('href', '/settings')
  })

  test('notifications start unread and Mark all as read clears the dot', async ({ page }) => {
    await expect(page.getByTestId('topbar-notifications-dot')).toBeVisible()

    await page.getByTestId('topbar-notifications').click()
    const menu = page.getByTestId('topbar-notifications-menu')
    await expect(menu.getByRole('listitem')).toHaveCount(3)

    await menu.getByTestId('notifications-mark-all').click()
    await expect(page.getByTestId('topbar-notifications-dot')).toBeHidden()

    // Read state is the one thing that persists (T-08.7).
    await page.reload()
    await topbarReady(page)
    await expect(page.getByTestId('topbar-notifications-dot')).toBeHidden()
  })

  test('recent searches are remembered and offered on the next focus', async ({ page }) => {
    await openSearch(page)
    await page.locator(SEARCH).fill('roadmap')
    await expect(page.getByTestId('search-row-meeting-0')).toBeVisible({
      timeout: DROPDOWN_TIMEOUT,
    })
    await page.keyboard.press('Enter')
    // Enter starts a client-side navigation. Calling goto() while it is still
    // in flight aborts the new document load (net::ERR_ABORTED).
    await expect(page).toHaveURL(/\/meeting\//)

    await page.goto('/notebook')
    await topbarReady(page)
    await openSearch(page)

    await expect(
      page.getByTestId('topbar-search-results').getByRole('group', { name: 'Recent searches' }),
    ).toContainText('roadmap')
  })

  test('the dropdown shows skeletons rather than a blank box while fetching', async ({ page }) => {
    // Hold the response open so the loading state is observable at all.
    await page.route('**/api/v1/search*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800))
      await route.continue()
    })

    await openSearch(page)
    await page.locator(SEARCH).fill('road')

    await expect(page.getByTestId('search-loading')).toBeVisible()
    await expect(page.getByTestId('search-empty')).toBeHidden()
  })

  test('a transcript containing markup is rendered as text, never injected', async ({ page }) => {
    // The reason the Highlighter exists. The API is stubbed because no seeded
    // transcript quotes HTML — the risk is real regardless of the fixtures.
    await page.route('**/api/v1/search*', (route) =>
      route.fulfill({
        json: {
          query: 'img',
          meetings: [],
          transcripts: [
            {
              segment_id: 1,
              meeting_id: 1,
              meeting_title: 'Injection test',
              speaker: 'Attacker',
              start_ms: 0,
              snippet: '<img src=x onerror="window.__pwned = true">',
              matches: [{ start: 1, end: 4 }],
            },
          ],
          total: 1,
        },
      }),
    )

    await openSearch(page)
    await page.locator(SEARCH).fill('img')
    await expect(page.getByTestId('search-row-transcript-0')).toBeVisible({
      timeout: DROPDOWN_TIMEOUT,
    })

    expect(await page.evaluate(() => '__pwned' in window)).toBe(false)
    await expect(page.getByTestId('search-row-transcript-0')).toContainText('<img src=x')
    expect(await page.getByTestId('search-row-transcript-0').locator('img').count()).toBe(0)
  })
})

test.describe('topbar · narrow viewports', () => {
  test.use({ viewport: { width: 800, height: 720 } })

  test('T08-L · search collapses to an icon that expands to an overlay', async ({ page }) => {
    await page.goto('/notebook')
    await topbarReady(page)

    // Below 1024px the field is gone and the icon takes its place.
    await expect(page.locator(SEARCH)).toBeHidden()
    const toggle = page.getByTestId('topbar-search-toggle')
    await expect(toggle).toBeVisible()

    await toggle.click()

    await expect(page.locator(SEARCH)).toBeVisible()
    await expect(page.locator(SEARCH)).toBeFocused()

    // "Full-width overlay", not a field squeezed into the leftover space.
    const input = await page.locator(SEARCH).boundingBox()
    expect(input!.width).toBeGreaterThan(600)
  })

  test('+ New drops its label but keeps its icon below 768px', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 720 })
    await page.goto('/notebook')
    await topbarReady(page)

    const button = page.getByTestId('topbar-new-button')
    await expect(button).toBeVisible()
    // `toContainText` reads textContent, which includes `display: none` text —
    // it would pass whether or not the label were actually hidden.
    await expect(button.getByText('New', { exact: true })).toBeHidden()
  })
})

/** Hrefs contain `?` and `/`; a raw one in `new RegExp` matches the wrong thing. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

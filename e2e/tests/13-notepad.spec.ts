import { expect, test, type Page } from '@playwright/test'

/**
 * Notepad shell (T-18, cases T18-A → T18-K).
 *
 * The property most of these protect is that the CHROME DOES NOT MOVE: only
 * the panel interiors scroll, and the title edits in place without shifting
 * anything.
 */

async function notepad(page: Page): Promise<void> {
  await page.goto('/meeting/1')
  await expect(page.getByTestId('notepad-page')).toBeVisible()
  // The SUMMARY panel, not the transcript: below 1024px the layout is tabs and
  // the transcript is behind one, so waiting for it would hang there.
  await expect(page.getByTestId('summary-panel')).toBeVisible()
}

test.describe('notepad shell', () => {
  test.beforeEach(async ({ page }) => {
    await notepad(page)
    await expect(page.getByTestId('transcript-segments')).toBeVisible()
  })

  test('T18-A · every part of the workspace is present', async ({ page }) => {
    await expect(page.getByTestId('notepad-header')).toBeVisible()
    await expect(page.getByTestId('icon-rail')).toBeVisible()
    await expect(page.getByTestId('summary-panel')).toBeVisible()
    await expect(page.getByTestId('transcript-panel')).toBeVisible()
    await expect(page.getByTestId('panel-handle')).toBeVisible()
  })

  test('T18-H · only the panel interiors scroll', async ({ page }) => {
    const panel = page.getByTestId('transcript-panel')
    const headerTop = (await page.getByTestId('notepad-header').boundingBox())!.y

    await panel.evaluate((el) => el.scrollTo(0, 2000))
    await expect.poll(() => panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)

    // The page itself never scrolls, so the header cannot disappear — the
    // failure that is instantly obvious against the real app.
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    expect((await page.getByTestId('notepad-header').boundingBox())!.y).toBe(headerTop)

    // …and the summary panel is unmoved by the transcript scrolling.
    expect(await page.getByTestId('summary-panel').evaluate((el) => el.scrollTop)).toBe(0)
  })

  test('the tab title follows the meeting', async ({ page }) => {
    await expect(page).toHaveTitle(/Q3 Product Roadmap Sync · Fireflies/)
  })

  test('T18-J · the icon rail opens one flyout at a time', async ({ page }) => {
    await page.getByTestId('icon-rail-search').click()
    await expect(page.getByTestId('rail-flyout-search')).toBeVisible()
    await expect(page.getByTestId('icon-rail-search')).toHaveAttribute('aria-pressed', 'true')

    await page.getByTestId('icon-rail-comments').click()
    await expect(page.getByTestId('rail-flyout-comments')).toBeVisible()
    // The previous one closed — two open panels would leave no room for either.
    await expect(page.getByTestId('rail-flyout-search')).toBeHidden()

    // Clicking the active item closes it, so the user is not hunting for an ✕.
    await page.getByTestId('icon-rail-comments').click()
    await expect(page.getByTestId('rail-flyout-comments')).toBeHidden()
  })

  test('T18-G · the split ratio survives a reload', async ({ page }) => {
    const handle = page.getByTestId('panel-handle')
    await handle.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')

    const ratio = await handle.getAttribute('aria-valuenow')
    expect(ratio).not.toBe('50')

    await page.reload()
    await expect(page.getByTestId('notepad-page')).toBeVisible()
    await expect(page.getByTestId('panel-handle')).toHaveAttribute('aria-valuenow', ratio!)
  })

  test('T18-F · Copy link copies the current URL', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    await page.getByTestId('notepad-copy-link').click()
    await expect(page.getByTestId('toast').first()).toContainText('Link copied')

    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toContain('/meeting/1')
  })

  test('the kebab offers every documented action', async ({ page }) => {
    await page.getByTestId('notepad-kebab').click()

    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    for (const label of ['Rename', 'Edit details', 'Regenerate summary', 'Delete meeting']) {
      await expect(menu.getByText(label, { exact: true })).toBeVisible()
    }
  })

  test('the participant count opens a list rather than being decoration', async ({ page }) => {
    await page.getByTestId('notepad-participant-count').click()
    const popover = page.getByTestId('notepad-participants')
    await expect(popover).toBeVisible()
    await expect(popover.getByRole('listitem').first()).toBeVisible()
  })

  test('T16-G · one failing panel does not blank the page', async ({ page }) => {
    await page.route('**/summary', (route) =>
      route.fulfill({
        status: 500,
        json: { error: { code: 'INTERNAL_ERROR', message: 'Boom', details: {} } },
      }),
    )
    await page.reload()

    await expect(page.getByTestId('summary-panel')).toContainText("Couldn't load the summary")
    // The transcript is unaffected.
    await expect(page.getByTestId('transcript-segments')).toBeVisible()
  })
})

test.describe('notepad · title editing @mutates', () => {
  test('T18-C · Escape reverts without saving', async ({ page }) => {
    await notepad(page)

    let patched = 0
    await page.route('**/api/v1/meetings/1', async (route) => {
      if (route.request().method() === 'PATCH') patched++
      await route.continue()
    })

    const original = await page.getByTestId('notepad-title').textContent()
    await page.getByTestId('notepad-title').click()
    await page.getByTestId('notepad-title-input').fill('Discarded')
    await page.keyboard.press('Escape')

    await expect(page.getByTestId('notepad-title')).toHaveText(original!)
    expect(patched).toBe(0)
  })

  test('T18-D · an empty title is refused inline', async ({ page }) => {
    await notepad(page)

    let patched = 0
    await page.route('**/api/v1/meetings/1', async (route) => {
      if (route.request().method() === 'PATCH') patched++
      await route.continue()
    })

    await page.getByTestId('notepad-title').click()
    await page.getByTestId('notepad-title-input').fill('   ')
    await page.keyboard.press('Enter')

    // Says why, rather than silently snapping back.
    await expect(page.getByTestId('notepad-title-error')).toBeVisible()
    await expect(page.getByTestId('notepad-title-input')).toBeVisible()
    expect(patched).toBe(0)
  })
})

test.describe('notepad · narrow viewports', () => {
  test.use({ viewport: { width: 900, height: 800 } })

  test('T18-I · below 1024px the panels become tabs', async ({ page }) => {
    await notepad(page)

    await expect(page.getByTestId('notepad-tabs')).toBeVisible()
    await expect(page.getByTestId('panel-handle')).toBeHidden()

    // Both are still reachable.
    await expect(page.getByTestId('summary-panel')).toBeVisible()
    await page.getByTestId('tab-transcript').click()
    await expect(page.getByTestId('transcript-panel')).toBeVisible()
  })
})

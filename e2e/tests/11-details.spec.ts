import { expect, test, type Page } from '@playwright/test'

/**
 * The meeting details drawer (T-15, cases T15-A → T15-I).
 *
 * Fireflies shows this from the list without leaving the page, so most of these
 * assert that the Notebook is STILL THERE — a drawer that navigates, or that
 * pushes the list sideways, is a different interaction.
 */

async function notebook(page: Page): Promise<void> {
  await page.goto('/notebook')
  await expect(page.getByTestId('meeting-list')).toBeVisible()
}

async function openDetails(page: Page, index = 0): Promise<void> {
  const row = page.getByTestId('meeting-row').nth(index)
  await row.hover()
  await row.getByTestId('meeting-row-details').click()
  await expect(page.getByTestId('details-drawer')).toBeVisible()
}

test.describe('details drawer', () => {
  test.beforeEach(async ({ page }) => notebook(page))

  test('T15-A · opening the drawer puts the meeting in the URL', async ({ page }) => {
    await openDetails(page)

    await expect(page).toHaveURL(/details=\d+/)
    // The list is still there — this is a drawer, not a navigation.
    await expect(page.getByTestId('meeting-list')).toBeVisible()
  })

  test('the drawer overlays rather than pushing the list sideways', async ({ page }) => {
    const before = await page.getByTestId('meeting-row-title').first().boundingBox()
    await openDetails(page)
    const after = await page.getByTestId('meeting-row-title').first().boundingBox()

    expect(after!.x).toBe(before!.x)
    expect(after!.width).toBe(before!.width)
  })

  test('T15-B · a details URL opens the drawer cold', async ({ page }) => {
    await page.goto('/notebook?details=1')

    const drawer = page.getByTestId('details-drawer')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByTestId('details-meta-host')).toContainText(/\w/)
    await expect(drawer.getByTestId('details-meta-duration')).toContainText(/\d+:\d\d/)
  })

  test('T15-C · Escape closes it, cleans the URL and returns focus', async ({ page }) => {
    await openDetails(page)
    const id = new URL(page.url()).searchParams.get('details')

    await page.keyboard.press('Escape')

    await expect(page.getByTestId('details-drawer')).toBeHidden()
    await expect(page).not.toHaveURL(/details=/)
    // Otherwise a keyboard user is dropped at the top of the document.
    await expect(page.getByTestId(`meeting-row-${id}`)).toBeFocused()
  })

  test('the close button works too', async ({ page }) => {
    await openDetails(page)
    await page.getByTestId('details-close').click()
    await expect(page.getByTestId('details-drawer')).toBeHidden()
  })

  test('T15-F · invited and attended are listed separately', async ({ page }) => {
    await openDetails(page)

    const invited = page.getByTestId('details-invited-list').getByRole('listitem')
    const attended = page.getByTestId('details-attended-list').getByRole('listitem')

    await expect(invited.first()).toBeVisible()
    // Invited-but-absent is a real state, so attended is a subset.
    expect(await attended.count()).toBeLessThanOrEqual(await invited.count())
  })

  test('each attendee has a talk-time bar in their own speaker colour', async ({ page }) => {
    await openDetails(page)

    // `evaluateAll` does NOT auto-wait, so the list has to be there first —
    // the drawer shows a skeleton until the meeting loads.
    await expect(
      page.getByTestId('details-attended-list').getByRole('listitem').first()
    ).toBeVisible()

    // The detail that makes this read as Fireflies rather than a generic panel:
    // the bar matches the person's colour in the transcript, because the index
    // is server-assigned (ADR-013).
    const colours = await page
      .getByTestId('details-attended-list')
      .locator('span[style*="background-color"]')
      .evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).backgroundColor))

    expect(colours.length).toBeGreaterThan(1)
    expect(new Set(colours).size).toBeGreaterThan(1)
  })

  test('T15-G · Open full view navigates to the meeting', async ({ page }) => {
    await openDetails(page)
    const id = new URL(page.url()).searchParams.get('details')

    await page.getByTestId('details-open-full').click()
    await expect(page).toHaveURL(new RegExp(`/meeting/${id}$`))
  })

  test('T15-H · arrow keys move between meetings without closing', async ({ page }) => {
    await openDetails(page, 0)
    const first = new URL(page.url()).searchParams.get('details')

    await page.keyboard.press('ArrowRight')

    await expect(page.getByTestId('details-drawer')).toBeVisible()
    await expect(page).not.toHaveURL(new RegExp(`details=${first}$`))

    await page.keyboard.press('ArrowLeft')
    await expect(page).toHaveURL(new RegExp(`details=${first}`))
  })

  test('the drawer shows the summary overview with a Show more toggle', async ({ page }) => {
    await openDetails(page)

    const overview = page.getByTestId('details-overview')
    await expect(overview).toBeVisible()

    // Clamped to four lines until asked otherwise.
    await expect(overview).toHaveClass(/line-clamp-4/)
    await page.getByTestId('details-overview-toggle').click()
    await expect(overview).not.toHaveClass(/line-clamp-4/)
  })
})

test.describe('details drawer · narrow viewports', () => {
  test.use({ viewport: { width: 500, height: 800 } })

  test('T15-I · below sm the drawer is full width', async ({ page }) => {
    await page.goto('/notebook?details=1')
    const drawer = page.getByTestId('details-drawer')
    await expect(drawer).toBeVisible()

    // Sub-pixel: layout widths are floats, so an exact comparison fails on a
    // value that is visually identical.
    const box = await drawer.boundingBox()
    expect(box!.width).toBeCloseTo(500, 0)

    // And the backdrop appears, because there is nothing left behind it to use.
    await expect(page.locator('.bg-scrim')).toBeVisible()
  })
})

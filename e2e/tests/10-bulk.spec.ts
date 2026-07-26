import { expect, test, type Page } from '@playwright/test'

/**
 * Bulk selection and pagination (T-14, cases T14-A → T14-M).
 *
 * The seeded library is 8 meetings, so the pagination cases drive `page_size`
 * rather than seeding 50: three pages of three exercises exactly the same
 * boundaries — first page, middle page, last page — without making the fixture
 * depend on a number the seeder is free to change.
 */

async function notebook(page: Page): Promise<void> {
  await page.goto('/notebook')
  await expect(page.getByTestId('meeting-list')).toBeVisible()
}

/** Selecting requires hovering first — the checkbox only appears on hover. */
async function selectRow(page: Page, index: number, shift = false): Promise<void> {
  const row = page.getByTestId('meeting-row').nth(index)
  await row.hover()
  await row.getByTestId('meeting-row-checkbox').click(shift ? { modifiers: ['Shift'] } : undefined)
}

test.describe('bulk selection', () => {
  test.beforeEach(async ({ page }) => notebook(page))

  test('T14-A · selecting one row raises the bulk bar', async ({ page }) => {
    await expect(page.getByTestId('bulk-bar')).toBeHidden()

    await selectRow(page, 0)

    await expect(page.getByTestId('bulk-bar')).toBeVisible()
    await expect(page.getByTestId('bulk-count')).toHaveText('1 selected')
  })

  test('the bulk bar OVERLAYS the list rather than pushing it down', async ({ page }) => {
    const titleBefore = await page.getByTestId('meeting-row-title').first().boundingBox()
    await selectRow(page, 0)
    await expect(page.getByTestId('bulk-bar')).toBeVisible()
    const titleAfter = await page.getByTestId('meeting-row-title').first().boundingBox()

    // Pushing content down would move the very rows being selected out from
    // under the pointer.
    expect(titleAfter!.y).toBe(titleBefore!.y)
  })

  test('T14-B · three selected shows an indeterminate group checkbox', async ({ page }) => {
    await selectRow(page, 0)
    await selectRow(page, 2)
    await expect(page.getByTestId('bulk-count')).toHaveText('2 selected')

    // "Today" holds two meetings and only one of them is selected, so its box
    // must be indeterminate — a plain unchecked box would claim nothing in
    // that day is picked.
    const today = page.getByTestId('meeting-list').locator('section').first()
    await expect(today.locator('[data-testid^="select-group-"]')).toHaveAttribute(
      'data-state',
      'indeterminate',
    )
  })

  test('T14-C · a group checkbox selects exactly its own day', async ({ page }) => {
    const group = page.getByTestId('meeting-list').locator('section').first()
    const rows = await group.getByTestId('meeting-row').count()

    await group.locator('[data-testid^="select-group-"]').click()

    await expect(page.getByTestId('bulk-count')).toHaveText(`${rows} selected`)
    await expect(group.locator('[data-testid^="select-group-"]')).toHaveAttribute(
      'data-state',
      'checked',
    )
  })

  test('T14-D · unchecking one row returns the group to indeterminate', async ({ page }) => {
    const group = page.getByTestId('meeting-list').locator('section').first()
    const box = group.locator('[data-testid^="select-group-"]')

    await box.click()
    await expect(box).toHaveAttribute('data-state', 'checked')

    await selectRow(page, 0)
    await expect(box).toHaveAttribute('data-state', 'indeterminate')
  })

  test('T14-E · shift-click selects the range between two rows', async ({ page }) => {
    await selectRow(page, 0)
    await selectRow(page, 3, true)

    // Four rows, not two: the range fills in everything between.
    await expect(page.getByTestId('bulk-count')).toHaveText('4 selected')
  })

  test('shift-click extends rather than toggling', async ({ page }) => {
    // A range that flipped each row would leave holes wherever one was already
    // picked.
    await selectRow(page, 2)
    await selectRow(page, 0)
    await selectRow(page, 4, true)

    await expect(page.getByTestId('bulk-count')).toHaveText('5 selected')
  })

  test('T14-H · Clear dismisses the bar and unchecks everything', async ({ page }) => {
    await selectRow(page, 0)
    await selectRow(page, 1)
    await expect(page.getByTestId('bulk-bar')).toBeVisible()

    await page.getByTestId('bulk-clear').click()

    await expect(page.getByTestId('bulk-bar')).toBeHidden()
    await expect(page.getByTestId('meeting-list').locator('[data-selected="true"]')).toHaveCount(0)
  })

  test('T14-I · changing a filter clears the selection and says so', async ({ page }) => {
    await selectRow(page, 0)
    await expect(page.getByTestId('bulk-count')).toHaveText('1 selected')

    await page.getByTestId('quick-filter-hosted-by-me').click()

    // Silently keeping rows the user can no longer see, and then bulk-deleting
    // them, is the outcome this prevents.
    await expect(page.getByTestId('bulk-bar')).toBeHidden()
    await expect(page.getByTestId('toast').first()).toContainText('Selection cleared')
  })

  test('selection survives paging', async ({ page }) => {
    await page.goto('/notebook?page_size=3')
    await expect(page.getByTestId('meeting-list')).toBeVisible()

    await selectRow(page, 0)
    await page.getByTestId('pagination-page-2').click()
    await expect(page.getByTestId('meeting-list')).toBeVisible()

    // Three on page 1 plus two on page 2 means five — paging is not a filter.
    await expect(page.getByTestId('bulk-count')).toHaveText('1 selected')

    await selectRow(page, 0)
    await expect(page.getByTestId('bulk-count')).toHaveText('2 selected')
  })
})

test.describe('pagination', () => {
  test('T14-J · a single page renders no pagination at all', async ({ page }) => {
    await notebook(page)
    // A lone disabled `[1]` implies there is somewhere else to go.
    await expect(page.getByTestId('pagination')).toBeHidden()
  })

  test('T14-K · a middle page shows the right slice and summary', async ({ page }) => {
    await page.goto('/notebook?page_size=3&page=2')
    await expect(page.getByTestId('meeting-list')).toBeVisible()

    await expect(page.getByTestId('meeting-row')).toHaveCount(3)
    await expect(page.getByTestId('pagination-summary')).toHaveText('Showing 4–6 of 8')
  })

  test('T14-L · prev and next are disabled at the bounds', async ({ page }) => {
    await page.goto('/notebook?page_size=3')
    await expect(page.getByTestId('pagination')).toBeVisible()
    await expect(page.getByTestId('pagination-prev')).toBeDisabled()
    await expect(page.getByTestId('pagination-next')).toBeEnabled()

    await page.getByTestId('pagination-page-3').click()
    await expect(page.getByTestId('pagination-next')).toBeDisabled()
    await expect(page.getByTestId('pagination-prev')).toBeEnabled()
  })

  test('T14-M · changing the page size returns to page 1', async ({ page }) => {
    await page.goto('/notebook?page_size=3&page=3')
    await expect(page.getByTestId('meeting-list')).toBeVisible()

    await page.getByTestId('page-size-select').click()
    await page.getByTestId('select-option-50').click()

    // Staying on page 3 of a now-single-page result is the blank-screen bug.
    await expect(page).not.toHaveURL(/page=3/)
    await expect(page.getByTestId('meeting-row')).toHaveCount(8)
  })

  test('the page slices do not overlap or skip', async ({ page }) => {
    const seen: string[] = []
    for (const pageNumber of [1, 2, 3]) {
      await page.goto(`/notebook?page_size=3&page=${pageNumber}`)
      await expect(page.getByTestId('meeting-list')).toBeVisible()
      seen.push(...(await page.getByTestId('meeting-row-title').allTextContents()))
    }

    expect(seen).toHaveLength(8)
    expect(new Set(seen).size).toBe(8)
  })
})

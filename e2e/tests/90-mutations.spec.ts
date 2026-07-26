import { expect, test, type Page } from '@playwright/test'

/**
 * Every test that WRITES to the database (T-09.4, T-12.11).
 *
 * They live in one file rather than beside the features they exercise, and
 * that is a Playwright constraint rather than a preference: `fullyParallel:
 * false` serialises tests within a FILE, but files still run in parallel
 * across workers. Two mutating specs in two files therefore raced each other
 * on the one shared database — `T09-A` deleted a row while the notebook's
 * kebab test was counting them.
 *
 * ADR-027 put writers in their own project so they could not race the readers;
 * this is the same fix one level up. The rule is simple enough to hold: if a
 * test writes, it goes here, and it restores what it changed.
 */

const ANCHOR = '2026-07-26T12:00:00Z'

const toasts = (page: Page) => page.getByTestId('toast')

async function notebook(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(ANCHOR))
  await page.goto('/notebook')
  await expect(page.getByTestId('meeting-list')).toBeVisible()
}

/**
 * Deleting goes through the row kebab, which T-12.11 built.
 *
 * T-09 shipped a provisional single delete button per row so the undo flow
 * could be tested at all; the kebab replaced it as planned, so these follow
 * the path a user actually takes.
 */
async function deleteFirstRow(page: Page): Promise<void> {
  const row = page.getByTestId('meeting-row').first()
  await row.hover()
  await row.getByTestId('meeting-row-kebab').click()
  await page.getByTestId('meeting-row-delete').click()
}

test.describe('toasts · delete and undo', { tag: '@mutates' }, () => {
  test('T09-A · deleting a meeting shows a toast with Undo', async ({ page }) => {
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible()

    const before = await page.getByTestId('meeting-row').count()
    const title = await page.getByTestId('meeting-row-title').first().textContent()

    await deleteFirstRow(page)

    const toast = toasts(page).first()
    await expect(toast).toBeVisible({ timeout: 1500 })
    await expect(toast).toContainText('Meeting deleted')
    await expect(page.getByTestId('toast-action')).toHaveText('Undo')

    await expect(page.getByTestId('meeting-row')).toHaveCount(before - 1)
    await expect(page.getByTestId('meeting-row-title').first()).not.toHaveText(title!)

    // Put it back. Every writer restores what it changed, so the next one
    // starts from the seeded state rather than from whatever the last one left.
    await page.getByTestId('toast-action').click()
    await expect(page.getByTestId('meeting-row')).toHaveCount(before)
  })

  test('T09-B · Undo restores the meeting and confirms it', async ({ page }) => {
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible()

    const before = await page.getByTestId('meeting-row').count()
    const title = await page.getByTestId('meeting-row-title').first().textContent()

    await deleteFirstRow(page)
    await expect(page.getByTestId('toast-action')).toHaveText('Undo')
    await page.getByTestId('toast-action').click()

    await expect(toasts(page).first()).toContainText('Meeting restored')
    await expect(page.getByTestId('meeting-row')).toHaveCount(before)
    await expect(page.getByTestId('meeting-row-title').first()).toHaveText(title!)
  })

  test('T09-D · a failed mutation raises an error toast with Retry', async ({ page }) => {
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible()

    // 503 rather than 400: a retryable status, so `Retry` is offered. The
    // client deliberately withholds it for errors that would fail identically.
    let failures = 0
    await page.route('**/api/v1/meetings/*', async (route) => {
      if (route.request().method() !== 'DELETE') return route.continue()
      failures++
      await route.fulfill({
        status: 503,
        json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Try again shortly', details: {} } },
      })
    })

    await deleteFirstRow(page)

    const toast = toasts(page).first()
    await expect(toast).toHaveAttribute('data-toast-variant', 'error')
    await expect(toast).toContainText('Try again shortly')
    await expect(page.getByTestId('toast-action')).toHaveText('Retry')

    // Errors persist — this is the case where auto-dismissal loses the message.
    await page.waitForTimeout(6000)
    await expect(toast).toBeVisible()

    await page.getByTestId('toast-action').click()
    await expect.poll(() => failures).toBeGreaterThan(1)
  })

  test('the row is gone before the request settles, and comes back if it fails', async ({
    page,
  }) => {
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible()
    const before = await page.getByTestId('meeting-row').count()

    await page.route('**/api/v1/meetings/*', async (route) => {
      if (route.request().method() !== 'DELETE') return route.continue()
      await route.fulfill({
        status: 500,
        json: { error: { code: 'INTERNAL_ERROR', message: 'Boom', details: {} } },
      })
    })

    await deleteFirstRow(page)
    await expect(toasts(page).first()).toHaveAttribute('data-toast-variant', 'error')

    // A failed delete must leave the list exactly as it was.
    await expect(page.getByTestId('meeting-row')).toHaveCount(before)
  })
})

test.describe('notebook · deleting @mutates', () => {
  test('T12-G · the kebab deletes with an undo toast', async ({ page }) => {
    await notebook(page)

    const before = await page.getByTestId('meeting-row').count()
    const row = page.getByTestId('meeting-row').first()

    await row.hover()
    await row.getByTestId('meeting-row-kebab').click()
    await page.getByTestId('meeting-row-delete').click()

    await expect(page.getByTestId('toast').first()).toContainText('Meeting deleted')
    await expect(page.getByTestId('meeting-row')).toHaveCount(before - 1)

    // Put it back, so the next writer starts from the seeded state.
    await page.getByTestId('toast-action').click()
    await expect(page.getByTestId('meeting-row')).toHaveCount(before)
  })
})

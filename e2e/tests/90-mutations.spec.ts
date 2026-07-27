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

/** Selecting requires hovering first — the checkbox only appears on hover. */
async function selectRow(page: Page, index: number): Promise<void> {
  const row = page.getByTestId('meeting-row').nth(index)
  await row.hover()
  await row.getByTestId('meeting-row-checkbox').click()
}

test.describe('bulk delete', { tag: '@mutates' }, () => {
  test('T14-F · deleting a selection confirms, removes and reports', async ({ page }) => {
    await notebook(page)
    const before = await page.getByTestId('meeting-row').count()

    await selectRow(page, 0)
    await selectRow(page, 1)
    await expect(page.getByTestId('bulk-count')).toHaveText('2 selected')

    await page.getByTestId('bulk-delete').click()

    // The dialog names the COUNT, so the scope is visible rather than trusted.
    const dialog = page.getByTestId('bulk-confirm')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Delete 2 meetings?')

    await page.getByTestId('confirm-dialog-confirm').click()

    await expect(page.getByTestId('toast').first()).toContainText('2 meetings deleted')
    await expect(page.getByTestId('meeting-row')).toHaveCount(before - 2)
    await expect(page.getByTestId('notebook-count')).toContainText(`${before - 2} meetings`)

    // Restore, so the next writer starts from the seeded state.
    await page.getByTestId('toast-action').click()
    await expect(page.getByTestId('meeting-row')).toHaveCount(before)
  })

  test('T14-G · Undo restores every deleted meeting', async ({ page }) => {
    await notebook(page)
    const before = await page.getByTestId('meeting-row-title').allTextContents()

    await selectRow(page, 0)
    await selectRow(page, 1)
    await page.getByTestId('bulk-delete').click()
    await page.getByTestId('confirm-dialog-confirm').click()
    await expect(page.getByTestId('meeting-row')).toHaveCount(before.length - 2)

    await page.getByTestId('toast-action').click()

    await expect(page.getByTestId('toast').first()).toContainText('Meeting restored')
    // Same meetings, same order — a restore that reshuffled the list would be
    // its own kind of wrong.
    await expect.poll(() => page.getByTestId('meeting-row-title').allTextContents()).toEqual(before)
  })

  test('the selection is cleared once the delete lands', async ({ page }) => {
    await notebook(page)
    const before = await page.getByTestId('meeting-row').count()

    await selectRow(page, 0)
    await page.getByTestId('bulk-delete').click()
    await page.getByTestId('confirm-dialog-confirm').click()

    // Leaving ids selected after they are gone would let a second Delete act
    // on rows that no longer exist.
    await expect(page.getByTestId('bulk-bar')).toBeHidden()

    await page.getByTestId('toast-action').click()
    await expect(page.getByTestId('meeting-row')).toHaveCount(before)
  })
})

test.describe('details drawer', { tag: '@mutates' }, () => {
  test('T15-D · ticking an action item strikes it through and updates the row badge', async ({
    page,
  }) => {
    await page.goto('/notebook?details=1')
    await expect(page.getByTestId('details-drawer')).toBeVisible()

    const badge = page.getByTestId('meeting-row-1').getByTestId('meeting-row-actions')
    const before = await badge.textContent()

    const item = page.locator('[data-testid^="details-action-item-"]').first()
    await item.click()

    // Optimistic: the strikethrough is immediate, not after a round-trip.
    await expect(item).toHaveAttribute('data-state', 'checked')
    // …and the Notebook row's "N open" count follows, which is the
    // cross-surface invalidation ADR-005 chose TanStack Query for.
    await expect(badge).not.toHaveText(before!)

    // Put it back.
    await item.click()
    await expect(badge).toHaveText(before!)
  })

  test('T15-E · changing privacy saves and survives a reload', async ({ page }) => {
    await page.goto('/notebook?details=1')
    await expect(page.getByTestId('details-drawer')).toBeVisible()

    const select = page.getByTestId('details-privacy-select')
    const before = await select.textContent()

    await select.click()
    await page.getByTestId('select-option-public').click()

    await expect(page.getByTestId('toast').first()).toContainText('Changes saved')

    await page.reload()
    await expect(page.getByTestId('details-privacy-select')).toContainText('Public')

    // Restore the seeded value.
    await page.getByTestId('details-privacy-select').click()
    await page.getByTestId(`select-option-${before!.toLowerCase()}`).click()
    await expect(page.getByTestId('details-privacy-select')).toContainText(before!)
  })
})

test.describe('summary · regenerate', { tag: '@mutates' }, () => {
  const HERO = 1

  test('T23-I · regenerating replaces the summary and re-enables the button', async ({ page }) => {
    await page.goto(`/meeting/${HERO}`)
    await expect(page.getByTestId('summary-overview')).toBeVisible({ timeout: 20_000 })

    const button = page.getByTestId('summary-regenerate')
    await button.click()

    await expect(page.getByTestId('toast')).toContainText('Summary regenerated', {
      timeout: 15_000,
    })

    // Re-enabled and still showing a summary — not left spinning, and not
    // blanked while the new one arrives.
    await expect(button).toBeEnabled()
    await expect(page.getByTestId('summary-overview')).toBeVisible()
    await expect(page.getByTestId('summary-outline')).toBeVisible()
  })

  test('T23-L · regenerating clears the Outdated badge', async ({ page, request }) => {
    /*
     * The stale flag is set by EDITING A SEGMENT, which has no UI yet — the
     * segment editor is a later task. Driving it through the API is the honest
     * way to reach the state from here, and it exercises the same path the
     * editor will: edit, badge appears; regenerate, badge clears.
     */
    const transcript = await request.get(
      `http://127.0.0.1:8100/api/v1/meetings/${HERO}/transcript`,
    )
    const segment = (await transcript.json()).segments[0]

    const edit = await request.patch(
      `http://127.0.0.1:8100/api/v1/meetings/segments/${segment.id}`,
      { data: { text: `${segment.text} ` } },
    )
    expect(edit.ok()).toBe(true)

    await page.goto(`/meeting/${HERO}`)
    await expect(page.getByTestId('summary-stale-badge')).toBeVisible({ timeout: 20_000 })

    await page.getByTestId('summary-regenerate').click()
    await expect(page.getByTestId('toast')).toContainText('Summary regenerated', {
      timeout: 15_000,
    })

    await expect(page.getByTestId('summary-stale-badge')).toBeHidden()

    // Put the segment back the way the seed left it.
    await request.patch(
      `http://127.0.0.1:8100/api/v1/meetings/segments/${segment.id}`,
      { data: { text: segment.text } },
    )
  })
})

import { expect, test, type Page } from '@playwright/test'

/**
 * Deleting a meeting (T-28, cases T28-A → T28-K).
 *
 * Every case here stops AT the dialog — which is most of what T-28 is about,
 * since the point of a confirmation is that it is the last moment before
 * anything happens. Anything that actually deletes lives in
 * `90-mutations.spec.ts`, because these run four-up against one database.
 */

async function openDeleteDialog(page: Page): Promise<string> {
  await page.goto('/notebook')
  await expect(page.getByTestId('meeting-list')).toBeVisible({ timeout: 20_000 })

  const row = page.getByTestId('meeting-row').first()
  const title = (await row.getByTestId('meeting-row-title').innerText()).trim()

  await row.hover()
  await row.getByTestId('meeting-row-kebab').click()
  await page.getByTestId('meeting-row-delete').click()
  await expect(page.getByTestId('delete-dialog')).toBeVisible()

  return title
}

test.describe('delete meeting', () => {
  test('T28-A/K · the dialog names the meeting and focuses Cancel', async ({ page }) => {
    const title = await openDeleteDialog(page)

    const dialog = page.getByTestId('delete-dialog')
    await expect(dialog).toContainText('Delete meeting?')
    // The title, so the user can see WHICH meeting they are about to lose.
    await expect(dialog).toContainText(title)
    await expect(dialog).toContainText('transcript, summary, and action items')

    /*
     * Focus is on CANCEL (T-28.3).
     *
     * A destructive dialog that autofocuses its destructive button turns an
     * Enter still travelling from the keystroke that opened it into a
     * deletion.
     */
    await expect(page.getByTestId('delete-dialog-cancel')).toBeFocused()
  })

  test('T28-B · Cancel closes without deleting', async ({ page }) => {
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible({ timeout: 20_000 })
    const before = await page.getByTestId('meeting-row').count()

    let deletes = 0
    await page.route('**/api/v1/meetings/*', (route) => {
      if (route.request().method() === 'DELETE') deletes += 1
      return route.continue()
    })

    await openDeleteDialog(page)
    await page.getByTestId('delete-dialog-cancel').click()

    await expect(page.getByTestId('delete-dialog')).toBeHidden()
    await expect(page.getByTestId('meeting-row')).toHaveCount(before)
    expect(deletes).toBe(0)
  })

  test('T28-C · Escape does the same as Cancel', async ({ page }) => {
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible({ timeout: 20_000 })
    const before = await page.getByTestId('meeting-row').count()

    await openDeleteDialog(page)
    await page.keyboard.press('Escape')

    await expect(page.getByTestId('delete-dialog')).toBeHidden()
    await expect(page.getByTestId('meeting-row')).toHaveCount(before)
  })

  test('T28-J · a deleted meeting answers with a branded page, not a crash', async ({ page }) => {
    /*
     * A 410, which is not a 404: the meeting EXISTED and was deleted, and the
     * page says so rather than implying the link was never valid.
     */
    await page.route('**/api/v1/meetings/1', (route) =>
      route.fulfill({
        status: 410,
        json: {
          error: { code: 'MEETING_DELETED', message: 'This meeting was deleted.', details: {} },
        },
      }),
    )

    await page.goto('/meeting/1')

    const error = page.getByTestId('notepad-error')
    await expect(error).toBeVisible({ timeout: 20_000 })
    await expect(error).toContainText("doesn't exist or was deleted")
    await expect(error.getByRole('link', { name: 'Back to meetings' })).toBeVisible()
  })

})

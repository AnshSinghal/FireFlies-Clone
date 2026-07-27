import { expect, test, type Page } from '@playwright/test'

/**
 * Editing a meeting's metadata (T-27, cases T27-A → T27-K).
 *
 * The cases that SAVE live in `90-mutations.spec.ts`; these stop before
 * writing — the dirty-state rules, the validation, and the discard confirm.
 */

async function openEdit(page: Page): Promise<void> {
  await page.goto('/meeting/1')
  await expect(page.getByTestId('notepad-header')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('notepad-kebab').click()
  await page.getByTestId('notepad-edit-details').click()
  await expect(page.getByTestId('edit-modal')).toBeVisible()
}

test.describe('edit meeting', () => {
  test('T27-B · Save is disabled until something changes', async ({ page }) => {
    await openEdit(page)

    await expect(page.getByTestId('edit-save')).toBeDisabled()

    await page.getByTestId('edit-title').fill('Something else')
    await expect(page.getByTestId('edit-save')).toBeEnabled()

    // …and disabled again when the change is undone, which a dirty FLAG would
    // get wrong.
    await page.getByTestId('edit-title').fill('Q3 Product Roadmap Sync')
    await expect(page.getByTestId('edit-save')).toBeDisabled()
  })

  test('T27-C · closing with unsaved changes asks first', async ({ page }) => {
    await openEdit(page)

    await page.getByTestId('edit-description').fill('An edit nobody asked to lose')
    await page.getByTestId('edit-cancel').click()

    const confirm = page.getByTestId('confirm-dialog')
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText('Discard changes?')

    // Backing out of the discard leaves the edit where it was.
    await page.getByTestId('confirm-dialog-cancel').click()
    await expect(page.getByTestId('edit-description')).toHaveValue('An edit nobody asked to lose')
  })

  test('T27-G · an empty title blocks the save', async ({ page }) => {
    await openEdit(page)

    let patched = 0
    await page.route('**/api/v1/meetings/1', (route) => {
      if (route.request().method() === 'PATCH') patched += 1
      return route.continue()
    })

    await page.getByTestId('edit-title').fill('   ')
    await page.getByTestId('edit-save').click()

    await expect(page.getByTestId('edit-modal')).toContainText('needs a title')
    expect(patched).toBe(0)
  })

  test('T27-H · the title is capped at 200 with a counter near the limit', async ({ page }) => {
    await openEdit(page)

    // No counter while nowhere near the ceiling.
    await expect(page.getByTestId('edit-title-counter')).toHaveCount(0)

    await page.getByTestId('edit-title').fill('x'.repeat(250))

    // The input itself refuses the overflow, so 250 characters became 200.
    await expect(page.getByTestId('edit-title')).toHaveValue('x'.repeat(200))
    await expect(page.getByTestId('edit-title-counter')).toContainText('200 / 200')
  })

  test('T27-F · a duplicate participant is blocked inline', async ({ page }) => {
    await openEdit(page)

    // From `data-name`, not `innerText`: the avatar contributes its initials,
    // so the text reads "SCSarah Chen".
    const existing = (await page.getByTestId('edit-participant-token-0').getAttribute('data-name'))!

    await page.getByTestId('edit-participant-input').fill(existing)
    await page.getByTestId('edit-participant-input').press('Enter')

    await expect(page.getByTestId('edit-participants')).toContainText('already a participant')
    // Not added twice.
    const names = await page
      .locator('[data-testid^="edit-participant-token-"]')
      .evaluateAll((tokens) => tokens.map((token) => token.getAttribute('data-name')))
    expect(names.filter((name) => name === existing)).toHaveLength(1)
  })

  test('T27-E · removing a speaker warns before it happens', async ({ page }) => {
    await openEdit(page)

    const before = await page.locator('[data-testid^="edit-participant-token-"]').count()

    await page.getByTestId('edit-participant-remove-0').click()

    // Warned, and still there.
    await expect(page.getByTestId('edit-participant-warning')).toBeVisible()
    await expect(page.locator('[data-testid^="edit-participant-token-"]')).toHaveCount(before)

    // Confirmed by pressing again.
    await page.getByTestId('edit-participant-remove-0').click()
    await expect(page.locator('[data-testid^="edit-participant-token-"]')).toHaveCount(before - 1)
  })

  test('the duration is shown as derived, not editable', async ({ page }) => {
    await openEdit(page)

    const duration = page.getByTestId('edit-duration')
    await expect(duration).toContainText('derived from the transcript')
    // No input for it: a field that accepted a number would let the two
    // disagree, and the transcript is the one telling the truth.
    await expect(duration.locator('input')).toHaveCount(0)
  })
})

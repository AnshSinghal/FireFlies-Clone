import { expect, test, type Page } from '@playwright/test'

/**
 * Comments & threads (T-31, cases T31-A → T31-K).
 *
 * Everything here writes, so the whole file is `@mutates` and runs in the
 * serial project. The empty state (T31-J) runs FIRST, against meeting 2 —
 * once this file has commented on meeting 1, its flyout is never empty again
 * within the run.
 */

async function openMeeting(page: Page, id = 1): Promise<void> {
  await page.goto(`/meeting/${id}`)
  await expect(page.getByTestId('notepad-header')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('transcript-list')).toBeVisible()
}

test.describe('comments · threads on transcript lines', { tag: '@mutates' }, () => {
  test('T31-J · a meeting without comments shows the flyout empty state', async ({ page }) => {
    await openMeeting(page, 2)

    await page.getByTestId('icon-rail-comments').click()

    await expect(page.getByTestId('comments-flyout-empty')).toBeVisible()
    await expect(page.getByTestId('rail-flyout-comments')).toContainText('No comments yet')
    await expect(page.getByTestId('rail-flyout-comments')).toContainText(
      'Select transcript text to start a discussion',
    )
  })

  test('T31-A · a comment appears under its line, chips the gutter, and survives reload', async ({
    page,
  }) => {
    await openMeeting(page)
    const firstSegment = page.locator('[data-segment-id]').first()
    const segmentId = await firstSegment.getAttribute('data-segment-id')

    await firstSegment.hover()
    await firstSegment.getByTestId('transcript-segment-menu').click()
    await page.getByTestId(`segment-add-comment-${segmentId}`).click()
    await page.getByTestId('comment-composer-input').fill('Strong opening point.')
    await page.getByTestId('comment-submit').click()

    await expect(page.getByText('Strong opening point.')).toBeVisible()
    await expect(page.getByTestId(`comment-gutter-${segmentId}`)).toHaveText('1')

    await page.reload()
    await expect(page.getByTestId('notepad-header')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Strong opening point.')).toBeVisible()
    await expect(page.getByTestId(`comment-gutter-${segmentId}`)).toHaveText('1')
  })

  test('T31-B · a reply indents under its parent', async ({ page }) => {
    await openMeeting(page)

    await page.getByTestId(/^comment-reply-\d+$/).first().click()
    await page
      .getByTestId(/^comment-reply-composer-\d+-input$/)
      .fill('Agreed — and the numbers back it up.')
    await page.getByTestId('comment-submit').last().click()

    await expect(page.getByText('Agreed — and the numbers back it up.')).toBeVisible()
  })

  test('T31-C/D · @ lists only participants; a pick becomes an accent token', async ({
    page,
  }) => {
    await openMeeting(page)
    const firstSegment = page.locator('[data-segment-id]').first()
    const segmentId = await firstSegment.getAttribute('data-segment-id')

    await firstSegment.hover()
    await firstSegment.getByTestId('transcript-segment-menu').click()
    await page.getByTestId(`segment-add-comment-${segmentId}`).click()
    await page.getByTestId('comment-composer-input').fill('What do you think @')

    await expect(page.getByTestId('comment-mention-list')).toBeVisible()
    const first = page.getByTestId(/^comment-mention-\d+$/).first()
    const mentionedName = (await first.textContent())?.trim() ?? ''
    await first.click()

    await page.getByTestId('comment-submit').click()

    // The saved comment renders the mention as an accent-tinted token.
    const token = page.locator('span.bg-accent-subtle', { hasText: `@${mentionedName}` })
    await expect(token.first()).toBeVisible()
  })

  test('T31-E · editing marks the comment as edited', async ({ page }) => {
    await openMeeting(page)

    await page.getByTestId(/^comment-edit-\d+$/).first().click()
    await page.getByTestId(/^comment-edit-input-\d+$/).fill('Strong opening point — revised.')
    await page.getByTestId(/^comment-edit-save-\d+$/).click()

    await expect(page.getByText('Strong opening point — revised.')).toBeVisible()
    await expect(page.getByText('(edited)').first()).toBeVisible()
  })

  test('T31-H · a flyout entry seeks the player to its segment', async ({ page }) => {
    await openMeeting(page)

    await page.getByTestId('icon-rail-comments').click()
    await expect(page.getByTestId('comments-flyout')).toBeVisible()

    await page.getByTestId(/^comments-flyout-entry-\d+$/).first().click()

    // Seeking rewrites ?t= in place — the player position IS the URL (T-19).
    await expect(page).toHaveURL(/[?&]t=/)
  })

  test('T31-G · a failed post rolls back and keeps the text', async ({ page }) => {
    await openMeeting(page)
    const segment = page.locator('[data-segment-id]').nth(3)
    const segmentId = await segment.getAttribute('data-segment-id')

    await page.route('**/api/v1/meetings/*/comments', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, json: { error: { code: 'BOOM', message: 'Forced' } } })
        : route.continue(),
    )

    await segment.hover()
    await segment.getByTestId('transcript-segment-menu').click()
    await page.getByTestId(`segment-add-comment-${segmentId}`).click()
    await page.getByTestId('comment-composer-input').fill('This must not be lost')
    await page.getByTestId('comment-submit').click()

    await expect(page.getByTestId('toast')).toBeVisible()
    // Rolled back — no optimistic remnant at full opacity…
    await expect(page.locator('[data-pending]')).toHaveCount(0)
    // …and the composer still holds the words (T31-G).
    await expect(page.getByTestId('comment-composer-input')).toHaveValue('This must not be lost')
  })

  test('T31-K · a script tag renders as literal text', async ({ page }) => {
    await openMeeting(page)
    const segment = page.locator('[data-segment-id]').nth(5)
    const segmentId = await segment.getAttribute('data-segment-id')

    await segment.hover()
    await segment.getByTestId('transcript-segment-menu').click()
    await page.getByTestId(`segment-add-comment-${segmentId}`).click()
    await page.getByTestId('comment-composer-input').fill('<script>alert(1)</script>')
    await page.getByTestId('comment-submit').click()

    await expect(page.getByText('<script>alert(1)</script>')).toBeVisible()
  })

  test('T31-F · deleting a parent with replies leaves a tombstone', async ({ page }) => {
    await openMeeting(page)

    // The first thread gained a reply in T31-B; delete its parent.
    await page.getByTestId(/^comment-delete-\d+$/).first().click()

    await expect(page.getByText('Comment deleted').first()).toBeVisible()
    await expect(page.getByText('Agreed — and the numbers back it up.')).toBeVisible()
  })

  test('T31-I · resolving collapses the thread behind a badge', async ({ page }) => {
    await openMeeting(page)

    await page.getByTestId(/^comment-resolve-\d+$/).first().click()

    await expect(page.getByText('Resolved').first()).toBeVisible()
    // The collapsed summary offers its way back.
    await expect(page.getByRole('button', { name: 'Show', exact: true }).first()).toBeVisible()
  })

})

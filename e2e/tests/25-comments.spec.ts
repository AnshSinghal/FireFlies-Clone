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
    await firstSegment.getByRole('button', { name: 'Segment actions' }).click()
    await page.getByTestId(`segment-add-comment-${segmentId}`).click()
    await page.getByTestId('comment-composer-input').fill('Strong opening point.')
    await page.getByTestId('comment-submit').click()

    await expect(page.getByText('Strong opening point.').first()).toBeVisible()
    await expect(page.getByTestId(`comment-gutter-${segmentId}`)).toHaveText('1')

    /*
     * Both assertions above are satisfied by the OPTIMISTIC row alone — they
     * pass while the POST is still on the wire. Reloading at that instant
     * aborts the request and the comment never persists, which is exactly
     * what happened under post-suite load (the run's access log had NO
     * comment POST during this test). The pending marker clearing is the
     * signal that the SERVER row replaced the placeholder; only then does
     * "survives reload" test persistence rather than a race.
     */
    await expect(page.locator('[data-pending]')).toHaveCount(0)

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

    await expect(page.getByText('Agreed — and the numbers back it up.').first()).toBeVisible()
    // T31-F later deletes this thread expecting a REPLY to exist in the DB —
    // closing this page while the POST is in flight would abort it (the same
    // race T31-A guards against before its reload).
    await expect(page.locator('[data-pending]')).toHaveCount(0)
  })

  test('T31-C/D · @ lists only participants; a pick becomes an accent token', async ({
    page,
  }) => {
    await openMeeting(page)
    const firstSegment = page.locator('[data-segment-id]').first()
    const segmentId = await firstSegment.getAttribute('data-segment-id')

    await firstSegment.hover()
    await firstSegment.getByRole('button', { name: 'Segment actions' }).click()
    await page.getByTestId(`segment-add-comment-${segmentId}`).click()
    await page.getByTestId('comment-composer-input').fill('What do you think @')

    await expect(page.getByTestId('comment-mention-list')).toBeVisible()
    const first = page.getByTestId(/^comment-mention-\d+$/).first()
    const mentionedName =
      (await first.getByTestId('comment-mention-name').textContent())?.trim() ?? ''
    await first.click()

    await page.getByTestId('comment-submit').click()

    // The saved comment renders the mention as an accent-tinted token.
    const token = page
      .getByTestId('comment-mention-token')
      .filter({ hasText: `@${mentionedName}` })
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
    await segment.getByRole('button', { name: 'Segment actions' }).click()
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
    await segment.getByRole('button', { name: 'Segment actions' }).click()
    await page.getByTestId(`segment-add-comment-${segmentId}`).click()
    await page.getByTestId('comment-composer-input').fill('<script>alert(1)</script>')
    await page.getByTestId('comment-submit').click()

    /*
     * The composer closes ON SUCCESS (its submit awaits the POST, then
     * cancels itself), so waiting for it to leave is waiting for the server
     * row — and it removes the second strict-mode match for the script text,
     * which briefly lives in BOTH the textarea and the optimistic row.
     */
    await expect(page.getByTestId('comment-composer-input')).toHaveCount(0)
    await expect(page.getByText('<script>alert(1)</script>')).toBeVisible()
    // T31-H clicks this thread's flyout entry next test — it must be a real
    // row, not an optimistic one an unload would abort.
    await expect(page.locator('[data-pending]')).toHaveCount(0)
  })

  test('T31-H · a flyout entry seeks the player to its segment', async ({ page }) => {
    await openMeeting(page)

    await page.getByTestId('icon-rail-comments').click()
    await expect(page.getByTestId('comments-flyout')).toBeVisible()

    const before = await page.getByTestId('player-time').textContent()
    // The last entry is T31-K's thread, anchored well past 00:00.
    await page
      .getByTestId(/^comments-flyout-entry-\d+$/)
      .last()
      .click()

    // A paused seek moves the CLOCK, not the URL (?t= belongs to playback,
    // T19-I) — and it reveals the thread's segment in the transcript.
    await expect(page.getByTestId('player-time')).not.toHaveText(before ?? '')
    await expect(
      page.getByText('<script>alert(1)</script>').first(),
    ).toBeInViewport()
  })

  test('T31-F · deleting a parent with replies leaves a tombstone', async ({ page }) => {
    await openMeeting(page)

    // The first thread gained a reply in T31-B; delete its parent.
    await page.getByTestId(/^comment-delete-\d+$/).first().click()

    await expect(page.getByText('Comment deleted').first()).toBeVisible()
    await expect(page.getByText('Agreed — and the numbers back it up.').first()).toBeVisible()
  })

  test('T31-I · resolving collapses the thread behind a badge', async ({ page }) => {
    await openMeeting(page)

    await page.getByTestId(/^comment-resolve-\d+$/).first().click()

    await expect(page.getByText('Resolved').first()).toBeVisible()
    // The collapsed summary offers its way back.
    await expect(page.getByRole('button', { name: 'Show', exact: true }).first()).toBeVisible()
  })

})

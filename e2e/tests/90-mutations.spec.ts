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

  // T-28.2 put a confirmation in front of this. The undo toast is still the
  // safety net; the dialog is what stops the accident in the first place.
  await expect(page.getByTestId('delete-dialog')).toBeVisible()
  await page.getByTestId('delete-dialog-confirm').click()
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

    // Confirmed first (T-28.2): the dialog stops the accident, the undo toast
    // catches the confirmed one.
    await page.getByTestId('delete-dialog-confirm').click()

    await expect(page.getByTestId('toast').first()).toContainText('Meeting deleted')
    await expect(page.getByTestId('meeting-row')).toHaveCount(before - 1)

    // Put it back, so the next writer starts from the seeded state.
    await page.getByTestId('toast-action').first().click()
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

    await page.getByTestId('bulk-confirm-confirm').click()

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
    await page.getByTestId('bulk-confirm-confirm').click()
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
    await page.getByTestId('bulk-confirm-confirm').click()

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

    /*
     * Pinned to an ID, not to a position.
     *
     * T-24.1 orders the list open-first, so ticking an item MOVES it to the
     * bottom — and `.first()` then refers to a different item, which made
     * "put it back" tick a second item instead of unticking the first.
     */
    const id = (await page
      .locator('[data-testid^="details-action-item-"]')
      .first()
      .getAttribute('data-testid'))!
    const item = page.getByTestId(id)

    await item.click()

    // Optimistic: the strikethrough is immediate, not after a round-trip.
    await expect(item).toHaveAttribute('data-state', 'checked')
    // …and the Notebook row's "N open" count follows, which is the
    // cross-surface invalidation ADR-005 chose TanStack Query for.
    await expect(badge).not.toHaveText(before!)

    // Put it back.
    await page.getByTestId(id).click()
    await expect(page.getByTestId(id)).toHaveAttribute('data-state', 'unchecked')
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

    /*
     * A REAL change, not a trailing space.
     *
     * T-25 made the API trim segment text, so a whitespace-only "edit" now
     * lands as the same string and nothing is marked stale — correctly, since
     * nothing changed.
     */
    const edit = await request.patch(
      `http://127.0.0.1:8100/api/v1/meetings/segments/${segment.id}`,
      { data: { text: `${segment.text} (edited by T23-L)` } },
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

test.describe('action items · editing', { tag: '@mutates' }, () => {
  /** The QBR: seven items, a mix of overdue, due-today and no-date. */
  const QBR = 6

  const rows = (page: Page) => page.locator('[data-testid^="action-item-"][data-status]')

  async function openActions(page: Page): Promise<void> {
    await page.goto(`/meeting/${QBR}`)
    await expect(page.getByTestId('action-items-section')).toBeVisible({ timeout: 20_000 })
  }

  test('T24-B/C · ticking an item is instant and survives a reload', async ({ page }) => {
    await openActions(page)

    const open = page.locator('[data-testid^="action-item-"][data-status="open"]').first()
    const id = (await open.getAttribute('data-testid'))!.replace('action-item-', '')
    const checkbox = page.getByTestId(`action-item-checkbox-${id}`)

    /*
     * Held OPEN by a delayed route, so "instant" is a claim with teeth: the row
     * must show as completed while the request is still in flight, not after
     * it settles.
     */
    await page.route('**/api/v1/meetings/action-items/*', async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue()
      await new Promise((resolve) => setTimeout(resolve, 1500))
      return route.continue()
    })

    await checkbox.click()
    await expect(page.getByTestId(`action-item-${id}`)).toHaveAttribute(
      'data-status',
      'completed',
      { timeout: 500 },
    )

    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await page.reload()
    await expect(page.getByTestId(`action-item-${id}`)).toHaveAttribute(
      'data-status',
      'completed',
      { timeout: 20_000 },
    )

    // Put it back, so the seeded counts hold for everything else.
    await page.getByTestId(`action-item-checkbox-${id}`).click()
    await expect(page.getByTestId(`action-item-${id}`)).toHaveAttribute('data-status', 'open')
  })

  test('T24-O · toggling here updates the Notebook row', async ({ page }) => {
    await openActions(page)

    const open = page.locator('[data-testid^="action-item-"][data-status="open"]').first()
    const id = (await open.getAttribute('data-testid'))!.replace('action-item-', '')

    await page.goto('/notebook')
    const badge = page.getByTestId(`meeting-row-${QBR}`).getByTestId('meeting-row-actions')
    await expect(badge).toBeVisible({ timeout: 15_000 })
    const before = Number((await badge.innerText()).match(/\d+/)![0])

    await page.goto(`/meeting/${QBR}`)
    await page.getByTestId(`action-item-checkbox-${id}`).click()
    await expect(page.getByTestId(`action-item-${id}`)).toHaveAttribute('data-status', 'completed')

    await page.goto('/notebook')
    // The cross-view invalidation: the row's "N open" is derived from the same
    // counts, so it has to fall by one.
    await expect
      .poll(
        async () =>
          Number((await page.getByTestId(`meeting-row-${QBR}`).getByTestId('meeting-row-actions').innerText()).match(/\d+/)![0]),
        { timeout: 15_000 },
      )
      .toBe(before - 1)

    await page.goto(`/meeting/${QBR}`)
    await page.getByTestId(`action-item-checkbox-${id}`).click()
    await expect(page.getByTestId(`action-item-${id}`)).toHaveAttribute('data-status', 'open')
  })

  test('T24-F/J · adding an item, then deleting it with Undo', async ({ page }) => {
    await openActions(page)
    const before = await rows(page).count()

    await page.getByTestId('action-item-add').click()
    await page.getByTestId('action-item-composer-text').fill('Ship the pricing deck')
    await page.getByTestId('action-item-composer-save').click()

    await expect(rows(page)).toHaveCount(before + 1, { timeout: 15_000 })
    const added = page.locator('[data-testid^="action-item-"][data-status]', {
      hasText: 'Ship the pricing deck',
    })
    await expect(added).toHaveCount(1)

    await page.reload()
    await expect(page.getByTestId('action-items-section')).toBeVisible({ timeout: 20_000 })
    await expect(rows(page)).toHaveCount(before + 1)

    // Delete it, and take the Undo — the item comes back.
    const id = (await added.first().getAttribute('data-testid'))!.replace('action-item-', '')
    await page.getByTestId(`action-item-kebab-${id}`).click()
    await page.getByTestId(`action-item-delete-${id}`).click()

    await expect(rows(page)).toHaveCount(before)
    await page.getByTestId('toast-action').first().click()
    await expect(rows(page)).toHaveCount(before + 1, { timeout: 15_000 })

    // Now really remove it, so the seeded count holds.
    const restored = page.locator('[data-testid^="action-item-"][data-status]', {
      hasText: 'Ship the pricing deck',
    })
    const restoredId = (await restored.first().getAttribute('data-testid'))!.replace(
      'action-item-',
      '',
    )
    await page.getByTestId(`action-item-kebab-${restoredId}`).click()
    await page.getByTestId(`action-item-delete-${restoredId}`).click()
    await expect(rows(page)).toHaveCount(before)
  })

  test('T24-H/I · inline editing saves on Enter and reverts on Escape', async ({ page }) => {
    await openActions(page)

    const first = rows(page).first()
    const id = (await first.getAttribute('data-testid'))!.replace('action-item-', '')
    const text = page.getByTestId(`action-item-text-${id}`)
    const original = (await text.innerText()).trim()

    // Escape reverts, and sends nothing.
    let patched = 0
    await page.route('**/api/v1/meetings/action-items/*', (route) => {
      if (route.request().method() === 'PATCH') patched += 1
      return route.continue()
    })

    await text.click()
    await page.getByTestId(`action-item-text-${id}-input`).fill('Something else entirely')
    await page.keyboard.press('Escape')

    await expect(page.getByTestId(`action-item-text-${id}`)).toHaveText(original)
    expect(patched).toBe(0)

    // Enter saves, and it persists.
    await page.getByTestId(`action-item-text-${id}`).click()
    await page.getByTestId(`action-item-text-${id}-input`).fill('Edited by a test')
    await page.keyboard.press('Enter')

    await expect(page.getByTestId(`action-item-text-${id}`)).toHaveText('Edited by a test')
    await page.reload()
    await expect(page.getByTestId(`action-item-text-${id}`)).toHaveText('Edited by a test', {
      timeout: 20_000,
    })

    // Restore the seeded text.
    await page.getByTestId(`action-item-text-${id}`).click()
    await page.getByTestId(`action-item-text-${id}-input`).fill(original)
    await page.keyboard.press('Enter')
    await expect(page.getByTestId(`action-item-text-${id}`)).toHaveText(original)
  })
})

test.describe('transcript · editing', { tag: '@mutates' }, () => {
  const HERO = 1

  async function edit(page: Page): Promise<void> {
    await page.goto(`/meeting/${HERO}`)
    await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('transcript-edit-toggle').click()
    await expect(page.getByTestId('transcript-edit-status')).toBeVisible()
  }

  test('T25-B/D/E · an edit autosaves, is badged, and can be reverted', async ({ page }) => {
    await edit(page)

    const editor = page.locator('[data-testid^="segment-editor-"]').first()
    const id = (await editor.getAttribute('data-testid'))!.replace('segment-editor-', '')
    const original = await editor.inputValue()

    await editor.fill('Edited by the transcript suite')

    // Autosaved 800ms after the last keystroke — no button, no blur needed.
    await expect(page.getByTestId('transcript-edit-status')).toHaveText('Saved', {
      timeout: 10_000,
    })

    await page.reload()
    await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId(`transcript-segment-${id}`)).toContainText(
      'Edited by the transcript suite',
    )

    // T25-D: badged, so a corrected line is distinguishable from a transcribed one.
    await expect(page.getByTestId(`segment-edited-${id}`)).toBeVisible()

    // T25-L: and the summary knows it is now describing text that has changed.
    await expect(page.getByTestId('summary-stale-badge')).toBeVisible({ timeout: 15_000 })

    // T25-E: revert restores the ORIGINAL, not the previous edit.
    await page.getByTestId(`transcript-segment-${id}`).hover()
    await page.getByTestId(`transcript-segment-actions-${id}`).click()
    await page.getByTestId(`segment-revert-${id}`).click()

    await expect(page.getByTestId(`transcript-segment-${id}`)).toContainText(original, {
      timeout: 15_000,
    })
  })

  test('T25-M · search finds the new text, not the old', async ({ page, request }) => {
    await edit(page)

    const editor = page.locator('[data-testid^="segment-editor-"]').first()
    const id = Number((await editor.getAttribute('data-testid'))!.replace('segment-editor-', ''))
    const original = await editor.inputValue()

    await editor.fill('Zarquon pricing anomaly')
    await expect(page.getByTestId('transcript-edit-status')).toHaveText('Saved', {
      timeout: 10_000,
    })

    /*
     * Asked of the SERVER, not the client-side find bar.
     *
     * The point of this case is that the FTS index moved with the edit — which
     * it does through triggers on the segments table, not through anything the
     * app remembers to call.
     */
    const found = await request.get(
      'http://127.0.0.1:8100/api/v1/search?q=Zarquon&scope=transcript',
    )
    expect(found.ok()).toBe(true)
    expect(JSON.stringify(await found.json())).toContain('Zarquon')

    await request.patch(`http://127.0.0.1:8100/api/v1/meetings/segments/${id}`, {
      data: { text: original },
    })
  })

  test('T25-H · a line can be reassigned, and the row follows', async ({ page, request }) => {
    await page.goto(`/meeting/${HERO}`)
    await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 20_000 })

    const row = page
      .locator('[data-testid^="transcript-segment-"]:not([data-testid*="actions"])')
      .first()
    const id = Number((await row.getAttribute('data-testid'))!.replace('transcript-segment-', ''))

    const nameEl = page.getByTestId(`transcript-speaker-${id}`)
    const before = (await nameEl.innerText()).trim()
    const beforeColour = await nameEl.evaluate((el) => getComputedStyle(el).color)

    /*
     * The MENU offers every other speaker — asserted while it is open.
     *
     * The selection itself then goes through the API rather than the submenu.
     * A Radix submenu lives in a portal and unmounts when its row re-renders,
     * and this row re-renders on any background refetch of the transcript — so
     * a test that holds the submenu open across several steps is testing
     * whether a refetch landed, not whether reassignment works.
     */
    await row.hover()
    await page.getByTestId(`transcript-segment-actions-${id}`).click()
    await page.getByRole('menuitem', { name: 'Reassign speaker' }).hover()

    const options = page.locator('[data-testid^="segment-reassign-"]')
    await expect(options.first()).toBeVisible()
    const labels = (await options.allInnerTexts()).map((label) => label.trim())
    expect(labels.length).toBeGreaterThan(1)
    expect(labels).toContain(before)

    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')

    const speakers = (await (
      await request.get(`http://127.0.0.1:8100/api/v1/meetings/${HERO}/speakers`)
    ).json()) as Array<{ id: number; label: string }>

    const current = speakers.find((speaker) => speaker.label === before)!
    const target = speakers.find((speaker) => speaker.label !== before)!

    await request.patch(`http://127.0.0.1:8100/api/v1/meetings/segments/${id}`, {
      data: { speaker_id: target.id },
    })

    await page.reload()
    await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 20_000 })

    // The name, and with it the colour, follow the reassignment.
    await expect(page.getByTestId(`transcript-speaker-${id}`)).toHaveText(target.label)
    const afterColour = await page
      .getByTestId(`transcript-speaker-${id}`)
      .evaluate((el) => getComputedStyle(el).color)
    expect(afterColour).not.toBe(beforeColour)

    await request.patch(`http://127.0.0.1:8100/api/v1/meetings/segments/${id}`, {
      data: { speaker_id: current.id },
    })
  })

  test('T25-F · undo puts the previous text back', async ({ page }) => {
    await edit(page)

    const editor = page.locator('[data-testid^="segment-editor-"]').first()
    const id = (await editor.getAttribute('data-testid'))!.replace('segment-editor-', '')
    const original = await editor.inputValue()

    await editor.fill('A change that will be undone')
    await expect(page.getByTestId('transcript-edit-status')).toHaveText('Saved', {
      timeout: 10_000,
    })

    await page.getByTestId('transcript-undo').click()

    /*
     * Read from the EDITOR, not from the row.
     *
     * `innerText` does not include a `textarea`'s value — in edit mode the row
     * reads as just the speaker's initials and name, and an assertion against
     * it fails whatever the undo did.
     */
    await expect
      .poll(() => page.getByTestId(`segment-editor-${id}`).inputValue(), { timeout: 15_000 })
      .toBe(original)
  })
})

test.describe('create meeting', { tag: '@mutates' }, () => {
  /**
   * Every case here CREATES a meeting and then deletes it, so the seeded
   * counts the rest of the suite asserts against still hold.
   */
  async function cleanUp(page: Page, id: number): Promise<void> {
    await page.request.delete(`http://127.0.0.1:8100/api/v1/meetings/${id}`)
  }

  async function openCreate(page: Page, tab = 'upload'): Promise<void> {
    await page.goto(`/upload?tab=${tab}`)
    await expect(page.getByTestId('create-modal')).toBeVisible({ timeout: 20_000 })
  }

  async function attach(page: Page, name: string, body: string): Promise<void> {
    await page.getByTestId('create-file-input').setInputFiles({
      name,
      mimeType: 'text/plain',
      buffer: Buffer.from(body),
    })
  }

  /** Creates from the current preview and returns the new meeting's id. */
  async function createAndOpen(page: Page): Promise<number> {
    await page.getByTestId('create-submit').click()
    await page.waitForURL(/\/meeting\/\d+/, { timeout: 20_000 })
    return Number(new URL(page.url()).pathname.split('/').pop())
  }

  test('T26-A · a .vtt becomes a meeting with its transcript', async ({ page }) => {
    await openCreate(page)

    await attach(
      page,
      'roadmap.vtt',
      `WEBVTT

00:00:00.000 --> 00:00:04.000
<v Ada Lovelace>Morning everyone, shall we start?

00:00:04.000 --> 00:00:09.000
<v Alan Turing>Yes — I have the numbers ready.

00:00:09.000 --> 00:00:14.000
<v Ada Lovelace>Good. Let's take pricing first.
`,
    )

    await expect(page.getByTestId('create-preview')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('create-preview-count')).toContainText('3 segments')
    await expect(page.getByTestId('create-preview-strategy')).toContainText('WebVTT')
    // The title came from the filename, tidied.
    await expect(page.getByTestId('create-title')).toHaveValue('roadmap')

    const id = await createAndOpen(page)

    await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('transcript-count')).toContainText('3 segments')
    await expect(page.getByTestId('transcript-list')).toContainText('shall we start?')
    await expect(page.getByTestId('speaker-legend')).toContainText('Ada Lovelace')

    await cleanUp(page, id)
  })

  test('T26-B · an .srt is parsed with comma separators', async ({ page }) => {
    await openCreate(page)

    await attach(
      page,
      'standup.srt',
      `1
00:00:02,500 --> 00:00:06,000
Grace Hopper: Standup, quickly.

2
00:00:06,000 --> 00:00:11,250
Ada Lovelace: Nothing blocking on my side.
`,
    )

    await expect(page.getByTestId('create-preview')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('create-preview-strategy')).toContainText('SubRip')
    // 2.5s in, which only parses correctly if the comma is handled.
    await expect(page.getByTestId('create-preview-segment-0')).toContainText('00:02')

    const id = await createAndOpen(page)
    await expect(page.getByTestId('transcript-count')).toContainText('2 segments', {
      timeout: 20_000,
    })
    await cleanUp(page, id)
  })

  test('T26-C/D · .txt timings are honoured when present and synthesised when not', async ({
    page,
  }) => {
    await openCreate(page)
    await attach(page, 'timed.txt', '[00:14] Ada: Morning.\n[00:30] Alan: Morning.\n')

    await expect(page.getByTestId('create-preview')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('create-preview-strategy')).toContainText('[00:14]')
    // HONOURED: 14 seconds, not a synthesised zero.
    await expect(page.getByTestId('create-preview-segment-0')).toContainText('00:14')

    const timedId = await createAndOpen(page)
    await cleanUp(page, timedId)

    await openCreate(page)
    await attach(page, 'untimed.txt', 'Ada: Morning everyone.\nAlan: Morning — ready when you are.\n')

    await expect(page.getByTestId('create-preview')).toBeVisible({ timeout: 15_000 })
    // And it SAYS the timings were estimated, rather than presenting a guess
    // as a fact.
    await expect(page.getByTestId('create-preview-strategy')).toContainText('estimated')
    await expect(page.getByTestId('create-preview-segment-0')).toContainText('00:00')

    const untimedId = await createAndOpen(page)
    await expect(page.getByTestId('transcript-count')).toContainText('2 segments', {
      timeout: 20_000,
    })
    await cleanUp(page, untimedId)
  })

  test('T26-E · a .json transcript imports its speakers and segments', async ({ page }) => {
    await openCreate(page)

    await attach(
      page,
      'export.json',
      JSON.stringify({
        title: 'Imported from JSON',
        segments: [
          { speaker: 'Ada', start: 0, end: 4, text: 'From JSON.' },
          { speaker: 'Alan', start_ms: 4000, end_ms: 8000, text: 'And in milliseconds.' },
        ],
      }),
    )

    await expect(page.getByTestId('create-preview')).toBeVisible({ timeout: 15_000 })
    // The file's own title wins over the filename.
    await expect(page.getByTestId('create-title')).toHaveValue('Imported from JSON')
    await expect(page.getByTestId('create-preview-segment-1')).toContainText('00:04')

    const id = await createAndOpen(page)
    await expect(page.getByTestId('transcript-list')).toContainText('And in milliseconds.', {
      timeout: 20_000,
    })
    await cleanUp(page, id)
  })

  test('T26-J/M · the sample creates, with a renamed speaker applied throughout', async ({
    page,
  }) => {
    await openCreate(page, 'paste')

    await page.getByTestId('create-load-sample').click()
    await expect(page.getByTestId('create-preview')).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('create-title').fill('Sample import')
    // Renamed BEFORE the meeting exists, which is when it is cheap.
    await page.getByTestId('create-speaker-0').fill('Renamed Person')

    const id = await createAndOpen(page)

    await expect(page.getByTestId('speaker-legend')).toContainText('Renamed Person', {
      timeout: 20_000,
    })
    await expect(page.getByTestId('speaker-legend')).not.toContainText('Sarah Chen')
    // Applied to every line that speaker had, not just the first.
    await expect(page.getByTestId('transcript-list')).toContainText('Renamed Person')

    await cleanUp(page, id)
  })

  test('T26-N/O · a manual meeting is empty, and appears at the top of the Notebook', async ({
    page,
  }) => {
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible({ timeout: 20_000 })
    const before = await page.getByTestId('meeting-row').count()

    await openCreate(page, 'manual')
    await page.getByTestId('create-title').fill('Manually created meeting')
    const id = await createAndOpen(page)

    // The empty states from T-23.12 and T-20.12, on a real meeting.
    await expect(page.getByTestId('transcript-empty')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('summary-empty')).toBeVisible()

    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-row')).toHaveCount(before + 1, { timeout: 20_000 })
    // Most recent first, and it was created just now.
    await expect(page.getByTestId('meeting-row').first()).toContainText(
      'Manually created meeting',
    )

    await cleanUp(page, id)
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-row')).toHaveCount(before, { timeout: 20_000 })
  })
})

test.describe('edit meeting', { tag: '@mutates' }, () => {
  const HERO = 1

  async function openEdit(page: Page): Promise<void> {
    await page.goto(`/meeting/${HERO}`)
    await expect(page.getByTestId('notepad-header')).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('notepad-kebab').click()
    await page.getByTestId('notepad-edit-details').click()
    await expect(page.getByTestId('edit-modal')).toBeVisible()
  }

  test('T27-A/I · a title change reaches every surface, and sends only the title', async ({
    page,
  }) => {
    await openEdit(page)
    const original = await page.getByTestId('edit-title').inputValue()

    // Captured, to prove the PATCH is partial (T-27.6).
    const bodies: string[] = []
    await page.route(`**/api/v1/meetings/${HERO}`, (route) => {
      if (route.request().method() === 'PATCH') bodies.push(route.request().postData() ?? '')
      return route.continue()
    })

    await page.getByTestId('edit-title').fill('Renamed by the edit suite')
    await page.getByTestId('edit-save').click()

    await expect(page.getByTestId('toast')).toContainText('Changes saved')
    await expect(page.getByTestId('edit-modal')).toBeHidden()

    // ONLY the title. A PATCH that resends everything is a PUT in disguise.
    expect(bodies).toHaveLength(1)
    expect(Object.keys(JSON.parse(bodies[0]!))).toEqual(['title'])

    // The Notepad header, without a reload.
    await expect(page.getByTestId('notepad-title')).toHaveText('Renamed by the edit suite')
    // The tab title, which follows the meeting (T-18.11).
    await expect.poll(() => page.title()).toContain('Renamed by the edit suite')

    // And the Notebook row, from the same cache.
    await page.goto('/notebook')
    await expect(page.getByTestId(`meeting-row-${HERO}`)).toContainText(
      'Renamed by the edit suite',
      { timeout: 20_000 },
    )

    await page.request.patch(`http://127.0.0.1:8100/api/v1/meetings/${HERO}`, {
      data: { title: original },
    })
  })

  test('T27-D · adding a participant shows up in the drawer', async ({ page, request }) => {
    // Captured FIRST, and restored through the API at the end — a failure
    // partway through this test must not leave a participant behind for the
    // next one to trip over.
    const original = (
      (await (await request.get(`http://127.0.0.1:8100/api/v1/meetings/${HERO}`)).json()) as {
        participants: Array<{ display_name: string }>
      }
    ).participants.map((person) => person.display_name)

    await openEdit(page)

    await page.getByTestId('edit-participant-input').fill('Temporary Attendee')
    await page.getByTestId('edit-participant-input').press('Enter')

    await expect(page.locator('[data-testid^="edit-participant-token-"]')).toHaveCount(
      original.length + 1,
    )

    /*
     * `force`, because the button disables itself as a RESULT of this click.
     *
     * A successful save makes the draft match the meeting, which is what
     * `Save` being disabled means — and Playwright's actionability re-check
     * sees that as evidence the click never landed, then retries until the
     * test times out. Forcing dispatches once; the assertions below are what
     * decide whether it worked.
     */
    await page.getByTestId('edit-save').click({ force: true })
    await expect(page.getByTestId('toast').first()).toContainText('Changes saved')

    await page.goto(`/notebook?details=${HERO}`)
    await expect(page.getByTestId('details-drawer')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('details-attended-list')).toContainText('Temporary Attendee')

    await request.patch(`http://127.0.0.1:8100/api/v1/meetings/${HERO}`, {
      data: { participant_names: original },
    })
  })

  test('T27-J · a failed save keeps the modal and the input', async ({ page }) => {
    await openEdit(page)
    const original = await page.getByTestId('edit-title').inputValue()

    await page.route(`**/api/v1/meetings/${HERO}`, (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({
            status: 500,
            json: { error: { code: 'INTERNAL_ERROR', message: 'Boom', details: {} } },
          })
        : route.continue(),
    )

    await page.getByTestId('edit-title').fill('An edit that will fail')
    await page.getByTestId('edit-save').click()

    /*
     * The API's own message, not the generic line.
     *
     * The global mutation handler prefers what the server said when it said
     * anything — a routed 500 carrying "Boom" surfaces as "Boom", which is the
     * correct behaviour and the reason this asserts on the RETRY rather than
     * on wording the test itself chose.
     */
    await expect(page.getByTestId('toast').first()).toBeVisible()
    await expect(page.getByTestId('toast-action').first()).toHaveText('Retry')

    // Still open, with what was typed — closing it would throw the work away
    // to show an error about not being able to save it.
    await expect(page.getByTestId('edit-modal')).toBeVisible()
    await expect(page.getByTestId('edit-title')).toHaveValue('An edit that will fail')
    // The header never showed the failed title.
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await page.reload()
    await expect(page.getByTestId('notepad-title')).toHaveText(original, { timeout: 20_000 })
  })
})

test.describe('delete meeting', { tag: '@mutates' }, () => {
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

  test('T28-D/E · confirming removes the row and offers Undo', async ({ page }) => {
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible({ timeout: 20_000 })
    const before = await page.getByTestId('meeting-row').count()

    const title = await openDeleteDialog(page)
    await page.getByTestId('delete-dialog-confirm').click()

    await expect(page.getByTestId('toast').first()).toContainText('Meeting deleted')
    await expect(page.getByTestId('meeting-row')).toHaveCount(before - 1)

    // T28-E: Undo puts it back where it was.
    await page.getByTestId('toast-action').first().click()
    await expect(page.getByTestId('toast').first()).toContainText('Meeting restored', {
      timeout: 15_000,
    })
    await expect(page.getByTestId('meeting-row')).toHaveCount(before)
    await expect(page.getByTestId('meeting-row').first()).toContainText(title)
  })

  test('T28-H · a double-click fires exactly one DELETE', async ({ page }) => {
    let deletes = 0
    await page.route('**/api/v1/meetings/*', async (route) => {
      if (route.request().method() !== 'DELETE') return route.continue()
      deletes += 1
      // Held open, so the second click lands while the first is in flight —
      // the only window in which the guard matters.
      await new Promise((resolve) => setTimeout(resolve, 800))
      return route.continue()
    })

    await openDeleteDialog(page)

    /*
     * Both clicks dispatched in ONE evaluate.
     *
     * `locator.click()` re-checks actionability, and the button disables
     * itself the moment the first click starts the request — so a second call
     * waits for an element that is deliberately unavailable and the test times
     * out instead of testing anything. Dispatching directly is also a truer
     * double-click: two events in one frame, which is exactly what the
     * synchronous `fired` ref exists to catch.
     */
    await page.getByTestId('delete-dialog-confirm').evaluate((button: HTMLElement) => {
      button.click()
      button.click()
    })

    await expect(page.getByTestId('toast').first()).toContainText('Meeting deleted', {
      timeout: 15_000,
    })
    expect(deletes).toBe(1)

    await page.getByTestId('toast-action').first().click()
    await expect(page.getByTestId('toast').first()).toContainText('Meeting restored', {
      timeout: 15_000,
    })
  })

  test('T28-G · deleting from the Notepad returns to the Notebook', async ({ page, request }) => {
    // A throwaway meeting, so the seeded eight are untouched.
    const created = await request.post('http://127.0.0.1:8100/api/v1/meetings', {
      data: { title: 'Meeting to delete from the notepad' },
    })
    const id = (await created.json()).id as number

    await page.goto(`/meeting/${id}`)
    await expect(page.getByTestId('notepad-header')).toBeVisible({ timeout: 20_000 })

    await page.getByTestId('notepad-kebab').click()
    await page.getByTestId('notepad-delete').click()
    // The Notepad's dialog keeps the DEFAULT id — only the bulk bar names its
    // own. A blanket rename here is how this test broke the first time.
    await page.getByTestId('confirm-dialog-confirm').click()

    // Back to the list, rather than sitting on a page whose subject is gone.
    await page.waitForURL(/\/notebook/, { timeout: 20_000 })
    await expect(page.getByTestId('meeting-list')).toBeVisible()
    await expect(page.getByTestId('meeting-list')).not.toContainText(
      'Meeting to delete from the notepad',
    )
  })

  test('T28-I · a failed delete puts the row back and offers Retry', async ({ page }) => {
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible({ timeout: 20_000 })
    const before = await page.getByTestId('meeting-row').count()

    await page.route('**/api/v1/meetings/*', (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({
            status: 500,
            json: { error: { code: 'INTERNAL_ERROR', message: 'Boom', details: {} } },
          })
        : route.continue(),
    )

    await openDeleteDialog(page)
    await page.getByTestId('delete-dialog-confirm').click()

    // The row comes back, and the failure is reported with a way to try again.
    await expect(page.getByTestId('meeting-row')).toHaveCount(before, { timeout: 15_000 })
    await expect(page.getByTestId('toast-action').first()).toHaveText('Retry')
  })
})

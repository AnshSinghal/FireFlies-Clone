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

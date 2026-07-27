import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Toast system (T-09, cases T09-A → T09-J).
 *
 * Almost every case here is about TIME — when a toast leaves, what pauses it,
 * what happens when two arrive at once. So the assertions are deliberately
 * about observable timing rather than about classes, and the durations are read
 * from the spec (success 4s, error never) rather than guessed at.
 */

const toasts = (page: Page) => page.getByTestId('toast')

async function harness(page: Page): Promise<void> {
  await page.goto('/dev/toasts')
  await expect(page.getByTestId('toast-harness')).toBeVisible()
}

test.describe('toasts · behaviour', () => {
  test.beforeEach(async ({ page }) => harness(page))

  test('T09-C · a success toast auto-dismisses after ~4s', async ({ page }) => {
    await page.getByTestId('fire-success').click()
    await expect(toasts(page)).toHaveCount(1)

    // Still there just before the deadline…
    await page.waitForTimeout(3000)
    await expect(toasts(page)).toHaveCount(1)

    // …and gone shortly after it.
    await expect(toasts(page)).toHaveCount(0, { timeout: 3000 })
  })

  test('T09-D · an error toast never auto-dismisses', async ({ page }) => {
    await page.getByTestId('fire-error').click()

    const toast = toasts(page).first()
    await expect(toast).toBeVisible()
    await expect(toast).toHaveAttribute('data-toast-variant', 'error')

    // Well past every other variant's timer. An error is the one message the
    // user has to act on; auto-hiding it is the bug this asserts against.
    await page.waitForTimeout(7000)
    await expect(toast).toBeVisible()

    await page.getByTestId('toast-dismiss').first().click()
    await expect(toasts(page)).toHaveCount(0)
  })

  test('T09-E · hovering pauses the timer, leaving resumes it', async ({ page }) => {
    await page.getByTestId('fire-success').click()
    const toast = toasts(page).first()
    await expect(toast).toBeVisible()

    await toast.hover()
    // 6s is 1.5× the 4s timer — without the pause it would be long gone.
    await page.waitForTimeout(6000)
    await expect(toast).toBeVisible()

    // Move the pointer off, and the remaining time resumes rather than restarting.
    await page.mouse.move(0, 0)
    await expect(toasts(page)).toHaveCount(0, { timeout: 5000 })
  })

  test('T09-F · five toasts render three plus a +2 more counter', async ({ page }) => {
    await page.getByTestId('fire-five').click()

    await expect(toasts(page)).toHaveCount(3)
    await expect(page.getByTestId('toast-overflow')).toHaveText('+2 more')

    // The newest are the ones shown — the most recent action is the one being
    // waited on.
    await expect(toasts(page).last()).toContainText('Toast number 5')
  })

  test('T09-G · two identical toasts collapse into one with a ×2 counter', async ({ page }) => {
    await page.getByTestId('fire-duplicate').click()

    await expect(toasts(page)).toHaveCount(1)
    await expect(page.getByTestId('toast-count')).toHaveText('×2')
  })

  test('T09-I · an arriving toast does not steal focus', async ({ page }) => {
    const search = page.getByTestId('topbar-search')
    await page.getByTestId('fire-delayed').click()
    await search.click()
    await search.fill('typing')

    await expect(toasts(page)).toHaveCount(1, { timeout: 4000 })

    // The whole point: the toast appeared and the caret never moved.
    await expect(search).toBeFocused()
    await expect(search).toHaveValue('typing')
  })

  test('the action button fires its handler and dismisses the toast', async ({ page }) => {
    await page.getByTestId('fire-with-action').click()
    await expect(page.getByTestId('toast-action')).toHaveText('Undo')

    await page.getByTestId('toast-action').click()

    // The original is gone and the handler's own toast has replaced it.
    await expect(toasts(page)).toHaveCount(1)
    await expect(toasts(page).first()).toContainText('Meeting restored')
  })

  test('a promise shows ONE toast through loading → success', async ({ page }) => {
    await page.getByTestId('fire-promise').click()

    const toast = toasts(page).first()
    await expect(toast).toHaveAttribute('data-toast-variant', 'loading')
    await expect(toast).toContainText('Saving…')

    // Mutated in place — still exactly one card, not one sliding out and
    // another sliding in for what the user experienced as a single action.
    await expect(toast).toHaveAttribute('data-toast-variant', 'success', { timeout: 3000 })
    await expect(toast).toContainText('Changes saved')
    await expect(toasts(page)).toHaveCount(1)
  })

  test('a rejected promise becomes an error toast that stays', async ({ page }) => {
    await page.getByTestId('promise-should-fail').check()
    await page.getByTestId('fire-promise').click()

    const toast = toasts(page).first()
    await expect(toast).toHaveAttribute('data-toast-variant', 'error', { timeout: 3000 })

    // The success variant's 4s timer must not carry over to the error.
    await page.waitForTimeout(5000)
    await expect(toast).toBeVisible()
  })

  test('Escape dismisses the newest toast when focus is inside the region', async ({ page }) => {
    await page.getByTestId('fire-error').click()
    await page.getByTestId('fire-warning').click()
    await expect(toasts(page)).toHaveCount(2)

    await page.getByTestId('toast-dismiss').last().focus()
    await page.keyboard.press('Escape')

    await expect(toasts(page)).toHaveCount(1)
    // The newest went; the older one stayed.
    await expect(toasts(page).first()).toHaveAttribute('data-toast-variant', 'error')
  })

  test('reduced motion removes the translate but keeps the fade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('fire-info').click()

    const name = await toasts(page)
      .first()
      .evaluate((el) => getComputedStyle(el).animationName)
    expect(name).toBe('ff-toast-fade')
  })

  test('T09-H · an error toast is announced assertively and is axe-clean', async ({ page }) => {
    await page.getByTestId('fire-error').click()

    const toast = toasts(page).first()
    await expect(toast).toHaveRole('alert')
    await expect(toast).toHaveAttribute('aria-live', 'assertive')
    await expect(page.getByTestId('toast-container')).toHaveAttribute('aria-label', 'Notifications')
    await expect(page.getByTestId('toast-dismiss').first()).toHaveAttribute(
      'aria-label',
      'Dismiss notification',
    )

    const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

    /*
     * Wait for the entrance animation to finish before measuring.
     *
     * `ff-toast-in` fades from `opacity: 0`, and axe computes contrast against
     * the COMPOSITED colour — so a scan that lands mid-fade measures a blend of
     * the text against the background and reports a contrast failure for a
     * colour that exists for two hundred milliseconds. The toast's real
     * contrast is what it has once it has arrived.
     */
    await expect
      .poll(() => toast.evaluate((el) => getComputedStyle(el).opacity))
      .toBe('1')

    /*
     * The toast itself is held to the FULL bar, contrast included — it is new
     * code and has no excuse.
     */
    const scoped = await new AxeBuilder({ page })
      .include('[data-testid="toast-container"]')
      .withTags(TAGS)
      .analyze()
    expect(scoped.violations).toEqual([])

    /*
     * A page-wide scan with NO rules disabled.
     *
     * This used to drop `color-contrast`, because ADR-012 recorded
     * `--ff-text-muted` at #8992A2 (3.14:1) as a deliberate deviation and
     * predicted axe would flag it. That prediction expired: the shipped value
     * is #667085 — 4.97:1 light, 5.94:1 dark — so there is nothing to suppress,
     * and the exclusion was hiding a rule that no longer fires. Verified by
     * removing it and running: clean.
     *
     * Page-wide rather than scoped to the toast, which is the original point
     * worth keeping: narrowing the scan would quietly give up every other rule
     * across the page to silence one.
     */
    const page_wide = await new AxeBuilder({ page })
      .withTags(TAGS)
      .analyze()
    expect(page_wide.violations).toEqual([])
  })

  test('a non-error toast is polite, not assertive', async ({ page }) => {
    // Announcing "Changes saved" over what somebody is reading is the
    // accessibility equivalent of a modal.
    await page.getByTestId('fire-success').click()
    await expect(toasts(page).first()).toHaveAttribute('aria-live', 'polite')
  })
})

/*
 * These WRITE to the shared database, so they carry `@mutates` and run in the
 * serial project that starts only once every reader has finished. Each one also
 * leaves the data as it found it — the ordering guarantee protects the readers,
 * not the other writers.
 */
test.describe('toasts · coming soon', () => {
  test('T09-J · a Soon feature says so rather than doing nothing', async ({ page }) => {
    await page.goto('/notebook')
    await page.getByTestId('topbar-avatar').click()
    await page.getByTestId('avatar-profile').click()

    await expect(toasts(page).first()).toHaveText(
      /Coming soon — this feature isn't part of this build/,
    )
  })
})

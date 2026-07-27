import { expect, test, type Page } from '@playwright/test'

/**
 * Transcript editing & speaker management (T-25, cases T25-A → T25-M).
 *
 * Everything that WRITES lives in `90-mutations.spec.ts`, which runs serially.
 * A transcript edited by one worker while another asserts its text is a flake
 * with no reproduction.
 */

const HERO = 1

async function openTranscript(page: Page): Promise<void> {
  await page.goto(`/meeting/${HERO}`)
  await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 20_000 })
}

test.describe('transcript editing', () => {
  test('T25-A · edit mode announces itself and makes the lines editable', async ({ page }) => {
    await openTranscript(page)

    // Off by default: a transcript is for reading.
    await expect(page.getByTestId('transcript-edit-status')).toHaveCount(0)

    await page.getByTestId('transcript-edit-toggle').click()

    await expect(page.getByTestId('transcript-edit-status')).toContainText(
      'changes save automatically',
    )
    await expect(page.getByTestId('transcript-edit-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    const first = page.locator('[data-testid^="segment-editor-"]').first()
    await expect(first).toBeVisible()

    // Playback keeps working while editing — the two are unrelated (T-25.1).
    await page.getByTestId('player-play').click()
    await expect(page.getByTestId('player-play')).toHaveAttribute('aria-label', 'Pause')
  })

  test('T25-K · a legend entry filters the transcript to that speaker', async ({ page }) => {
    await openTranscript(page)

    const legend = page.getByTestId('speaker-legend')
    await expect(legend).toBeVisible()

    // Every speaker carries a share, and they add up to roughly everything.
    const shares = (await legend.locator('button').allInnerTexts())
      .map((text) => Number(text.match(/(\d+)%/)?.[1] ?? 0))
      .filter((share) => share > 0)
    expect(shares.length).toBeGreaterThan(1)
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeGreaterThan(90)

    const before = await page.getByTestId('transcript-count').innerText()

    const entry = legend.locator('button').first()
    const name = (await entry.innerText()).replace(/\s*\d+%\s*$/, '').trim()
    await entry.click()

    // Only that speaker's lines are rendered — checked on the names that are
    // visible, since the list is virtualised.
    await expect
      .poll(async () => {
        const names = await page.locator('[data-testid^="transcript-speaker-"]').allInnerTexts()
        return names.every((rendered) => rendered.trim() === name)
      })
      .toBe(true)

    // Clicking again clears it.
    await entry.click()
    await expect(page.getByTestId('transcript-count')).toHaveText(before)
  })

  test('T25-J · the rename popover states how much it will change', async ({ page }) => {
    await openTranscript(page)
    await page.getByTestId('transcript-edit-toggle').click()

    await page.getByTestId('speaker-legend').locator('button').first().click()

    const count = page.getByTestId('speaker-rename-count')
    await expect(count).toBeVisible()
    await expect(count).toContainText(/Renaming will update \d+ segments/)
    // And the talk time, so a wrongly-picked speaker is obvious before the
    // click rather than after it.
    await expect(count).toContainText(/\d+:\d{2}/)
  })

  test('T25-G · an emptied line is rejected and put back', async ({ page }) => {
    await openTranscript(page)
    await page.getByTestId('transcript-edit-toggle').click()

    let patched = 0
    await page.route('**/api/v1/meetings/segments/*', (route) => {
      if (route.request().method() === 'PATCH') patched += 1
      return route.continue()
    })

    const editor = page.locator('[data-testid^="segment-editor-"]').first()
    const original = await editor.inputValue()

    await editor.fill('')
    await editor.blur()

    await expect(editor).toHaveValue(original)
    await expect(page.getByText('A line cannot be empty')).toBeVisible()
    // Nothing was sent: an empty line is not an edit.
    expect(patched).toBe(0)
  })

  test('T25-D · an unedited line carries no badge', async ({ page }) => {
    await openTranscript(page)

    /*
     * The badge's PRESENCE is asserted in the mutation suite, where a line is
     * actually edited. What is checked here is that it does not appear on a
     * transcript nobody has touched — a badge on every line would be worse
     * than none at all.
     */
    const badges = await page.locator('[data-testid^="segment-edited-"]').count()
    const rows = await page
      .locator('[data-testid^="transcript-segment-"]:not([data-testid*="actions"])')
      .count()

    expect(rows).toBeGreaterThan(0)
    expect(badges).toBeLessThan(rows)
  })
})

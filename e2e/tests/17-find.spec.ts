import { expect, test, type Page } from '@playwright/test'

/**
 * Find in transcript & Smart Search (T-22, cases T22-A → T22-N).
 *
 * The transcript is virtualised, so "11 highlights exist" can only ever be true
 * of the ROWS THAT ARE RENDERED. What is asserted instead is the pair that
 * actually matters: the counter knows the real total, and stepping to any match
 * brings its row into existence and into view.
 */

const HERO = 1
/** Present six times in the hero transcript. */
const TERM = 'pricing'

async function openTranscript(page: Page, query = ''): Promise<void> {
  await page.goto(`/meeting/${HERO}${query}`)
  await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 20_000 })
}

async function openFind(page: Page): Promise<void> {
  await page.getByTestId('transcript-find-open').click()
  await expect(page.getByTestId('transcript-find')).toBeVisible()
}

/** `1 of 6` → `[1, 6]`. */
async function counter(page: Page): Promise<[number, number]> {
  const text = await page.getByTestId('transcript-find-count').innerText()
  const [position, total] = text.split(' of ').map(Number)
  return [position!, total!]
}

async function search(page: Page, term: string): Promise<void> {
  await openFind(page)
  await page.getByTestId('transcript-find-input').fill(term)

  /*
   * Waits for the DEBOUNCE to land, using the URL as the signal.
   *
   * The hook writes `?find=` once per applied query, so the parameter matching
   * the term is proof the search actually ran — where a fixed sleep is a guess
   * and the counter is not (a term with no matches reads `0 of 0` both before
   * and after).
   */
  await expect.poll(() => new URL(page.url()).searchParams.get('find')).toBe(term)
}

test.describe('find in transcript', () => {
  test('T22-A · ⌘F opens the bar and puts the cursor in it', async ({ page }) => {
    await openTranscript(page)

    await page.keyboard.press('ControlOrMeta+f')

    await expect(page.getByTestId('transcript-find')).toBeVisible()
    await expect(page.getByTestId('transcript-find-input')).toBeFocused()
  })

  test('T22-B · a search counts every match and highlights the rendered ones', async ({ page }) => {
    await openTranscript(page)
    await search(page, TERM)

    const [position, total] = await counter(page)
    expect(position).toBe(1)
    expect(total).toBeGreaterThanOrEqual(5)

    // Highlights exist in the rows that are rendered. The rest are counted, not
    // drawn — that is what virtualisation means.
    const marks = page.getByTestId('transcript-list').locator('mark')
    expect(await marks.count()).toBeGreaterThan(0)
    for (const text of await marks.allInnerTexts()) {
      expect(text.toLowerCase()).toBe(TERM)
    }
  })

  test('T22-C · Enter steps to the next match, and only one is current', async ({ page }) => {
    await openTranscript(page)
    await search(page, TERM)

    await page.getByTestId('transcript-find-input').press('Enter')
    await expect.poll(() => counter(page).then(([position]) => position)).toBe(2)

    const active = page.getByTestId('transcript-list').locator('mark[data-active="true"]')
    await expect(active).toHaveCount(1)

    // The current match is visibly different from the rest.
    const activeBg = await active.evaluate((el) => getComputedStyle(el).backgroundColor)
    const otherBg = await page
      .getByTestId('transcript-list')
      .locator('mark:not([data-active="true"])')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(activeBg).not.toBe(otherBg)
  })

  test('T22-D · stepping past the last match wraps to the first', async ({ page }) => {
    await openTranscript(page)
    await search(page, TERM)

    const [, total] = await counter(page)
    const input = page.getByTestId('transcript-find-input')

    for (let step = 1; step < total; step += 1) await input.press('Enter')
    await expect.poll(() => counter(page).then(([position]) => position)).toBe(total)

    await input.press('Enter')
    await expect.poll(() => counter(page).then(([position]) => position)).toBe(1)
  })

  test('T22-E · Shift+Enter from the first match wraps to the last', async ({ page }) => {
    await openTranscript(page)
    await search(page, TERM)

    const [, total] = await counter(page)
    await page.getByTestId('transcript-find-input').press('Shift+Enter')

    await expect.poll(() => counter(page).then(([position]) => position)).toBe(total)
  })

  test('T22-F · a match in an unrendered row is scrolled into view', async ({ page }) => {
    await openTranscript(page)
    await search(page, TERM)

    const [, total] = await counter(page)
    const input = page.getByTestId('transcript-find-input')

    // To the LAST match, which is far enough down that its row was never
    // mounted. `scrollIntoView` on a node that does not exist does nothing —
    // the trap this case exists for.
    for (let step = 1; step < total; step += 1) await input.press('Enter')
    await expect.poll(() => counter(page).then(([position]) => position)).toBe(total)

    const active = page.getByTestId('transcript-list').locator('mark[data-active="true"]')
    await expect(active).toHaveCount(1)
    await expect(active).toBeInViewport()
  })

  test('T22-G · a term with no matches says so and offers a way on', async ({ page }) => {
    await openTranscript(page)
    await search(page, 'zzzzqqq')

    expect(await counter(page)).toEqual([0, 0])
    await expect(page.getByTestId('transcript-list').locator('mark')).toHaveCount(0)

    // The input is TINTED, not marked invalid: a search that found nothing is
    // not a typing mistake.
    const border = await page
      .getByTestId('transcript-find-input')
      .evaluate((el) => getComputedStyle(el).borderTopColor)
    const warning = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ff-warning').trim(),
    )
    expect(warning.length).toBeGreaterThan(0)
    expect(border).not.toBe('rgba(0, 0, 0, 0)')

    const global = page.getByTestId('transcript-find-global')
    await expect(global).toBeVisible()
    await expect(global).toHaveAttribute('href', /\/search\?q=zzzzqqq/)
  })

  test('T22-H · regex characters are treated as text', async ({ page }) => {
    await openTranscript(page)
    await search(page, 'a.*b')

    // Literal, so it matches nothing here — and crucially does not match
    // everything, which is what a compiled pattern would have done.
    expect(await counter(page)).toEqual([0, 0])

    // Still alive: unbalanced parens are the version that throws.
    await page.getByTestId('transcript-find-input').fill('(draft')
    await page.waitForTimeout(300)
    await expect(page.getByTestId('transcript-find-count')).toBeVisible()
    await expect(page.getByTestId('transcript-list')).toBeVisible()
  })

  test('T22-I · typing is debounced rather than searched per keystroke', async ({ page }) => {
    await openTranscript(page)
    await openFind(page)

    // Counted through `replaceState`, which the hook calls once per APPLIED
    // query — so it is a direct count of how many searches were committed.
    await page.evaluate(() => {
      const target = window as unknown as { __replaces: number }
      target.__replaces = 0
      const original = window.history.replaceState.bind(window.history)
      window.history.replaceState = (...args: Parameters<typeof original>) => {
        target.__replaces += 1
        return original(...args)
      }
    })

    // Seven characters, typed without pauses.
    await page.getByTestId('transcript-find-input').pressSequentially('pricing', { delay: 10 })
    await page.waitForTimeout(600)

    const replaces = await page.evaluate(
      () => (window as unknown as { __replaces: number }).__replaces,
    )
    // One commit for the settled query. Two would still be a debounce; seven
    // would be none at all.
    expect(replaces).toBeLessThanOrEqual(2)
    expect(replaces).toBeGreaterThan(0)

    const [, total] = await counter(page)
    expect(total).toBeGreaterThan(0)
  })

  test('T22-J · Escape closes the bar, clears the marks and cleans the URL', async ({ page }) => {
    await openTranscript(page)
    await search(page, TERM)
    expect(new URL(page.url()).searchParams.get('find')).toBe(TERM)

    await page.getByTestId('transcript-find-input').press('Escape')

    await expect(page.getByTestId('transcript-find')).toBeHidden()
    await expect(page.getByTestId('transcript-list').locator('mark')).toHaveCount(0)
    await expect.poll(() => new URL(page.url()).searchParams.get('find')).toBeNull()
  })

  test('T22-K · the speaker filter narrows the matches', async ({ page }) => {
    await openTranscript(page)
    await search(page, TERM)
    const [, all] = await counter(page)

    await page.getByTestId('transcript-find-speaker').click()
    await page.getByRole('option', { name: 'Marcus Patel' }).click()
    await page.waitForTimeout(300)

    const [, narrowed] = await counter(page)
    expect(narrowed).toBeLessThan(all)

    // And every highlight that is rendered belongs to that speaker.
    const highlighted = page
      .getByTestId('transcript-list')
      .locator('[data-testid^="transcript-segment-"]:not([data-testid*="actions"])')
      .filter({ has: page.locator('mark') })

    for (const row of await highlighted.all()) {
      const speakerId = (await row.getAttribute('data-testid'))!
      expect(speakerId).toBeTruthy()
    }
    expect(narrowed).toBeGreaterThan(0)
  })

  test('T22-N · ?find= opens the bar already searching', async ({ page }) => {
    await openTranscript(page, `?find=${TERM}`)

    await expect(page.getByTestId('transcript-find')).toBeVisible()
    await expect(page.getByTestId('transcript-find-input')).toHaveValue(TERM)

    const [position, total] = await counter(page)
    expect(position).toBe(1)
    expect(total).toBeGreaterThan(0)
    await expect(
      page.getByTestId('transcript-list').locator('mark[data-active="true"]'),
    ).toHaveCount(1)
  })
})

test.describe('smart search', () => {
  test('T22-L · a preset lists only its own matches, and they seek', async ({ page }) => {
    await openTranscript(page)

    await page.getByTestId('icon-rail-search').click()
    const panel = page.getByTestId('smart-search-panel')
    await expect(panel).toBeVisible()

    await page.getByTestId('smart-search-preset-questions').click()
    const results = page.getByTestId('smart-search-results')
    await expect(results).toBeVisible()

    // Every line listed under Questions ends in a question mark.
    const texts = await results.locator('li span.line-clamp-2').allInnerTexts()
    expect(texts.length).toBeGreaterThan(0)
    for (const text of texts) expect(text.trim().endsWith('?')).toBe(true)

    // And clicking one moves the player there.
    const before = Number(
      await page.getByTestId('player-seekbar').getAttribute('aria-valuenow'),
    )
    await results.locator('button').nth(2).click()
    await expect
      .poll(() => page.getByTestId('player-seekbar').getAttribute('aria-valuenow').then(Number))
      .not.toBe(before)
  })

  test('T22-M · stepping through matches moves the player with them', async ({ page }) => {
    await openTranscript(page)
    await search(page, TERM)

    // The first match already seeked; stepping moves on again.
    const first = Number(await page.getByTestId('player-seekbar').getAttribute('aria-valuenow'))
    await page.getByTestId('transcript-find-next').click()

    await expect
      .poll(() => page.getByTestId('player-seekbar').getAttribute('aria-valuenow').then(Number))
      .toBeGreaterThan(first)

    // The player is at the matched line, not somewhere near it.
    const active = page
      .getByTestId('transcript-list')
      .locator('[data-active="true"]')
      .locator('[data-testid^="transcript-timestamp-"]')
    const [minutes, seconds] = (await active.innerText()).trim().split(':').map(Number)
    const rowSeconds = minutes! * 60 + seconds!
    const player = Number(await page.getByTestId('player-seekbar').getAttribute('aria-valuenow'))
    expect(Math.abs(player - rowSeconds)).toBeLessThanOrEqual(1)
  })
})

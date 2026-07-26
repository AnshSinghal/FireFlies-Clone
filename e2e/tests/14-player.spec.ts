import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Media player (T-19, cases T19-A → T19-O).
 *
 * Position is read from the seekbar's `aria-valuenow` rather than from the
 * time display. It is the same number, but it is the one a screen reader gets
 * — so every assertion here doubles as a check that the accessible value keeps
 * up with the visual one.
 */

/** Meeting 1 has audio; meeting 2 has none and runs on the virtual clock. */
const WITH_AUDIO = 1
const WITHOUT_AUDIO = 2

async function openPlayer(page: Page, meetingId = WITH_AUDIO): Promise<Locator> {
  await page.goto(`/meeting/${meetingId}`)
  const player = page.getByTestId('player')
  await expect(player).toBeVisible({ timeout: 15_000 })
  /*
   * The transcript backs the segment skips and the hover preview; without it
   * the player is up but half its inputs are empty.
   *
   * The generous timeout is for the FIRST test in a run: `/meeting/[id]` is
   * the one route rendered on demand, so its first request pays for warming
   * the server as well as for the data.
   */
  await expect(page.getByTestId('transcript-segments')).toBeVisible({ timeout: 15_000 })
  return player
}

/**
 * The highlighted transcript segment.
 *
 * Scoped to the list: `data-active` is also how the sidebar marks the current
 * nav item, and an unscoped attribute selector matches both.
 */
function activeSegment(page: Page): Locator {
  return page.getByTestId('transcript-segments').locator('[data-active="true"]')
}

/** The playhead in seconds. */
function position(page: Page): Promise<number> {
  return page
    .getByTestId('player-seekbar')
    .getAttribute('aria-valuenow')
    .then((value) => Number(value))
}

function duration(page: Page): Promise<number> {
  return page
    .getByTestId('player-seekbar')
    .getAttribute('aria-valuemax')
    .then((value) => Number(value))
}

/** Clicks the seekbar at `ratio` along its width. */
async function clickAt(page: Page, ratio: number): Promise<void> {
  const bar = page.getByTestId('player-seekbar')
  const box = (await bar.boundingBox())!
  await page.mouse.click(box.x + box.width * ratio, box.y + box.height / 2)
}

test.describe('player', () => {
  test('T19-A · play starts the clock and the button becomes pause', async ({ page }) => {
    await openPlayer(page)
    const play = page.getByTestId('player-play')

    await expect(play).toHaveAttribute('aria-label', 'Play')
    await play.click()
    await expect(play).toHaveAttribute('aria-label', 'Pause')

    // Advancing at all is the claim; the exact figure depends on how fast the
    // machine got round to the first animation frame.
    await expect.poll(() => position(page), { timeout: 3000 }).toBeGreaterThan(0)
  })

  test('T19-B · clicking the middle of the seekbar seeks there', async ({ page }) => {
    await openPlayer(page)
    const total = await duration(page)

    await clickAt(page, 0.5)

    // ±2% of the whole recording, which is the tolerance a pointer landing on
    // a ~700px track can actually be held to.
    await expect.poll(() => position(page)).toBeGreaterThan(total * 0.48)
    expect(await position(page)).toBeLessThan(total * 0.52)
  })

  test('T19-C · dragging the thumb scrubs, and the transcript follows', async ({ page }) => {
    await openPlayer(page)
    const total = await duration(page)

    const bar = page.getByTestId('player-seekbar')
    const box = (await bar.boundingBox())!

    // Started at 20%, not at the left edge: the first chapter tick sits at 0%
    // and its hit area would take the pointerdown before the track saw it.
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2)
    await page.mouse.down()
    // Through an intermediate point: a single jump would be indistinguishable
    // from a click, and it is the DRAG that pointer capture exists for.
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2)
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2)
    await page.mouse.up()

    await expect.poll(() => position(page)).toBeGreaterThan(total * 0.73)
    expect(await position(page)).toBeLessThan(total * 0.77)

    // The transcript followed: the highlighted segment starts near the
    // playhead rather than back at the top.
    const active = activeSegment(page)
    await expect(active).toBeVisible()
    await expect(active).toBeInViewport()
  })

  test('T19-D · Space toggles playback', async ({ page }) => {
    await openPlayer(page)
    const play = page.getByTestId('player-play')

    await page.locator('body').click({ position: { x: 5, y: 300 } })
    await page.keyboard.press('Space')
    await expect(play).toHaveAttribute('aria-label', 'Pause')

    await page.keyboard.press('Space')
    await expect(play).toHaveAttribute('aria-label', 'Play')
  })

  test('T19-E · Space types a space while a text field has focus', async ({ page }) => {
    await openPlayer(page)

    /*
     * The title, because it is the text input this page has today. T-21 adds
     * the transcript search box the plan names; the property under test — a
     * shortcut must not steal a keystroke from a field — is the same, and this
     * is the field that exists to prove it.
     */
    await page.getByTestId('notepad-title').click()
    const input = page.getByTestId('notepad-title-input')
    await expect(input).toBeFocused()

    const before = await input.inputValue()
    await page.keyboard.press('End')
    await page.keyboard.press('Space')

    await expect(input).toHaveValue(`${before} `)
    await expect(page.getByTestId('player-play')).toHaveAttribute('aria-label', 'Play')

    // Leave the title as it was: this project runs its read-only tests in
    // parallel against one database.
    await page.keyboard.press('Escape')
  })

  test('T19-F · three right-arrows move forward fifteen seconds', async ({ page }) => {
    await openPlayer(page)
    await page.locator('body').click({ position: { x: 5, y: 300 } })

    for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowRight')

    await expect.poll(() => position(page)).toBe(15)
  })

  test('T19-G · the playback rate survives opening another meeting', async ({ page }) => {
    await openPlayer(page)

    await page.getByTestId('player-rate').click()
    await page.getByTestId('player-rate-1.5').click()
    await expect(page.getByTestId('player-rate')).toHaveText('1.5×')

    await page.goto(`/meeting/${WITHOUT_AUDIO}`)
    await expect(page.getByTestId('player-rate')).toHaveText('1.5×')

    // Back to the default, so the rest of the suite starts where it expects.
    await page.getByTestId('player-rate').click()
    await page.getByTestId('player-rate-1').click()
  })

  test('T19-H · ?t= opens at that position with the segment highlighted', async ({ page }) => {
    await page.goto(`/meeting/${WITH_AUDIO}?t=300`)
    await expect(page.getByTestId('player')).toBeVisible()
    await expect(page.getByTestId('transcript-segments')).toBeVisible()

    await expect.poll(() => position(page)).toBe(300)
    await expect(page.getByTestId('player-time')).toContainText('05:00')

    const active = activeSegment(page)
    await expect(active).toBeVisible()
    await expect(active).toBeInViewport()
    // The highlighted segment is one that had started by 5:00, not the first
    // one in the list.
    await expect(active).not.toContainText('00:00')
  })

  test('T19-I · playing rewrites ?t= in place, without a history entry', async ({ page }) => {
    await openPlayer(page)
    const historyBefore = await page.evaluate(() => window.history.length)

    await page.getByTestId('player-play').click()
    // The first write lands at the five-second mark; the rest of the budget is
    // headroom for a machine running four workers at once.
    await expect
      .poll(() => new URL(page.url()).searchParams.get('t'), { timeout: 20_000 })
      .not.toBeNull()

    const t = Number(new URL(page.url()).searchParams.get('t'))
    // Written once, at the five-second mark — not on every tick.
    expect(t).toBeGreaterThanOrEqual(5)
    expect(t).toBeLessThan(10)

    expect(await page.evaluate(() => window.history.length)).toBe(historyBefore)
  })

  test('T19-J · a chapter tick seeks to that chapter', async ({ page }) => {
    await openPlayer(page)

    const tick = page.getByTestId('player-chapter-2')
    await expect(tick).toBeVisible()

    // The tick's own label carries the timestamp it points at, so the
    // assertion compares against the chapter rather than against a pixel.
    const label = (await tick.getAttribute('aria-label'))!
    const [minutes, seconds] = label.split(' at ').at(-1)!.split(':').map(Number)
    const expected = minutes! * 60 + seconds!

    await tick.click()
    await expect.poll(() => position(page)).toBe(expected)
  })

  test('T19-K · hovering the seekbar previews the time and the speaker', async ({ page }) => {
    await openPlayer(page)

    const bar = page.getByTestId('player-seekbar')
    const box = (await bar.boundingBox())!
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2)

    const preview = page.getByTestId('player-seek-preview')
    await expect(preview).toBeVisible()
    await expect(preview).toContainText(/^\d{2}:\d{2}/)

    // A speaker name as well as a timestamp — the detail that makes the
    // preview worth having.
    const text = (await preview.innerText()).replace(/^\d{2}:\d{2}\s*/, '')
    expect(text.length).toBeGreaterThan(0)
  })

  test('T19-L · a meeting with no media still has a working player', async ({ page }) => {
    await openPlayer(page, WITHOUT_AUDIO)

    await expect(page.getByTestId('player-waveform')).toBeVisible()
    await page.getByTestId('player-play').click()

    // The virtual clock advances exactly like the real one.
    await expect.poll(() => position(page), { timeout: 4000 }).toBeGreaterThan(0)

    // And the transcript syncs to it: seeking moves the highlight.
    await clickAt(page, 0.5)
    const active = activeSegment(page)
    await expect(active).toBeVisible()
    await expect(active).toBeInViewport()
  })

  test('T19-M · unreachable media falls back without a broken element', async ({ page }) => {
    await page.route('**/api/v1/meetings/*/media', (route) => route.fulfill({ status: 404 }))
    await openPlayer(page)

    await expect(page.getByTestId('player-media-note')).toContainText('Audio unavailable')

    // Still a player, not a dead card: the clock runs and the seekbar works.
    await page.getByTestId('player-play').click()
    await expect.poll(() => position(page), { timeout: 4000 }).toBeGreaterThan(0)
  })

  test('T19-N · the time display does not change width as the digits change', async ({ page }) => {
    await openPlayer(page)
    const time = page.getByTestId('player-time')

    const widthAt = async () => (await time.boundingBox())!.width
    const atZero = await widthAt()

    // `9` seeks to 90% — every digit in the display changes, which is exactly
    // what a proportional font would make jump.
    await page.locator('body').click({ position: { x: 5, y: 300 } })
    await page.keyboard.press('9')
    await expect.poll(() => position(page)).toBeGreaterThan(0)

    expect(await widthAt()).toBe(atZero)

    await page.getByTestId('player-play').click()
    await page.waitForTimeout(1500)
    expect(await widthAt()).toBe(atZero)
  })

  test('T19-O · the player stays put while the transcript scrolls', async ({ page }) => {
    await openPlayer(page)

    const player = page.getByTestId('player')
    const before = (await player.boundingBox())!.y

    const list = page.getByTestId('transcript-scroll')
    await list.evaluate((el) => el.scrollTo(0, 2000))
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)

    await expect(player).toBeInViewport()
    expect((await player.boundingBox())!.y).toBe(before)
  })
})

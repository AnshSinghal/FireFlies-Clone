import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { API_BASE as API_URL } from '../api-base'

/**
 * Soundbites (T-33, cases T33-A → T33-K).
 *
 * Read-only cases run in the parallel project against the seeded clips
 * (meeting 1 carries two, one of them auto-generated). The two cases that
 * WRITE — save (T33-D) and delete (T33-J) — are `@mutates`, and J deletes the
 * clip D created, so the seeded data the read-only assertions lean on is never
 * touched.
 *
 * Clip ranges are read from the API rather than hardcoded: the seeder resolves
 * them from segment indices, so a fixture edit would silently move every
 * millisecond a hardcoded test relied on.
 */

/** Meeting 1 has two seeded soundbites; meeting 2 has none. */
const HERO = 1
const BARE = 2

interface Clip {
  id: number
  title: string
  start_ms: number
  end_ms: number
  auto_generated: boolean
}

interface Segment {
  id: number
  start_ms: number
  end_ms: number
  text: string
}

async function fetchClips(request: APIRequestContext, meetingId: number): Promise<Clip[]> {
  const response = await request.get(`${API_URL}/api/v1/meetings/${meetingId}/soundbites`)
  expect(response.ok()).toBe(true)
  return (await response.json()).items as Clip[]
}

async function fetchSegments(request: APIRequestContext, meetingId: number): Promise<Segment[]> {
  const response = await request.get(`${API_URL}/api/v1/meetings/${meetingId}/transcript`)
  expect(response.ok()).toBe(true)
  return (await response.json()).segments as Segment[]
}

async function openMeeting(page: Page, id = HERO): Promise<void> {
  await page.goto(`/meeting/${id}`)
  await expect(page.getByTestId('player')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 20_000 })
}

async function openFlyout(page: Page): Promise<void> {
  await page.getByTestId('icon-rail-soundbites').click()
  await expect(page.getByTestId('soundbites-flyout')).toBeVisible()
}

/** The playhead in seconds, from the value a screen reader is given. */
function position(page: Page): Promise<number> {
  return page
    .getByTestId('player-seekbar')
    .getAttribute('aria-valuenow')
    .then(Number)
}

/**
 * Selects from the start of one segment's paragraph to the end of another's —
 * a real DOM selection, because the toolbar reads `window.getSelection()` and
 * anything less would not exercise it (the T20-L technique, spanning rows).
 */
async function selectAcross(page: Page, fromNth: number, toNth: number): Promise<void> {
  const rows = page.locator('[data-segment-id]')
  const from = rows.nth(fromNth).locator('p').first()
  const to = rows.nth(toNth).locator('p').first()
  await expect(from).toBeVisible()
  await expect(to).toBeVisible()

  const handles = [await from.elementHandle(), await to.elementHandle()] as const
  await page.evaluate(([start, end]) => {
    const range = document.createRange()
    range.setStart(start!, 0)
    range.setEnd(end!, end!.childNodes.length)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  }, handles)
}

/** Selection → toolbar → `Soundbite` → the create modal. */
async function openModal(page: Page, fromNth: number, toNth: number): Promise<void> {
  await selectAcross(page, fromNth, toNth)
  await expect(page.getByTestId('selection-toolbar')).toBeVisible()
  await page.getByTestId('selection-soundbite').click()
  await expect(page.getByTestId('soundbite-modal')).toBeVisible()
}

/** `formatDuration`'s contract for sub-hour clips: `m:ss`, no leading zero. */
function asDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

test.describe('soundbites · clips, trimmer, range-locked playback', () => {
  test('T33-A · selecting two segments pre-fills the modal with their range', async ({
    page,
    request,
  }) => {
    const segments = await fetchSegments(request, HERO)
    await openMeeting(page)

    // Resolve the two rows to their segments BEFORE selecting: the DOM only
    // carries ids; the milliseconds the modal must show live in the API.
    const rows = page.locator('[data-segment-id]')
    const firstId = Number(await rows.nth(1).getAttribute('data-segment-id'))
    const secondId = Number(await rows.nth(2).getAttribute('data-segment-id'))
    const first = segments.find((segment) => segment.id === firstId)!
    const second = segments.find((segment) => segment.id === secondId)!
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()

    await openModal(page, 1, 2)

    // The range runs from the FIRST segment's start to the SECOND's end.
    await expect(page.getByTestId('soundbite-trim-start')).toHaveAttribute(
      'aria-valuenow',
      String(Math.floor(first.start_ms / 1000)),
    )
    await expect(page.getByTestId('soundbite-trim-end')).toHaveAttribute(
      'aria-valuenow',
      String(Math.floor(second.end_ms / 1000)),
    )
    await expect(page.getByTestId('soundbite-duration')).toHaveText(
      asDuration(second.end_ms - first.start_ms),
    )

    // The suggested title is the selected text: it starts with the first
    // segment's words and respects the server's 120-character cap.
    const title = await page.getByTestId('soundbite-title').inputValue()
    expect(title).toContain(first.text.trim().split(/\s+/).slice(0, 3).join(' '))
    expect(title.length).toBeGreaterThan(0)
    expect(title.length).toBeLessThanOrEqual(120)
  })

  test('T33-B · dragging the end handle updates the duration readout live', async ({ page }) => {
    await openMeeting(page)
    await openModal(page, 1, 2)

    const handle = page.getByTestId('soundbite-trim-end')
    const before = await page.getByTestId('soundbite-duration').innerText()
    const endBefore = Number(await handle.getAttribute('aria-valuenow'))

    const box = (await handle.boundingBox())!
    const y = box.y + box.height / 2
    await page.mouse.move(box.x + box.width / 2, y)
    await page.mouse.down()
    // Through an intermediate point — it is the DRAG that pointer capture
    // exists for, and a single jump would be indistinguishable from a click.
    await page.mouse.move(box.x + box.width / 2 - 20, y)
    await page.mouse.move(box.x + box.width / 2 - 40, y)

    // Read WHILE the pointer is still down: "live" means during the drag,
    // not after it settles.
    const during = await page.getByTestId('soundbite-duration').innerText()
    await page.mouse.up()

    expect(during).not.toBe(before)
    // Dragging left shortens the clip — the readout moved the right way.
    expect(Number(await handle.getAttribute('aria-valuenow'))).toBeLessThan(endBefore)
  })

  test('T33-C · a 1-second range is blocked with a min-length message', async ({ page }) => {
    await openMeeting(page)
    await openModal(page, 1, 2)

    /*
     * Walked down with the keyboard: each ArrowLeft is exactly one second, so
     * the clip shrinks deterministically until the trimmer's own 1s floor —
     * which sits BELOW the 3s minimum precisely so this state is reachable
     * and explained, not silently clamped away.
     */
    const readout = page.getByTestId('soundbite-duration')
    await page.getByTestId('soundbite-trim-end').focus()
    for (let i = 0; i < 90; i += 1) {
      if ((await readout.innerText()) === '0:01') break
      await page.keyboard.press('ArrowLeft')
    }

    await expect(readout).toHaveText('0:01')
    const error = page.getByTestId('soundbite-length-error')
    await expect(error).toBeVisible()
    await expect(error).toContainText('at least 3 seconds')
    await expect(page.getByTestId('soundbite-create')).toBeDisabled()
  })

  test('T33-E · playing a soundbite seeks to its start and auto-pauses at its end', async ({
    page,
    request,
  }) => {
    // Real time at 1× would spend the whole budget listening; 2× halves it.
    // The shortest seeded clip (~25s) keeps the wait inside the timeout.
    test.setTimeout(60_000)

    const clips = await fetchClips(request, HERO)
    const clip = clips.reduce((a, b) => (b.end_ms - b.start_ms < a.end_ms - a.start_ms ? b : a))
    const startSec = Math.floor(clip.start_ms / 1000)
    const endSec = Math.floor(clip.end_ms / 1000)

    await openMeeting(page)
    await page.getByTestId('player-rate').click()
    await page.getByTestId('player-rate-2').click()
    await openFlyout(page)

    await page.getByTestId(`soundbite-play-${clip.id}`).click()

    // Seeked to the clip's start — not playing on from 00:00.
    await expect(page.getByTestId('player-play')).toHaveAttribute('aria-label', 'Pause')
    await expect.poll(() => position(page)).toBeGreaterThanOrEqual(startSec - 1)
    expect(await position(page)).toBeLessThanOrEqual(endSec - 5)

    // …and auto-pauses at the end, without anyone touching the player.
    const clipWallMs = (clip.end_ms - clip.start_ms) / 2
    await expect(page.getByTestId('player-play')).toHaveAttribute('aria-label', 'Play', {
      timeout: clipWallMs + 12_000,
    })

    /*
     * The engine commits exactly `end_ms` when the range trips, so the ±300ms
     * the spec allows collapses to ±1 here — one second being the resolution
     * the ARIA value (and the visible clock) actually carries.
     */
    expect(Math.abs((await position(page)) - endSec)).toBeLessThanOrEqual(1)
  })

  test('T33-F · seeking away mid-soundbite clears the range constraint', async ({
    page,
    request,
  }) => {
    const clips = await fetchClips(request, HERO)
    // The longest clip, so the seek lands comfortably mid-playback.
    const clip = clips.reduce((a, b) => (b.end_ms - b.start_ms > a.end_ms - a.start_ms ? b : a))
    const startSec = Math.floor(clip.start_ms / 1000)

    await openMeeting(page)
    await openFlyout(page)
    await page.getByTestId(`soundbite-play-${clip.id}`).click()

    await expect(page.getByTestId('player-play')).toHaveAttribute('aria-label', 'Pause')
    await expect.poll(() => position(page)).toBeGreaterThanOrEqual(startSec - 1)

    // Seek to the middle of the meeting — far outside the armed range.
    const bar = page.getByTestId('player-seekbar')
    const box = (await bar.boundingBox())!
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2)

    /*
     * The landing point is past the clip's end, so a constraint that survived
     * the seek would pause on the VERY NEXT clock tick. Still playing and
     * still advancing a second and a half later is the proof it was cleared.
     */
    await expect.poll(() => position(page)).toBeGreaterThan(startSec + 60)
    await expect(page.getByTestId('player-play')).toHaveAttribute('aria-label', 'Pause')

    const landed = await position(page)
    await page.waitForTimeout(1500)
    expect(await position(page)).toBeGreaterThan(landed)
    await expect(page.getByTestId('player-play')).toHaveAttribute('aria-label', 'Pause')
  })

  test('T33-G · seekbar bands span exactly each clip range', async ({ page, request }) => {
    const clips = await fetchClips(request, HERO)
    expect(clips.length).toBeGreaterThan(0)

    await openMeeting(page)

    const track = page.getByTestId('player-seekbar')
    const trackBox = (await track.boundingBox())!
    // The track's own accessible maximum, in ms — the same denominator the
    // band geometry is computed from.
    const durationMs = Number(await track.getAttribute('aria-valuemax')) * 1000

    for (const clip of clips) {
      const band = page.getByTestId(`soundbite-band-${clip.id}`)
      await expect(band).toBeVisible()

      const box = (await band.boundingBox())!
      const expectedLeft = trackBox.x + trackBox.width * (clip.start_ms / durationMs)
      const expectedWidth = trackBox.width * ((clip.end_ms - clip.start_ms) / durationMs)

      // ±3px: percentage layout against a ~700px track resolves sub-pixel.
      expect(Math.abs(box.x - expectedLeft)).toBeLessThanOrEqual(3)
      expect(Math.abs(box.width - expectedWidth)).toBeLessThanOrEqual(3)
    }
  })

  test('T33-H · three Auto-badged proposals, each dismissible', async ({ page }) => {
    // A meeting with no saved clips, so no proposal is filtered out as
    // already-saved and all three of the provider's candidates render.
    await openMeeting(page, BARE)
    await openFlyout(page)

    await expect(page.getByTestId('soundbites-proposals')).toBeVisible()
    const proposals = page.getByTestId(/^soundbite-proposal-\d+$/)
    await expect(proposals).toHaveCount(3)

    for (const index of [0, 1, 2]) {
      await expect(page.getByTestId(`soundbite-proposal-auto-${index}`)).toContainText('Auto')
    }

    // Dismissing is client-side (localStorage), so it writes no rows and is
    // safe in the parallel project.
    await page.getByTestId('soundbite-proposal-dismiss-0').click()
    await expect(proposals).toHaveCount(2)
  })

  test('T33-I · copy link produces ?t=&clip=, and opening it selects the clip', async ({
    page,
    request,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const clips = await fetchClips(request, HERO)
    const clip = clips[0]!
    const startSec = Math.floor(clip.start_ms / 1000)

    await openMeeting(page)
    await openFlyout(page)
    await page.getByTestId(`soundbite-copy-link-${clip.id}`).click()
    await expect(page.getByTestId('toast')).toContainText('Link copied')

    const copied = await page.evaluate(() => navigator.clipboard.readText())
    const url = new URL(copied)
    expect(url.pathname).toBe(`/meeting/${HERO}`)
    expect(url.searchParams.get('t')).toBe(String(startSec))
    expect(url.searchParams.get('clip')).toBe(String(clip.id))

    // A fresh navigation, exactly what a pasted link is.
    await page.goto(copied)
    await expect(page.getByTestId('player')).toBeVisible({ timeout: 20_000 })

    // The flyout opened itself on the clip, selected and in view…
    await expect(page.getByTestId('rail-flyout-soundbites')).toBeVisible()
    const card = page.getByTestId(`soundbite-${clip.id}`)
    await expect(card).toHaveAttribute('data-selected', 'true')
    await expect(card).toBeInViewport()

    // …and the player sits at the clip's start, ready to play.
    await expect.poll(() => position(page)).toBe(startSec)
  })

  test('T33-K · a meeting with no soundbites shows the flyout empty state', async ({ page }) => {
    await openMeeting(page, BARE)
    await openFlyout(page)

    await expect(page.getByTestId('soundbites-flyout-empty')).toBeVisible()
    await expect(page.getByTestId('rail-flyout-soundbites')).toContainText('No soundbites yet')
    await expect(page.getByTestId('rail-flyout-soundbites')).toContainText(
      'Select transcript text to create your first clip',
    )
  })
})

test.describe('soundbites · save and delete', { tag: '@mutates' }, () => {
  /** Created by T33-D, deleted by T33-J — the seeded clips stay untouched. */
  const TITLE = 'Where the Q3 scope line actually landed'

  test('T33-D · saving puts the card in the flyout, and it survives reload', async ({ page }) => {
    await openMeeting(page)
    await openModal(page, 3, 4)

    await page.getByTestId('soundbite-title').fill(TITLE)
    await page.getByTestId('soundbite-create').click()

    await expect(page.getByTestId('toast')).toContainText('Soundbite created')
    await expect(page.getByTestId('soundbite-modal')).toBeHidden()

    await openFlyout(page)
    await expect(
      page.getByTestId(/^soundbite-\d+$/).filter({ hasText: TITLE }),
    ).toHaveCount(1)

    // Persisted, not merely cached: a full reload rebuilds from the server.
    await page.reload()
    await expect(page.getByTestId('player')).toBeVisible({ timeout: 20_000 })
    await openFlyout(page)
    await expect(
      page.getByTestId(/^soundbite-\d+$/).filter({ hasText: TITLE }),
    ).toHaveCount(1)
  })

  test('T33-J · deleting removes the card and its seekbar band', async ({ page }) => {
    await openMeeting(page)
    await openFlyout(page)

    const card = page.getByTestId(/^soundbite-\d+$/).filter({ hasText: TITLE })
    await expect(card).toHaveCount(1)
    const id = (await card.getAttribute('data-testid'))!.replace('soundbite-', '')

    // The band is on the seekbar before the delete — otherwise its
    // disappearance would prove nothing.
    await expect(page.getByTestId(`soundbite-band-${id}`)).toBeVisible()

    await page.getByTestId(`soundbite-delete-${id}`).click()

    await expect(page.getByTestId('toast')).toContainText('Soundbite deleted')
    await expect(card).toHaveCount(0)
    await expect(page.getByTestId(`soundbite-band-${id}`)).toHaveCount(0)
  })
})

import { expect, test, type Page } from '@playwright/test'

/**
 * Creating a meeting (T-26, cases T26-A → T26-P).
 *
 * The cases that actually CREATE live in `90-mutations.spec.ts`; these are the
 * ones that stop before writing anything — rejections, the live preview, and
 * the drag state.
 *
 * T26-P (an executable renamed to .txt, posted straight at the API) is a
 * backend test: it is about the layer a browser cannot reach past.
 */

async function openCreate(page: Page, tab = 'upload'): Promise<void> {
  await page.goto(`/upload?tab=${tab}`)
  await expect(page.getByTestId('create-modal')).toBeVisible({ timeout: 20_000 })
}

/** Attaches a file without touching the filesystem. */
async function attach(page: Page, name: string, body: string | Buffer): Promise<void> {
  await page.getByTestId('create-file-input').setInputFiles({
    name,
    mimeType: 'text/plain',
    buffer: typeof body === 'string' ? Buffer.from(body) : body,
  })
}

test.describe('create meeting', () => {
  test('T26-F · a .pdf is refused without a request', async ({ page }) => {
    await openCreate(page)

    let requests = 0
    await page.route('**/api/v1/meetings/parse', (route) => {
      requests += 1
      return route.continue()
    })

    await attach(page, 'notes.pdf', '%PDF-1.4 not a transcript')

    const error = page.getByTestId('create-file-error')
    await expect(error).toBeVisible()
    await expect(error).toContainText('.pdf')
    await expect(error).toContainText('.vtt')
    // Rejected in the browser: a round-trip to be told a .pdf is a .pdf is a
    // round-trip nobody needed.
    expect(requests).toBe(0)
  })

  test('T26-G · an oversized file is refused with the size', async ({ page }) => {
    await openCreate(page)

    // 11 MB of valid-looking text.
    await attach(page, 'huge.txt', Buffer.alloc(11 * 1024 * 1024, 'A: line\n'))

    const error = page.getByTestId('create-file-error')
    await expect(error).toBeVisible()
    await expect(error).toContainText('10 MB')
  })

  test('T26-H · an unparseable file explains itself and keeps the modal open', async ({ page }) => {
    await openCreate(page)

    await attach(page, 'notes.vtt', 'WEBVTT\n\nthis file has no cues at all\n')

    const error = page.getByTestId('create-file-error')
    await expect(error).toBeVisible({ timeout: 15_000 })
    await expect(error).toContainText("couldn't find any cues")
    // The hint from the server, which says what a cue looks like.
    await expect(error).toContainText('-->')

    await expect(page.getByTestId('create-modal')).toBeVisible()
    await expect(page.getByTestId('create-preview')).toHaveCount(0)
  })

  test('T26-I · dragging a file over the dropzone tints it', async ({ page }) => {
    await openCreate(page)

    const zone = page.getByTestId('create-dropzone')
    await expect(zone).not.toHaveAttribute('data-dragover', 'true')

    /*
     * A real `DataTransfer`, built in the page.
     *
     * Playwright cannot serialise one across the boundary — a plain object is
     * rejected by the DragEvent constructor — so the event is constructed and
     * dispatched where the DOM already has the class.
     */
    await zone.evaluate((element) => {
      element.dispatchEvent(
        new DragEvent('dragover', { bubbles: true, dataTransfer: new DataTransfer() }),
      )
    })

    await expect(zone).toHaveAttribute('data-dragover', 'true')
    const border = await zone.evaluate((el) => getComputedStyle(el).borderTopColor)
    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ff-accent').trim(),
    )
    expect(accent.length).toBeGreaterThan(0)
    expect(border).not.toBe('rgba(0, 0, 0, 0)')

    await zone.dispatchEvent('dragleave')
    await expect(zone).not.toHaveAttribute('data-dragover', 'true')
  })

  test('T26-K · the paste preview is debounced, not per keystroke', async ({ page }) => {
    await openCreate(page, 'paste')

    let parses = 0
    await page.route('**/api/v1/meetings/parse', (route) => {
      parses += 1
      return route.continue()
    })

    // Typed without pauses. One parse should follow, not one per character.
    await page.getByTestId('create-paste-input').pressSequentially(
      'Sarah Chen: Morning everyone and welcome to the call.',
      { delay: 15 },
    )
    await expect(page.getByTestId('create-preview')).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(800)

    expect(parses).toBeLessThanOrEqual(2)
    expect(parses).toBeGreaterThan(0)
  })

  test('T26-L · an empty title blocks submission with no request', async ({ page }) => {
    await openCreate(page, 'paste')

    let created = 0
    await page.route('**/api/v1/meetings/import', (route) => {
      created += 1
      return route.continue()
    })

    await page.getByTestId('create-load-sample').click()
    await expect(page.getByTestId('create-preview')).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('create-title').fill('')
    await page.getByTestId('create-submit').click()

    await expect(page.getByTestId('create-modal')).toContainText('needs a title')
    expect(created).toBe(0)
  })

  test('the sample loads and previews with its timings honoured', async ({ page }) => {
    await openCreate(page, 'paste')

    await page.getByTestId('create-load-sample').click()
    await expect(page.getByTestId('create-preview')).toBeVisible({ timeout: 15_000 })

    // The sample uses bracketed timestamps, so the parser should HONOUR them
    // rather than estimating — a demo that quietly fell back would be showing
    // the wrong thing.
    await expect(page.getByTestId('create-preview-strategy')).toContainText('[00:14]')
    await expect(page.getByTestId('create-preview-count')).toContainText(/\d+ segments/)
    await expect(page.getByTestId('create-preview-segment-0')).toContainText('00:00')
  })
})

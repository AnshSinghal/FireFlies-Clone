import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

/**
 * Export (T-34, cases T34-G → T34-J / PW-34-01 → PW-34-04).
 *
 * Everything here is READ-ONLY — an export renders what exists and writes
 * nothing — so the suite stays in the parallel read-only project despite the
 * bulk case driving row selection (selection is client state, like T-14's).
 *
 * The download assertions go through Playwright's `download` event: the modal
 * fetches the file and hands it to the browser via a synthetic anchor click
 * (lib/utils/download.ts), which fires the same event a server-navigated
 * download would. `suggestedFilename()` is therefore the anchor's `download`
 * attribute — the server's Content-Disposition name whenever the header made
 * it through CORS, which is exactly what T34-G specs.
 */

async function openNotepadExport(page: Page): Promise<void> {
  await page.goto('/meeting/1')
  await expect(page.getByTestId('notepad-page')).toBeVisible()
  // The summary panel, not the transcript — below 1024px the transcript hides
  // behind a tab (same wait as 13-notepad).
  await expect(page.getByTestId('summary-panel')).toBeVisible()

  await page.getByTestId('notepad-kebab').click()
  await page.getByTestId('notepad-export').click()
  await expect(page.getByTestId('export-modal')).toBeVisible()
}

/** Selecting requires hovering first — the checkbox only appears on hover. */
async function selectRow(page: Page, index: number): Promise<void> {
  const row = page.getByTestId('meeting-row').nth(index)
  await row.hover()
  await row.getByTestId('meeting-row-checkbox').click()
}

/**
 * The word count out of the estimate line, digits only — the number is
 * locale-formatted (`3,204`), and when the format is PDF the same line also
 * carries a page count, so the parse anchors on the ` words` suffix.
 */
async function estimatedWords(page: Page): Promise<number> {
  const text = await page.getByTestId('export-estimate').innerText()
  const match = /([\d,.\s]+)\s*words?/.exec(text)
  expect(match, `estimate line should carry a word count: "${text}"`).not.toBeNull()
  return Number(match![1].replace(/\D/g, ''))
}

/**
 * Entry names out of a zip's central directory, by hand.
 *
 * The e2e package deliberately has no dependencies beyond Playwright, and the
 * central directory is 20 lines of offsets: find the end-of-central-directory
 * record (signature PK\x05\x06, scanned backwards past any archive comment),
 * read the entry count and directory offset from it, then walk the fixed-size
 * headers. Parsing the REAL structure — rather than grepping for `PK` — means
 * a truncated or corrupt archive fails loudly here instead of downstream.
 */
function zipEntryNames(zip: Buffer): string[] {
  let eocd = -1
  for (let i = zip.length - 22; i >= 0; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  expect(eocd, 'no end-of-central-directory record — not a zip').toBeGreaterThanOrEqual(0)

  const count = zip.readUInt16LE(eocd + 10)
  let offset = zip.readUInt32LE(eocd + 16)

  const names: string[] = []
  for (let entry = 0; entry < count; entry++) {
    expect(zip.readUInt32LE(offset), 'corrupt central-directory header').toBe(0x02014b50)
    const nameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    names.push(zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'))
    offset += 46 + nameLength + extraLength + commentLength
  }
  return names
}

test.describe('export modal', () => {
  test('T34-G · Markdown export downloads a slug-named file', async ({ page }) => {
    await openNotepadExport(page)

    await page.getByTestId('export-format-md').click()
    await expect(page.getByTestId('export-format-md')).toHaveAttribute('data-state', 'checked')

    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('export-submit').click()
    const download = await downloadPromise

    // `q3-product-roadmap-sync-2026-07-26.md` — the slug-dash-date pattern the
    // spec calls out, never `download` or `export.md`.
    expect(download.suggestedFilename()).toMatch(
      /^q3-product-roadmap-sync-\d{4}-\d{2}-\d{2}\.md$/,
    )

    const content = readFileSync(await download.path(), 'utf8')
    expect(content).toContain('# Q3 Product Roadmap Sync')
    expect(content).toContain('## Meeting Overview')
    expect(content).toContain('## Transcript')
    // Speaker turns in the `**Speaker** [MM:SS]` shape, not raw HTML.
    expect(content).toMatch(/^\*\*.+\*\* \[\d{1,2}:\d{2}\]/m)
    expect(content).not.toMatch(/<\/?(div|span|p|br|table)[ >]/i)

    // Success is announced and the modal is gone — the export flow ends, it
    // does not park the user in front of a stale dialog.
    await expect(page.getByTestId('toast').first()).toContainText('Export downloaded')
    await expect(page.getByTestId('export-modal')).toBeHidden()
  })

  test('T34-H · unchecking Transcript drops the estimate and the section', async ({ page }) => {
    await openNotepadExport(page)

    // The estimate needs the section data; wait for a real number, not the
    // "Estimating size…" placeholder.
    await expect(page.getByTestId('export-estimate')).toContainText(/words?/)
    const before = await estimatedWords(page)

    await page.getByTestId('export-include-transcript').click()
    await expect(page.getByTestId('export-include-transcript')).toHaveAttribute(
      'data-state',
      'unchecked',
    )

    // The transcript is by far the largest section of a real meeting, so the
    // live estimate must fall — a static number would mean the preview lies.
    const after = await estimatedWords(page)
    expect(after).toBeLessThan(before)
    expect(after).toBeGreaterThan(0)

    await page.getByTestId('export-format-md').click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('export-submit').click()
    const download = await downloadPromise

    // The file honours the checkboxes: no transcript heading, no speaker
    // turns — while the still-checked sections remain.
    const content = readFileSync(await download.path(), 'utf8')
    expect(content).not.toContain('## Transcript')
    expect(content).not.toMatch(/^\*\*.+\*\* \[\d{1,2}:\d{2}\]/m)
    expect(content).toContain('## Meeting Overview')
  })

  test('T34-I · Copy as Markdown fills the clipboard and says so', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openNotepadExport(page)

    // Enabled only once every included section's data has arrived — clicking
    // earlier would copy a truncated document.
    const copyButton = page.getByTestId('export-copy-markdown')
    await expect(copyButton).toBeEnabled()
    await copyButton.click()

    await expect(page.getByTestId('toast').first()).toContainText('Markdown copied')

    const copied = await page.evaluate(() => navigator.clipboard.readText())

    // The T-34.3 document shape — title, metadata block, sections, checkbox
    // action items, `**Speaker** [MM:SS]` turns — because "pastes cleanly into
    // Notion or GitHub" is the whole promise of the button.
    expect(copied).toContain('# Q3 Product Roadmap Sync')
    expect(copied).toContain('**Date:**')
    expect(copied).toContain('## Meeting Overview')
    expect(copied).toContain('## Transcript')
    expect(copied).toMatch(/^- \[[ x]\] /m)
    expect(copied).toMatch(/^\*\*.+\*\* \[\d{1,2}:\d{2}\]$/m)
    expect(copied).not.toMatch(/<\/?(div|span|p|br|table)[ >]/i)

    // Copy is an alternative, not a submit — the modal stays open.
    await expect(page.getByTestId('export-modal')).toBeVisible()
  })
})

test.describe('bulk export', () => {
  test('T34-J · three selected meetings download as a three-file zip', async ({ page }) => {
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible()

    await selectRow(page, 0)
    await selectRow(page, 1)
    await selectRow(page, 2)
    await expect(page.getByTestId('bulk-count')).toHaveText('3 selected')

    await page.getByTestId('bulk-export').click()
    await expect(page.getByTestId('export-modal')).toBeVisible()
    // The modal knows it is exporting a batch, not one meeting.
    await expect(page.getByTestId('export-estimate')).toContainText('3 meetings')

    await page.getByTestId('export-format-md').click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('export-submit').click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/^meetings-export-\d{4}-\d{2}-\d{2}\.zip$/)

    // One member per meeting, each named by the single-export slug rule —
    // counted from the zip's central directory, not guessed from file size.
    const names = zipEntryNames(readFileSync(await download.path()))
    expect(names).toHaveLength(3)
    expect(new Set(names).size).toBe(3)
    for (const name of names) {
      expect(name).toMatch(/^[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.md$/)
    }

    await expect(page.getByTestId('toast').first()).toContainText('Export downloaded')
  })
})

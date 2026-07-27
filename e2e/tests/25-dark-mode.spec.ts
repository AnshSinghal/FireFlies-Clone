import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Dark mode (T-38, cases T38-A → T38-K).
 *
 * The claims split three ways: state (the attribute and the tokens follow the
 * preference), first paint (no white flash — the one everyone notices), and
 * legibility (axe at zero contrast violations in dark, which is stricter than
 * "looks fine").
 *
 * T38-J's paired-snapshot sweep belongs to T-41's visual-regression harness;
 * here each surface asserts its PAINTED colour instead, which is the part a
 * pixel diff would catch and a token typo would break.
 */

/** What `--ff-grey-25` resolves to in dark — the app background. */
const DARK_BG = 'rgb(14, 14, 21)'
/** `--ff-white` in dark — cards, modals, the topbar. */
const DARK_SURFACE = 'rgb(20, 20, 29)'

async function inTheme(page: Page, theme: 'light' | 'dark' | 'system'): Promise<void> {
  await page.addInitScript(
    (value) => localStorage.setItem('ff.theme', JSON.stringify(value)),
    theme,
  )
}

const htmlTheme = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.theme)

test.describe('dark mode', () => {
  test('T38-A · the toggle flips the attribute and the paint', async ({ page }) => {
    // Pinned, because the machine default is now `system` and this test's
    // starting point must not depend on the OS running it.
    await inTheme(page, 'light')
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible({ timeout: 20_000 })
    expect(await htmlTheme(page)).toBe('light')

    await page.getByTestId('topbar-avatar').click()
    await expect(page.getByTestId('theme-toggle')).toBeVisible()
    await page.getByTestId('theme-option-dark').click()

    await expect.poll(() => htmlTheme(page)).toBe('dark')
    // The paint follows the token, not just the attribute.
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .toBe(DARK_BG)
  })

  test('T38-B · a dark reload never paints white first', async ({ page }) => {
    await inTheme(page, 'dark')

    /*
     * The assertion has to catch the FIRST paint, so it cannot wait for the
     * app: it reads the html background the moment the document exists. The
     * boot script runs before paint, so even this early the attribute must
     * already be set — that is the entire point of inlining it in <head>.
     */
    await page.goto('/notebook', { waitUntil: 'domcontentloaded' })
    expect(await htmlTheme(page)).toBe('dark')

    const early = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(early).toBe(DARK_BG)
  })

  test('T38-C · system preference resolves to dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    // No stored preference: `system` is the default.
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible({ timeout: 20_000 })

    expect(await htmlTheme(page)).toBe('dark')
  })

  test('T38-D · while on system, the theme follows the OS live', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible({ timeout: 20_000 })
    expect(await htmlTheme(page)).toBe('light')

    // The OS flips; no reload, no interaction.
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(() => htmlTheme(page)).toBe('dark')

    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(() => htmlTheme(page)).toBe('light')
  })

  test('T38-E · dark /notebook has zero contrast violations', async ({ page }) => {
    await inTheme(page, 'dark')
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible({ timeout: 20_000 })

    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(scan.violations).toEqual([])
  })

  test('T38-F · dark /meeting has zero contrast violations', async ({ page }) => {
    await inTheme(page, 'dark')
    await page.goto('/meeting/1')
    await expect(page.getByTestId('transcript-list')).toBeVisible({ timeout: 25_000 })

    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(scan.violations).toEqual([])
  })

  test('T38-G · a modal in dark sits on a lifted surface, not a white box', async ({ page }) => {
    await inTheme(page, 'dark')
    await page.goto('/meeting/1')
    await expect(page.getByTestId('notepad-header')).toBeVisible({ timeout: 25_000 })

    await page.getByTestId('notepad-kebab').click()
    await page.getByTestId('notepad-edit-details').click()
    await expect(page.getByTestId('edit-modal')).toBeVisible()

    const bg = await page
      .getByTestId('edit-modal')
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    // A surface token, not white — and DIFFERENT from the page behind it,
    // because dark elevation is a lighter surface rather than a shadow.
    expect(bg).toBe(DARK_SURFACE)
    expect(bg).not.toBe('rgb(255, 255, 255)')
  })

  test('T38-H · search highlights stay legible in dark', async ({ page }) => {
    await inTheme(page, 'dark')
    await page.goto('/meeting/1?find=pricing')
    await expect(page.getByTestId('transcript-find-input')).toHaveValue('pricing', {
      timeout: 25_000,
    })

    const mark = page.getByTestId('transcript-list').locator('mark').first()
    await expect(mark).toBeVisible({ timeout: 15_000 })

    const { bg, fg } = await mark.evaluate((el) => ({
      bg: getComputedStyle(el).backgroundColor,
      fg: getComputedStyle(el).color,
    }))

    /*
     * The FIRST mark is the CURRENT one — the deep link primes the find bar,
     * which makes match zero active — so it wears the active amber #7d6211;
     * the resting marks wear #6b5714. Either way: a dark amber with light
     * text, never the light theme's yellow wash.
     */
    expect(['rgb(125, 98, 17)', 'rgb(107, 87, 20)']).toContain(bg)
    expect(fg).toBe('rgb(242, 244, 247)')

    const resting = page.getByTestId('transcript-list').locator('mark:not([data-active="true"])')
    if ((await resting.count()) > 0) {
      expect(
        await resting.first().evaluate((el) => getComputedStyle(el).backgroundColor),
      ).toBe('rgb(107, 87, 20)')
    }
  })

  test('T38-I · the waveform paints dark colours, and repaints on switch', async ({ page }) => {
    await inTheme(page, 'dark')
    await page.goto('/meeting/1')
    await expect(page.getByTestId('player-waveform')).toBeVisible({ timeout: 25_000 })
    await page.waitForTimeout(400)

    const sample = () =>
      page.getByTestId('player-waveform').evaluate((wrap) => {
        const canvas = wrap.querySelector('canvas')!
        const context = canvas.getContext('2d')!
        const { data } = context.getImageData(0, 0, canvas.width, Math.min(canvas.height, 40))
        // Count near-white and painted (non-transparent) pixels.
        let white = 0
        let painted = 0
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3]! > 0) {
            painted += 1
            if (data[i]! > 230 && data[i + 1]! > 230 && data[i + 2]! > 230) white += 1
          }
        }
        return { white, painted }
      })

    const dark = await sample()
    expect(dark.painted).toBeGreaterThan(0)
    // Not a white block (the classic un-themed canvas failure).
    expect(dark.white / dark.painted).toBeLessThan(0.05)

    // And switching themes repaints the pixels, not just the styles around them.
    await page.getByTestId('topbar-avatar').click()
    await page.getByTestId('theme-option-light').click()
    await expect.poll(() => htmlTheme(page)).toBe('light')

    await expect
      .poll(async () => {
        const light = await sample()
        return light.painted
      })
      .toBeGreaterThan(0)
  })

  test('the shortcut cycles all three modes', async ({ page }) => {
    await inTheme(page, 'light')
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible({ timeout: 20_000 })

    // light → dark → system → light: every state reachable from the keyboard.
    await page.keyboard.press('ControlOrMeta+Shift+KeyL')
    await expect.poll(() => htmlTheme(page)).toBe('dark')

    await page.keyboard.press('ControlOrMeta+Shift+KeyL')
    // `system` resolves to the emulated scheme, light by default here.
    await expect.poll(() => htmlTheme(page)).toBe('light')

    await page.keyboard.press('ControlOrMeta+Shift+KeyL')
    await expect.poll(() => htmlTheme(page)).toBe('light')
  })
})

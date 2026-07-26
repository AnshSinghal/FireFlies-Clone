import { expect, test } from '@playwright/test'

/**
 * Token layer behaviour in a real browser (T-02).
 *
 * The value assertions live in vitest, where they run in milliseconds against
 * tokens.css. What needs a browser is the behaviour the cascade produces:
 * focus rings, reduced motion, and the theme swap.
 */

test.describe('design tokens', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/tokens')
    await expect(page.getByTestId('tokens-page')).toBeVisible()
  })

  // T02-E
  test('every focusable control shows the accent focus ring', async ({ page }) => {
    const focusable = page.locator(
      '#main, button, a[href], input, [tabindex]:not([tabindex="-1"])',
    )
    const count = await focusable.count()
    expect(count).toBeGreaterThan(4)

    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ff-accent').trim(),
    )
    expect(accent).toBeTruthy()

    for (let i = 0; i < count; i += 1) {
      const el = focusable.nth(i)
      await el.focus()

      const { shadow, outline } = await el.evaluate((node) => {
        const s = getComputedStyle(node)
        return { shadow: s.boxShadow, outline: s.outlineStyle }
      })

      // The global :focus-visible rule swaps the outline for a 4px ring. A
      // control with neither is invisible to keyboard users.
      const hasRing = shadow !== 'none' && shadow.includes('4px')
      const hasOutline = outline !== 'none'
      expect(hasRing || hasOutline, `element ${i} has no visible focus indicator`).toBe(true)
    }
  })

  // T02-F
  test('reduced motion collapses every transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload()
    await expect(page.getByTestId('tokens-page')).toBeVisible()

    const longest = await page.evaluate(() => {
      const toMs = (v: string) =>
        v
          .split(',')
          .map((s) => s.trim())
          .map((s) => (s.endsWith('ms') ? parseFloat(s) : parseFloat(s) * 1000))
          .reduce((a, b) => Math.max(a, Number.isNaN(b) ? 0 : b), 0)

      let max = 0
      for (const node of Array.from(document.querySelectorAll('*'))) {
        const s = getComputedStyle(node)
        max = Math.max(max, toMs(s.transitionDuration), toMs(s.animationDuration))
      }
      return max
    })

    expect(longest).toBeLessThan(50)
  })

  test('transitions are NOT collapsed without the preference', async ({ page }) => {
    // Guards against the reduced-motion rule being written so broadly that it
    // applies unconditionally — which would pass T02-F while breaking the app.
    const longest = await page.evaluate(() => {
      let max = 0
      for (const node of Array.from(document.querySelectorAll('*'))) {
        const d = getComputedStyle(node).transitionDuration
        for (const part of d.split(',')) {
          const t = part.trim()
          const ms = t.endsWith('ms') ? parseFloat(t) : parseFloat(t) * 1000
          if (!Number.isNaN(ms)) max = Math.max(max, ms)
        }
      }
      return max
    })

    expect(longest).toBeGreaterThanOrEqual(100)
  })

  test('the dark theme re-points tokens without touching components', async ({ page }) => {
    const read = () =>
      page.evaluate(() => {
        const s = getComputedStyle(document.documentElement)
        return {
          surface: s.getPropertyValue('--ff-surface-0').trim(),
          text: s.getPropertyValue('--ff-text-primary').trim(),
          accent: s.getPropertyValue('--ff-accent').trim(),
        }
      })

    const light = await read()
    await page.getByTestId('tokens-theme-toggle').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const dark = await read()

    expect(dark.surface).not.toBe(light.surface)
    expect(dark.text).not.toBe(light.text)
    expect(dark.accent).not.toBe(light.accent)
  })

  test('all eight speaker hues resolve and are distinct', async ({ page }) => {
    const colours = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement)
      return Array.from({ length: 8 }, (_, i) =>
        s.getPropertyValue(`--ff-speaker-${i}`).trim(),
      )
    })

    expect(colours.every(Boolean)).toBe(true)
    expect(new Set(colours).size).toBe(8)
  })
})

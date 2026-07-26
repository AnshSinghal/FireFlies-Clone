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
  test('every focusable control shows the accent focus ring when tabbed to', async ({ page }) => {
    /*
     * Driven by real Tab presses, not element.focus().
     *
     * :focus-visible is gated on input modality — Chromium will not match it for
     * a button focused by script when the last interaction was not a keypress.
     * A programmatic version of this test passes on a machine where you have
     * already typed and fails on a fresh CI runner, which is exactly what
     * happened. Tabbing is also what T02-E actually asks for.
     */
    const visited: string[] = []

    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab')

      const info = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body || el === document.documentElement) return null

        // Next's dev overlay injects its own focusable button into the page.
        // It is not our UI and is not subject to our focus-ring rule, so it
        // must not be asserted on — and it does not exist in a prod build.
        if (!el.closest('[data-testid="tokens-page"]')) return { outside: true as const }

        const s = getComputedStyle(el)
        return {
          outside: false as const,
          label:
            el.getAttribute('data-testid') ??
            el.getAttribute('placeholder') ??
            el.textContent?.trim().slice(0, 24) ??
            el.tagName,
          shadow: s.boxShadow,
          outline: s.outlineStyle,
          focusVisible: el.matches(':focus-visible'),
        }
      })

      if (!info) break
      if (info.outside) continue
      if (visited.includes(info.label) && visited.length > 3) break
      visited.push(info.label)

      // The global :focus-visible rule replaces the outline with a 4px ring.
      // A control showing neither is invisible to keyboard users.
      const hasRing = info.shadow !== 'none' && info.shadow.includes('4px')
      const hasOutline = info.outline !== 'none'

      expect(
        hasRing || hasOutline,
        `"${info.label}" has no visible focus indicator ` +
          `(focus-visible=${info.focusVisible}, shadow=${info.shadow}, outline=${info.outline})`,
      ).toBe(true)
    }

    expect(visited.length, `tabbed through: ${visited.join(', ')}`).toBeGreaterThan(3)
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

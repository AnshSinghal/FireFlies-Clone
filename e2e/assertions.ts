import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Custom assertions (T-39.8).
 *
 * Each one packages a comparison the suite kept re-deriving inline: token
 * resolution from `00-smoke`/`02-tokens`, the seekbar arithmetic from
 * `16-sync`. Plain async functions rather than `expect.extend` matchers — the
 * suite has three of these, and a call site reads the same either way without
 * the declaration-merging ceremony.
 */

/**
 * Assert a computed style property resolves to exactly what a design token
 * resolves to — `expectToBeToken(row, 'background-color', '--ff-surface-0')`.
 *
 * Both sides are normalised by the browser: the token is applied to a hidden
 * probe element and read back as a COMPUTED value, so a hex token compares
 * equal to the element's `rgb(…)` and the assertion holds in either theme.
 * A missing token fails loudly instead of comparing two empty strings.
 */
export async function expectToBeToken(
  locator: Locator,
  property: string,
  token: `--${string}`,
): Promise<void> {
  const resolved = await locator.evaluate(
    (element, args) => {
      const actual = getComputedStyle(element).getPropertyValue(args.property).trim()

      // The probe joins the document so `var()` resolves against the same
      // `:root[data-theme]` scope the element sees.
      const probe = document.createElement('div')
      probe.style.position = 'absolute'
      probe.style.visibility = 'hidden'
      probe.style.setProperty(args.property, `var(${args.token})`)
      document.body.appendChild(probe)
      const expected = getComputedStyle(probe).getPropertyValue(args.property).trim()
      probe.remove()

      const tokenValue = getComputedStyle(document.documentElement)
        .getPropertyValue(args.token)
        .trim()
      return { actual, expected, tokenValue }
    },
    { property, token },
  )

  expect(resolved.tokenValue, `${token} resolves to nothing — is the token defined?`).not.toBe('')
  expect(resolved.actual, `${property} should come from ${token}`).toBe(resolved.expected)
}

/**
 * Assert the playhead sits at `seconds`, within `toleranceMs`.
 *
 * Position is read from the seekbar's `aria-valuenow` — the value a screen
 * reader is given — which carries whole-second resolution, so the default
 * tolerance is ±1s (the same envelope `16-sync` T21-A established). Polls the
 * lower bound first because a seek lands asynchronously.
 */
export async function expectPlayerTime(
  page: Page,
  seconds: number,
  toleranceMs = 1000,
): Promise<void> {
  const position = () =>
    page
      .getByTestId('player-seekbar')
      .getAttribute('aria-valuenow')
      .then((value) => Number(value) * 1000)

  const target = seconds * 1000
  await expect.poll(position).toBeGreaterThanOrEqual(target - toleranceMs)
  expect(await position()).toBeLessThanOrEqual(target + toleranceMs)
}

/**
 * Assert the transcript's active line is the row at `index` — and that it is
 * the ONLY active line, because two highlights is the classic sync bug.
 *
 * Rows are matched by the `transcript-segment-` testid prefix, excluding the
 * per-row action clusters that share it (the `16-sync` selector).
 */
export async function expectActiveSegment(page: Page, index: number): Promise<void> {
  const rows = page.locator('[data-testid^="transcript-segment-"]:not([data-testid*="actions"])')

  await expect(rows.nth(index)).toHaveAttribute('data-active', 'true')
  await expect(page.getByTestId('transcript-list').locator('[data-active="true"]')).toHaveCount(1)
}

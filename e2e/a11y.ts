import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/**
 * Shared axe scan (T-39.9, feeds T-42).
 *
 * Lifted from the inline scans in `06-toasts` and `07-primitives`, including
 * their tag set. One deliberate difference: this helper fails on SERIOUS and
 * CRITICAL violations only. Minor/moderate findings are worth reading in a
 * report, but failing CI on them turns the a11y gate into noise nobody trusts
 * — the two existing inline scans stay strict about everything because their
 * surfaces are small enough to keep clean.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

interface CheckA11yOptions {
  /** Narrow the scan to one region, e.g. `'[data-testid="notepad-page"]'`. */
  include?: string
  /** Regions to skip — third-party embeds, known-noisy widgets. */
  exclude?: string[]
  /**
   * Rules to switch off, each one a documented decision — and each one owing a
   * replacement assertion, because a disabled rule with nothing in its place is
   * a hole rather than a decision.
   *
   * The only current use is `aria-hidden-focus` in `28-a11y`, where Radix marks
   * the shell `aria-hidden` without `inert` so axe flags every control on the
   * page. The half that was ours is fixed at source in `globals.css`; the half
   * that is not is replaced by asserting the property directly — focus cannot
   * leave the menu.
   *
   * `color-contrast` used to be the recurring case, on ADR-012's grounds that
   * `--ff-text-muted` shipped at 3.14:1. It ships at 4.97:1. Removed from all
   * three call sites in 2026-07-28 after verifying each passes with the rule on.
   */
  disableRules?: string[]
}

export async function checkA11y(page: Page, options: CheckA11yOptions = {}): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags(TAGS)

  if (options.include) builder = builder.include(options.include)
  for (const selector of options.exclude ?? []) builder = builder.exclude(selector)
  if (options.disableRules?.length) builder = builder.disableRules(options.disableRules)

  const results = await builder.analyze()
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  )

  // The message carries enough to fix the finding without re-running locally:
  // rule, impact, and the first offending node per violation.
  const report = blocking
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n` +
        `  ${violation.nodes.length} node(s), e.g. ${violation.nodes[0]?.target.join(' ')}`,
    )
    .join('\n')

  expect(blocking, `axe found serious/critical violations:\n${report}`).toEqual([])
}

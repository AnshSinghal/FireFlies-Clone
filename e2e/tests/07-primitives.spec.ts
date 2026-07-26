import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Core UI primitives (T-10, cases T10-A → T10-M).
 *
 * These run against `/dev/components`, which renders every primitive in every
 * state. That is deliberate: a primitive tested only through the feature that
 * happens to use it is tested in one configuration, and the loading, disabled
 * and error states — the ones that actually break — never get exercised.
 */

async function gallery(page: Page): Promise<void> {
  await page.goto('/dev/components')
  await expect(page.getByTestId('component-gallery')).toBeVisible()
}

test.describe('primitives', () => {
  test.beforeEach(async ({ page }) => gallery(page))

  test('T10-A · toggling loading does not change a button’s width', async ({ page }) => {
    const button = page.getByTestId('loading-button')
    const before = await button.boundingBox()

    await button.click()
    await expect(page.getByTestId('button-spinner')).toBeVisible()

    const after = await button.boundingBox()
    // ±1px for sub-pixel rounding. Anything more shifts every control beside
    // it, and on a toolbar that moves the target out from under the pointer.
    expect(Math.abs(after!.width - before!.width)).toBeLessThanOrEqual(1)
  })

  test('a loading button cannot be clicked again', async ({ page }) => {
    const button = page.getByTestId('loading-button')
    await button.click()
    await expect(button).toBeDisabled()
    await expect(button).toHaveAttribute('aria-busy', 'true')
  })

  test('T10-B · every focusable control shows the focus ring', async ({ page }) => {
    // Tab through the gallery and assert nothing silently killed its outline.
    const checked: string[] = []

    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab')

      const info = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return null
        const style = getComputedStyle(el)
        return {
          tag: el.tagName,
          testId: el.getAttribute('data-testid') ?? '',
          outline: style.outlineStyle,
          shadow: style.boxShadow,
        }
      })

      if (!info) continue
      checked.push(info.testId || info.tag)

      // Either a real outline or the app's shared focus shadow. `outline: none`
      // with nothing in its place is the bug being hunted.
      const visible = info.outline !== 'none' || info.shadow.includes('rgb')
      expect(visible, `${info.tag} ${info.testId} has no visible focus indicator`).toBe(true)
    }

    expect(checked.length).toBeGreaterThan(10)
  })

  test('T10-C · a modal traps focus, closes on Escape and restores focus', async ({ page }) => {
    const trigger = page.getByTestId('open-modal')
    await trigger.click()

    const modal = page.getByTestId('modal')
    await expect(modal).toBeVisible()

    // Focus moved inside.
    expect(await modal.evaluate((el) => el.contains(document.activeElement))).toBe(true)

    // …and stays inside across a full cycle.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      expect(
        await modal.evaluate((el) => el.contains(document.activeElement)),
        `focus escaped the modal on tab ${i + 1}`,
      ).toBe(true)
    }

    await page.keyboard.press('Escape')
    await expect(modal).toBeHidden()

    // Focus returns to what opened it — otherwise a keyboard user is dumped at
    // the top of the document.
    await expect(trigger).toBeFocused()
  })

  test('T10-D · opening a modal locks scroll without shifting the page sideways', async ({
    page,
  }) => {
    const widthBefore = await page.evaluate(() => document.body.getBoundingClientRect().width)

    await page.getByTestId('open-modal').click()
    await expect(page.getByTestId('modal')).toBeVisible()

    const after = await page.evaluate(() => ({
      width: document.body.getBoundingClientRect().width,
      overflow: getComputedStyle(document.body).overflow,
    }))

    expect(after.overflow).toBe('hidden')
    // Removing the scrollbar without compensating for its width jumps the
    // whole page ~15px left, which is the single most obvious modal bug.
    expect(Math.abs(after.width - widthBefore)).toBeLessThanOrEqual(1)
  })

  test('T10-E · Highlighter treats regex metacharacters literally', async ({ page }) => {
    // `a.*b` as a pattern would match the entire string, or throw.
    const marks = page.locator('p', { hasText: 'the a.*b pattern is literal' }).locator('mark')
    await expect(marks).toHaveCount(1)
    await expect(marks.first()).toHaveText('a.*b')
  })

  test('T10-F · Highlighter renders markup as text', async ({ page }) => {
    const node = page.getByTestId('highlighter-script')

    await expect(node).toContainText('<script>')
    // If it had been injected there would be a real <script> element here.
    expect(await node.locator('script').count()).toBe(0)
  })

  test('one match can be marked active', async ({ page }) => {
    const active = page.getByTestId('highlighter-active').locator('mark[data-active="true"]')
    await expect(active).toHaveCount(1)
  })

  test('T10-G · AvatarGroup shows three plus a counted overflow', async ({ page }) => {
    const crowd = page.getByTestId('avatar-group').last()
    const overflow = crowd.getByTestId('avatar-overflow')

    await expect(overflow).toHaveText('+21')

    /*
     * The NAMES are asserted on the element, not in the tooltip.
     *
     * The first version hovered and read the tooltip. It passed on macOS and
     * failed all three CI attempts on Linux — Radix's hover heuristics are not
     * reproducible enough to hang a guarantee on. That turned out to be the
     * right signal rather than a flake: if a headless browser cannot get the
     * names out of "+21", neither can a touch user or a screen reader.
     *
     * So the names moved onto the element and the tooltip became the sighted-
     * pointer convenience it should always have been (asserted separately
     * below, where its absence is not a correctness failure).
     */
    const label = await overflow.getAttribute('aria-label')
    expect(label).toContain('Person 4 Surname')
    expect(label).toContain('and 11 more')
  })

  test('hovering the overflow chip also shows the names visually', async ({ page }) => {
    const overflow = page.getByTestId('avatar-group').last().getByTestId('avatar-overflow')
    await overflow.scrollIntoViewIfNeeded()

    // Move somewhere neutral first: Radix tracks pointer transit, and a hover
    // that teleports onto the trigger is not the gesture it listens for.
    const box = (await overflow.boundingBox())!
    await page.mouse.move(box.x - 120, box.y + box.height / 2)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 })

    const tooltip = page.getByTestId('tooltip')
    await expect(tooltip).toBeVisible()
    await expect(tooltip).toContainText('Person 4 Surname')
  })

  test('T10-H · dragging the panel handle past the minimum clamps at 30%', async ({ page }) => {
    const panels = page.getByTestId('resizable-panels')
    await panels.scrollIntoViewIfNeeded()

    const handle = page.getByTestId('panel-handle')
    const box = (await panels.boundingBox())!
    const handleBox = (await handle.boundingBox())!

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await page.mouse.down()
    // Aim at 20% — well past the clamp.
    await page.mouse.move(box.x + box.width * 0.2, handleBox.y + handleBox.height / 2, { steps: 8 })
    await page.mouse.up()

    await expect(handle).toHaveAttribute('aria-valuenow', '30')
  })

  test('T10-I · double-clicking the handle resets the split to 50%', async ({ page }) => {
    const handle = page.getByTestId('panel-handle')
    await handle.scrollIntoViewIfNeeded()

    // Move it off centre first, or the assertion passes without doing anything.
    await handle.focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(handle).not.toHaveAttribute('aria-valuenow', '50')

    await handle.dblclick()
    await expect(handle).toHaveAttribute('aria-valuenow', '50')
  })

  test('the panel handle is keyboard-resizable', async ({ page }) => {
    // A split a mouse can adjust and a keyboard cannot is a split half the
    // users cannot adjust.
    const handle = page.getByTestId('panel-handle')
    await handle.scrollIntoViewIfNeeded()
    await handle.focus()

    await handle.dblclick()
    await expect(handle).toHaveAttribute('aria-valuenow', '50')

    await handle.focus()
    await page.keyboard.press('ArrowRight')
    await expect(handle).toHaveAttribute('aria-valuenow', '52')
    await page.keyboard.press('ArrowLeft')
    await expect(handle).toHaveAttribute('aria-valuenow', '50')
  })

  test('T10-J · a double-clicked confirm fires its action exactly once', async ({ page }) => {
    await page.getByTestId('open-confirm').click()
    const confirm = page.getByTestId('confirm-dialog-confirm')
    await expect(confirm).toBeVisible()

    // Two clicks inside one frame. The ref guard is what stops the second —
    // `disabled` only applies from the next render.
    await confirm.dblclick()

    await expect(page.getByTestId('confirm-dialog')).toBeHidden()
    // One toast, not two. Identical toasts would dedupe into `×2`, so the
    // absence of a counter is the proof.
    await expect(page.getByTestId('toast')).toHaveCount(1)
    await expect(page.getByTestId('toast-count')).toHaveCount(0)
  })

  test('a destructive confirm focuses Cancel, not Delete', async ({ page }) => {
    await page.getByTestId('open-confirm').click()

    // Enter still travelling from the keystroke that opened the dialog must
    // not destroy anything.
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused()
  })

  test('a confirm dialog names what it is about to delete', async ({ page }) => {
    await page.getByTestId('open-confirm').click()
    const dialog = page.getByTestId('confirm-dialog')

    // Bolded, so the user can see WHICH meeting rather than trusting the row
    // selection.
    await expect(dialog.locator('span.text-body-strong')).toHaveText('Q3 Product Roadmap Sync')
  })

  test('T10-K · a dropdown near the right edge flips to stay on screen', async ({ page }) => {
    const trigger = page.getByTestId('gallery-dropdown').or(page.getByText('Open menu')).first()
    await trigger.scrollIntoViewIfNeeded()
    await trigger.click()

    const menu = page.getByTestId('gallery-dropdown')
    await expect(menu).toBeVisible()

    const box = (await menu.boundingBox())!
    const viewport = page.viewportSize()!

    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  })

  test('a dropdown is keyboard navigable and closes on Escape', async ({ page }) => {
    const trigger = page.getByText('Open menu').first()
    await trigger.scrollIntoViewIfNeeded()
    await trigger.click()

    const menu = page.getByTestId('gallery-dropdown')
    await expect(menu).toBeVisible()

    await page.keyboard.press('ArrowDown')
    await expect(menu.locator('[data-highlighted]')).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('a disabled dropdown item cannot be selected', async ({ page }) => {
    const trigger = page.getByText('Open menu').first()
    await trigger.scrollIntoViewIfNeeded()
    await trigger.click()

    const disabled = page.getByRole('menuitem', { name: 'Disabled item' })
    await expect(disabled).toHaveAttribute('data-disabled', '')
  })

  test('the meeting row skeleton is exactly 72px tall', async ({ page }) => {
    // It stands in for the real row; a different height means content jumps
    // when data lands.
    const skeleton = page.getByTestId('meeting-row-skeleton')
    await skeleton.scrollIntoViewIfNeeded()
    expect((await skeleton.boundingBox())!.height).toBe(72)
  })

  test('every icon-only control has an accessible name', async ({ page }) => {
    // The recurring a11y deduction the plan calls out.
    const unnamed = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .filter((el) => (el.textContent ?? '').trim() === '')
        .filter((el) => !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby'))
        .map((el) => el.outerHTML.slice(0, 120)),
    )
    expect(unnamed).toEqual([])
  })

  test('a toggle chip reports its pressed state', async ({ page }) => {
    const chip = page.getByTestId('gallery-toggle-chip')
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
  })

  test('a removable chip names what it removes', async ({ page }) => {
    // "Remove" alone is useless in a list of identical buttons.
    await expect(page.getByRole('button', { name: 'Remove roadmap' })).toBeVisible()
  })

  test('no VISIBLE native select survives', async ({ page }) => {
    /*
     * A native <select> beside custom inputs is the "looks unfinished" failure
     * T-10.4 exists to prevent.
     *
     * The assertion started as `select` count === 0 and was intermittently
     * wrong: Radix renders a 1×1 `aria-hidden` <select> as its form-integration
     * shim, which appears once the trigger detects a form context. That element
     * is invisible and removed from the accessibility tree — it is not the
     * thing being guarded against. So the check is for a select that a user
     * could actually SEE.
     */
    const visibleNative = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll('select')).filter(
          (el) => el.getAttribute('aria-hidden') !== 'true',
        ).length,
    )
    expect(visibleNative).toBe(0)
  })

  test('T10-L · the gallery is axe-clean', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      // ADR-012: `--ff-text-muted` is a recorded, tested deviation from AA to
      // stay close to the reference. Every other rule is enforced.
      .disableRules(['color-contrast'])
      .analyze()

    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    expect(serious).toEqual([])
  })
})

test.describe('primitives · reduced motion', () => {
  test('skeletons go static rather than shimmering fast', async ({ page }) => {
    // `emulateMedia`, not `test.use({ reducedMotion })`. The project-level `use`
    // in playwright.config.ts wins over the file-level one here, so the media
    // query never actually matched — `matchMedia(...).matches` was false while
    // the test claimed to be asserting reduced-motion behaviour.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await gallery(page)

    // The blanket 0.01ms rule would leave the gradient parked mid-sweep, which
    // reads as a rendering fault. The reduced-motion form is a flat block.
    const style = await page
      .getByTestId('skeleton')
      .first()
      .evaluate((el) => ({
        animation: getComputedStyle(el).animationName,
        image: getComputedStyle(el).backgroundImage,
      }))

    expect(style.animation).toBe('none')
    expect(style.image).toBe('none')
  })
})

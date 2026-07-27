import { expect, test, type Page } from '@playwright/test'

/**
 * Left rail (T-07, cases T07-A → T07-L).
 *
 * The rail is the first thing an evaluator sees, so these assert on COMPUTED
 * values rather than on class names — a test that checks for `bg-accent-subtle`
 * passes even when the token behind it is broken.
 */

/** Resolve a design token to the value the browser actually computed. */
async function token(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  )
}

/**
 * Wait until the rail has fully settled before measuring it.
 *
 * The rail renders a Suspense skeleton first (useSearchParams suspends), and
 * the channels list arrives later still. Measuring before both land reads the
 * skeleton's geometry or a half-populated list — which showed up as four
 * intermittently-failing geometry tests rather than as an obvious error.
 */
async function railReady(page: Page): Promise<void> {
  await expect(page.getByTestId('sidebar-item-meetings')).toBeVisible()
  await expect(page.getByTestId('sidebar-channel-all-meetings')).toBeVisible()
}

/** Tokens are authored as hex; getComputedStyle reports rgb(). */
function hexToRgb(hex: string): string {
  const value = hex.replace('#', '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value
  const n = parseInt(full, 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

// ── T07-A · active state ────────────────────────────────────────────────────

test('the active item uses the accent tint, accent text and weight 600', async ({ page }) => {
  await page.goto('/notebook')

  const item = page.getByTestId('sidebar-item-meetings')
  await expect(item).toHaveAttribute('aria-current', 'page')

  const styles = await item.evaluate((el) => {
    const s = getComputedStyle(el)
    return { background: s.backgroundColor, color: s.color, weight: s.fontWeight }
  })

  expect(styles.background).toBe(hexToRgb(await token(page, '--ff-accent-subtle')))
  expect(styles.color).toBe(hexToRgb(await token(page, '--ff-accent-strong')))
  expect(Number(styles.weight)).toBeGreaterThanOrEqual(600)
})

test('exactly one item is active at a time', async ({ page }) => {
  await page.goto('/notebook')
  await expect(page.getByTestId('sidebar').locator('[aria-current="page"]')).toHaveCount(1)
})

test('the active pill is inset from both rail edges, not full-bleed', async ({ page }) => {
  // Measured at 12px in the reference. A full-bleed highlight touching both
  // edges is explicitly on the do-not-ship list.
  await page.goto('/notebook')
  await railReady(page)

  const rail = await page.getByTestId('sidebar-rail').boundingBox()
  const pill = await page.getByTestId('sidebar-item-meetings').boundingBox()

  expect(pill!.x - rail!.x).toBeGreaterThanOrEqual(8)
  expect(rail!.x + rail!.width - (pill!.x + pill!.width)).toBeGreaterThanOrEqual(8)
})

test('items are 36px tall, matching the reference', async ({ page }) => {
  await page.goto('/notebook')
  await railReady(page)

  const box = await page.getByTestId('sidebar-item-meetings').boundingBox()
  expect(Math.round(box!.height)).toBe(36)
})

// ── T07-B / T07-C · prefix matching ─────────────────────────────────────────

test('a meeting detail page keeps Meetings lit', async ({ page }) => {
  // The route itself lands in T-18; what matters here is that a child path does
  // not orphan the nav, which the 404 rendered inside the shell proves equally.
  await page.goto('/meeting/1')
  await expect(page.getByTestId('sidebar-item-meetings')).toHaveAttribute('aria-current', 'page')
})

test('a settings sub-page keeps Settings lit and Meetings dark', async ({ page }) => {
  await page.goto('/settings/recording')

  await expect(page.getByTestId('sidebar-item-settings')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('sidebar-item-meetings')).not.toHaveAttribute(
    'aria-current',
    'page',
  )
})

// ── T07-D · hover ───────────────────────────────────────────────────────────

test('hover and active are visibly different', async ({ page }) => {
  // "hover and active looking the same" is on the do-not-ship list.
  await page.goto('/notebook')

  const idle = page.getByTestId('sidebar-item-uploads')
  const active = page.getByTestId('sidebar-item-meetings')

  const activeBefore = await active.evaluate((el) => getComputedStyle(el).backgroundColor)

  await idle.hover()

  // Poll until the 120ms colour transition settles. Sampling immediately
  // catches it mid-fade — rgba(244, 245, 247, 0.937) rather than the final
  // rgb(244, 245, 247) — which looks like a wrong colour but is just a
  // wrongly-timed read.
  const expected = hexToRgb(await token(page, '--ff-surface-hover'))
  await expect(async () => {
    const hovered = await idle.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(hovered).toBe(expected)
  }).toPass({ timeout: 2000 })

  expect(expected).not.toBe(activeBefore)

  const activeAfter = await active.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(activeAfter).toBe(activeBefore)
})

// ── T07-E / T07-F · collapse ────────────────────────────────────────────────

test('the toggle collapses the rail and the choice survives a reload', async ({ page }) => {
  await page.goto('/notebook')
  await railReady(page)

  const rail = page.getByTestId('sidebar-rail')
  const expanded = (await rail.boundingBox())!.width
  expect(expanded).toBe(240)

  await page.getByTestId('sidebar-toggle').click()
  await expect(async () => {
    expect(Math.round((await rail.boundingBox())!.width)).toBe(64)
  }).toPass()

  // Labels leave the DOM rather than merely hiding — a 240px label inside a
  // 64px rail wraps mid-animation and the rail visibly jitters.
  await expect(page.getByTestId('sidebar-item-meetings')).not.toContainText('Meetings')

  const stored = await page.evaluate(() => localStorage.getItem('ff.sidebar.collapsed'))
  expect(stored).toBe('true')

  await page.reload()
  await expect(async () => {
    expect(Math.round((await rail.boundingBox())!.width)).toBe(64)
  }).toPass()
})

// ── T07-G / T07-H · tooltips ────────────────────────────────────────────────

test('a collapsed item shows a tooltip; an expanded one does not', async ({ page }) => {
  await page.goto('/notebook')

  // Expanded: the label is already visible, so a tooltip repeating it is noise.
  await page.getByTestId('sidebar-item-uploads').hover()
  await page.waitForTimeout(600)
  await expect(page.getByTestId('sidebar-tooltip')).toHaveCount(0)

  await page.getByTestId('sidebar-toggle').click()
  await expect(async () => {
    expect(Math.round((await page.getByTestId('sidebar-rail').boundingBox())!.width)).toBe(64)
  }).toPass()

  await page.getByTestId('sidebar-item-uploads').hover()
  await expect(page.getByTestId('sidebar-tooltip').first()).toContainText('Uploads')
})

// ── T07-I · placeholder routes are navigable ────────────────────────────────

test('a Soon item still navigates rather than sitting dead', async ({ page }) => {
  // An item that refuses to respond reads as broken, and the evaluator WILL
  // click it to check (T-07.12).
  await page.goto('/notebook')

  await expect(page.getByTestId('sidebar-item-apps')).toContainText('Soon')
  await page.getByTestId('sidebar-item-apps').click()

  await expect(page).toHaveURL(/\/apps$/)
  await expect(page.getByRole('heading', { name: 'AI Apps' })).toBeVisible()
  await expect(page.getByTestId('sidebar-item-apps')).toHaveAttribute('aria-current', 'page')
})

// ── T07-J · mobile drawer ───────────────────────────────────────────────────

test.describe('mobile drawer', () => {
  test.use({ viewport: { width: 600, height: 900 } })

  test('opens from the toggle, closes on Escape, and returns focus', async ({ page }) => {
    await page.goto('/notebook')

    await expect(page.getByTestId('sidebar-rail')).toBeHidden()

    await page.getByTestId('sidebar-toggle').click()
    const drawer = page.getByTestId('sidebar-drawer')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByTestId('sidebar-item-meetings')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()

    // Focus must come back to the toggle, or reopening needs a mouse.
    await expect(page.getByTestId('sidebar-toggle')).toBeFocused()
  })

  test('closes on backdrop click and on navigation', async ({ page }) => {
    await page.goto('/notebook')

    await page.getByTestId('sidebar-toggle').click()
    await page.getByTestId('sidebar-drawer-backdrop').click()
    await expect(page.getByTestId('sidebar-drawer')).toBeHidden()

    await page.getByTestId('sidebar-toggle').click()
    await page.getByTestId('sidebar-drawer').getByTestId('sidebar-item-uploads').click()

    await expect(page).toHaveURL(/\/upload$/)
    // Leaving the drawer open over the page you just navigated to is the bug
    // this catches.
    await expect(page.getByTestId('sidebar-drawer')).toBeHidden()
  })
})

// ── T07-K · keyboard ────────────────────────────────────────────────────────

test('every rail item is reachable by keyboard with a visible focus ring', async ({ page }) => {
  await page.goto('/notebook')
  // Enumerating before channels land makes the list grow mid-iteration and
  // nth(i) goes stale.
  await railReady(page)

  const items = page.getByTestId('sidebar').getByRole('link')
  const count = await items.count()
  expect(count).toBeGreaterThan(6)

  for (let i = 0; i < count; i += 1) {
    const item = items.nth(i)
    await item.focus()

    const { shadow, outline } = await item.evaluate((el) => {
      const s = getComputedStyle(el)
      return { shadow: s.boxShadow, outline: s.outlineStyle }
    })
    expect(shadow !== 'none' || outline !== 'none').toBe(true)
  }
})

test('the nav is a landmark with list semantics', async ({ page }) => {
  await page.goto('/notebook')
  await railReady(page)

  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  // Screen readers announce "list, N items" — without it the rail is an
  // undifferentiated run of links.
  expect(await page.getByTestId('sidebar').getByRole('list').count()).toBeGreaterThan(0)
})

// ── Channels ────────────────────────────────────────────────────────────────

test('channels render from the API with live counts', async ({ page }) => {
  await page.goto('/notebook')

  const section = page.getByTestId('sidebar-section-channels')
  await expect(section).toContainText('Channels')

  // Seeded channels — a private one included, so the lock affordance has an
  // example.
  await expect(page.getByTestId('sidebar-channel-design-team')).toBeVisible()
  await expect(page.getByTestId('sidebar-channel-leadership')).toBeVisible()

  // All Meetings must equal the Notebook's own total, or the rail is lying.
  await expect(page.getByTestId('sidebar-channel-all-meetings')).toContainText('8')
})

test('the rail degrades rather than disappearing when channels fail', async ({ page }) => {
  await page.route('**/api/v1/channels', (route) => route.fulfill({ status: 500, body: '{}' }))
  await page.goto('/notebook')

  // Primary nav and footer must still render — a failed count query cannot take
  // navigation with it.
  await expect(page.getByTestId('sidebar-item-meetings')).toBeVisible()
  await expect(page.getByTestId('sidebar-item-settings')).toBeVisible()
})

// ── Structure ───────────────────────────────────────────────────────────────

test('Settings is pinned to the bottom, not floating mid-list', async ({ page }) => {
  await page.goto('/notebook')
  await railReady(page)

  const rail = await page.getByTestId('sidebar-rail').boundingBox()
  const settings = await page.getByTestId('sidebar-item-settings').boundingBox()

  // Within 120px of the rail's bottom edge — below Help & Support, and nowhere
  // near the primary group.
  expect(rail!.y + rail!.height - (settings!.y + settings!.height)).toBeLessThan(120)
})

test('the rail is white, not grey or dark', async ({ page }) => {
  // "a dark-navy sidebar (that's Notion/Linear, not Fireflies)" — and the
  // reference is white-on-white, not the grey the plan specified.
  await page.goto('/notebook')

  const background = await page
    .getByTestId('sidebar')
    .evaluate((el) => getComputedStyle(el).backgroundColor)

  expect(background).toBe(hexToRgb(await token(page, '--ff-surface-0')))
})

test('the two built-in views list meetings rather than emptying the Notebook', async ({ page }) => {
  /*
   * `all-meetings` and `my-meetings` are FILTERS over the same data, not
   * stored channels — so passing either to the API's `channel` filter, which
   * matches a stored slug, narrowed the list to nothing. Both rail items led
   * to an empty Notebook, which is a lot of the app to lose to a naming
   * collision nobody had asserted on.
   */
  await page.goto('/notebook')
  await railReady(page)

  /** The rail's own badge, once the count has actually arrived. */
  async function badge(id: string): Promise<number> {
    const item = page.getByTestId(`sidebar-channel-${id}`)
    // The channels request lands after the rail paints, so reading the text
    // before this resolves reads the label without its number.
    await expect(item).toContainText(/\d/)
    return Number((await item.innerText()).match(/\d+/)![0])
  }

  const total = await badge('all-meetings')
  const mine = await badge('my-meetings')
  expect(total).toBeGreaterThan(0)
  expect(mine).toBeGreaterThan(0)

  await page.getByTestId('sidebar-channel-all-meetings').click()
  await expect(page).toHaveURL(/channel=all-meetings/)
  await expect(page.getByTestId('meeting-list')).toBeVisible()
  await expect(page.getByTestId('meeting-row')).toHaveCount(total)

  // "My Meetings" is hosted-by-me, the same definition the rail's count uses —
  // so the badge and the list have to agree.
  await page.getByTestId('sidebar-channel-my-meetings').click()
  await expect(page).toHaveURL(/channel=my-meetings/)
  await expect(page.getByTestId('meeting-list')).toBeVisible()
  await expect(page.getByTestId('meeting-row')).toHaveCount(mine)
})

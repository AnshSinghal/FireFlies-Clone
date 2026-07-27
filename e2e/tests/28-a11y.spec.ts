import type { Page } from '@playwright/test'

import { checkA11y } from '../a11y'
import { expectPlayerTime } from '../assertions'
import { expect, test } from '../fixtures'
import {
  CreateModal,
  FiltersPanel,
  NotebookPage,
  NotepadPage,
  PlayerComponent,
  TranscriptComponent,
} from '../pages'

/**
 * Accessibility (T-40.12, previewing T-42.2).
 *
 * Three claims, in three describes: axe finds nothing serious on the eight key
 * surfaces in either theme; the whole app is traversable by keyboard with a
 * visible focus indicator at every stop; and every modal traps focus, closes
 * on Escape, and puts focus back where it came from. The details drawer is
 * the deliberate exception — `aria-modal="false"`, so its test asserts the
 * NON-modal contract instead (see the case itself).
 *
 * First consumer of the T-39 infra end to end: POMs for every selector,
 * `checkA11y` for the axe gate, the frozen-clock fixture riding along.
 *
 * The tag editor from the T-40.12 brief has no test here because T-36 (tags)
 * is not merged — there is no tag editor in this build to verify.
 */

type Theme = 'light' | 'dark'
const THEMES: readonly Theme[] = ['light', 'dark']

/**
 * The T-38 mechanism: the boot script inlined in <head> reads `ff.theme`
 * before first paint, so seeding storage before navigation is exactly what a
 * returning user with a saved preference looks like (same helper as
 * `25-dark-mode`).
 */
async function inTheme(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript(
    (value) => localStorage.setItem('ff.theme', JSON.stringify(value)),
    theme,
  )
}

// ── Surface openers ─────────────────────────────────────────────────────────

async function openNotebook(page: Page): Promise<NotebookPage> {
  const notebook = new NotebookPage(page)
  await notebook.goto()
  await expect(notebook.list).toBeVisible({ timeout: 20_000 })
  // Rows, not skeletons — axe on a loading shimmer proves nothing.
  await expect(notebook.rows.first()).toBeVisible()
  return notebook
}

async function openNotepad(page: Page, meetingId: number): Promise<NotepadPage> {
  const notepad = new NotepadPage(page)
  await notepad.goto(meetingId)
  // At 1440px both panels render; waiting for summary AND transcript rows
  // means the scan sees real content on both sides, not placeholders.
  await expect(notepad.summaryPanel).toBeVisible({ timeout: 25_000 })
  const transcript = new TranscriptComponent(page)
  await expect(transcript.rows.first()).toBeVisible({ timeout: 15_000 })
  return notepad
}

async function openDeleteDialog(page: Page): Promise<NotebookPage> {
  const notebook = await openNotebook(page)
  const row = notebook.row(0)
  await row.hover()
  await notebook.kebabOf(row).click()
  await page.getByTestId('meeting-row-delete').click()
  await expect(page.getByTestId('delete-dialog')).toBeVisible()
  return notebook
}

// ── Focus helpers ───────────────────────────────────────────────────────────

/** `data-testid` of the focused element — '' when focus sits on body. */
function focusedTestId(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '')
}

/** Whether focus is anywhere inside the element carrying `testId`. */
function focusWithin(page: Page, testId: string): Promise<boolean> {
  return page.evaluate(
    (id) => Boolean(document.activeElement?.closest(`[data-testid="${id}"]`)),
    testId,
  )
}

/**
 * Press Tab until `predicate` holds. The bound is the trap detector: a focus
 * loop that never reaches the target burns the budget and fails with a name,
 * instead of hanging the test.
 */
async function tabUntil(
  page: Page,
  target: string,
  predicate: () => Promise<boolean>,
  maxTabs = 60,
): Promise<void> {
  for (let i = 0; i < maxTabs; i += 1) {
    await page.keyboard.press('Tab')
    if (await predicate()) return
  }
  throw new Error(
    `Tabbed ${maxTabs}× without reaching ${target} — keyboard trap or unreachable control`,
  )
}

/**
 * The focused element must LOOK focused (T-42.2's real requirement).
 *
 * Same detection as `02-tokens` T02-E: the global :focus-visible rule paints
 * a 4px ring via box-shadow (`--ff-shadow-focus`), and anything not covered
 * by it must at least keep its outline. Driven by real Tab presses upstream,
 * because Chromium only matches :focus-visible for keyboard-driven focus.
 */
async function expectVisibleFocus(page: Page, label: string): Promise<void> {
  const info = await page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body || el === document.documentElement) return null
    const style = getComputedStyle(el)
    return {
      testid: el.getAttribute('data-testid') ?? el.tagName.toLowerCase(),
      shadow: style.boxShadow,
      outline: style.outlineStyle,
    }
  })

  expect(info, `${label}: nothing is focused`).not.toBeNull()
  const hasRing = info!.shadow !== 'none' && info!.shadow.includes('4px')
  const hasOutline = info!.outline !== 'none'
  expect(
    hasRing || hasOutline,
    `${label} ("${info!.testid}") has no visible focus indicator ` +
      `(shadow=${info!.shadow}, outline=${info!.outline})`,
  ).toBe(true)
}

/**
 * Tab (and Shift+Tab) never leave the container. `tabs` deliberately exceeds
 * the widest dialog's tabbable count, so the cycle provably wraps rather than
 * stopping at the last control.
 */
async function expectFocusTrapped(page: Page, testId: string, tabs = 12): Promise<void> {
  for (let i = 0; i < tabs; i += 1) {
    await page.keyboard.press('Tab')
    expect(
      await focusWithin(page, testId),
      `Tab ×${i + 1}: focus escaped [data-testid="${testId}"]`,
    ).toBe(true)
  }
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('Shift+Tab')
    expect(
      await focusWithin(page, testId),
      `Shift+Tab ×${i + 1}: focus escaped [data-testid="${testId}"]`,
    ).toBe(true)
  }
}

// ── 1 · axe on the eight key surfaces, per theme ────────────────────────────

for (const theme of THEMES) {
  test.describe(`axe · ${theme}`, () => {
    test.beforeEach(async ({ page }) => inTheme(page, theme))

    test('the notebook list is clean', async ({ page }) => {
      await openNotebook(page)
      await checkA11y(page)
    })

    test('the notebook with the filters panel open is clean', async ({ page }) => {
      await openNotebook(page)
      const filters = new FiltersPanel(page)
      await filters.open()
      await expect(filters.panel).toBeVisible()
      await checkA11y(page)
    })

    test('the notepad with the summary in view is clean', async ({ page, seededMeeting }) => {
      await openNotepad(page, seededMeeting.id)
      await checkA11y(page)
    })

    test('the transcript panel is clean', async ({ page, seededMeeting }) => {
      await openNotepad(page, seededMeeting.id)
      await checkA11y(page, { include: '[data-testid="transcript-panel"]' })
    })

    test('the player region is clean', async ({ page, seededMeeting }) => {
      await openNotepad(page, seededMeeting.id)
      const player = new PlayerComponent(page)
      await expect(player.root).toBeVisible()
      await checkA11y(page, { include: '[data-testid="player"]' })
    })

    test('the create modal is clean', async ({ page }) => {
      const create = new CreateModal(page)
      await create.open('upload')
      await expect(create.modal).toBeVisible({ timeout: 20_000 })
      await checkA11y(page)
    })

    test('the delete confirmation is clean', async ({ page }) => {
      await openDeleteDialog(page)
      await checkA11y(page)
    })

    test('the settings page is clean', async ({ page }) => {
      await page.goto('/settings')
      await expect(page.getByTestId('settings-view')).toBeVisible({ timeout: 20_000 })
      await checkA11y(page)
    })
  })
}

// ── 2 · keyboard traversal ──────────────────────────────────────────────────

test.describe('keyboard traversal', () => {
  test('notebook: skip link → topbar → sidebar → list → Enter opens the meeting', async ({
    page,
  }) => {
    await openNotebook(page)

    // The very first Tab is the skip link (T-42.3) — visually hidden until
    // focused, so `expectVisibleFocus` would misread its sr-only styling; the
    // meaningful claim is that it IS the first stop and receives focus.
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()

    // DOM order is topbar, then the sidebar rail, then main (app-shell).
    await tabUntil(page, 'the topbar', () => focusWithin(page, 'topbar'))
    await expectVisibleFocus(page, 'a topbar control')

    await tabUntil(page, 'the sidebar', () => focusWithin(page, 'sidebar'))
    await expectVisibleFocus(page, 'a sidebar item')

    // A row's focusable anchor is `meeting-row-{id}`.
    await tabUntil(page, 'a meeting row', async () =>
      /^meeting-row-\d+$/.test(await focusedTestId(page)),
    )
    await expectVisibleFocus(page, 'a meeting row')

    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/meeting\/\d+/)
    await expect(new NotepadPage(page).root).toBeVisible({ timeout: 25_000 })
  })

  test('notepad: tab reaches the player, then a transcript line, and Enter seeks', async ({
    page,
    seededMeeting,
  }) => {
    await openNotepad(page, seededMeeting.id)

    // The summary panel sits between the header and the player in DOM order
    // and is dense with controls, hence the generous budget. Reaching the
    // player at all is the "no keyboard trap" claim for everything before it.
    // Inside the player the seekbar tabs FIRST: the card stacks waveform →
    // seekbar → transport (player-card.tsx), and tab order follows the DOM.
    await tabUntil(
      page,
      'the seekbar',
      async () => (await focusedTestId(page)) === 'player-seekbar',
      150,
    )
    await expectVisibleFocus(page, 'the seekbar')

    await tabUntil(
      page,
      'the play button',
      async () => (await focusedTestId(page)) === 'player-play',
      30,
    )
    await expectVisibleFocus(page, 'the play button')

    // A transcript line's keyboard affordance is its timestamp button —
    // hover-hidden on continuation lines but revealed on :focus-visible.
    await tabUntil(
      page,
      'a transcript timestamp',
      async () => /^transcript-timestamp-\d+$/.test(await focusedTestId(page)),
      60,
    )
    await expectVisibleFocus(page, 'a transcript timestamp')

    // "Play from MM:SS" — the button's visible text is the seek target.
    const time = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')
    expect(time).toMatch(/^\d+(?::\d\d)+$/)
    const seconds = time
      .split(':')
      .map(Number)
      .reduce((total, part) => total * 60 + part, 0)

    await page.keyboard.press('Enter')
    await expectPlayerTime(page, seconds)
  })
})

// ── 3 · focus traps ─────────────────────────────────────────────────────────

test.describe('focus traps', () => {
  test('create modal: trapped, Escape returns to the notebook', async ({ page }) => {
    await openNotebook(page)
    await page.getByTestId('topbar-new-button').click()
    await page.getByTestId('new-upload').click()

    const create = new CreateModal(page)
    await expect(create.modal).toBeVisible({ timeout: 20_000 })
    await expectFocusTrapped(page, 'create-modal')

    await page.keyboard.press('Escape')
    await expect(create.modal).toBeHidden()
    // The create modal is a ROUTE (/upload), so "close" is a navigation home.
    await expect(page).toHaveURL(/\/notebook/)
  })

  test('delete confirm: trapped, Escape restores focus to the opener', async ({ page }) => {
    const notebook = await openDeleteDialog(page)
    await expectFocusTrapped(page, 'delete-dialog', 8)

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('delete-dialog')).toBeHidden()
    // The kebab that spawned the menu that spawned the dialog — the Modal
    // primitive captures it at open (T10-C) and hands focus back on close.
    await expect(notebook.kebabOf(notebook.row(0))).toBeFocused()
  })

  test('details drawer: non-modal by design, Escape restores focus to the row', async ({
    page,
  }) => {
    const notebook = await openNotebook(page)
    const row = notebook.row(0)
    await row.hover()
    await row.getByTestId('meeting-row-details').click()
    const drawer = page.getByTestId('details-drawer')
    await expect(drawer).toBeVisible()
    // The LOADED body, not the aside: while the drawer still shows its
    // skeleton it contains zero tabbable elements, so a fast tab loop would
    // pass straight through it, wrap to the topbar, and drown in the search
    // popup's links — the one flake this test ever produced.
    await expect(page.getByTestId('details-close')).toBeVisible()
    const id = new URL(page.url()).searchParams.get('details')

    /*
     * NOT a focus trap, and that is the design, not an omission: the drawer
     * declares `aria-modal="false"` and the list behind it stays interactive
     * (T-15 — "the Notebook is STILL THERE"). Trapping focus inside a
     * non-modal dialog would contradict the semantics it declares. The
     * keyboard contract to verify is the non-modal one: the drawer is
     * REACHABLE by Tab, Escape closes it from wherever focus is, and focus
     * lands back on the row that opened it (T15-C).
     */
    await expect(drawer).toHaveAttribute('aria-modal', 'false')
    await tabUntil(page, 'the details drawer', () => focusWithin(page, 'details-drawer'), 80)
    await expectVisibleFocus(page, 'a drawer control')

    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(page.getByTestId(`meeting-row-${id}`)).toBeFocused()
  })

  test('export modal: trapped, Escape restores focus to the kebab', async ({
    page,
    seededMeeting,
  }) => {
    const notepad = await openNotepad(page, seededMeeting.id)
    await notepad.kebab.click()
    await page.getByTestId('notepad-export').click()
    await expect(page.getByTestId('export-modal')).toBeVisible()

    await expectFocusTrapped(page, 'export-modal')

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('export-modal')).toBeHidden()
    await expect(notepad.kebab).toBeFocused()
  })
})

test.describe('axe · narrow viewports', () => {
  /*
   * The sweep above runs at 1440px, which is where an entire class of defect
   * hides: a control whose LABEL is `hidden md:inline` is a named button on
   * desktop and a nameless icon below 768px. Lighthouse found exactly that on
   * the topbar's New button — it emulates a phone, and this suite did not.
   *
   * 393px is the plan's phone width (T-42.13's sibling), and these are the two
   * surfaces the brief is graded on.
   */
  for (const [name, path] of [
    ['notebook', '/notebook'],
    ['notepad', '/meeting/1'],
  ] as const) {
    test(`T42-A · ${name} is clean at 393px @mobile`, async ({ page }) => {
      await page.setViewportSize({ width: 393, height: 852 })
      await page.goto(path)
      await expect(
        page.getByTestId(name === 'notebook' ? 'meeting-list' : 'notepad-page'),
      ).toBeVisible({ timeout: 20_000 })

      await checkA11y(page)
    })
  }

  test('every icon-only control in the topbar is named at 393px @mobile', async ({ page }) => {
    // The specific claim behind the fix, asserted directly rather than left to
    // axe's ruleset: below `md` the topbar is all icons, and each has to say
    // what it does.
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/notebook')
    await expect(page.getByTestId('meeting-list')).toBeVisible({ timeout: 20_000 })

    const nameless: string[] = []
    for (const button of await page.getByTestId('topbar').getByRole('button').all()) {
      const name = (await button.getAttribute('aria-label')) ?? (await button.innerText()).trim()
      if (!name) nameless.push((await button.getAttribute('data-testid')) ?? '(no testid)')
    }

    expect(nameless).toEqual([])
  })
})

import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Tags — chips, editor, filters, settings (T-36, cases T36-A → T36-L).
 *
 * Two describes because the cases split cleanly by whether they write:
 *
 * - The FILTER cases (T36-C/D/E) and the colour-identity case (T36-L) only
 *   read the seeded library, so they run untagged in the read-only project,
 *   before any writer can disturb the seeded counts.
 * - Everything else mutates and carries `@mutates`, running serially in the
 *   mutations project. Order inside the file is load-bearing: A restores what
 *   it adds, I restores meeting 1 to its seeded three tags, K creates the
 *   `follow-up` tag that H then deletes (asserting the blast radius on the
 *   way out), and G's merge runs last because it permanently folds `roadmap`
 *   into `product`.
 *
 * Seeded tag math this file leans on (8 meetings, anchored seeds):
 *   engineering ×5 (01,03,04,05,08) · product ×3 (01,04,07)
 *   roadmap ×2 (01,07) · customer ×2 (02,06) · urgent ×2 (06,08)
 *   sales ×1 (02) · hiring ×1 (05)
 */

async function notebook(page: Page): Promise<void> {
  await page.goto('/notebook')
  await expect(page.getByTestId('meeting-list')).toBeVisible()
}

const count = (page: Page) => page.getByTestId('notebook-count')

/** A meeting row found by its (seeded, unique) title fragment. */
const rowFor = (page: Page, title: string) =>
  page.getByTestId('meeting-row').filter({ hasText: title })

const toastWith = (page: Page, text: string | RegExp) =>
  page.getByTestId('toast').filter({ hasText: text }).first()

/** Row kebab → `Tags` → the editor popover (T-36.3's row entry point). */
async function openRowTagEditor(page: Page, title: string): Promise<void> {
  const row = rowFor(page, title)
  await row.hover()
  await row.getByTestId('meeting-row-kebab').click()
  await page.getByTestId('meeting-row-tags-menu').click()
  await expect(page.getByTestId('tag-editor')).toBeVisible()
}

/** Escape closes the popover, which is exactly when the editor commits. */
async function closeTagEditor(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('tag-editor')).toBeHidden()
}

/** Create `name` from inside an open editor; it lands in the draft checked. */
async function createTagInEditor(page: Page, name: string): Promise<void> {
  await page.getByTestId('tag-editor-search').fill(name)
  await page.getByTestId('tag-create').click()
  await expect(page.getByTestId(`tag-option-${name}`)).toHaveAttribute('aria-checked', 'true')
}

/**
 * Computed background of a chip's colour dot. The dot's inline style is a
 * `var(--ff-speaker-N)` reference (never a hex — the hard rule), so reading
 * the COMPUTED value proves the token resolved in the active theme.
 */
const dotColor = (chip: Locator) =>
  chip.evaluate((el) => {
    const dot = el.querySelector('span[aria-hidden="true"]')
    return dot ? getComputedStyle(dot).backgroundColor : ''
  })

test.describe('tags · chips as filters', () => {
  test('T36-C · clicking a row chip filters the notebook instead of navigating', async ({
    page,
  }) => {
    await notebook(page)

    // `sales` lives on exactly one seeded meeting, so the chip is unambiguous.
    await page.getByTestId('tag-chip-sales').click()

    // Filtered, not navigated — the chip sits inside the row's link and must
    // win against it (T36-C).
    await expect(page).toHaveURL(/\/notebook\?.*tags=sales/)
    await expect(page.getByTestId('active-filter-chip-tag-sales')).toContainText('#sales')
    await expect(count(page)).toHaveText('1 meeting')
    await expect(page.getByTestId('meeting-row-title')).toHaveText(/Acme/)
  })

  test('T36-D · two tags from the panel return the union (OR is the default)', async ({
    page,
  }) => {
    await notebook(page)
    await page.getByTestId('filters-button').click()
    await expect(page.getByTestId('filters-panel')).toBeVisible()

    await page.getByTestId('tag-filter-sales').click()
    await page.getByTestId('tag-filter-urgent').click()
    await page.getByTestId('filters-apply').click()

    // OR stays OUT of the URL — the default mode must not grow a parameter.
    await expect(page).toHaveURL(/tags=sales&tags=urgent/)
    await expect(page).not.toHaveURL(/tags_mode/)

    // sales(02) ∪ urgent(06,08) = 3 meetings.
    await expect(count(page)).toHaveText('3 meetings')
    await expect(rowFor(page, 'Acme')).toBeVisible()
    await expect(rowFor(page, 'Northwind')).toBeVisible()
    await expect(rowFor(page, 'Bug Triage')).toBeVisible()
  })

  test('T36-E · toggling AND narrows the union to the intersection', async ({ page }) => {
    await page.goto('/notebook?tags=customer&tags=urgent')
    await expect(page.getByTestId('meeting-list')).toBeVisible()

    // customer(02,06) ∪ urgent(06,08) = 3 before the toggle…
    await expect(count(page)).toHaveText('3 meetings')

    await page.getByTestId('filters-button').click()
    await expect(page.getByTestId('filters-panel')).toBeVisible()
    // Labelled `Match all` in the UI; `radio-and` is its value-derived id.
    await page.getByTestId('radio-and').click()
    await page.getByTestId('filters-apply').click()

    // …and only Northwind carries BOTH after it. The count moving is the case.
    await expect(page).toHaveURL(/tags_mode=and/)
    await expect(count(page)).toHaveText('1 meeting')
    await expect(page.getByTestId('meeting-row-title')).toHaveText(/Northwind/)
  })

  test('T36-L · one tag, one colour, wherever the chip renders', async ({ page }) => {
    await notebook(page)

    // `engineering` sits on five seeded meetings; compare two rows…
    const standup = rowFor(page, 'Weekly Engineering Standup')
    const triage = rowFor(page, 'Bug Triage')

    const onStandup = await dotColor(standup.getByTestId('tag-chip-engineering'))
    const onTriage = await dotColor(triage.getByTestId('tag-chip-engineering'))

    // A real resolved colour — a broken token computes to transparent.
    expect(onStandup).toMatch(/^rgb/)
    expect(onStandup).not.toBe('rgba(0, 0, 0, 0)')
    expect(onTriage).toBe(onStandup)

    // …and a second SURFACE: the details drawer renders the same chip.
    await standup.hover()
    await standup.getByTestId('meeting-row-details').click()
    await expect(page.getByTestId('details-drawer')).toBeVisible()

    const inDrawer = await dotColor(
      page.getByTestId('details-meta-tags').getByTestId('tag-chip-engineering'),
    )
    expect(inDrawer).toBe(onStandup)
  })
})

test.describe('tags · editor, settings and bulk', { tag: '@mutates' }, () => {
  test('T36-A · a tag added from the row kebab lands on row and drawer, and persists', async ({
    page,
  }) => {
    await notebook(page)
    const standup = rowFor(page, 'Weekly Engineering Standup')
    await expect(standup.getByTestId('tag-chip-hiring')).toHaveCount(0)

    await openRowTagEditor(page, 'Weekly Engineering Standup')
    await page.getByTestId('tag-option-hiring').click()
    await expect(page.getByTestId('tag-option-hiring')).toHaveAttribute('aria-checked', 'true')
    await closeTagEditor(page)

    // One PUT on close, confirmed, and the chip joins the row's metadata line.
    await expect(toastWith(page, 'Tags updated')).toBeVisible()
    await expect(standup.getByTestId('tag-chip-hiring')).toBeVisible()

    // The drawer shows the full list including the new tag.
    await standup.hover()
    await standup.getByTestId('meeting-row-details').click()
    await expect(page.getByTestId('details-drawer')).toBeVisible()
    await expect(
      page.getByTestId('details-meta-tags').getByTestId('tag-chip-hiring'),
    ).toBeVisible()
    await page.getByTestId('details-close').click()
    await expect(page.getByTestId('details-drawer')).toBeHidden()

    // Persists — the chip came back from the server, not from client state.
    await page.reload()
    await expect(page.getByTestId('meeting-list')).toBeVisible()
    await expect(
      rowFor(page, 'Weekly Engineering Standup').getByTestId('tag-chip-hiring'),
    ).toBeVisible()

    // Restore the seeded state (and prove unchecking works the same way).
    await openRowTagEditor(page, 'Weekly Engineering Standup')
    await page.getByTestId('tag-option-hiring').click()
    await closeTagEditor(page)
    await expect(
      rowFor(page, 'Weekly Engineering Standup').getByTestId('tag-chip-hiring'),
    ).toHaveCount(0)
  })

  test('T36-B · a tag created in the editor is applied here and offered everywhere', async ({
    page,
  }) => {
    await notebook(page)
    await openRowTagEditor(page, 'Acme')

    await page.getByTestId('tag-editor-search').fill('compliance')
    await expect(page.getByTestId('tag-create')).toContainText('compliance')
    await page.getByTestId('tag-create').click()
    await expect(toastWith(page, 'Tag created')).toBeVisible()
    // Creation drops it straight into the draft, checked.
    await expect(page.getByTestId('tag-option-compliance')).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await closeTagEditor(page)
    await expect(toastWith(page, 'Tags updated')).toBeVisible()

    // Third tag on Acme: the row truncates to 2 + `+1`, the drawer shows it.
    const acme = rowFor(page, 'Acme')
    await expect(acme.getByTestId('tag-chip-overflow')).toHaveText('+1')
    await acme.hover()
    await acme.getByTestId('meeting-row-details').click()
    await expect(
      page.getByTestId('details-meta-tags').getByTestId('tag-chip-compliance'),
    ).toBeVisible()
    await page.getByTestId('details-close').click()

    // Available to OTHER meetings now — and offered as an option, not a create.
    await openRowTagEditor(page, 'Northwind')
    await page.getByTestId('tag-editor-search').fill('compliance')
    await expect(page.getByTestId('tag-option-compliance')).toBeVisible()
    await expect(page.getByTestId('tag-option-compliance')).toHaveAttribute(
      'aria-checked',
      'false',
    )
    await expect(page.getByTestId('tag-create')).toHaveCount(0)
    // Close by clicking away — no draft change, so nothing commits.
    await page.getByRole('heading', { name: 'Meetings', level: 1 }).click()
    await expect(page.getByTestId('tag-editor')).toBeHidden()
  })

  test('T36-I · the 11th tag is blocked with a message', async ({ page }) => {
    await notebook(page)
    await openRowTagEditor(page, 'Q3 Product Roadmap Sync')

    // Seeded three + the five other existing tags = 8 in the draft…
    for (const name of ['sales', 'customer', 'urgent', 'hiring', 'compliance']) {
      await page.getByTestId(`tag-option-${name}`).click()
      await expect(page.getByTestId(`tag-option-${name}`)).toHaveAttribute(
        'aria-checked',
        'true',
      )
    }
    // …two freshly created make 10…
    await createTagInEditor(page, 'q3-planning')
    await createTagInEditor(page, 'budget')

    // …and the 11th refuses WITH a message, never silently (T36-I).
    await page.getByTestId('tag-editor-search').fill('one-too-many')
    await page.getByTestId('tag-create').click()
    await expect(toastWith(page, 'at most 10 tags')).toBeVisible()
    await expect(page.getByTestId('tag-option-one-too-many')).toHaveAttribute(
      'aria-checked',
      'false',
    )

    // The ten that fit commit fine: 2 visible chips + `+8`.
    await closeTagEditor(page)
    await expect(toastWith(page, 'Tags updated')).toBeVisible()
    const row = rowFor(page, 'Q3 Product Roadmap Sync')
    await expect(row.getByTestId('tag-chip-overflow')).toHaveText('+8')

    // Restore the seeded three so later counts stay honest.
    await openRowTagEditor(page, 'Q3 Product Roadmap Sync')
    for (const name of [
      'sales',
      'customer',
      'urgent',
      'hiring',
      'compliance',
      'q3-planning',
      'budget',
    ]) {
      await page.getByTestId(`tag-option-${name}`).click()
    }
    await closeTagEditor(page)
    await expect(row.getByTestId('tag-chip-overflow')).toHaveText('+1')
  })

  test('T36-J · a duplicate name in a different case is blocked at both doors', async ({
    page,
  }) => {
    // The editor: `Sales` surfaces the existing #sales, offers no create.
    await notebook(page)
    await openRowTagEditor(page, 'Northwind')
    await page.getByTestId('tag-editor-search').fill('Sales')
    await expect(page.getByTestId('tag-option-sales')).toBeVisible()
    await expect(page.getByTestId('tag-create')).toHaveCount(0)
    await page.getByRole('heading', { name: 'Meetings', level: 1 }).click()
    await expect(page.getByTestId('tag-editor')).toBeHidden()

    // The server: renaming `urgent` to `SALES` 409s, naming the owner.
    await page.goto('/settings/tags')
    await expect(page.getByTestId('tags-settings-page')).toBeVisible()
    await page.getByTestId('tag-rename-urgent').click()
    await page.getByTestId('tag-rename-urgent-input').fill('SALES')
    await page.keyboard.press('Enter')

    await expect(toastWith(page, /sales/i)).toBeVisible()
    await expect(page.getByTestId('tag-row-urgent')).toBeVisible()
    await expect(page.getByTestId('tag-row-sales')).toHaveCount(1)
  })

  test('T36-F · renaming in settings follows the tag everywhere', async ({ page }) => {
    await page.goto('/settings/tags')
    await expect(page.getByTestId('tags-settings-list')).toBeVisible()

    await page.getByTestId('tag-rename-hiring').click()
    await page.getByTestId('tag-rename-hiring-input').fill('recruiting')
    await page.keyboard.press('Enter')

    await expect(page.getByTestId('tag-row-recruiting')).toBeVisible()
    await expect(page.getByTestId('tag-row-hiring')).toHaveCount(0)
    // Same tag, same usage — a rename must never re-count.
    await expect(
      page.getByTestId('tag-row-recruiting').getByTestId('tag-usage-count'),
    ).toHaveText('1 meeting')

    // Propagated by id linkage: the meeting that carried #hiring now shows it.
    await notebook(page)
    const row = rowFor(page, 'Sarah & Marcus')
    await expect(row.getByTestId('tag-chip-recruiting')).toContainText('#recruiting')
    await expect(row.getByTestId('tag-chip-hiring')).toHaveCount(0)

    // Restore the seeded name.
    await page.goto('/settings/tags')
    await page.getByTestId('tag-rename-recruiting').click()
    await page.getByTestId('tag-rename-recruiting-input').fill('hiring')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('tag-row-hiring')).toBeVisible()
  })

  test('T36-K · bulk-tagging three meetings tags all three in one action', async ({ page }) => {
    await notebook(page)

    for (const index of [0, 1, 2]) {
      const row = page.getByTestId('meeting-row').nth(index)
      await row.hover()
      await row.getByTestId('meeting-row-checkbox').click()
    }
    await expect(page.getByTestId('bulk-count')).toHaveText('3 selected')

    await page.getByTestId('bulk-tag').click()
    await expect(page.getByTestId('tag-editor')).toBeVisible()
    await createTagInEditor(page, 'follow-up')
    await closeTagEditor(page)

    // One summary toast for the whole batch, not three.
    await expect(toastWith(page, 'Tags added to 3 meetings')).toBeVisible()

    // The union proves all three carry it, whatever their overflow state.
    await page.goto('/notebook?tags=follow-up')
    await expect(count(page)).toHaveText('3 meetings')
  })

  test('T36-H · deleting a tag names its blast radius and strips every meeting', async ({
    page,
  }) => {
    await page.goto('/settings/tags')
    const row = page.getByTestId('tag-row-follow-up')
    await expect(row.getByTestId('tag-usage-count')).toHaveText('3 meetings')

    await row.getByTestId('tag-delete').click()
    const dialog = page.getByTestId('tag-delete-dialog')
    await expect(dialog).toBeVisible()
    // The confirm NAMES the affected count before anything happens (T36-H).
    await expect(dialog).toContainText('#follow-up')
    await expect(dialog).toContainText('3 meetings')
    await page.getByTestId('tag-delete-dialog-confirm').click()

    await expect(toastWith(page, 'Tag deleted')).toBeVisible()
    await expect(page.getByTestId('tag-row-follow-up')).toHaveCount(0)

    // Removed from every meeting: filtering by the dead tag matches nothing.
    await page.goto('/notebook?tags=follow-up')
    const empty = page.getByTestId('notebook-empty')
    await expect(empty).toBeVisible()
    await expect(empty).toHaveAttribute('data-variant', 'no-matches')
  })

  test('T36-G · merging folds every meeting onto the survivor without duplicates', async ({
    page,
  }) => {
    await page.goto('/settings/tags')
    const source = page.getByTestId('tag-row-roadmap')
    await expect(source.getByTestId('tag-usage-count')).toHaveText('2 meetings')

    await source.getByTestId('tag-merge').click()
    const dialog = page.getByTestId('tag-merge-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('#roadmap')
    await expect(dialog).toContainText('2 meetings')

    await page.getByTestId('tag-merge-into').click()
    await page.getByRole('option', { name: '#product' }).click()
    await page.getByTestId('tag-merge-dialog-confirm').click()

    await expect(toastWith(page, 'Tags merged')).toBeVisible()
    await expect(page.getByTestId('tag-row-roadmap')).toHaveCount(0)

    // roadmap(01,07) already overlapped product(01,04,07) entirely, so the
    // survivor's count stays 3 — growth here would mean a duplicate row.
    await expect(
      page.getByTestId('tag-row-product').getByTestId('tag-usage-count'),
    ).toHaveText('3 meetings')

    await page.goto('/notebook?tags=product')
    await expect(count(page)).toHaveText('3 meetings')

    // All-Hands carried BOTH; now exactly one #product chip and no ghost.
    const allHands = rowFor(page, 'All-Hands')
    await expect(allHands.getByTestId('tag-chip-product')).toHaveCount(1)
    await expect(allHands.getByTestId('tag-chip-roadmap')).toHaveCount(0)
    await expect(allHands.getByTestId('tag-chip-overflow')).toHaveCount(0)
  })
})

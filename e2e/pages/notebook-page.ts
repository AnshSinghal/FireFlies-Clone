import type { Locator, Page } from '@playwright/test'

/**
 * The Notebook — the date-grouped meeting list at `/notebook` (T-12).
 * Selectors mirror `03-shell`, `08-notebook` and `10-bulk`.
 */
export class NotebookPage {
  constructor(readonly page: Page) {}

  /** Navigate, preserving the URL-as-state contract: filters ride in `query`. */
  async goto(query = ''): Promise<void> {
    await this.page.goto(`/notebook${query}`)
  }

  get root(): Locator {
    return this.page.getByTestId('notebook-page')
  }

  get list(): Locator {
    return this.page.getByTestId('meeting-list')
  }

  get grid(): Locator {
    return this.page.getByTestId('meeting-grid')
  }

  get rows(): Locator {
    return this.page.getByTestId('meeting-row')
  }

  row(index: number): Locator {
    return this.rows.nth(index)
  }

  /** The card for one meeting id — the anchor `meeting-row-{id}` sits inside. */
  rowById(id: number): Locator {
    return this.page.getByTestId(`meeting-row-${id}`)
  }

  get rowTitles(): Locator {
    return this.page.getByTestId('meeting-row-title')
  }

  get rowDates(): Locator {
    return this.page.getByTestId('meeting-row-date')
  }

  get rowDurations(): Locator {
    return this.page.getByTestId('meeting-row-duration')
  }

  /** "8 meetings" — the header count the filter tests key off. */
  get count(): Locator {
    return this.page.getByTestId('notebook-count')
  }

  get toolbar(): Locator {
    return this.page.getByTestId('notebook-toolbar')
  }

  get search(): Locator {
    return this.page.getByTestId('notebook-search')
  }

  get searchClear(): Locator {
    return this.page.getByTestId('notebook-search-clear')
  }

  get sort(): Locator {
    return this.page.getByTestId('notebook-sort')
  }

  get empty(): Locator {
    return this.page.getByTestId('notebook-empty')
  }

  get error(): Locator {
    return this.page.getByTestId('notebook-error')
  }

  get retry(): Locator {
    return this.page.getByTestId('notebook-retry')
  }

  get skeletons(): Locator {
    return this.page.getByTestId('meeting-row-skeleton')
  }

  // ── Row hover affordances ─────────────────────────────────────────────────

  kebabOf(row: Locator): Locator {
    return row.getByTestId('meeting-row-kebab')
  }

  checkboxOf(row: Locator): Locator {
    return row.getByTestId('meeting-row-checkbox')
  }

  // ── Bulk selection (T-12.10) ──────────────────────────────────────────────

  get bulkBar(): Locator {
    return this.page.getByTestId('bulk-bar')
  }

  get bulkCount(): Locator {
    return this.page.getByTestId('bulk-count')
  }

  // ── Pagination ────────────────────────────────────────────────────────────

  get pagination(): Locator {
    return this.page.getByTestId('pagination')
  }

  get paginationNext(): Locator {
    return this.page.getByTestId('pagination-next')
  }

  get paginationPrev(): Locator {
    return this.page.getByTestId('pagination-prev')
  }
}

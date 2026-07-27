import type { Locator, Page } from '@playwright/test'

/**
 * The draft-then-apply filters panel and its chips (T-13, ADR-039).
 * Selectors mirror `09-filters`.
 */
export class FiltersPanel {
  constructor(readonly page: Page) {}

  get button(): Locator {
    return this.page.getByTestId('filters-button')
  }

  get panel(): Locator {
    return this.page.getByTestId('filters-panel')
  }

  /** Open the panel. Nothing applies until `apply` is clicked (ADR-039). */
  async open(): Promise<void> {
    await this.button.click()
  }

  get apply(): Locator {
    return this.page.getByTestId('filters-apply')
  }

  /** `host`, `participants`, `channel`, `tags` — one collapsible group. */
  section(name: string): Locator {
    return this.page.getByTestId(`filter-section-${name}`)
  }

  /** `last-7-days`, `last-30-days`, `over-60` … — one radio preset. */
  radio(name: string): Locator {
    return this.page.getByTestId(`radio-${name}`)
  }

  get hasActionItems(): Locator {
    return this.page.getByTestId('filter-has-action-items')
  }

  // ── Applied state, outside the panel ──────────────────────────────────────

  get chips(): Locator {
    return this.page.getByTestId('active-filter-chips')
  }

  /** `host`, `date`, `action-items` — one removable chip per filter group. */
  chip(name: string): Locator {
    return this.page.getByTestId(`active-filter-chip-${name}`)
  }

  get clearAll(): Locator {
    return this.page.getByTestId('active-filters-clear')
  }

  quickFilter(name: string): Locator {
    return this.page.getByTestId(`quick-filter-${name}`)
  }
}

import type { Locator, Page } from '@playwright/test'

/**
 * The action-items section of the summary panel (T-24).
 * Selectors mirror `19-action-items`.
 */
export class ActionItemsComponent {
  constructor(readonly page: Page) {}

  get section(): Locator {
    return this.page.getByTestId('action-items-section')
  }

  /** Every item row — the id-suffixed testid narrowed by its status attribute. */
  get items(): Locator {
    return this.page.locator('[data-testid^="action-item-"][data-status]')
  }

  itemsWithStatus(status: 'open' | 'completed'): Locator {
    return this.page.locator(`[data-testid^="action-item-"][data-status="${status}"]`)
  }

  item(id: number): Locator {
    return this.page.getByTestId(`action-item-${id}`)
  }

  due(id: number): Locator {
    return this.page.getByTestId(`action-item-due-${id}`)
  }

  timestamp(id: number): Locator {
    return this.page.getByTestId(`action-item-timestamp-${id}`)
  }

  /** Assignee groups when grouped view is on. */
  get groups(): Locator {
    return this.page.locator('[data-testid^="action-items-group-"]')
  }

  filter(status: 'open' | 'completed'): Locator {
    return this.page.getByTestId(`action-items-filter-${status}`)
  }

  get progress(): Locator {
    return this.page.getByTestId('action-items-progress')
  }

  get progressLabel(): Locator {
    return this.page.getByTestId('action-items-progress-label')
  }

  get add(): Locator {
    return this.page.getByTestId('action-item-add')
  }

  get composer(): Locator {
    return this.page.getByTestId('action-item-composer')
  }

  get composerSave(): Locator {
    return this.page.getByTestId('action-item-composer-save')
  }

  get empty(): Locator {
    return this.page.getByTestId('action-items-empty')
  }
}

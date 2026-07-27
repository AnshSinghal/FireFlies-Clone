import type { Locator, Page } from '@playwright/test'

/**
 * The summary panel: the five canonically-named sections (T-23).
 * Selectors mirror `18-summary`.
 */
export class SummaryComponent {
  constructor(readonly page: Page) {}

  get panel(): Locator {
    return this.page.getByTestId('summary-panel')
  }

  /** `keywords`, `overview`, `outline`, `notes` — one collapsible section. */
  section(kind: string): Locator {
    return this.page.getByTestId(`summary-section-${kind}`)
  }

  toggle(kind: string): Locator {
    return this.page.getByTestId(`summary-toggle-${kind}`)
  }

  get overview(): Locator {
    return this.page.getByTestId('summary-overview')
  }

  keyword(index: number): Locator {
    return this.page.getByTestId(`summary-keyword-${index}`)
  }

  outlineItem(index: number): Locator {
    return this.page.getByTestId(`summary-outline-item-${index}`)
  }

  /** The clickable chapter timestamp that seeks the player. */
  outlineTime(index: number): Locator {
    return this.page.getByTestId(`summary-outline-time-${index}`)
  }

  get notes(): Locator {
    return this.page.getByTestId('summary-notes')
  }

  get noteGroups(): Locator {
    return this.page.getByTestId('summary-note-group')
  }

  get noteBullets(): Locator {
    return this.page.getByTestId('summary-note-bullet')
  }

  get copy(): Locator {
    return this.page.getByTestId('summary-copy')
  }

  get template(): Locator {
    return this.page.getByTestId('summary-template')
  }

  get generate(): Locator {
    return this.page.getByTestId('summary-generate')
  }

  get retry(): Locator {
    return this.page.getByTestId('summary-retry')
  }

  get staleBadge(): Locator {
    return this.page.getByTestId('summary-stale-badge')
  }

  get empty(): Locator {
    return this.page.getByTestId('summary-empty')
  }

  get error(): Locator {
    return this.page.getByTestId('summary-error')
  }
}

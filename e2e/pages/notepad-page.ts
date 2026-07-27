import type { Locator, Page } from '@playwright/test'

/**
 * The Notepad — the two-panel meeting workspace at `/meeting/{id}` (T-18).
 * Selectors mirror `13-notepad`.
 */
export class NotepadPage {
  constructor(readonly page: Page) {}

  async goto(meetingId: number, query = ''): Promise<void> {
    await this.page.goto(`/meeting/${meetingId}${query}`)
  }

  get root(): Locator {
    return this.page.getByTestId('notepad-page')
  }

  get header(): Locator {
    return this.page.getByTestId('notepad-header')
  }

  get title(): Locator {
    return this.page.getByTestId('notepad-title')
  }

  get titleInput(): Locator {
    return this.page.getByTestId('notepad-title-input')
  }

  get titleError(): Locator {
    return this.page.getByTestId('notepad-title-error')
  }

  get copyLink(): Locator {
    return this.page.getByTestId('notepad-copy-link')
  }

  get kebab(): Locator {
    return this.page.getByTestId('notepad-kebab')
  }

  get participantCount(): Locator {
    return this.page.getByTestId('notepad-participant-count')
  }

  get participants(): Locator {
    return this.page.getByTestId('notepad-participants')
  }

  get summaryPanel(): Locator {
    return this.page.getByTestId('summary-panel')
  }

  get transcriptPanel(): Locator {
    return this.page.getByTestId('transcript-panel')
  }

  /** The draggable divider; `aria-valuenow` carries the split ratio. */
  get panelHandle(): Locator {
    return this.page.getByTestId('panel-handle')
  }

  get error(): Locator {
    return this.page.getByTestId('notepad-error')
  }

  // ── Icon rail and its flyouts (T18-J: one open at a time) ─────────────────

  get iconRail(): Locator {
    return this.page.getByTestId('icon-rail')
  }

  /** `search`, `comments`, `index` — the rail item for one flyout. */
  railItem(name: string): Locator {
    return this.page.getByTestId(`icon-rail-${name}`)
  }

  railFlyout(name: string): Locator {
    return this.page.getByTestId(`rail-flyout-${name}`)
  }

  // ── Below 1024px the panels become tabs (T18-I) ───────────────────────────

  get tabs(): Locator {
    return this.page.getByTestId('notepad-tabs')
  }

  tab(name: 'transcript' | 'summary'): Locator {
    return this.page.getByTestId(`tab-${name}`)
  }
}

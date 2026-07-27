import type { Locator, Page } from '@playwright/test'

/**
 * The transcript panel: segment list, find bar, per-row actions (T-20/T-22).
 * Selectors mirror `15-transcript`, `16-sync` and `17-find`.
 */
export class TranscriptComponent {
  constructor(readonly page: Page) {}

  get list(): Locator {
    return this.page.getByTestId('transcript-list')
  }

  /** The scrolling box below the fixed player header (T18-H). */
  get scroll(): Locator {
    return this.page.getByTestId('transcript-scroll')
  }

  /**
   * Segment rows — the testid prefix minus the per-row action clusters that
   * share it. The one selector every sync test agrees on.
   */
  get rows(): Locator {
    return this.page.locator(
      '[data-testid^="transcript-segment-"]:not([data-testid*="actions"])',
    )
  }

  row(index: number): Locator {
    return this.rows.nth(index)
  }

  /** The single highlighted line the player position drives (T-21). */
  get activeLine(): Locator {
    return this.list.locator('[data-active="true"]')
  }

  timestampOf(row: Locator): Locator {
    return row.locator('[data-testid^="transcript-timestamp-"]')
  }

  speakerOf(row: Locator): Locator {
    return row.locator('[data-testid^="transcript-speaker-"]')
  }

  actionsOf(row: Locator): Locator {
    return row.locator('[data-testid^="transcript-segment-actions-"]')
  }

  get count(): Locator {
    return this.page.getByTestId('transcript-count')
  }

  get copyAll(): Locator {
    return this.page.getByTestId('transcript-copy-all')
  }

  get jumpToCurrent(): Locator {
    return this.page.getByTestId('transcript-jump-to-current')
  }

  get empty(): Locator {
    return this.page.getByTestId('transcript-empty')
  }

  get selectionToolbar(): Locator {
    return this.page.getByTestId('selection-toolbar')
  }

  // ── Find bar (T-22) ───────────────────────────────────────────────────────

  get find(): Locator {
    return this.page.getByTestId('transcript-find')
  }

  get findInput(): Locator {
    return this.page.getByTestId('transcript-find-input')
  }

  get findCount(): Locator {
    return this.page.getByTestId('transcript-find-count')
  }

  get findNext(): Locator {
    return this.page.getByTestId('transcript-find-next')
  }

  get findOpen(): Locator {
    return this.page.getByTestId('transcript-find-open')
  }
}

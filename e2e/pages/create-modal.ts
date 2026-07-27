import type { Locator, Page } from '@playwright/test'

/**
 * The create/upload modal at `/upload` (T-27).
 * Selectors mirror `21-create`.
 */
export class CreateModal {
  constructor(readonly page: Page) {}

  /** The modal is a route; `tab` picks `upload` or `paste`. */
  async open(tab: 'upload' | 'paste' = 'upload'): Promise<void> {
    await this.page.goto(`/upload?tab=${tab}`)
  }

  get modal(): Locator {
    return this.page.getByTestId('create-modal')
  }

  get title(): Locator {
    return this.page.getByTestId('create-title')
  }

  get dropzone(): Locator {
    return this.page.getByTestId('create-dropzone')
  }

  get fileInput(): Locator {
    return this.page.getByTestId('create-file-input')
  }

  get fileError(): Locator {
    return this.page.getByTestId('create-file-error')
  }

  get pasteInput(): Locator {
    return this.page.getByTestId('create-paste-input')
  }

  get loadSample(): Locator {
    return this.page.getByTestId('create-load-sample')
  }

  get preview(): Locator {
    return this.page.getByTestId('create-preview')
  }

  get previewCount(): Locator {
    return this.page.getByTestId('create-preview-count')
  }

  previewSegment(index: number): Locator {
    return this.page.getByTestId(`create-preview-segment-${index}`)
  }

  /** Which parser recognised the paste — `timestamped`, `speaker-only`, … */
  get previewStrategy(): Locator {
    return this.page.getByTestId('create-preview-strategy')
  }

  get submit(): Locator {
    return this.page.getByTestId('create-submit')
  }
}

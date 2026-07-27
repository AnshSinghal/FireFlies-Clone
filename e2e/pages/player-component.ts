import type { Locator, Page } from '@playwright/test'

/**
 * The simulated player fixed at the top of the transcript panel (T-19/T-20).
 * Selectors mirror `14-player` and `16-sync`.
 */
export class PlayerComponent {
  constructor(readonly page: Page) {}

  get root(): Locator {
    return this.page.getByTestId('player')
  }

  get playButton(): Locator {
    return this.page.getByTestId('player-play')
  }

  get seekbar(): Locator {
    return this.page.getByTestId('player-seekbar')
  }

  /** "MM:SS / MM:SS" readout. */
  get time(): Locator {
    return this.page.getByTestId('player-time')
  }

  get waveform(): Locator {
    return this.page.getByTestId('player-waveform')
  }

  get rate(): Locator {
    return this.page.getByTestId('player-rate')
  }

  /** e.g. `rateOption('1.5')` → the 1.5× menu item. */
  rateOption(value: string): Locator {
    return this.page.getByTestId(`player-rate-${value}`)
  }

  chapter(index: number): Locator {
    return this.page.getByTestId(`player-chapter-${index}`)
  }

  get seekPreview(): Locator {
    return this.page.getByTestId('player-seek-preview')
  }

  /** Playhead in seconds, from the value a screen reader is given. */
  async position(): Promise<number> {
    return Number(await this.seekbar.getAttribute('aria-valuenow'))
  }

  async duration(): Promise<number> {
    return Number(await this.seekbar.getAttribute('aria-valuemax'))
  }
}

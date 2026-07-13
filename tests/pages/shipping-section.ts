import type { Page } from '@playwright/test';
import { NetworkError } from './errors.js';

/** The delivery-estimate widget shared by the inventory, checkout and payment
 *  pages. BUG 6 (the shipping "API" 503s on every call) surfaces here on all
 *  three pages, so every test using this section fails through this ONE method
 *  with an identical error — the traces flakehound folds into a single cluster. */
export class ShippingSection {
  constructor(private readonly page: Page) {}

  /**
   * Asserts the delivery estimate rendered. BUG 6 makes the shipping fetch
   * fail deterministically, so the error banner shows instead → this throws
   * the same NetworkError on every page that embeds the widget.
   */
  async expectEstimate(): Promise<void> {
    // Both outcome elements are always in the DOM (unlike the catalog list),
    // so wait for whichever one is REVEALED rather than for the first match.
    const outcome = this.page.locator('#shipping-estimate:visible, #shipping-error:visible');
    await outcome.first().waitFor({ state: 'visible', timeout: 8000 });
    const error = this.page.locator('#shipping-error');
    if (await error.isVisible()) {
      const detail = (await error.textContent())?.trim() || 'shipping estimate failed';
      throw new NetworkError(detail);
    }
  }
}

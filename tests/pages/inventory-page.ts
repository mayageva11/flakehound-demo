import type { Page } from '@playwright/test';
import { EnvironmentError, NetworkError } from './errors.js';

export class InventoryPage {
  constructor(private readonly page: Page) {}

  /** Inventory is a public browse page — no session needed, so these tests
   *  stay independent of the login flow and of BUG 1's slow button. */
  async goto(): Promise<void> {
    await this.page.goto('inventory.html');
  }

  /**
   * Asserts the catalog rendered. BUG 4 (the simulated 502 from the catalog
   * "API") intermittently surfaces the error banner instead → a network flake.
   */
  async expectCatalog(): Promise<void> {
    const outcome = this.page.locator('#catalog-list li, #catalog-error');
    await outcome.first().waitFor({ state: 'visible', timeout: 8000 });
    const error = this.page.locator('#catalog-error');
    if (await error.isVisible()) {
      const detail = (await error.textContent())?.trim() || 'catalog fetch failed';
      throw new NetworkError(detail);
    }
  }

  /**
   * Asserts the restock schedule is shown. BUG 5 (the UTC maintenance window)
   * hides it when a run lands in the first 8 minutes of an hour → an
   * environment-dependent failure that flips across runs, not within one.
   */
  async expectRestockSchedule(): Promise<void> {
    const outcome = this.page.locator('#restock-table li, #maintenance-banner');
    await outcome.first().waitFor({ state: 'visible', timeout: 8000 });
    if (await this.page.locator('#maintenance-banner').isVisible()) {
      throw new EnvironmentError('shop unavailable during maintenance window');
    }
  }
}

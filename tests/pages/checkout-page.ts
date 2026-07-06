import type { Page } from '@playwright/test';
import { TimeoutError } from './errors.js';

/** Render SLA for the pay button. The app reveals it after a random 0–35s
 *  delay (planted BUG 1), so waits longer than this intermittently time out. */
const PAY_BUTTON_SLA_MS = 20_000;

export class CheckoutPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('checkout.html');
  }

  /**
   * Wait for the pay button within the SLA and click it. When the app's random
   * reveal delay exceeds the SLA this throws a TimeoutError naming the locator
   * — the timeout flake, isolated to the `checkout` test.
   */
  async pay(): Promise<void> {
    try {
      await this.page.locator('#pay-button').waitFor({ state: 'visible', timeout: PAY_BUTTON_SLA_MS });
    } catch {
      throw new TimeoutError(
        `Timeout ${PAY_BUTTON_SLA_MS}ms exceeded waiting for locator('#pay-button')`,
      );
    }
    await this.page.click('#pay-button');
  }
}

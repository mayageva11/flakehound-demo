import type { Page } from '@playwright/test';
import { AssertionError } from './errors.js';

export class PaymentPage {
  constructor(private readonly page: Page) {}

  /** Deep-links straight to the payment page (session already set) so this
   *  path is independent of the slow checkout button in BUG 1. */
  async goto(): Promise<void> {
    await this.page.goto('payment.html');
    await this.page.locator('#pricing-ready').waitFor({ state: 'attached', timeout: 8000 });
  }

  private async amount(selector: string): Promise<number> {
    const value = await this.page.locator(selector).getAttribute('data-amount');
    return Number(value);
  }

  /**
   * Asserts the displayed cart total equals the amount charged. BUG 2 (the
   * pricing race) makes the cart total occasionally reflect the pre-promo list
   * price, so this fails intermittently → the race flake.
   */
  async verify(): Promise<void> {
    const cartTotal = await this.amount('#cart-total');
    const charged = await this.amount('#charged-amount');
    if (cartTotal !== charged) {
      throw new AssertionError('expected cart total to equal charged amount');
    }
  }
}

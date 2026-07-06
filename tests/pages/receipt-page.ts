import type { Page } from '@playwright/test';
import { AssertionError } from './errors.js';

export class ReceiptPage {
  constructor(private readonly page: Page) {}

  private async amount(selector: string): Promise<number> {
    const value = await this.page.locator(selector).getAttribute('data-amount');
    return Number(value);
  }

  /**
   * Completes payment and asserts the receipt total equals the amount charged.
   * BUG 3 sums list prices and ignores the promo, so the receipt total is
   * ALWAYS wrong — this fails every run → the regression.
   */
  async verifyTotal(): Promise<void> {
    await this.page.click('#pay-now');
    await this.page.locator('#receipt-total').waitFor({ state: 'visible', timeout: 8000 });
    const receiptTotal = await this.amount('#receipt-total');
    const charged = await this.amount('#charged-amount');
    if (receiptTotal !== charged) {
      throw new AssertionError('expected receipt total to equal amount charged');
    }
  }
}

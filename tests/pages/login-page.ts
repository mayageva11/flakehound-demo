import type { Page } from '@playwright/test';
import { AssertionError } from './errors.js';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('index.html');
  }

  async signIn(username = 'demo', password = 'demo'): Promise<void> {
    await this.page.fill('#username', username);
    await this.page.fill('#password', password);
    await this.page.click('#login-button');
  }

  /** Asserts the sign-in landed on the checkout page. */
  async expectSignedIn(): Promise<void> {
    await this.page.waitForURL(/checkout\.html/, { timeout: 8000 }).catch(() => {
      throw new AssertionError('expected sign in to navigate to the checkout page');
    });
  }
}

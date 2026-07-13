import { test } from '@playwright/test';
import { CheckoutPage } from './pages/checkout-page.js';
import { InventoryPage } from './pages/inventory-page.js';
import { LoginPage } from './pages/login-page.js';
import { PaymentPage } from './pages/payment-page.js';
import { ShippingSection } from './pages/shipping-section.js';

/**
 * The shipping suite — three tests, ONE root cause. The shipping-estimate
 * "API" is down (BUG 6 in docs/shop/js/shop.js: a deterministic 503), and its
 * widget sits on three different pages. Every test below fails every run with
 * the same NetworkError, so flakehound normalizes the traces to one canonical
 * form and folds all three into a SINGLE failure cluster:
 *   inventory delivery estimate → fails ┐
 *   checkout delivery estimate  → fails ├─ one cluster = one bug
 *   payment delivery estimate   → fails ┘
 */

async function signIn(page: import('@playwright/test').Page): Promise<void> {
  const login = new LoginPage(page);
  await login.goto();
  await login.signIn();
  await login.expectSignedIn();
}

test('inventory delivery estimate', async ({ page }) => {
  // BUG 6 on the public inventory page — no session needed.
  await new InventoryPage(page).goto();
  await new ShippingSection(page).expectEstimate();
});

test('checkout delivery estimate', async ({ page }) => {
  // BUG 6 on the checkout page. Only the shipping widget is asserted, so this
  // stays independent of BUG 1's slow pay button.
  await signIn(page);
  await new CheckoutPage(page).goto();
  await new ShippingSection(page).expectEstimate();
});

test('payment delivery estimate', async ({ page }) => {
  // BUG 6 on the payment page, deep-linked with a session already set.
  await signIn(page);
  await new PaymentPage(page).goto();
  await new ShippingSection(page).expectEstimate();
});

import { test } from '@playwright/test';
import { CheckoutPage } from './pages/checkout-page.js';
import { LoginPage } from './pages/login-page.js';
import { PaymentPage } from './pages/payment-page.js';
import { ReceiptPage } from './pages/receipt-page.js';

/**
 * The Flaky Shop suite. Every failure below comes from a defect planted in the
 * APP (see app/js/shop.js), never from the test. Over repeated runs on the same
 * commit, flakehound should read this as:
 *   login    → stable
 *   checkout → flaky   (BUG 1, intermittent timeout)
 *   payment  → flaky   (BUG 2, intermittent pricing race)
 *   receipt  → regression (BUG 3, deterministic wrong total)
 */

async function signIn(page: import('@playwright/test').Page): Promise<void> {
  const login = new LoginPage(page);
  await login.goto();
  await login.signIn();
  await login.expectSignedIn();
}

test('login', async ({ page }) => {
  // Stable: signing in always lands on checkout.
  const login = new LoginPage(page);
  await login.goto();
  await login.signIn();
  await login.expectSignedIn();
});

// flakehound-quarantined cluster=842e18d0a516 issue=https://github.com/mayageva11/flakehound-demo/issues/1 — managed by 'flakehound quarantine', do not edit
test('checkout', { tag: '@flakehound-quarantined' }, async ({ page }) => {
  // BUG 1: the pay button is revealed after a random 0–35s delay; the SLA wait
  // in CheckoutPage.pay times out when the delay is long → intermittent flake.
  await signIn(page);
  const checkout = new CheckoutPage(page);
  await checkout.goto();
  await checkout.pay();
});

// flakehound-quarantined cluster=1c30043e05a6 issue=https://github.com/mayageva11/flakehound-demo/issues/3 — managed by 'flakehound quarantine', do not edit
test('payment', { tag: '@flakehound-quarantined' }, async ({ page }) => {
  // BUG 2: the cart total races an async promo, so it occasionally disagrees
  // with the charged amount → intermittent flake.
  await signIn(page);
  const payment = new PaymentPage(page);
  await payment.goto();
  await payment.verify();
});

test('receipt', async ({ page }) => {
  // BUG 3: the receipt total always uses list prices → fails every run →
  // a regression once flakehound sees it passed before the pricing change.
  await signIn(page);
  const receipt = new ReceiptPage(page);
  await new PaymentPage(page).goto();
  await receipt.verifyTotal();
});

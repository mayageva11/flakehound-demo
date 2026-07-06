/*
 * Flaky Shop — shared client logic and the THREE intentionally-planted defects.
 *
 * ⚠️  READ ME FIRST — this file contains bugs ON PURPOSE.
 * This is a demonstration app for flakehound. Three defects are planted in the
 * APPLICATION CODE (never in the tests) so that a Playwright suite running
 * against the live site produces a realistic mix of signals:
 *
 *   BUG 1 (timeout flake)   — checkout.html: the pay button renders after a
 *                             random 0–35s delay, so a test with a fixed
 *                             render SLA sometimes times out waiting for it.
 *   BUG 2 (race flake)      — payment.html: the cart total is read from shared
 *                             pricing state that an async promo mutates; the
 *                             read races the promo, so the displayed total
 *                             occasionally disagrees with the charged amount.
 *   BUG 3 (regression)      — payment.html receipt: the receipt total is
 *                             computed from LIST prices, always ignoring the
 *                             promo, so it is CONSISTENTLY wrong. Deterministic,
 *                             not timing-dependent → shows up as a regression.
 *
 * Every planted defect is tagged `PLANTED DEFECT` in a comment below.
 */

export const CATALOG = [
  { id: 'keyboard', name: 'Aurora Keyboard', listPrice: 79, promoPrice: 71 },
  { id: 'mouse', name: 'Nimbus Mouse', listPrice: 29, promoPrice: 29 },
];

/** Authoritative amount the customer is charged — promo always applied. */
export const CHARGED_AMOUNT = CATALOG.reduce((sum, item) => sum + item.promoPrice, 0); // 100
/** Sum of LIST prices (promo NOT applied). */
export const LIST_TOTAL = CATALOG.reduce((sum, item) => sum + item.listPrice, 0); // 108

const rand = (maxMs) => Math.random() * maxMs;
export const money = (n) => `$${n.toFixed(2)}`;

// ── session ──────────────────────────────────────────────────────────────
export function login(username) {
  sessionStorage.setItem('session', JSON.stringify({ username, at: Date.now() }));
}
export function isLoggedIn() {
  return sessionStorage.getItem('session') !== null;
}
export function requireSession() {
  if (!isLoggedIn()) {
    location.href = 'index.html';
    return false;
  }
  return true;
}

// ── BUG 1: the intermittently-slow pay button (checkout.html) ──────────────
/**
 * PLANTED DEFECT (timeout flake): reveal #pay-button after a random 0–35s delay.
 * A real payment widget that boots slowly under load. A test that waits for the
 * button with a fixed SLA will pass when the delay is short and time out when it
 * is long — a genuine, non-deterministic timeout flake.
 */
export function scheduleSlowPayButton(button) {
  button.hidden = true;
  const delayMs = rand(35_000); // 0–35s, per spec
  setTimeout(() => {
    button.hidden = false;
    button.dataset.revealedAfterMs = String(Math.round(delayMs));
  }, delayMs);
}

// ── BUG 2 + BUG 3: the racing cart total and the always-wrong receipt ──────
/**
 * Resolve the payment page's prices. Returns a Promise of { cartTotal, charged }.
 *
 * PLANTED DEFECT (race flake): `keyboardPrice` is shared mutable state. An async
 * promo marks it down after a random delay, and the cart-total source reads it
 * after its OWN random delay. The two race: if the read wins, the cart total
 * reflects the pre-promo LIST price and disagrees with the charged amount.
 */
export function resolvePricing() {
  const keyboard = CATALOG[0];
  const mouse = CATALOG[1];
  let keyboardPrice = keyboard.listPrice; // shared mutable state — the race target

  // async promo mutates shared state after a random delay
  setTimeout(() => {
    keyboardPrice = keyboard.promoPrice;
  }, rand(250));

  // the cart-total source reads shared state after its own random delay
  return new Promise((resolve) => {
    setTimeout(() => {
      const cartTotal = keyboardPrice + mouse.promoPrice; // 108 (pre-promo) or 100 (post-promo)
      resolve({ cartTotal, charged: CHARGED_AMOUNT });
    }, rand(250));
  });
}

/**
 * PLANTED DEFECT (regression): the receipt total sums LIST prices and never
 * applies the promo, so it is ALWAYS $108 while the charged amount is $100.
 * This is deterministic — it fails every single run — so flakehound classifies
 * it as a regression, not a flake.
 */
export function receiptTotal() {
  return LIST_TOTAL; // always 108 — consistently wrong vs CHARGED_AMOUNT (100)
}

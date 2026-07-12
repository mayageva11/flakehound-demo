/*
 * Flaky Shop — shared client logic and the FIVE intentionally-planted defects.
 *
 * ⚠️  READ ME FIRST — this file contains bugs ON PURPOSE.
 * This is a demonstration app for flakehound. Five defects are planted in the
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
 *   BUG 4 (network flake)   — inventory.html: the catalog "API" call fails with
 *                             a simulated 502 on ~25% of loads — a CDN/edge
 *                             hiccup that surfaces as an intermittent network
 *                             failure.
 *   BUG 5 (environment)     — inventory.html: the restock schedule hides behind
 *                             a "maintenance window" covering the first 8
 *                             minutes of every UTC hour. Whether a CI run lands
 *                             inside it depends on scheduler jitter, not code.
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

// ── BUG 4: the flaky catalog fetch (inventory.html) ────────────────────────
/**
 * PLANTED DEFECT (network flake): the catalog "API" call fails with a simulated
 * 502 on roughly a quarter of loads — an edge/CDN hiccup. The inventory page
 * surfaces the error text; a test asserting the catalog rendered will
 * intermittently see the failure instead → a genuine network flake.
 */
export function fetchCatalog() {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() < 0.25) {
        reject(new Error('502 Bad Gateway fetching /api/catalog'));
        return;
      }
      resolve(CATALOG);
    }, rand(150));
  });
}

// ── BUG 5: the maintenance window (inventory.html restock schedule) ────────
/**
 * PLANTED DEFECT (environment flake): the restock schedule is unavailable
 * during a "maintenance window" — the first 8 minutes of every UTC hour.
 * Whether a scheduled CI run lands inside the window depends on runner
 * scheduling jitter, not on the code under test: every attempt within one run
 * sees the same clock, so the failure flips ACROSS runs but almost never
 * within one — the signature of an environment-dependent failure.
 */
export function maintenanceWindowActive(now = new Date()) {
  return now.getUTCMinutes() < 8;
}

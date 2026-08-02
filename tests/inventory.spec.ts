import { test } from '@playwright/test';
import { InventoryPage } from './pages/inventory-page.js';

/**
 * The inventory suite. Like shop.spec.ts, every failure comes from a defect
 * planted in the APP (see docs/shop/js/shop.js), never from the test. Over
 * repeated runs flakehound should read this as:
 *   catalog → flaky (BUG 4, intermittent 502 → retry flips → HIGH confidence,
 *             so it gets auto-quarantined once enough signal accumulates)
 *   restock → flaky (BUG 5, whole runs land in/out of the maintenance window →
 *             cross-run flips only → MEDIUM confidence, never quarantined —
 *             a live demonstration of the confidence gate)
 */

test('catalog', async ({ page }) => {
  // BUG 4: the catalog fetch 502s on ~25% of loads → intermittent network flake.
  const inventory = new InventoryPage(page);
  await inventory.goto();
  await inventory.expectCatalog();
});

test('restock', async ({ page }) => {
  // BUG 5: the restock schedule hides during the UTC maintenance window →
  // environment-dependent failure decided by CI scheduling, not code.
  const inventory = new InventoryPage(page);
  await inventory.goto();
  await inventory.expectRestockSchedule();
});

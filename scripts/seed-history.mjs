/*
 * Generates the SEEDED history under history/seed-*.
 *
 * Honesty note: this is a scripted backstory, written by hand, used only to
 * bootstrap the dashboard so it shows the full flaky-vs-regression split before
 * real scheduled runs have accumulated. It is clearly labelled as seed data
 * (folder prefix `seed-`, runnerId "seed", and history/README.md). The live
 * pipeline appends GENUINE artifacts from the deployed site on top of it; the
 * two compose because every run carries the same test ids and trace shapes the
 * real Playwright suite emits.
 *
 * The backstory: on commit 5eed001 everything passed. Commit 5eed002 shipped
 * the promo-pricing change that introduced the shop defects — the receipt
 * total broke deterministically (regression), while the checkout timeout and
 * the payment race began flipping (flaky). The inventory page (and its catalog
 * 502 / maintenance-window defects) appears on 2026-07-05. Both checkout and
 * payment carry an intra-run retry flip in the seeds, so they classify as
 * flaky/HIGH — which is what makes `flakehound quarantine` pick them up on the
 * first pipeline run. The inventory tests start at MEDIUM confidence
 * (cross-run flips only) and earn their verdicts live.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const historyDir = path.resolve(fileURLToPath(new URL('../history', import.meta.url)));

const P = 'pass';
const F = 'fail';
const RF = 'retryflip'; // failed then passed WITHIN one run (two attempts) → retry flip

// chronological backstory: [timestamp, commitSha, { suite: { test: verdict } }]
// Retry flips (RF) are flakehound's highest-confidence flaky signal:
//   2026-07-04 checkout RF → checkout is flaky/HIGH from the seed alone.
//   2026-07-05 payment  RF → payment is flaky/HIGH too — required for the
//     quarantine → fix → auto-release story arc documented in the README.
// Real CI runs (retries: 2) add more of these over time.
const RUNS = [
  ['2026-06-30T10:00:00Z', '5eed001', {
    'shop.spec.ts': { login: P, checkout: P, payment: P, receipt: P },
  }],
  ['2026-07-01T10:00:00Z', '5eed001', {
    'shop.spec.ts': { login: P, checkout: P, payment: P, receipt: P },
  }],
  ['2026-07-02T10:00:00Z', '5eed002', {
    'shop.spec.ts': { login: P, checkout: P, payment: F, receipt: F },
  }],
  ['2026-07-03T10:00:00Z', '5eed002', {
    'shop.spec.ts': { login: P, checkout: F, payment: P, receipt: F },
  }],
  ['2026-07-04T10:00:00Z', '5eed002', {
    'shop.spec.ts': { login: P, checkout: RF, payment: F, receipt: F },
  }],
  // inventory.html ships here — its two tests join the history
  ['2026-07-05T10:00:00Z', '5eed002', {
    'shop.spec.ts': { login: P, checkout: P, payment: RF, receipt: F },
    'inventory.spec.ts': { catalog: F, restock: P },
  }],
  ['2026-07-06T10:00:00Z', '5eed002', {
    'shop.spec.ts': { login: P, checkout: F, payment: P, receipt: F },
    'inventory.spec.ts': { catalog: P, restock: P },
  }],
  ['2026-07-06T18:00:00Z', '5eed002', {
    'shop.spec.ts': { login: P, checkout: P, payment: P, receipt: F },
    'inventory.spec.ts': { catalog: P, restock: F },
  }],
];

const CI = '/home/runner/work/flakehound-demo/flakehound-demo';

// Trace builders mirror what the real page objects throw, so seed failures
// cluster with live failures after normalization.
const FAILURE = {
  checkout: {
    message: "TimeoutError: Timeout 20000ms exceeded waiting for locator('#pay-button')",
    stack: (line) =>
      `TimeoutError: Timeout 20000ms exceeded waiting for locator('#pay-button')\n` +
      `    at CheckoutPage.pay (${CI}/tests/pages/checkout-page.ts:${line}:13)\n` +
      `    at ${CI}/tests/shop.spec.ts:34:18`,
  },
  payment: {
    message: 'AssertionError: expected cart total to equal charged amount',
    stack: (line) =>
      `AssertionError: expected cart total to equal charged amount\n` +
      `    at PaymentPage.verify (${CI}/tests/pages/payment-page.ts:${line}:13)\n` +
      `    at ${CI}/tests/shop.spec.ts:44:18`,
  },
  receipt: {
    message: 'AssertionError: expected receipt total to equal amount charged',
    stack: (line) =>
      `AssertionError: expected receipt total to equal amount charged\n` +
      `    at ReceiptPage.verifyTotal (${CI}/tests/pages/receipt-page.ts:${line}:13)\n` +
      `    at ${CI}/tests/shop.spec.ts:54:18`,
  },
  catalog: {
    message: 'NetworkError: 502 Bad Gateway fetching /api/catalog',
    stack: (line) =>
      `NetworkError: 502 Bad Gateway fetching /api/catalog\n` +
      `    at InventoryPage.expectCatalog (${CI}/tests/pages/inventory-page.ts:${line}:13)\n` +
      `    at ${CI}/tests/inventory.spec.ts:19:3`,
  },
  restock: {
    message: 'EnvironmentError: shop unavailable during maintenance window',
    stack: (line) =>
      `EnvironmentError: shop unavailable during maintenance window\n` +
      `    at InventoryPage.expectRestockSchedule (${CI}/tests/pages/inventory-page.ts:${line}:13)\n` +
      `    at ${CI}/tests/inventory.spec.ts:26:3`,
  },
};

const ORDER = {
  'shop.spec.ts': ['login', 'checkout', 'payment', 'receipt'],
  'inventory.spec.ts': ['catalog', 'restock'],
};
const DURATION = {
  login: '0.700', checkout: '20.000', payment: '1.200', receipt: '1.400',
  catalog: '0.450', restock: '0.320',
};

const attr = (s) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const text = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function passCase(suite, name, timeSec = DURATION[name]) {
  return `    <testcase name="${name}" classname="${suite}" time="${timeSec}"/>`;
}

function failCase(suite, name, lineSalt) {
  const f = FAILURE[name];
  // vary the line number per run so normalization (:<N>) is exercised
  return (
    `    <testcase name="${name}" classname="${suite}" time="${DURATION[name]}">\n` +
    `      <failure message="${attr(f.message)}">${text(f.stack(30 + lineSalt))}</failure>\n` +
    `    </testcase>`
  );
}

// Returns one or more <testcase> strings for a test in a run. A retry flip emits
// TWO: a failed first attempt and a passing second attempt (same name), which
// flakehound groups into one execution → an intra-run retry flip.
function testcaseXml(suite, name, verdict, lineSalt) {
  if (verdict === P) return [passCase(suite, name)];
  if (verdict === F) return [failCase(suite, name, lineSalt)];
  // RF: fail-then-pass within the run
  return [failCase(suite, name, lineSalt), passCase(suite, name, '3.000')];
}

function runXml(suiteVerdicts, lineSalt) {
  // One <testsuite> per spec file, sorted by name — matching the live reporter.
  const suiteBlocks = Object.keys(suiteVerdicts)
    .sort()
    .map((suite) => {
      const verdicts = suiteVerdicts[suite];
      const cases = ORDER[suite].flatMap((t) => testcaseXml(suite, t, verdicts[t], lineSalt));
      const failures = cases.filter((c) => c.includes('<failure')).length;
      const totalTime = cases.length * 2; // cosmetic
      return (
        `  <testsuite name="${suite}" tests="${cases.length}" failures="${failures}" time="${totalTime.toFixed(3)}">\n` +
        `${cases.join('\n')}\n` +
        `  </testsuite>`
      );
    })
    .join('\n');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<testsuites>\n` +
    `${suiteBlocks}\n` +
    `</testsuites>\n`
  );
}

for (const [timestamp, commitSha, suiteVerdicts] of RUNS) {
  const day = timestamp.slice(0, 10);
  const hour = timestamp.slice(11, 13);
  // Two seed runs can share a day (2026-07-06) — suffix the hour to keep dirs unique.
  const dir = path.join(historyDir, `seed-${day}T${hour}_${commitSha}`);
  await mkdir(dir, { recursive: true });
  const lineSalt = Number(day.slice(-2));
  await writeFile(path.join(dir, 'junit.xml'), runXml(suiteVerdicts, lineSalt), 'utf8');
  await writeFile(
    path.join(dir, 'junit.meta.json'),
    `${JSON.stringify({ commitSha, timestamp, runnerId: 'seed' }, null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(`seeded ${path.relative(historyDir, dir)}\n`);
}

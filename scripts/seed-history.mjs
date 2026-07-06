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
 * the promo-pricing change that introduced all three defects — the receipt
 * total broke deterministically (regression), while the checkout timeout and
 * the payment race began flipping (flaky). That is exactly what flakehound
 * should recover from these files.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const historyDir = path.resolve(fileURLToPath(new URL('../history', import.meta.url)));

const P = 'pass';
const F = 'fail';

// chronological backstory: [date, commitSha, { test: verdict }]
const RUNS = [
  ['2026-06-30T10:00:00Z', '5eed001', { login: P, checkout: P, payment: P, receipt: P }],
  ['2026-07-01T10:00:00Z', '5eed001', { login: P, checkout: P, payment: P, receipt: P }],
  ['2026-07-02T10:00:00Z', '5eed002', { login: P, checkout: P, payment: F, receipt: F }],
  ['2026-07-03T10:00:00Z', '5eed002', { login: P, checkout: F, payment: P, receipt: F }],
  ['2026-07-04T10:00:00Z', '5eed002', { login: P, checkout: P, payment: F, receipt: F }],
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
};

const ORDER = ['login', 'checkout', 'payment', 'receipt'];
const DURATION = { login: '0.700', checkout: '20.000', payment: '1.200', receipt: '1.400' };

const attr = (s) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const text = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function testcaseXml(name, verdict, lineSalt) {
  const open = `    <testcase name="${name}" classname="shop.spec.ts" time="${DURATION[name]}"`;
  if (verdict === P) return `${open}/>`;
  const f = FAILURE[name];
  // vary the line number per run so normalization (:<N>) is exercised
  return (
    `${open}>\n` +
    `      <failure message="${attr(f.message)}">${text(f.stack(30 + lineSalt))}</failure>\n` +
    `    </testcase>`
  );
}

function runXml(verdicts, lineSalt) {
  const failures = ORDER.filter((t) => verdicts[t] === F).length;
  const body = ORDER.map((t) => testcaseXml(t, verdicts[t], lineSalt)).join('\n');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<testsuites>\n` +
    `  <testsuite name="shop.spec.ts" tests="${ORDER.length}" failures="${failures}" time="23.300">\n` +
    `${body}\n` +
    `  </testsuite>\n` +
    `</testsuites>\n`
  );
}

for (const [timestamp, commitSha, verdicts] of RUNS) {
  const day = timestamp.slice(0, 10);
  const dir = path.join(historyDir, `seed-${day}_${commitSha}`);
  await mkdir(dir, { recursive: true });
  const lineSalt = Number(day.slice(-2));
  await writeFile(path.join(dir, 'junit.xml'), runXml(verdicts, lineSalt), 'utf8');
  await writeFile(
    path.join(dir, 'junit.meta.json'),
    `${JSON.stringify({ commitSha, timestamp, runnerId: 'seed' }, null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(`seeded ${path.relative(historyDir, dir)}\n`);
}

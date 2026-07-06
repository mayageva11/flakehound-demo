import { defineConfig, devices } from '@playwright/test';

/**
 * Tests run against the LIVE shop. In CI SHOP_URL points at the GitHub
 * Pages-hosted shop (…/flakehound-demo/shop/); locally we boot a static server
 * for docs/shop automatically.
 */
const localPort = 4173;
const rawBase = process.env.SHOP_URL ?? `http://localhost:${localPort}`;
const baseURL = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
const useLiveUrl = process.env.SHOP_URL !== undefined;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // In CI, retry failures — a flaky test that fails then passes within one run
  // is flakehound's highest-confidence signal (intra-run retry flip). Locally
  // stay at 0 for fast, deterministic runs; cross-run same-commit transitions
  // still surface flakiness there.
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  reporter: [['list'], ['./tests/junit-reporter.ts']],
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(useLiveUrl
    ? {}
    : {
        webServer: {
          command: `node scripts/serve.mjs ${localPort}`,
          url: `http://localhost:${localPort}/index.html`,
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
      }),
});

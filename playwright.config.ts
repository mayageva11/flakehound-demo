import { defineConfig, devices } from '@playwright/test';

/**
 * Tests run against the LIVE shop. In CI set SHOP_URL to the Vercel deployment;
 * locally we boot a static server for app/ automatically.
 */
const localPort = 4173;
const rawBase = process.env.SHOP_URL ?? `http://localhost:${localPort}`;
const baseURL = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
const useLiveUrl = process.env.SHOP_URL !== undefined;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries: flakiness must surface as pass↔fail transitions across runs on
  // the same commit — that is exactly the signal flakehound scores.
  retries: 0,
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

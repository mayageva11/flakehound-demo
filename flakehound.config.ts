import { defineConfig } from 'flakehound';

export default defineConfig({
  /** The accumulated run history: seed backstory + live scheduled runs. */
  input: 'history/**/*.xml',
  /** The dashboard reads the report straight from docs/ (GitHub Pages). */
  output: 'docs/flakehound.report.json',

  quarantine: {
    /**
     * 5 instead of the default 10: at one scheduled run every 6 hours, a fixed
     * test earns its release in ~30 hours — fast enough to watch the
     * quarantine → fix → auto-release arc play out live on the dashboard.
     */
    stableRunsToRelease: 5,
    /** The login flow is the demo's sanity check — never auto-quarantine it. */
    criticalTests: ['shop.spec.ts > login'],
    github: {
      createIssues: true,
      repo: 'mayageva11/flakehound-demo',
    },
  },
});

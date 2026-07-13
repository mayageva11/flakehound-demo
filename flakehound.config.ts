import { defineConfig } from 'flakehound';

export default defineConfig({
  /** The accumulated run history: seed backstory + live scheduled runs. */
  input: 'history/**/*.xml',
  /** The dashboard reads the report straight from docs/ (GitHub Pages). */
  output: 'docs/flakehound.report.json',

  /**
   * `analyze` emits the dashboard itself — one self-contained HTML file with
   * the report embedded, written straight into the GitHub Pages folder. This
   * is the same thing `npx flakehound analyze --html` gives any project; no
   * copying, no separate dashboard deployment. (stableRuns rides along from
   * quarantine.stableRunsToRelease automatically; mode: 'demo' turns on this
   * repo's story-arc panel.)
   */
  html: {
    output: 'docs/index.html',
    dashboard: { mode: 'demo' },
  },

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

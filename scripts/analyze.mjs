/*
 * Runs flakehound over the accumulated history and refreshes the dashboard.
 *
 * Used identically by `npm run analyze` locally and by the scheduled workflow.
 * Steps:
 *   1. Locate the flakehound CLI (see scripts/resolve-cli.mjs — env override,
 *      the npm devDependency, a sibling checkout, or clone + build).
 *   2. Use the CURRENT docs/flakehound.report.json as the baseline (so a
 *      regression fails the gate once, then reads as "known").
 *   3. Analyze history/ (AI hypotheses via the local Ollama model when reachable,
 *      otherwise auto-skips — free) and write the fresh report into docs/.
 *   4. Write docs/last-run.json for the dashboard's "last run" stamp.
 *
 * Exit code mirrors flakehound: 0 clean, 1 new regression, 2 tool error. The
 * workflow treats 1 as informational — surfacing a regression is the point.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveFlakehoundCli } from './resolve-cli.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const reportPath = path.join(root, 'docs', 'flakehound.report.json');

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

const cli = resolveFlakehoundCli();

// Snapshot the current report as the baseline before we overwrite it.
const tmp = mkdtempSync(path.join(tmpdir(), 'flakehound-baseline-'));
const baselineArgs = [];
if (existsSync(reportPath)) {
  const baseline = path.join(tmp, 'baseline.json');
  copyFileSync(reportPath, baseline);
  baselineArgs.push('--baseline', baseline);
}

// AI hypotheses use flakehound's `auto` provider chain: a reachable local Ollama
// (your machine) annotates each cluster at zero cost; the cloud CI runner has no
// local model and no API key, so it auto-skips — free either way. Set
// FLAKEHOUND_NO_AI=1 to force the deterministic-only path.
const aiArgs = process.env.FLAKEHOUND_NO_AI ? ['--no-ai'] : [];

let exitCode = 0;
try {
  run('node', [
    cli,
    'analyze',
    '--input',
    'history/**/*.xml',
    '--json',
    reportPath,
    ...aiArgs,
    ...baselineArgs,
  ], { cwd: root });
} catch (error) {
  exitCode = typeof error.status === 'number' ? error.status : 2;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// Dashboard stamp: when this ran, on what commit, and how it was triggered.
writeFileSync(
  path.join(root, 'docs', 'last-run.json'),
  `${JSON.stringify(
    {
      lastRun: new Date().toISOString(),
      commitSha: (process.env.GITHUB_SHA ?? 'local').slice(0, 7),
      trigger: process.env.GITHUB_EVENT_NAME ?? 'manual',
      runNumber: process.env.GITHUB_RUN_NUMBER ?? null,
    },
    null,
    2,
  )}\n`,
);

process.exitCode = exitCode;

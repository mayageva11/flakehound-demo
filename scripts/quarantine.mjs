/*
 * Applies flakehound's quarantine verdicts to this repo — the live half of the
 * demo's quarantine story.
 *
 * Runs `flakehound quarantine --apply` (config in flakehound.config.ts):
 *   · tags newly high-confidence flaky tests with @flakehound-quarantined in
 *     their spec files and files one GitHub issue per test (GITHUB_TOKEN),
 *   · releases tests that posted `stableRunsToRelease` consecutive clean
 *     passes — untagging the spec and closing the issue,
 *   · records everything in flakehound.quarantine.json.
 *
 * It never commits: the workflow's existing bot-commit step picks up the spec
 * edits and state file alongside the fresh history and report. The state copy
 * in docs/ feeds the dashboard's Quarantine panel.
 *
 * Exit codes: flakehound's 1 ("actions taken") is the demo working as
 * intended → exit 0. Only 2 (tool error) fails the job.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveFlakehoundCli } from './resolve-cli.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const cli = resolveFlakehoundCli();

let exitCode = 0;
try {
  execFileSync('node', [cli, 'quarantine', '--apply'], { cwd: root, stdio: 'inherit' });
} catch (error) {
  exitCode = typeof error.status === 'number' ? error.status : 2;
}

// 1 = quarantined/released something this run — informational for the pipeline.
if (exitCode === 1) exitCode = 0;

// Sync the state to docs/ for the dashboard, even when nothing changed this
// run (covers hand-edits and keeps Pages consistent with the repo root).
const statePath = path.join(root, 'flakehound.quarantine.json');
if (existsSync(statePath)) {
  copyFileSync(statePath, path.join(root, 'docs', 'flakehound.quarantine.json'));
}

process.exitCode = exitCode;

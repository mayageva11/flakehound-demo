/*
 * Locates a runnable flakehound CLI, shared by analyze.mjs and quarantine.mjs.
 *
 * Resolution order:
 *   1. FLAKEHOUND_CLI env — explicit override (local development against a
 *      work-in-progress flakehound checkout).
 *   2. node_modules/flakehound — the pinned npm devDependency; what CI uses.
 *   3. ../flakehound sibling checkout (built).
 *   4. Clone + build into .flakehound/ as a last resort.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const FLAKEHOUND_REPO = 'https://github.com/mayageva11/flakehound.git';

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

export function resolveFlakehoundCli() {
  const fromEnv = process.env.FLAKEHOUND_CLI;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const fromNpm = path.join(root, 'node_modules', 'flakehound', 'dist', 'cli.js');
  if (existsSync(fromNpm)) return fromNpm;

  const sibling = path.resolve(root, '..', 'flakehound', 'dist', 'cli.js');
  if (existsSync(sibling)) return sibling;

  const vendored = path.join(root, '.flakehound');
  const cli = path.join(vendored, 'dist', 'cli.js');
  if (!existsSync(cli)) {
    if (!existsSync(vendored)) {
      const ref = process.env.FLAKEHOUND_REF ?? 'main';
      run('git', ['clone', '--depth', '1', '--branch', ref, FLAKEHOUND_REPO, vendored]);
    }
    run('npm', ['ci'], { cwd: vendored });
    run('npm', ['run', 'build'], { cwd: vendored });
  }
  return cli;
}

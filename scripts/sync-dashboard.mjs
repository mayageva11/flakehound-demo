// Sync docs/index.html from the canonical dashboard in the flakehound repo.
// docs/index.html is a GENERATED artifact: the dashboard is developed in
// mayageva11/flakehound (docs/index.html there); this script fetches it and
// injects the demo's config block. Used by BOTH workflows — the 6-hourly
// flakehound.yml pipeline and the instant sync-dashboard.yml — so there is
// exactly one implementation to keep correct.
// Zero dependencies on purpose (the demo stays light).
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://raw.githubusercontent.com/mayageva11/flakehound/main/docs/index.html';
const CONFIG_BLOCK = [
  '<head>',
  '<!-- flakehound-dashboard-config -->',
  '<script>window.FHCONFIG = { stableRuns: 5, mode: "demo" };</script>',
].join('\n');

const target = path.resolve(fileURLToPath(new URL('../docs/index.html', import.meta.url)));

// A failed fetch must leave the committed copy untouched — the demo keeps
// serving the previous dashboard rather than a broken page.
const res = await fetch(SOURCE);
if (!res.ok) {
  console.error(`sync-dashboard: fetch failed (${res.status} ${res.statusText}) — keeping the committed copy`);
  process.exit(1);
}
const html = await res.text();
if (!html.includes('<head>')) {
  console.error('sync-dashboard: fetched file has no <head> to inject into — keeping the committed copy');
  process.exit(1);
}

await writeFile(target, html.replace('<head>', CONFIG_BLOCK), 'utf8');
console.log(`sync-dashboard: wrote ${target} (${html.length} bytes fetched, FHCONFIG injected)`);

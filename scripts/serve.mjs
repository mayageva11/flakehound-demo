// Minimal static file server for the shop (docs/shop) — used locally by
// Playwright's webServer. Zero dependencies on purpose (the demo stays light).
// In production the same files are served by GitHub Pages at /shop/.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.argv[2] ?? 4173);
const root = path.resolve(fileURLToPath(new URL('../docs/shop', import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname.endsWith('/')) pathname += 'index.html';
    const filePath = path.join(root, pathname);
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, { 'content-type': TYPES[path.extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
}).listen(port, () => {
  process.stdout.write(`Flaky Shop static server on http://localhost:${port}\n`);
});

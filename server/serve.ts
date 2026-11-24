// Local server for Windows/macOS/Linux: serves the built app from dist/. No login, no accounts.
// Bundled to dist-server/serve.mjs by `npm run build`. Needs Node 18+, nothing else.
//
//   node dist-server/serve.mjs              this PC only, http://localhost:4173
//   set HOST=0.0.0.0 && node ...serve.mjs   also reachable from your home network
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// APP_DIR lets the installed layout point at {app}\app instead of ../dist
const DIST = path.resolve(process.env.APP_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist'));
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
};
const HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' };

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ is missing. Run: npm run build');
  process.exit(1);
}

http
  .createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, HEADERS).end();
      return;
    }
    let rel: string;
    try {
      rel = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    } catch {
      res.writeHead(400, HEADERS).end();
      return;
    }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(DIST, '.' + rel);
    if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { ...HEADERS, 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      ...HEADERS,
      'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, HOST, () => {
    console.log(`Inkgrid running at http://localhost:${PORT}`);
    if (HOST === '0.0.0.0')
      for (const nets of Object.values(os.networkInterfaces()))
        for (const n of nets ?? []) if (n.family === 'IPv4' && !n.internal) console.log(`  on your network: http://${n.address}:${PORT}`);
    console.log('Close this window or press Ctrl+C to stop.');
  });

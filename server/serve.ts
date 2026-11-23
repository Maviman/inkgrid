// Self-hosted server for Windows/macOS/Linux: serves dist/ and puts the passphrase gate in front.
// Bundled to dist-server/serve.mjs by `npm run build`. Needs Node 18+, no other installs.
//
//   node dist-server/serve.mjs                    start (reads .env next to package.json)
//   node dist-server/serve.mjs --set-passphrase   write GATE_PASSPHRASE + a fresh GATE_SECRET to .env
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { gate } from './gate';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const ENV_FILE = path.join(ROOT, '.env');

function readEnvFile(): Record<string, string> {
  if (!fs.existsSync(ENV_FILE)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith('#')) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

async function setPassphrase() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((r) => rl.question(q, r));
  const pass = (await ask('New passphrase (12+ characters): ')).trim();
  rl.close();
  if (pass.length < 12) {
    console.error('Too short, nothing changed.');
    process.exit(1);
  }
  const keep = Object.entries(readEnvFile()).filter(([k]) => k !== 'GATE_PASSPHRASE' && k !== 'GATE_SECRET');
  const lines = [...keep.map(([k, v]) => `${k}=${v}`), `GATE_PASSPHRASE=${pass}`, `GATE_SECRET=${crypto.randomBytes(36).toString('base64url')}`];
  fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n', { mode: 0o600 });
  console.log('Saved to .env. Existing logins are signed out (new secret).');
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(url: URL): Response {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(DIST, '.' + rel);
  if (!file.startsWith(DIST + path.sep)) return new Response('Not found', { status: 404 });
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('Not found', { status: 404 });
  const ext = path.extname(file).toLowerCase();
  const cache = rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
  return new Response(fs.readFileSync(file), { headers: { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': cache } });
}

const isLoopback = (h: string) => h === '127.0.0.1' || h === 'localhost' || h === '::1';

async function main() {
  if (process.argv.includes('--set-passphrase')) return setPassphrase();
  const env = { ...readEnvFile(), ...process.env } as Record<string, string | undefined>;
  const host = env.HOST || '127.0.0.1';
  const port = Number(env.PORT || 4173);
  const gated = !!env.GATE_PASSPHRASE;
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('dist/ is missing. Run: npm run build');
    process.exit(1);
  }
  if (!gated && !isLoopback(host)) {
    console.error(`Refusing to listen on ${host} without a passphrase. Run: npm run passphrase`);
    process.exit(1);
  }
  if (gated && (!env.GATE_SECRET || env.GATE_SECRET.length < 32)) {
    console.error('GATE_SECRET missing or short. Run: npm run passphrase');
    process.exit(1);
  }
  // plain http on a LAN: browsers drop Secure cookies except on localhost
  const secureCookie = env.HTTPS === '1' || isLoopback(host);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      const request = new Request(url, {
        method: req.method,
        headers,
        body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
        // @ts-expect-error node needs this for streamed bodies
        duplex: hasBody ? 'half' : undefined,
      });
      const next = async () => serveStatic(url);
      const response = gated ? await gate(request, env, next, { secureCookie }) : await next();
      res.statusCode = response.status;
      response.headers.forEach((v, k) => {
        if (k !== 'set-cookie') res.setHeader(k, v);
      });
      const cookies = response.headers.getSetCookie?.() ?? [];
      if (cookies.length) res.setHeader('set-cookie', cookies);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      console.error(err);
      res.statusCode = 500;
      res.end('Server error');
    }
  });
  server.listen(port, host, () => {
    console.log(`Inkgrid running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}  (gate ${gated ? 'on' : 'off'})`);
    if (host === '0.0.0.0') {
      for (const nets of Object.values(os.networkInterfaces()))
        for (const n of nets ?? []) if (n.family === 'IPv4' && !n.internal) console.log(`  on your network: http://${n.address}:${port}`);
    }
    console.log('Close this window or press Ctrl+C to stop.');
  });
}

main();

// Single-user access gate. Runs at the edge (Cloudflare Pages Functions) in front of
// every request. Passphrase -> HMAC-signed, HttpOnly cookie. No database.

export interface GateEnv {
  GATE_PASSPHRASE?: string; // the one passphrase that unlocks the app
  GATE_SECRET?: string; // random 32+ chars used to sign the cookie
}

const COOKIE = 'ig_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const enc = new TextEncoder();

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Constant-time string equality on SHA-256 digests (length-independent). */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function makeToken(secret: string, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + MAX_AGE;
  return `${exp}.${await hmac(secret, String(exp))}`;
}

export async function validToken(secret: string, token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) * 1000 < now) return false;
  return safeEqual(sig, await hmac(secret, exp));
}

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get('cookie') ?? '';
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return undefined;
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
};

function page(error = false): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Inkgrid · locked</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1113;color:#e8ebe9;font:14px system-ui,sans-serif}form{background:#171a1d;border:1px solid #2a2f34;border-radius:10px;padding:24px;width:min(340px,90vw);display:flex;flex-direction:column;gap:12px}h1{margin:0;font:700 16px ui-monospace,monospace}label{color:#9aa39f;font-size:12px}input{height:36px;background:#0f1113;border:1px solid #5f6870;border-radius:6px;color:#e8ebe9;padding:0 10px;font:14px system-ui}button{height:36px;border:0;border-radius:6px;background:#5fe3a1;color:#0b1a12;font-weight:600;cursor:pointer}p{margin:0;color:#ff6b6b;font-size:12px}:focus-visible{outline:2px solid #5fe3a1;outline-offset:2px}</style></head>
<body><form method="post" action="/login"><h1>Inkgrid</h1><label for="p">Passphrase</label><input id="p" name="pass" type="password" autocomplete="current-password" autofocus required>${error ? '<p role="alert">That passphrase did not match.</p>' : ''}<button type="submit">Unlock</button></form></body></html>`;
  return new Response(html, { status: error ? 401 : 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS } });
}

function redirect(to: string, cookie?: string): Response {
  const h = new Headers({ location: to, 'cache-control': 'no-store', ...SECURITY_HEADERS });
  if (cookie) h.append('set-cookie', cookie);
  return new Response(null, { status: 303, headers: h });
}

export interface GateOptions {
  /** Add the Secure cookie flag. Off only for plain-http self-hosting on a LAN. */
  secureCookie?: boolean;
}

export async function gate(req: Request, env: GateEnv, next: () => Promise<Response>, opts: GateOptions = {}): Promise<Response> {
  const url = new URL(req.url);
  const secure = opts.secureCookie === false ? '' : ' Secure;';
  if (!env.GATE_PASSPHRASE || !env.GATE_SECRET || env.GATE_SECRET.length < 32) {
    return new Response('Gate is not configured: set GATE_PASSPHRASE and GATE_SECRET (32+ chars).', { status: 503 });
  }
  if (url.pathname === '/login') {
    if (req.method === 'POST') {
      const form = await req.formData().catch(() => null);
      const pass = String(form?.get('pass') ?? '');
      if (pass && (await safeEqual(pass, env.GATE_PASSPHRASE))) {
        const token = await makeToken(env.GATE_SECRET);
        return redirect('/', `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly;${secure} SameSite=Strict`);
      }
      await new Promise((r) => setTimeout(r, 600)); // slow down guessing
      return page(true);
    }
    return page();
  }
  if (url.pathname === '/logout' && req.method === 'POST') {
    return redirect('/login', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly;${secure} SameSite=Strict`);
  }
  if (!(await validToken(env.GATE_SECRET, readCookie(req, COOKIE)))) {
    return redirect('/login');
  }
  // lets the page know a gate is in front of it (shows the Lock button)
  if (url.pathname === '/__gate') return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  const res = await next();
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}

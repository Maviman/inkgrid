import { describe, expect, it } from 'vitest';
import { gate, makeToken, validToken } from '../server/gate';

const env = { GATE_PASSPHRASE: 'correct horse battery', GATE_SECRET: 'x'.repeat(40) };
const ok = async () => new Response('app', { status: 200 });
const form = (pass: string) => {
  const f = new FormData();
  f.set('pass', pass);
  return f;
};

describe('gate', () => {
  it('refuses to run unconfigured', async () => {
    const r = await gate(new Request('https://a.test/'), {}, ok);
    expect(r.status).toBe(503);
  });
  it('redirects to login without a cookie', async () => {
    const r = await gate(new Request('https://a.test/'), env, ok);
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toBe('/login');
  });
  it('serves the login form', async () => {
    const r = await gate(new Request('https://a.test/login'), env, ok);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('name="pass"');
  });
  it('rejects a wrong passphrase', async () => {
    const r = await gate(new Request('https://a.test/login', { method: 'POST', body: form('nope') }), env, ok);
    expect(r.status).toBe(401);
    expect(r.headers.get('set-cookie')).toBeNull();
  });
  it('accepts the passphrase and the cookie then works', async () => {
    const r = await gate(new Request('https://a.test/login', { method: 'POST', body: form(env.GATE_PASSPHRASE) }), env, ok);
    expect(r.status).toBe(303);
    const cookie = r.headers.get('set-cookie')!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Strict/);
    const value = cookie.split(';')[0];
    const r2 = await gate(new Request('https://a.test/', { headers: { cookie: value } }), env, ok);
    expect(r2.status).toBe(200);
    expect(await r2.text()).toBe('app');
    expect(r2.headers.get('x-frame-options')).toBe('DENY');
  });
  it('rejects tampered, expired and foreign tokens', async () => {
    const t = await makeToken(env.GATE_SECRET);
    expect(await validToken(env.GATE_SECRET, t)).toBe(true);
    expect(await validToken(env.GATE_SECRET, t.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')))).toBe(false);
    expect(await validToken('y'.repeat(40), t)).toBe(false);
    const old = await makeToken(env.GATE_SECRET, Date.now() - 31 * 864e5);
    expect(await validToken(env.GATE_SECRET, old)).toBe(false);
    const [, sig] = t.split('.');
    expect(await validToken(env.GATE_SECRET, `99999999999.${sig}`)).toBe(false);
  });
  it('logout clears the cookie', async () => {
    const r = await gate(new Request('https://a.test/logout', { method: 'POST' }), env, ok);
    expect(r.headers.get('set-cookie')).toMatch(/Max-Age=0/);
  });
});

describe('gate on plain-http LAN', () => {
  it('drops the Secure flag when asked, and reports itself', async () => {
    const f = new FormData();
    f.set('pass', env.GATE_PASSPHRASE);
    const r = await gate(new Request('http://192.168.1.5/login', { method: 'POST', body: f }), env, ok, { secureCookie: false });
    const cookie = r.headers.get('set-cookie')!;
    expect(cookie).not.toMatch(/Secure/);
    const r2 = await gate(new Request('http://192.168.1.5/__gate', { headers: { cookie: cookie.split(';')[0] } }), env, ok);
    expect(r2.status).toBe(204);
  });
});

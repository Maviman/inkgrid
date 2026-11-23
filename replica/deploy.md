# Deploy checklist: Inkgrid

Date: 2026-11-23  Commit: b4d1a48  Go from user: yes (self-host on Windows)

## Preflight

- [x] e2e suite green: 16/16 (plus 24/24 unit)
- [x] no open S1 or S2 bugs (3 S3/S4 found and fixed)
- [x] parity: must-haves 15/15, feature score 98.8
- [x] rebrand sweep clean
- [x] production build passes (45 kB JS, 17 kB gzipped)
- [x] gate verified end to end under `wrangler pages dev` (303 to login, 401 on wrong pass, cookie, assets gated)
- [x] favicon, title, logo are original
- N/A store listing, privacy policy/terms, account deletion, Stripe, OAuth, email domain (one user, no data leaves the browser)

## Production: self-hosted on Jordan's Windows PC (chosen 2026-11-23)

- [x] `server/serve.ts` -> `dist-server/serve.mjs` (bundled, zero runtime deps): serves dist/, runs the same gate as the edge version
- [x] Binds 127.0.0.1 by default; refuses to bind a LAN address without a passphrase
- [x] Secure cookie flag on loopback/HTTPS, dropped on plain-http LAN (browsers would discard it otherwise)
- [x] Path traversal blocked, security headers, noindex
- [x] `start.cmd`: checks Node, builds if needed, asks for a passphrase on first run, opens the browser
- [x] Tested: gate off on loopback, refuses LAN without pass, login/wrong pass/lock on 127.0.0.1 and on a LAN IP
- [ ] Jordan: run start.cmd once and set a passphrase
- N/A domain, DNS, email, Stripe, OAuth, monitoring

Cloudflare Pages remains possible later (functions/_middleware.ts), not used.

# Deploy checklist: Inkgrid

Date: 2026-11-23  Commit: b4d1a48  Go from user: yes (local on Windows, no login)

## Preflight

- [x] e2e suite green: 16/16 (plus 24/24 unit)
- [x] no open S1 or S2 bugs (3 S3/S4 found and fixed)
- [x] parity: must-haves 15/15, feature score 98.8
- [x] rebrand sweep clean
- [x] production build passes (45 kB JS, 17 kB gzipped)
- [x] gate verified end to end under `wrangler pages dev` (303 to login, 401 on wrong pass, cookie, assets gated)
- [x] favicon, title, logo are original
- N/A store listing, privacy policy/terms, account deletion, Stripe, OAuth, email domain (one user, no data leaves the browser)

## Production: local app on Jordan's Windows PC (2026-11-24)

Jordan asked for no login, password or accounts of any kind, so the passphrase gate was removed entirely (server/gate.ts, functions/, Lock button, gate tests).

- [x] `server/serve.ts` -> `dist-server/serve.mjs`: static server, zero runtime deps, GET/HEAD only, path traversal blocked, noindex
- [x] Listens on 127.0.0.1:4173 by default (this PC only); `HOST=0.0.0.0` opts in to the home network
- [x] `start.cmd`: checks Node, builds if needed, opens the browser
- N/A domain, DNS, email, Stripe, OAuth, monitoring, auth

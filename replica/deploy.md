# Deploy checklist: Inkgrid

Date: 2026-11-23  Commit: b4d1a48  Go from user: not yet

## Preflight

- [x] e2e suite green: 16/16 (plus 24/24 unit)
- [x] no open S1 or S2 bugs (3 S3/S4 found and fixed)
- [x] parity: must-haves 15/15, feature score 98.8
- [x] rebrand sweep clean
- [x] production build passes (45 kB JS, 17 kB gzipped)
- [x] gate verified end to end under `wrangler pages dev` (303 to login, 401 on wrong pass, cookie, assets gated)
- [x] favicon, title, logo are original
- N/A store listing, privacy policy/terms, account deletion, Stripe, OAuth, email domain (one user, no data leaves the browser)

## Production (Cloudflare Pages, recommended)

1. Jordan: create a Cloudflare account (free) if needed, then either
   - connect a GitHub repo holding this code in Pages (build: `npm run build`, output: `dist`), or
   - run `npx wrangler pages deploy dist --project-name inkgrid` locally after `npx wrangler login`.
2. Pages > Settings > Variables and secrets (Production, encrypted):
   - GATE_PASSPHRASE: your passphrase
   - GATE_SECRET: output of `openssl rand -base64 48`
3. Optional extra lock: Cloudflare Zero Trust > Access > self-hosted app on the Pages domain, policy "emails = yours" (free under 50 users). Works in front of the passphrase.
4. Optional custom domain: Pages > Custom domains (DNS managed by Cloudflare, HTTPS automatic).

## Watch

- N/A error tracking/analytics (deliberately none; nothing phones home)
- [ ] core flow done on the live site, desktop and phone (after deploy)

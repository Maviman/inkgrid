# Inkgrid

Private image/video to ASCII converter. All rendering happens in your browser; the only server code is a small Node server with a passphrase gate.

## Run it on Windows

1. Install Node.js 18 or newer (https://nodejs.org) if you don't have it.
2. Double-click `start.cmd`.
   - First run asks you to pick a passphrase (saved to `.env` in this folder).
   - It opens http://localhost:4173. Enter the passphrase once; the login lasts 30 days.
3. Close the window to stop it.

`dist/` and `dist-server/` ship prebuilt, so running needs nothing but Node. No `npm install` unless you change code.

**Change the passphrase:** `node dist-server\serve.mjs --set-passphrase` (signs out every browser).

**Use it from your phone or another PC on your network:** add `HOST=0.0.0.0` to `.env`, restart, allow Node through the Windows Firewall prompt (Private networks only), then open the "on your network" address it prints. Over plain http on the LAN the cookie can't use the Secure flag, so keep this to your home network.

**Start with Windows (optional):** Task Scheduler > Create Basic Task > "When I log on" > Start a program: `node`, arguments `dist-server\serve.mjs`, start in: this folder.

## Develop

```bash
npm install
npm run dev            # http://localhost:5173, no gate
npm test               # unit tests (core math, gate)
npx playwright test --trace off   # browser tests
npm run build          # dist/ + dist-server/serve.mjs
```

Cloudflare Pages also works if you ever want it hosted (functions/_middleware.ts uses the same gate). Planning docs from the Replica pack are in `replica/`.

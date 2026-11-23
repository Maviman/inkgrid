# Inkgrid

Private image/video to ASCII converter. Everything renders in the browser.

**Run it on Windows:** double-click `start.cmd` (needs Node.js 18+). First run installs packages, then it opens http://localhost:4173. Close the window to stop it.

The passphrase gate in `server/` + `functions/` is only used if you ever host it on Cloudflare Pages; locally there is no gate.

```bash
npm install
npm run dev            # http://localhost:5173 (no gate in dev)
npm test               # unit tests
npx playwright test --trace off   # e2e
npm run build          # -> dist/
```

Deploy: see replica/deploy.md. Needs GATE_PASSPHRASE and GATE_SECRET (see .env.example).
Planning docs from the Replica pack are in replica/.

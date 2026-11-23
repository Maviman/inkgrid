# Inkgrid

Private image/video to ASCII converter. Everything renders in the browser; the only server code is a passphrase gate.

```bash
npm install
npm run dev            # http://localhost:5173 (no gate in dev)
npm test               # unit tests
npx playwright test --trace off   # e2e
npm run build          # -> dist/
```

Deploy: see replica/deploy.md. Needs GATE_PASSPHRASE and GATE_SECRET (see .env.example).
Planning docs from the Replica pack are in replica/.

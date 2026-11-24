# Inkgrid

Private image/video to ASCII converter. Everything renders in your browser. No login, no accounts, nothing uploaded anywhere.

## Run it on Windows

1. Install Node.js 18 or newer (https://nodejs.org) if you don't have it.
2. Double-click `start.cmd`. It opens http://localhost:4173.
3. Close the window to stop it.

`dist/` and `dist-server/` ship prebuilt, so running needs nothing but Node.

**Use it from your phone or another PC on your home network:** edit `start.cmd` and put `set HOST=0.0.0.0` on the line before `node dist-server\serve.mjs`, then allow Node through the Windows Firewall prompt (Private networks only). It prints the address to open. With no login, anyone on that network can open it, so only do this at home.

**Start with Windows (optional):** Task Scheduler > Create Basic Task > "When I log on" > Start a program: `node`, arguments `dist-server\serve.mjs`, start in: this folder.

## Develop

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # unit tests
npx playwright test --trace off   # browser tests
npm run build          # dist/ + dist-server/serve.mjs
```

Planning docs from the Replica pack are in `replica/`.

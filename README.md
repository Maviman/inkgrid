# Inkgrid

Private image/video to ASCII converter. Everything renders on your PC. No login, no accounts, nothing uploaded.

## Install on Windows (recommended)

1. Download **[Inkgrid-Setup.exe](https://github.com/Maviman/inkgrid/releases/latest/download/Inkgrid-Setup.exe)** from the latest release.
2. Run it. No admin rights needed: it installs for your user only, into `%LOCALAPPDATA%\Programs\Inkgrid`.
   - **SmartScreen:** the installer isn't code-signed, so Windows may say *"Windows protected your PC"*. Click **More info**, then **Run anyway**. (Optionally right-click the file > Properties > tick **Unblock** first.) Compare the SHA-256 in the release notes if you want to be sure it's the file CI built.
3. The wizard shows a **System check** page (Edge, .NET Framework) and lets you tick:
   - **Home-network server** (optional, bundles Node.js) to open Inkgrid from your phone or another PC.
   - **Desktop shortcut**.
4. Start it from the Start Menu. It opens in its own window and works offline.

**Update:** run a newer `Inkgrid-Setup.exe`; it upgrades in place and keeps your settings.
**Uninstall:** Settings > Apps > Installed apps > Inkgrid. It asks before deleting your settings (`%LOCALAPPDATA%\Inkgrid`); the default keeps them. Silent: `unins000.exe /VERYSILENT` keeps data, add `/PURGE` to delete it.
**Requirements:** Windows 10 1809+ or 11, 64-bit. No GPU driver, CUDA or VC++ runtime needed; Edge is used for the app window (default browser otherwise).

### Building the installer

CI (`.github/workflows/windows-installer.yml`) builds it on `windows-latest`, silently installs it, launches the app and checks it renders, tests an in-place upgrade and both uninstall modes, and only then publishes a release on `v*` tags. The version comes from `package.json`; a tag must match it. To cut a release: bump `version` in `package.json`, merge, then `git tag v1.2.3 && git push --tags`.

Locally on Windows: `powershell -ExecutionPolicy Bypass -File packaging\build.ps1` writes `out\Inkgrid-Setup.exe` (needs Node.js and Inno Setup 6, which the script installs with Chocolatey if missing).

## Run from source (alternative)

1. Install Node.js 18 or newer (https://nodejs.org) if you don't have it.
2. Double-click `start.cmd`. It opens http://localhost:4173.
3. Close the window to stop it.

From a source checkout, `start.cmd` runs `npm install` and `npm run build` the first time (needs Node.js 18+), then serves the app at http://localhost:4173.

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

# Architecture: personal ASCII converter

Source: replica/recon.md, replica/features.csv. One user, no data leaves the browser.

## Stack

| layer | choice | why |
| --- | --- | --- |
| web app | Vite + TypeScript, no UI framework | one screen, ~60 controls; a framework adds weight and nothing else |
| rendering | Canvas 2D, glyph atlas + per-cell drawImage | fast enough for 200+ cols at 30 fps video; no WebGL dependency |
| styling | plain CSS with custom properties from replica-design tokens | tokens map 1:1, no build plugin |
| state | one `Settings` object, JSON-serialisable, saved to localStorage | presets are just partial Settings |
| export | canvas.toBlob (PNG), MediaRecorder on canvas.captureStream (WebM), text/clipboard | all native browser APIs |
| database | none | nothing to store server-side |
| auth | Cloudflare Pages Function middleware: passphrase -> HMAC-signed cookie (or Cloudflare Access in front, zero code) | single user; see replica-backend |
| hosting | Cloudflare Pages (static + one function), free tier | static files + edge middleware in one place; Jordan's choice at deploy |
| tests | Vitest (pure functions) + Playwright (e2e) | Playwright already in the toolchain |

## Schema

No SQL. The only "schema" is the client `Settings` type in `src/settings.ts`, persisted under one localStorage key with a `version` field so old saves are migrated or dropped, never crash.

## API

| method path | what | who | in | out | flow |
| --- | --- | --- | --- | --- | --- |
| GET /* | static app | gated by middleware | cookie | html/js | all |
| GET /login | passphrase form | anyone | | html | gate |
| POST /login | check passphrase, set cookie | anyone, rate-limited by Cloudflare | form `pass` | 303 + Set-Cookie | gate |
| POST /logout | clear cookie | owner | | 303 | gate |

No webhooks, no jobs.

## Parts that bite

- **Per-frame cost**: sample source into a cols x rows offscreen canvas (GPU downscale), read once with getImageData, map to glyph index, blit from a pre-rendered glyph atlas. Never fillText per cell per frame for big grids.
- **Export resolution**: re-render at target size (720p/1080p/4K long edge) into an offscreen canvas, not by upscaling the preview.
- **Video export**: MediaRecorder is realtime; export length = clip length. Fall back message if `MediaRecorder` or VP9 missing (Safari -> mp4 where supported).
- **Memory**: 4K + bloom = several full-size canvases; reuse buffers.
- **File limits**: reject non-image/video; downscale sources > 4096 px on load.
- **Fonts**: bundle an OFL mono font (JetBrains Mono, OFL) locally, never the original's.
- **Auth**: constant-time compare, HttpOnly+Secure+SameSite=Strict cookie, 30-day expiry, secret in env only.

## Build order

1. **Vertical slice**: upload -> classic ramp -> canvas preview -> PNG download. (S01, S03)
2. **Must-haves**: styles + custom ramp, cols, tone, auto levels/invert, colour modes, ink, backgrounds incl. transparent, preset strip with live thumbs, drag-drop, sample, in-browser only.
3. **Should-haves**: video in/out, compare split, dither, letter spacing, tiles, palettes, boost, overlay/blend, contours, CRT effects, double-click reset, text copy.
4. **Could-haves**: particle, film, drift, bricks, animate flicker/twinkle, immersive, collapsible sections.
5. **Gate + deploy**.

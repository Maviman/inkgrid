# Recon map: ASCII art generator (web)

Scope: the converter app only (image/video -> styled ASCII, live preview, export). Not the library, admin or accounts.
For: Jordan, personal single-user tool. Not distributed.
Date: 2026-11-23

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | the live app (public, signed out) | https://devault.design/ascii-art-generator/app/ | read via accessibility tree + 2 screenshots, human pace |
| 2 | export gate dialog | same page, "Download image" | export requires a free account; not created |

No source code, bundles or network calls were read. Everything below is from visible UI.

## Core loop

Drop in a picture or clip, pick a look, tune a few sliders, download a PNG or video.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Editor | /app/ | everything: preview, presets, controls | header, preview canvas, video bar, compare, preset strip, sidebar sections, download bar | filled (sample), loading ("Loading…"), video playing |
| S02 | Drop overlay | drag a file over the page | accept image or video | full-page overlay "Drop an image or video" | dragging |
| S03 | Export dialog | Download image / video | choose resolution, render, download | modal, 720p/1080p/4K, Back, Cancel; original gates this behind sign-in | signed-out gate |
| S04 | Immersive view | expand button on preview | full-window preview | canvas only, exit | |

## Flows

```
F01 Convert a picture
    S01 -> Upload (picker) -> S01 preview updates -> Download image -> S03 pick 1080p -> file saved
    happy path clicks: 4 (original adds sign-in, ~8)
    edge: huge image, non-image file, transparent PNG, very wide/tall aspect

F02 Try looks
    S01 -> click preset thumbnail -> controls jump to preset values -> tweak slider -> double-click resets it

F03 Convert a video
    S02 drop .mp4 -> S01 plays live -> Download video -> S03 -> render (realtime) -> .webm
    edge: long clip, no MediaRecorder support, audio track

F04 Compare
    S01 -> Compare -> drag line across preview to reveal source
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary (light fill), secondary (outline), ghost/icon | default, hover, focus, active/selected, disabled | all |
| Segmented control | 2-7 options | selected | font, dither, colour mode, bg, blend, letter colour |
| Style tile | glyph sample + label | selected | Style grid (15) |
| Slider | with value readout, double-click reset | dragging, at default | sidebar (~45) |
| Switch | on/off | | toggles (~6) |
| Colour input | swatch + hex text | invalid hex | ink, background |
| Section | collapsible header | open/closed, hidden when not relevant to style | sidebar |
| Preset card | live thumbnail + label | selected | preset strip (19) |
| Modal | | open | S03 |
| Video bar | play/pause, seek, time | | S01 |

## Inferred data model

No server data. One client-side object:

```
Settings  style, charset(custom), dither, font, cols, letterSpacing, tileGap, softEdge,
          tone{brightness, contrast, gamma, hideShadows, irregularity, autoLevels, invert},
          colour{mode: mono|original|palette, ink, palette, boost, bg: dark|black|paper|custom|clear, bgColor},
          overlay{keepImage, imageOpacity, glyphOpacity, shadowFade, blend},
          contours{on, strength, smoothing},
          fx{animate, bloom, scanlines, curvature, chroma, vignette, grain, flicker, twinkle},
          style-specific blocks: particles, film, drift, letters
  evidence: sidebar controls; confidence: high
Preset    name, partial Settings  (evidence: preset click applies values; confidence: high)
Source    kind image|video, name, width, height (evidence: info line "760×784 → 130×67 cells")
```

## What cannot / will not be cloned

- Accounts, Google sign-in, admin: replaced by a single-user gate.
- The ASCII library and its content: owned by the original.
- Name, logo, copy, sample media, bundled font: replaced with original ones.

## Size

1 real screen + 3 overlays, 4 flows, 0 server entities. Hard parts: (1) fast per-frame render for video at high column counts, (2) the particle/film/drift looks, (3) video export via MediaRecorder at 4K. Size: S-M (a weekend for core, more for every exotic look).

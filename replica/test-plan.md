# Test plan

Automated: `npm test` (24 unit tests: tone, dither, glyph builders, colour, access gate) and
`npx playwright test --trace off` (16 e2e cases in e2e/convert.spec.ts). Every e2e case fails on console
errors, page errors and 5xx; F01-H1 runs an axe scan (serious/critical).

| ID | case | how |
| --- | --- | --- |
| F01-H1 | demo scene renders on load, no a11y blockers | e2e |
| F01-H2 | open PNG, save 1080p PNG, width is 1920 | e2e |
| F01-H3 | drag and drop a file | e2e |
| F01-E1 | non-image file rejected with message, previous picture kept | e2e |
| F01-E2 | 6000px image capped to 4096 | e2e |
| F02-H1 | all 14 styles render distinct output | e2e |
| F02-H2 | preset applies; manual change unmarks it; double-click resets | e2e |
| F02-H3 | settings survive reload | e2e |
| F02-H4 | contextual sections; emoji in custom ramp | e2e |
| F02-E1 | invalid hex flagged, not applied | e2e |
| F02-H5 | copy text; disabled for shape styles | e2e |
| F03-H1 | video load, pause, seek, export WebM | e2e |
| F03-E1 | still + no animation: video export disabled with reason | e2e |
| F04-H1 | split view changes the canvas | e2e |
| M-1 | 390px wide: no horizontal scroll, export reachable | e2e |
| K-1 | keyboard: preset via Enter, slider via arrows | e2e |
| G-1..7 | gate: unconfigured 503, redirect, wrong pass 401 + delay, cookie flags, tamper/expiry/foreign-secret, logout | unit |

Manual (after deploy, on Jordan's machine): real GPU frame rate for Tube and Particles looks, 4K video export, Safari/iOS video export (MP4 path), gate login on the real domain.

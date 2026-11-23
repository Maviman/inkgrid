## Parity: 98.8 / 100

features 98.8  (38 counted, must-haves 15 of 15 done)

## By area, weakest first
- style                         95.2  (12 features)
- input                        100.0  (4 features)
- preview                      100.0  (4 features)
- tone                         100.0  (3 features)
- colour                       100.0  (5 features)
- overlay                      100.0  (1 features)
- contours                     100.0  (1 features)
- effects                      100.0  (2 features)
- presets                      100.0  (1 features)
- controls                     100.0  (2 features)
- export                       100.0  (2 features)
- privacy                      100.0  (1 features)

## Missing, in build order
- [could] style: Font choice (bundled mono / system mono), partial  (JetBrains Mono (OFL) instead of the original font)
- [could] style: Particle style with drift/splash/gather/depth/melt, partial  (own take; deterministic motion not a physics sim)

## Left out on purpose (not scored)
- Account sign-in (email or Google) gating export: replaced by single-user access gate in replica-backend
- Admin console: multi-user only; not needed for one user
- Public ASCII library page: content owned by the original; out of scope

## Yours, not in the original (not scored)
- Copy ASCII as plain text

## Layout diff (S01)

`imgdiff.py` scored 27/100, which is not meaningful here: the reference screenshot was captured at an 800x600 viewport with a different picture, the clone at 1440x900. Structure matches by inspection: header with file actions, preview with info line and controls below, looks strip under the preview, scrollable control sidebar on the right with export buttons pinned to its bottom. Not chasing pixel parity on purpose.

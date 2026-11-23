# Bugs

| ID | sev | summary | steps | expected | actual | status |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | S3 | Style tiles' accessible name didn't include visible text | axe scan on S01 | name = visible label | aria-label "Fine" vs text "Il1Q Fine" (label-content-name-mismatch) | fixed: sample glyphs aria-hidden, label from text |
| B2 | S3 | Tile letters washed out the tiles | Looks > Grey tiles | tiles read as shades, letters as accents | heavy white glyphs filled dark tiles | fixed: letters picked by tile brightness, drawn at 60% size |
| B3 | S4 | Source colours over-brightened in dark areas | Looks > Tiles | dark sky stays dark | lilac sky (tone gain up to 3x) | fixed: gain capped at 1.5x |

## To check (not reproduced)

- Tube look runs ~20 fps in headless Chromium (software GPU). Expect much higher on real hardware; verify after deploy.
- Video export at 4K may drop frames on slow machines because MediaRecorder records in real time.

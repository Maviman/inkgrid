# Components

All built once in src/ui.ts and used by the sidebar builder. Icons: Lucide (ISC), inlined SVG paths.

Button
  variants  primary (accent fill, on-accent text), secondary (surface-2, border), ghost (transparent), icon (32px square)
  sizes     sm 28px, md 36px
  states    default, hover (+4% lightness), active, focus-visible (2px accent ring, 2px offset), disabled (.45 opacity), busy (label kept, spinner after)
  a11y      native <button>, aria-pressed for toggles

Segmented
  2-7 options in one row, wraps if needed; radio-group semantics (role=radiogroup, arrow keys)
  selected  surface-2 bg + text colour; unselected text-muted

StyleTile
  3-col grid, 64px tall, glyph sample in mono lg on top, label xs below; selected = accent border

Slider
  label left, value readout right (mono xs), native <input type=range>, accent thumb
  double-click resets to default; value readout shows units (°, %, x)
  a11y      label for=, aria-valuetext

Switch
  36x20 pill, accent when on; role=switch, aria-checked; label click toggles

ColorField
  native <input type=color> swatch + hex text input; invalid hex -> danger border, value not applied

Section
  header (xs uppercase, letter-spaced, text-muted) + chevron; collapsible; hidden when not relevant to current style

PresetCard
  110x96 live thumbnail canvas + label xs uppercase; selected = accent outline; strip scrolls horizontally with arrow buttons

Modal
  centred, surface, radius lg, shadow pop, Escape and backdrop close, focus trapped, returns focus

VideoBar
  play/pause icon button, seek range, time readout, compare toggle, immersive toggle; floats bottom-centre of preview

// Settings schema: one flat object. The sidebar is generated from CONTROLS,
// presets are partial overrides on DEFAULTS.

export type Style =
  | 'classic' | 'detailed' | 'blocks' | 'tiles' | 'sparse' | 'binary' | 'braille'
  | 'dots' | 'quads' | 'bricks' | 'particles' | 'film' | 'drift' | 'custom';

export const DEFAULTS = {
  style: 'classic' as Style,
  customRamp: ' .:-=+*#%@',
  dither: 'none' as 'none' | 'bayer4' | 'bayer8' | 'noise',
  font: 'jetbrains' as 'jetbrains' | 'system',
  cols: 120,
  spacing: 0.5,
  tileGap: 10,
  softEdge: 30,
  // particles
  pAmount: 250,
  pDrift: 30,
  pSplash: 0,
  pGather: 50,
  pDepth: 40,
  pMelt: false,
  // film
  fGrain: 40,
  fGlow: 30,
  fBlur: 10,
  fFringe: 20,
  fWarmth: 20,
  // drift
  dAmount: 50,
  dDistance: 40,
  dDirection: 135,
  dShimmer: 30,
  dPixel: 80,
  // tile letters
  letterColor: 'auto' as 'auto' | 'white' | 'black',
  accentLetters: 0,
  letterContrast: 100,
  // overlay
  keepImage: false,
  imageOpacity: 100,
  glyphOpacity: 100,
  shadowFade: 0,
  blend: 'normal' as 'normal' | 'overlay' | 'soft-light' | 'screen' | 'multiply',
  // tone
  brightness: 0,
  contrast: 0,
  gamma: 1,
  hideShadows: 0,
  irregularity: 0,
  autoLevels: true,
  invert: false,
  // colour
  colorMode: 'mono' as 'mono' | 'original' | 'palette',
  ink: '#e8ebe9',
  palette: 'phosphor',
  colorBoost: 0,
  bg: 'dark' as 'dark' | 'black' | 'paper' | 'custom' | 'clear',
  bgColor: '#101214',
  // contours
  edges: false,
  edgeStrength: 50,
  edgeSmooth: 20,
  // effects
  animate: false,
  bloom: 0,
  scanlines: 0,
  curvature: 0,
  chroma: 0,
  vignette: 0,
  grain: 0,
  flicker: 0,
  twinkle: 0,
};

export type Settings = typeof DEFAULTS;
export type Key = keyof Settings;

export const PALETTES: Record<string, { label: string; stops: string[] }> = {
  phosphor: { label: 'Phosphor', stops: ['#06140c', '#1d6b43', '#5fe3a1', '#e6fff1'] },
  terminal: { label: 'Terminal', stops: ['#001a00', '#00802b', '#33ff66', '#ccffd9'] },
  amber: { label: 'Amber', stops: ['#1a0d00', '#8a4b00', '#ffb000', '#fff0c2'] },
  ice: { label: 'Ice', stops: ['#050c1c', '#1f4f8f', '#79c6ff', '#f2fbff'] },
  sunset: { label: 'Sunset', stops: ['#1a0526', '#7a1f5c', '#ff6a3d', '#ffe6a8'] },
  neon: { label: 'Neon', stops: ['#0d0026', '#5b00d6', '#00e0ff', '#f5ff7a'] },
  grey: { label: 'Greyscale', stops: ['#000000', '#555555', '#aaaaaa', '#ffffff'] },
};

export const BACKGROUNDS = { dark: '#101214', black: '#000000', paper: '#f3efe6' };

export const STYLES: { id: Style; sample: string; label: string }[] = [
  { id: 'classic', sample: ':=*#', label: 'Classic' },
  { id: 'detailed', sample: 'Il1Q', label: 'Fine' },
  { id: 'blocks', sample: '░▒▓█', label: 'Shades' },
  { id: 'tiles', sample: '▢A▢', label: 'Tiles' },
  { id: 'sparse', sample: '. :+', label: 'Sparse' },
  { id: 'binary', sample: '0 1 0', label: 'Binary' },
  { id: 'braille', sample: '⠁⠃⠇⡇', label: 'Braille' },
  { id: 'dots', sample: '· • ●', label: 'Halftone' },
  { id: 'quads', sample: '▘▚▛█', label: 'Quadrants' },
  { id: 'bricks', sample: '◘◘◘', label: 'Bricks' },
  { id: 'particles', sample: '∴∵∴', label: 'Particles' },
  { id: 'film', sample: 'ISO', label: 'Film' },
  { id: 'drift', sample: '▪ ▫▪', label: 'Drift' },
  { id: 'custom', sample: 'Aa?', label: 'Custom' },
];

export type Control =
  | { kind: 'range'; key: Key; label: string; min: number; max: number; step?: number; unit?: string; fmt?: (v: number) => string }
  | { kind: 'switch'; key: Key; label: string; hint?: string }
  | { kind: 'seg'; key: Key; label: string; options: [string, string][] }
  | { kind: 'color'; key: Key; label: string }
  | { kind: 'text'; key: Key; label: string; placeholder?: string }
  | { kind: 'note'; text: string };

export interface Section {
  id: string;
  title: string;
  when?: (s: Settings) => boolean;
  controls: (Control & { when?: (s: Settings) => boolean })[];
}

const glyphStyles = new Set<Style>(['classic', 'detailed', 'blocks', 'sparse', 'binary', 'custom', 'tiles']);
const isGlyph = (s: Settings) => glyphStyles.has(s.style);

export const SECTIONS: Section[] = [
  {
    id: 'grid',
    title: 'Grid',
    controls: [
      { kind: 'text', key: 'customRamp', label: 'Characters, light to heavy', placeholder: ' .:-=+*#%@', when: (s) => s.style === 'custom' },
      { kind: 'seg', key: 'dither', label: 'Dither', options: [['none', 'Off'], ['bayer4', '4×4'], ['bayer8', '8×8'], ['noise', 'Noise']], when: (s) => s.style !== 'particles' && s.style !== 'film' },
      { kind: 'seg', key: 'font', label: 'Typeface', options: [['jetbrains', 'JetBrains Mono'], ['system', 'System']], when: isGlyph },
      { kind: 'range', key: 'cols', label: 'Columns', min: 16, max: 400, step: 1 },
      { kind: 'range', key: 'spacing', label: 'Row height', min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2), when: (s) => isGlyph(s) && s.style !== 'tiles' },
      { kind: 'range', key: 'tileGap', label: 'Gap', min: 0, max: 40, unit: '%', when: (s) => s.style === 'tiles' || s.style === 'bricks' },
      { kind: 'range', key: 'softEdge', label: 'Corner radius', min: 0, max: 100, unit: '%', when: (s) => s.style === 'tiles' },
    ],
  },
  {
    id: 'particles',
    title: 'Particles',
    when: (s) => s.style === 'particles',
    controls: [
      { kind: 'range', key: 'pAmount', label: 'Count', min: 10, max: 1000, step: 10, fmt: (v) => `${v}k` },
      { kind: 'range', key: 'pDrift', label: 'Wander', min: 0, max: 100 },
      { kind: 'range', key: 'pSplash', label: 'Burst', min: 0, max: 100 },
      { kind: 'range', key: 'pGather', label: 'Pull home', min: 0, max: 100 },
      { kind: 'range', key: 'pDepth', label: 'Depth', min: 0, max: 100 },
      { kind: 'switch', key: 'pMelt', label: 'Fall downward' },
    ],
  },
  {
    id: 'film',
    title: 'Film',
    when: (s) => s.style === 'film',
    controls: [
      { kind: 'range', key: 'fGrain', label: 'Grain', min: 0, max: 100 },
      { kind: 'range', key: 'fGlow', label: 'Halation', min: 0, max: 100 },
      { kind: 'range', key: 'fBlur', label: 'Softness', min: 0, max: 100 },
      { kind: 'range', key: 'fFringe', label: 'Fringing', min: 0, max: 100 },
      { kind: 'range', key: 'fWarmth', label: 'Temperature', min: -100, max: 100 },
    ],
  },
  {
    id: 'drift',
    title: 'Drift',
    when: (s) => s.style === 'drift',
    controls: [
      { kind: 'range', key: 'dAmount', label: 'Strength', min: 0, max: 100 },
      { kind: 'range', key: 'dDistance', label: 'Reach', min: 0, max: 100 },
      { kind: 'range', key: 'dDirection', label: 'Angle', min: 0, max: 360, unit: '°' },
      { kind: 'range', key: 'dShimmer', label: 'Shimmer', min: 0, max: 100 },
      { kind: 'range', key: 'dPixel', label: 'Block size', min: 10, max: 100, unit: '%' },
    ],
  },
  {
    id: 'letters',
    title: 'Tile letters',
    when: (s) => s.style === 'tiles',
    controls: [
      { kind: 'seg', key: 'letterColor', label: 'Letter colour', options: [['auto', 'Auto'], ['white', 'White'], ['black', 'Black']] },
      { kind: 'range', key: 'letterContrast', label: 'Letter contrast', min: 0, max: 100 },
      { kind: 'range', key: 'accentLetters', label: 'Accent letters', min: 0, max: 100 },
      { kind: 'note', text: 'Auto puts light letters on dark tiles and dark letters on light ones. Accent letters sprinkles a few in bright colours.' },
    ],
  },
  {
    id: 'overlay',
    title: 'Photo layer',
    when: (s) => s.style !== 'film',
    controls: [
      { kind: 'switch', key: 'keepImage', label: 'Show photo under glyphs' },
      { kind: 'range', key: 'imageOpacity', label: 'Photo opacity', min: 0, max: 100, when: (s) => s.keepImage },
      { kind: 'range', key: 'glyphOpacity', label: 'Glyph opacity', min: 0, max: 100 },
      { kind: 'range', key: 'shadowFade', label: 'Fade dark glyphs', min: 0, max: 100 },
      { kind: 'seg', key: 'blend', label: 'Blend', options: [['normal', 'Normal'], ['overlay', 'Overlay'], ['soft-light', 'Soft'], ['screen', 'Screen'], ['multiply', 'Multiply']] },
    ],
  },
  {
    id: 'tone',
    title: 'Tone',
    controls: [
      { kind: 'range', key: 'brightness', label: 'Brightness', min: -100, max: 100 },
      { kind: 'range', key: 'contrast', label: 'Contrast', min: -100, max: 100 },
      { kind: 'range', key: 'gamma', label: 'Gamma', min: 0.2, max: 3, step: 0.01, fmt: (v) => v.toFixed(2) },
      { kind: 'range', key: 'hideShadows', label: 'Cut shadows', min: 0, max: 100 },
      { kind: 'range', key: 'irregularity', label: 'Jitter', min: 0, max: 100 },
      { kind: 'switch', key: 'autoLevels', label: 'Auto levels' },
      { kind: 'switch', key: 'invert', label: 'Invert' },
    ],
  },
  {
    id: 'colour',
    title: 'Colour',
    controls: [
      { kind: 'seg', key: 'colorMode', label: 'Glyph colour', options: [['mono', 'Single'], ['original', 'Source'], ['palette', 'Palette']] },
      { kind: 'color', key: 'ink', label: 'Ink', when: (s) => s.colorMode === 'mono' },
      { kind: 'seg', key: 'palette', label: 'Palette', options: Object.entries(PALETTES).map(([k, v]) => [k, v.label] as [string, string]), when: (s) => s.colorMode === 'palette' },
      { kind: 'range', key: 'colorBoost', label: 'Saturation', min: -100, max: 100, when: (s) => s.colorMode !== 'mono' },
      { kind: 'seg', key: 'bg', label: 'Background', options: [['dark', 'Graphite'], ['black', 'Black'], ['paper', 'Paper'], ['custom', 'Custom'], ['clear', 'None']] },
      { kind: 'color', key: 'bgColor', label: 'Background colour', when: (s) => s.bg === 'custom' },
    ],
  },
  {
    id: 'contours',
    title: 'Edges',
    when: (s) => isGlyph(s) && s.style !== 'tiles',
    controls: [
      { kind: 'switch', key: 'edges', label: 'Draw edges with strokes' },
      { kind: 'range', key: 'edgeStrength', label: 'Sensitivity', min: 0, max: 100, when: (s) => s.edges },
      { kind: 'range', key: 'edgeSmooth', label: 'Pre-blur', min: 0, max: 100, when: (s) => s.edges },
      { kind: 'note', text: 'Strong edges get - / | \\ strokes that follow their direction.' },
    ],
  },
  {
    id: 'fx',
    title: 'Screen effects',
    controls: [
      { kind: 'switch', key: 'animate', label: 'Animate', hint: 'Moving grain, flicker and twinkle. Also lets a still picture export as a short video loop.' },
      { kind: 'range', key: 'bloom', label: 'Glow', min: 0, max: 100 },
      { kind: 'range', key: 'scanlines', label: 'Scanlines', min: 0, max: 100 },
      { kind: 'range', key: 'curvature', label: 'Tube curve', min: 0, max: 100 },
      { kind: 'range', key: 'chroma', label: 'RGB split', min: 0, max: 100 },
      { kind: 'range', key: 'vignette', label: 'Vignette', min: 0, max: 100 },
      { kind: 'range', key: 'grain', label: 'Noise', min: 0, max: 100 },
      { kind: 'range', key: 'flicker', label: 'Flicker', min: 0, max: 100, when: (s) => s.animate },
      { kind: 'range', key: 'twinkle', label: 'Twinkle', min: 0, max: 100, when: (s) => s.animate },
    ],
  },
];

export interface Preset {
  id: string;
  label: string;
  hint?: string;
  values: Partial<Settings>;
}

export const PRESETS: Preset[] = [
  { id: 'base', label: 'Plain', values: {} },
  { id: 'phosphor', label: 'Phosphor', values: { colorMode: 'palette', palette: 'phosphor', bloom: 35, scanlines: 30, vignette: 40, bg: 'black' } },
  { id: 'crt', label: 'Tube', values: { colorMode: 'palette', palette: 'terminal', bloom: 45, scanlines: 55, curvature: 45, chroma: 25, vignette: 55, bg: 'black', animate: true, flicker: 20 } },
  { id: 'amber', label: 'Amber', values: { colorMode: 'palette', palette: 'amber', bloom: 40, scanlines: 25, vignette: 35, bg: 'black' } },
  { id: 'code', label: 'Code fall', values: { style: 'binary', colorMode: 'palette', palette: 'terminal', bg: 'black', bloom: 30, animate: true, twinkle: 50, cols: 100 } },
  { id: 'print', label: 'Newsprint', values: { style: 'detailed', bg: 'paper', ink: '#1b1b1b', cols: 150 } },
  { id: 'braille', label: 'Dot matrix', values: { style: 'braille', cols: 110 } },
  { id: 'halftone', label: 'Halftone', values: { style: 'dots', bg: 'paper', ink: '#14171c', cols: 90 } },
  { id: 'color', label: 'Full colour', values: { colorMode: 'original', colorBoost: 20, cols: 140 } },
  { id: 'bricks', label: 'Bricks', hint: 'Snaps the picture to a small set of plastic-brick colours, studs included.', values: { style: 'bricks', colorMode: 'original', cols: 56, tileGap: 6, bg: 'black' } },
  { id: 'tiles', label: 'Tiles', hint: 'Each cell is a coloured tile with a letter on it, on a light page.', values: { style: 'tiles', colorMode: 'original', bg: 'paper', cols: 48, tileGap: 12, softEdge: 30 } },
  { id: 'greytiles', label: 'Grey tiles', hint: 'Grey tiles with letters on a light page, with a few accent letters.', values: { style: 'tiles', colorMode: 'mono', ink: '#8a8f94', bg: 'paper', cols: 48, tileGap: 12, accentLetters: 40 } },
  { id: 'film', label: 'Film', values: { style: 'film', colorMode: 'original', cols: 220, glyphOpacity: 30 } },
  { id: 'drift', label: 'Drift', values: { style: 'drift', colorMode: 'original', cols: 90, animate: true } },
  { id: 'particles', label: 'Particles', values: { style: 'particles', colorMode: 'original', bg: 'black', animate: true } },
  { id: 'g-ascii', label: 'Glyph wash', hint: 'Keeps the photo and scatters small glyphs over it, strongest in the highlights.', values: { keepImage: true, colorMode: 'mono', ink: '#ffffff', blend: 'overlay', shadowFade: 70, cols: 160 } },
  { id: 'g-binary', label: 'Bit wash', hint: 'Keeps the photo and fills it with tiny 0s and 1s that fade out in the shadows.', values: { keepImage: true, style: 'binary', ink: '#ffffff', blend: 'soft-light', shadowFade: 80, cols: 170 } },
  { id: 'g-dither', label: 'Grain wash', hint: 'Keeps the photo and lays an ordered dither texture on top.', values: { keepImage: true, style: 'quads', dither: 'bayer4', ink: '#ffffff', blend: 'overlay', glyphOpacity: 60, cols: 200 } },
  { id: 'g-halftone', label: 'Dot wash', hint: 'Keeps the photo and prints dark halftone dots over it.', values: { keepImage: true, style: 'dots', invert: true, ink: '#000000', blend: 'multiply', glyphOpacity: 70, cols: 110 } },
];

export function applyPreset(p: Preset): Settings {
  return { ...DEFAULTS, ...p.values };
}

const STORE_KEY = 'glyph-settings-v1';

export function load(): Settings {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ...DEFAULTS };
    const obj = JSON.parse(raw);
    const out: Settings = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS) as Key[]) {
      if (k in obj && typeof obj[k] === typeof DEFAULTS[k]) (out as Record<string, unknown>)[k] = obj[k];
    }
    return out;
  } catch {
    return { ...DEFAULTS };
  }
}

export function save(s: Settings) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* private mode: ignore */
  }
}

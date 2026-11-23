// Pure, DOM-free helpers: tone curve, dithering, ramps, sub-cell glyphs, colour.
// Everything here is unit-tested in tests/core.test.ts.

export const RAMPS: Record<string, string> = {
  classic: ' .:-=+*#%@',
  detailed: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocks: ' ░▒▓█',
  sparse: '   ..::+#',
  tiles: '.:;+itfoaxX8%#@',
};

export const EDGE_GLYPHS = ['-', '\\', '|', '/'];

export type Rgb = [number, number, number];

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function luma(r: number, g: number, b: number): number {
  // Rec. 709 on 0..255 input, returns 0..1
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Deterministic hash -> [0,1). Cheap integer mix, good enough for grain/jitter. */
export function hash01(n: number): number {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function bayer(n: number): number[] {
  // recursive construction: M(2k) = [[4M, 4M+2], [4M+3, 4M+1]]
  let m = [[0]];
  while (m.length < n) {
    const k = m.length;
    const next: number[][] = Array.from({ length: 2 * k }, () => new Array(2 * k).fill(0));
    for (let y = 0; y < k; y++)
      for (let x = 0; x < k; x++) {
        const v = 4 * m[y][x];
        next[y][x] = v;
        next[y][x + k] = v + 2;
        next[y + k][x] = v + 3;
        next[y + k][x + k] = v + 1;
      }
    m = next;
  }
  return m.flat().map((v) => (v + 0.5) / (n * n));
}
const BAYER4 = bayer(4);
const BAYER8 = bayer(8);

export type DitherKind = 'none' | 'bayer4' | 'bayer8' | 'noise';

/** Threshold in [0,1) for a cell; 0.5 means plain rounding. */
export function ditherThreshold(kind: DitherKind, x: number, y: number, seed = 0): number {
  switch (kind) {
    case 'bayer4':
      return BAYER4[(y & 3) * 4 + (x & 3)];
    case 'bayer8':
      return BAYER8[(y & 7) * 8 + (x & 7)];
    case 'noise':
      return hash01(x * 73856093 + y * 19349663 + seed * 83492791);
    default:
      return 0.5;
  }
}

export interface ToneParams {
  brightness: number; // -100..100
  contrast: number; // -100..100
  gamma: number; // 0.2..3
  hideShadows: number; // 0..100
  irregularity: number; // 0..100
  autoLevels: boolean;
  invert: boolean;
}

/** Percentile-based black/white points for auto levels. */
export function levels(lum: Float32Array): [number, number] {
  const hist = new Uint32Array(256);
  for (let i = 0; i < lum.length; i++) hist[Math.min(255, (lum[i] * 255) | 0)]++;
  const lo = lum.length * 0.01;
  const hi = lum.length * 0.99;
  let acc = 0;
  let a = 0;
  let b = 255;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= lo) {
      a = i;
      break;
    }
  }
  acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= hi) {
      b = i;
      break;
    }
  }
  if (b - a < 8) return [0, 1];
  return [a / 255, b / 255];
}

/** Map a 0..1 luminance through the tone controls. Returns 0..1. */
export function tone(v: number, p: ToneParams, lv: [number, number], i: number, seed = 0): number {
  if (p.autoLevels) v = (v - lv[0]) / (lv[1] - lv[0]);
  v += (p.brightness / 100) * 0.5;
  const c = p.contrast / 100;
  const k = c >= 0 ? 1 + c * 3 : 1 + c;
  v = (v - 0.5) * k + 0.5;
  v = clamp01(v);
  if (p.gamma !== 1) v = Math.pow(v, 1 / p.gamma);
  if (p.irregularity > 0) v += (hash01(i * 2654435761 + seed) - 0.5) * (p.irregularity / 100) * 0.35;
  v = clamp01(v);
  if (p.invert) v = 1 - v;
  const h = (p.hideShadows / 100) * 0.7;
  if (h > 0) v = v < h ? 0 : (v - h) / (1 - h);
  return v;
}

/** Ramp index for a toned value with a dither threshold. */
export function rampIndex(v: number, n: number, threshold: number): number {
  const idx = Math.floor(v * (n - 1) + threshold);
  return idx < 0 ? 0 : idx >= n ? n - 1 : idx;
}

/** Braille codepoint from 2x4 booleans, row-major [x + y*2]. */
export function brailleChar(dots: ArrayLike<boolean | number>): string {
  const bits = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80];
  let code = 0;
  for (let k = 0; k < 8; k++) if (dots[k]) code |= bits[k];
  return String.fromCharCode(0x2800 + code);
}

/** Quadrant block from 2x2 booleans [tl, tr, bl, br]. */
const QUAD = [' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛', '▗', '▚', '▐', '▜', '▄', '▙', '▟', '█'];
export function quadrantChar(q: ArrayLike<boolean | number>): string {
  return QUAD[(q[0] ? 1 : 0) | (q[1] ? 2 : 0) | (q[2] ? 4 : 0) | (q[3] ? 8 : 0)];
}

/** Edge glyph from a Sobel gradient. The stroke runs perpendicular to the gradient. */
export function edgeGlyph(gx: number, gy: number): string {
  let a = Math.atan2(gy, gx) + Math.PI / 2; // edge direction
  a = ((a % Math.PI) + Math.PI) % Math.PI; // 0..pi
  const sector = Math.round(a / (Math.PI / 4)) % 4;
  return EDGE_GLYPHS[sector];
}

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** Saturation boost: -100 greys out, +100 doubles chroma. */
export function boost(r: number, g: number, b: number, amount: number): Rgb {
  const k = 1 + amount / 100;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const f = (c: number) => Math.max(0, Math.min(255, y + (c - y) * k));
  return [f(r), f(g), f(b)];
}

/** Piecewise-linear gradient lookup. stops are evenly spaced. */
export function gradient(stops: Rgb[], t: number): Rgb {
  t = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  const f = t - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Nearest colour in a fixed set (squared RGB distance, weighted for perception). */
export function nearest(set: Rgb[], r: number, g: number, b: number): Rgb {
  let best = set[0];
  let bd = Infinity;
  for (const c of set) {
    const dr = c[0] - r;
    const dg = c[1] - g;
    const db = c[2] - b;
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/** Grid dimensions for an output width and source aspect. */
export function gridFor(srcW: number, srcH: number, cols: number, cellRatio: number) {
  const rows = Math.max(1, Math.round((cols * srcH) / srcW / cellRatio));
  return { cols, rows };
}

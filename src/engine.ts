// Canvas renderer. One call: render(target, source, settings, options).
// Pipeline: sample source into a cols x rows grid -> tone -> pick glyph/shape per cell
// -> draw white mask layer -> colourise with a per-cell colour grid (source-in)
// -> composite over background / photo -> screen effects.

import {
  RAMPS, boost, brailleChar, clamp01, ditherThreshold, edgeGlyph, gradient, hash01, hexToRgb,
  levels, luma, nearest, quadrantChar, rampIndex, tone, type Rgb, type ToneParams,
} from './core';
import { BACKGROUNDS, PALETTES, type Settings } from './settings';

export interface Source {
  el: CanvasImageSource;
  w: number;
  h: number;
  id: number; // changes when the source changes
}

export interface RenderOptions {
  width: number; // output width in px
  time?: number; // seconds, drives animation
  compareX?: number | null; // 0..1 split for preview compare
  wantText?: boolean;
  maxParticles?: number;
}

export interface RenderResult {
  cols: number;
  rows: number;
  width: number;
  height: number;
  text?: string;
}

type Ctx = CanvasRenderingContext2D;

const ACCENTS: Rgb[] = [[255, 122, 26], [143, 91, 255], [25, 195, 166], [255, 79, 139], [61, 139, 255]];
const BRICK_SET: Rgb[] = [
  [242, 243, 242], [160, 165, 169], [99, 95, 98], [27, 42, 52], [201, 26, 9], [254, 138, 24],
  [245, 205, 47], [75, 151, 74], [35, 120, 65], [13, 105, 172], [110, 153, 202], [146, 57, 120],
  [124, 80, 58], [215, 197, 153], [255, 152, 180], [0, 143, 155],
];
const GLYPH_STYLES = new Set(['classic', 'detailed', 'blocks', 'sparse', 'binary', 'custom', 'tiles', 'film']);

function canvas(w = 1, h = 1): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function ctx2d(c: HTMLCanvasElement, opts?: CanvasRenderingContext2DSettings): Ctx {
  return c.getContext('2d', opts) as Ctx;
}
function sizeTo(c: HTMLCanvasElement, w: number, h: number) {
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
}
const css = (c: Rgb, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export function fontFamily(s: Settings) {
  return s.font === 'jetbrains' ? '"JetBrains Mono", ui-monospace, monospace' : 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';
}

function cellRatio(s: Settings): number {
  switch (s.style) {
    case 'braille':
      return 2;
    case 'quads':
    case 'tiles':
    case 'bricks':
    case 'dots':
    case 'drift':
    case 'particles':
      return 1;
    default:
      return 1.2 + (1 - s.spacing) * 1.0;
  }
}

export function bgColor(s: Settings): Rgb | null {
  if (s.bg === 'clear') return null;
  if (s.bg === 'custom') return hexToRgb(s.bgColor) ?? [16, 18, 20];
  return hexToRgb(BACKGROUNDS[s.bg])!;
}

export class Renderer {
  private sample = canvas();
  private sub = canvas();
  private layer = canvas();
  private tmp = canvas();
  private colorGrid = canvas();
  private grain = canvas(256, 256);
  private atlas = canvas();
  private atlasKey = '';
  private atlasIndex = new Map<string, number>();
  private atlasCell = [1, 1];

  render(target: HTMLCanvasElement, src: Source, s: Settings, o: RenderOptions): RenderResult {
    const time = o.time ?? 0;
    const frame = s.animate ? Math.floor(time * 12) : 0;
    const ratio = cellRatio(s);
    const cols = Math.max(4, Math.round(s.cols));
    const rows = Math.max(1, Math.round((cols * src.h) / src.w / ratio));
    const W = Math.max(16, Math.round(o.width));
    const cw = W / cols;
    const chh = cw * ratio;
    const H = Math.max(16, Math.round(rows * chh));
    sizeTo(target, W, H);
    sizeTo(this.layer, W, H);
    const out = ctx2d(target);
    const lay = ctx2d(this.layer);
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.globalAlpha = 1;
    out.globalCompositeOperation = 'source-over';
    out.filter = 'none';

    // ---- sample
    sizeTo(this.sample, cols, rows);
    const sctx = ctx2d(this.sample, { willReadFrequently: true });
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.clearRect(0, 0, cols, rows);
    sctx.drawImage(src.el, 0, 0, cols, rows);
    const px = sctx.getImageData(0, 0, cols, rows).data;
    const n = cols * rows;
    const lum = new Float32Array(n);
    for (let i = 0; i < n; i++) lum[i] = luma(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) * (px[i * 4 + 3] / 255);

    const tp: ToneParams = s;
    const lv = levels(lum);
    const seed = s.animate ? frame : 0;
    const val = new Float32Array(n);
    for (let i = 0; i < n; i++) val[i] = tone(lum[i], tp, lv, i, s.irregularity && s.animate ? seed : 0);

    const bg = bgColor(s);
    const lightBg = bg ? luma(...bg) > 0.5 && !s.keepImage : false;
    // "dense" = how much ink the cell gets
    const dense = (v: number) => (lightBg ? 1 - v : v);

    // ---- per-cell colour grid (RGBA, cols x rows)
    sizeTo(this.colorGrid, cols, rows);
    const gctx = ctx2d(this.colorGrid);
    const grid = gctx.createImageData(cols, rows);
    const gd = grid.data;
    const ink = hexToRgb(s.ink) ?? [232, 235, 233];
    const pal = (PALETTES[s.palette] ?? PALETTES.phosphor).stops.map((h) => hexToRgb(h)!);
    const fade = s.shadowFade / 100;
    const tw = s.animate ? s.twinkle / 100 : 0;
    const cellColor = (i: number): Rgb => {
      const v = val[i];
      if (s.colorMode === 'mono') return ink;
      if (s.colorMode === 'palette') return boost(...gradient(pal, v), s.colorBoost);
      let r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
      if (!s.invert) {
        const k = Math.min(1.5, v / Math.max(0.02, lum[i]));
        r *= k; g *= k; b *= k;
      }
      return boost(Math.min(255, r), Math.min(255, g), Math.min(255, b), s.colorBoost);
    };
    const colors: Rgb[] = new Array(n);
    for (let i = 0; i < n; i++) {
      let c = cellColor(i);
      let a = 1 - fade + fade * val[i];
      if (tw > 0 && hash01(i * 31 + frame * 7919) < tw * 0.08) {
        c = [c[0] + (255 - c[0]) * 0.7, c[1] + (255 - c[1]) * 0.7, c[2] + (255 - c[2]) * 0.7];
        a = 1;
      }
      colors[i] = c;
      gd[i * 4] = c[0];
      gd[i * 4 + 1] = c[1];
      gd[i * 4 + 2] = c[2];
      gd[i * 4 + 3] = clamp01(a) * 255;
    }

    // ---- glyph / shape layer
    lay.setTransform(1, 0, 0, 1, 0, 0);
    lay.globalCompositeOperation = 'source-over';
    lay.globalAlpha = 1;
    lay.filter = 'none';
    lay.clearRect(0, 0, W, H);
    let text: string | undefined;
    let colourise = true;
    const style = s.style;

    if (GLYPH_STYLES.has(style)) {
      const ramp = style === 'custom' ? (s.customRamp.length ? s.customRamp : ' ') : style === 'film' ? RAMPS.classic : RAMPS[style] ?? RAMPS.classic;
      const chars = Array.from(ramp);
      const glyphs = new Array<string>(n);
      if (style === 'binary') {
        const shift = s.animate ? Math.floor(time * 8) : 0;
        for (let y = 0; y < rows; y++)
          for (let x = 0; x < cols; x++) {
            const i = y * cols + x;
            const d = dense(val[i]);
            const t = ditherThreshold(s.dither, x, y, seed);
            glyphs[i] = d + (t - 0.5) * 0.3 < 0.18 ? ' ' : hash01(x * 9176 + (y - shift) * 7351) < 0.5 ? '0' : '1';
          }
      } else {
        for (let y = 0; y < rows; y++)
          for (let x = 0; x < cols; x++) {
            const i = y * cols + x;
            const d = style === 'tiles' ? val[i] : dense(val[i]);
            glyphs[i] = chars[rampIndex(d, chars.length, ditherThreshold(s.dither, x, y, seed))];
          }
      }
      if (s.edges && style !== 'tiles' && style !== 'film') this.applyEdges(glyphs, val, cols, rows, s);
      if (style === 'tiles') this.drawTiles(out, s, colors, val, cols, rows, cw, chh, bg, W, H, gd, frame);
      else this.prepBase(out, s, src, bg, W, H, time);
      this.ensureAtlas([...new Set([...chars, '0', '1', '-', '/', '|', '\\'])], fontFamily(s), cw, chh);
      const [aw, ah] = this.atlasCell;
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const ch = glyphs[y * cols + x];
          if (ch === ' ') continue;
          const k = this.atlasIndex.get(ch);
          if (k === undefined) continue;
          if (style === 'tiles') lay.drawImage(this.atlas, k * aw, 0, aw, ah, x * cw + cw * 0.2, y * chh + chh * 0.2, cw * 0.6, chh * 0.6);
          else lay.drawImage(this.atlas, k * aw, 0, aw, ah, x * cw, y * chh, cw, chh);
        }
      if (o.wantText) text = rowsToText(glyphs, cols, rows);
    } else if (style === 'braille' || style === 'quads') {
      this.prepBase(out, s, src, bg, W, H, time);
      const sx = 2;
      const sy = style === 'braille' ? 4 : 2;
      const sub = this.subSample(src, cols * sx, rows * sy, tp, s.animate ? seed : 0);
      const glyphs = new Array<string>(n);
      lay.fillStyle = '#fff';
      lay.beginPath();
      const r = Math.min(cw / sx, chh / sy) * 0.36;
      const bits = new Array<boolean>(sx * sy);
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          for (let j = 0; j < sy; j++)
            for (let k = 0; k < sx; k++) {
              const gx = x * sx + k;
              const gy = y * sy + j;
              const v = dense(sub[gy * cols * sx + gx]);
              const on = v > ditherThreshold(s.dither === 'none' ? 'bayer4' : s.dither, gx, gy, seed);
              bits[j * sx + k] = on;
              if (!on) continue;
              if (style === 'braille') {
                const cx = x * cw + (k + 0.5) * (cw / sx);
                const cy = y * chh + (j + 0.5) * (chh / sy);
                lay.moveTo(cx + r, cy);
                lay.arc(cx, cy, r, 0, Math.PI * 2);
              } else {
                lay.rect(x * cw + k * (cw / 2), y * chh + j * (chh / 2), cw / 2 + 0.5, chh / 2 + 0.5);
              }
            }
          if (o.wantText) glyphs[y * cols + x] = style === 'braille' ? brailleChar(bits) : quadrantChar(bits);
        }
      lay.fill();
      if (o.wantText) text = rowsToText(glyphs, cols, rows);
    } else if (style === 'dots') {
      this.prepBase(out, s, src, bg, W, H, time);
      lay.fillStyle = '#fff';
      lay.beginPath();
      const rmax = Math.min(cw, chh) * 0.62;
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const d = dense(val[y * cols + x]);
          const jitter = s.dither === 'none' ? 0 : (ditherThreshold(s.dither, x, y, seed) - 0.5) * 0.25;
          const r = rmax * Math.sqrt(clamp01(d + jitter));
          if (r < 0.3) continue;
          const cx = (x + 0.5) * cw;
          const cy = (y + 0.5) * chh;
          lay.moveTo(cx + r, cy);
          lay.arc(cx, cy, r, 0, Math.PI * 2);
        }
      lay.fill();
    } else if (style === 'bricks') {
      colourise = false;
      this.prepBase(out, s, src, bg, W, H, time);
      const gap = (s.tileGap / 100) * cw * 0.5;
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const c0 = colors[i];
          const v = s.colorMode === 'mono' ? val[i] : 1;
          const c = nearest(BRICK_SET, c0[0] * (s.colorMode === 'mono' ? v : 1), c0[1] * (s.colorMode === 'mono' ? v : 1), c0[2] * (s.colorMode === 'mono' ? v : 1));
          const x0 = x * cw + gap / 2;
          const y0 = y * chh + gap / 2;
          const sz = cw - gap;
          lay.fillStyle = css(c);
          lay.fillRect(x0, y0, sz, sz);
          lay.fillStyle = 'rgba(0,0,0,0.22)';
          lay.fillRect(x0, y0 + sz * 0.88, sz, sz * 0.12);
          const cx = x0 + sz / 2;
          const cy = y0 + sz / 2;
          const r = sz * 0.3;
          lay.beginPath();
          lay.arc(cx + r * 0.12, cy + r * 0.12, r, 0, Math.PI * 2);
          lay.fillStyle = 'rgba(0,0,0,0.28)';
          lay.fill();
          lay.beginPath();
          lay.arc(cx, cy, r, 0, Math.PI * 2);
          lay.fillStyle = css([Math.min(255, c[0] + 22), Math.min(255, c[1] + 22), Math.min(255, c[2] + 22)]);
          lay.fill();
        }
    } else if (style === 'drift') {
      colourise = false;
      this.prepBase(out, s, src, bg, W, H, time);
      const size = cw * (s.dPixel / 100);
      const ang = (s.dDirection * Math.PI) / 180;
      const reach = (s.dDistance / 100) * cw * 4 * (s.dAmount / 100);
      const shim = (s.dShimmer / 100) * cw * 0.6;
      const t = s.animate ? time : 0;
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const d = dense(val[i]);
          if (d < 0.04) continue;
          const h = hash01(i * 7 + 3);
          const off = reach * d * (0.6 + 0.8 * h) + (t ? Math.sin(t * 2.4 + h * 6.283) * shim : 0);
          const c = colors[i];
          lay.fillStyle = css(c, gd[i * 4 + 3] / 255);
          const sz = size * (0.55 + 0.45 * d);
          lay.fillRect((x + 0.5) * cw + Math.cos(ang) * off - sz / 2, (y + 0.5) * chh + Math.sin(ang) * off - sz / 2, sz, sz);
        }
    } else if (style === 'particles') {
      colourise = false;
      this.prepBase(out, s, src, bg, W, H, time);
      this.drawParticles(lay, s, val, colors, cols, rows, W, H, time, o.maxParticles ?? 600_000, dense);
    }

    if (colourise) {
      lay.globalCompositeOperation = 'source-in';
      lay.imageSmoothingEnabled = false;
      gctx.putImageData(grid, 0, 0);
      lay.drawImage(this.colorGrid, 0, 0, W, H);
      lay.globalCompositeOperation = 'source-over';
    }

    // ---- composite glyph layer
    out.globalAlpha = s.glyphOpacity / 100;
    out.globalCompositeOperation = s.blend === 'normal' ? 'source-over' : (s.blend as GlobalCompositeOperation);
    out.drawImage(this.layer, 0, 0);
    out.globalAlpha = 1;
    out.globalCompositeOperation = 'source-over';

    this.effects(out, s, W, H, time, frame, bg);

    if (o.compareX != null) {
      const cx = Math.round(clamp01(o.compareX) * W);
      out.save();
      out.beginPath();
      out.rect(0, 0, cx, H);
      out.clip();
      out.drawImage(src.el, 0, 0, W, H);
      out.restore();
      out.fillStyle = '#fff';
      out.fillRect(cx - 1, 0, 2, H);
    }
    return { cols, rows, width: W, height: H, text };
  }

  /** Background fill plus optional photo underneath (film grade when style is film). */
  private prepBase(out: Ctx, s: Settings, src: Source, bg: Rgb | null, W: number, H: number, time: number) {
    out.clearRect(0, 0, W, H);
    if (bg) {
      out.fillStyle = css(bg);
      out.fillRect(0, 0, W, H);
    }
    if (s.style === 'film') {
      this.filmBase(out, s, src, W, H, time);
      return;
    }
    if (s.keepImage) {
      out.globalAlpha = s.imageOpacity / 100;
      out.drawImage(src.el, 0, 0, W, H);
      out.globalAlpha = 1;
    }
  }

  private filmBase(out: Ctx, s: Settings, src: Source, W: number, H: number, time: number) {
    const blur = (s.fBlur / 100) * W * 0.006;
    out.filter = blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : 'none';
    out.drawImage(src.el, 0, 0, W, H);
    out.filter = 'none';
    if (s.fWarmth !== 0) {
      const a = Math.abs(s.fWarmth) / 100;
      out.globalCompositeOperation = 'soft-light';
      out.fillStyle = s.fWarmth > 0 ? `rgba(255,140,40,${a * 0.7})` : `rgba(40,130,255,${a * 0.7})`;
      out.fillRect(0, 0, W, H);
      out.globalCompositeOperation = 'source-over';
    }
    if (s.fGlow > 0) {
      sizeTo(this.tmp, W, H);
      const t = ctx2d(this.tmp);
      t.clearRect(0, 0, W, H);
      t.filter = `brightness(1.4) contrast(2) blur(${(W * 0.012).toFixed(1)}px)`;
      t.drawImage(src.el, 0, 0, W, H);
      t.filter = 'none';
      t.globalCompositeOperation = 'multiply';
      t.fillStyle = 'rgb(255,90,40)';
      t.fillRect(0, 0, W, H);
      t.globalCompositeOperation = 'source-over';
      out.globalCompositeOperation = 'screen';
      out.globalAlpha = (s.fGlow / 100) * 0.8;
      out.drawImage(this.tmp, 0, 0);
      out.globalAlpha = 1;
      out.globalCompositeOperation = 'source-over';
    }
    if (s.fFringe > 0) chromaShift(out, W, H, Math.max(1, Math.round((s.fFringe / 100) * W * 0.004)));
    if (s.fGrain > 0) this.drawGrain(out, W, H, (s.fGrain / 100) * 0.55, s.animate ? Math.floor(time * 24) : 0);
  }

  private drawTiles(out: Ctx, s: Settings, colors: Rgb[], val: Float32Array, cols: number, rows: number, cw: number, chh: number, bg: Rgb | null, W: number, H: number, gd: Uint8ClampedArray, frame: number) {
    out.clearRect(0, 0, W, H);
    if (bg) {
      out.fillStyle = css(bg);
      out.fillRect(0, 0, W, H);
    }
    const gap = (s.tileGap / 100) * cw;
    const rad = (s.softEdge / 100) * (cw - gap) * 0.5;
    const lc = s.letterContrast / 100;
    const acc = (s.accentLetters / 100) * 0.12;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        let c = colors[i];
        if (s.colorMode === 'mono') {
          const k = 0.35 + 0.85 * val[i];
          c = [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
        }
        out.fillStyle = css(c);
        out.beginPath();
        if (rad > 0.5 && out.roundRect) out.roundRect(x * cw + gap / 2, y * chh + gap / 2, cw - gap, chh - gap, rad);
        else out.rect(x * cw + gap / 2, y * chh + gap / 2, cw - gap, chh - gap);
        out.fill();
        // letter colour for this tile
        let target: Rgb;
        if (acc > 0 && hash01(i * 131 + 17) < acc) target = ACCENTS[Math.floor(hash01(i * 7 + frame) * ACCENTS.length)];
        else if (s.letterColor === 'white') target = [255, 255, 255];
        else if (s.letterColor === 'black') target = [0, 0, 0];
        else target = luma(...c) > 0.55 ? [12, 12, 12] : [250, 250, 250];
        const isAccent = acc > 0 && hash01(i * 131 + 17) < acc;
        const m = isAccent ? 1 : lc;
        gd[i * 4] = c[0] + (target[0] - c[0]) * m;
        gd[i * 4 + 1] = c[1] + (target[1] - c[1]) * m;
        gd[i * 4 + 2] = c[2] + (target[2] - c[2]) * m;
        gd[i * 4 + 3] = 255;
      }
  }

  private applyEdges(glyphs: string[], val: Float32Array, cols: number, rows: number, s: Settings) {
    // optional box pre-blur
    let v = val;
    const passes = Math.round((s.edgeSmooth / 100) * 3);
    for (let p = 0; p < passes; p++) {
      const o = new Float32Array(v.length);
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          let acc = 0, k = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx, yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
              acc += v[yy * cols + xx];
              k++;
            }
          o[y * cols + x] = acc / k;
        }
      v = o;
    }
    const thr = 0.9 - (s.edgeStrength / 100) * 0.8;
    const at = (x: number, y: number) => v[Math.min(rows - 1, Math.max(0, y)) * cols + Math.min(cols - 1, Math.max(0, x))];
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
        const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
        if (Math.hypot(gx, gy) > thr) glyphs[y * cols + x] = edgeGlyph(gx, gy);
      }
  }

  private subSample(src: Source, w: number, h: number, tp: ToneParams, seed: number): Float32Array {
    sizeTo(this.sub, w, h);
    const c = ctx2d(this.sub, { willReadFrequently: true });
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.clearRect(0, 0, w, h);
    c.drawImage(src.el, 0, 0, w, h);
    const d = c.getImageData(0, 0, w, h).data;
    const lum = new Float32Array(w * h);
    for (let i = 0; i < lum.length; i++) lum[i] = luma(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) * (d[i * 4 + 3] / 255);
    const lv = levels(lum);
    for (let i = 0; i < lum.length; i++) lum[i] = tone(lum[i], tp, lv, i, seed);
    return lum;
  }

  private drawParticles(lay: Ctx, s: Settings, val: Float32Array, colors: Rgb[], cols: number, rows: number, W: number, H: number, time: number, cap: number, dense: (v: number) => number) {
    const n = cols * rows;
    const cdf = new Float32Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const d = dense(val[i]);
      acc += d * d;
      cdf[i] = acc;
    }
    const img = lay.createImageData(W, H);
    const buf = new Uint32Array(img.data.buffer);
    if (acc <= 0) {
      lay.putImageData(img, 0, 0);
      return;
    }
    const count = Math.min(cap, s.pAmount * 1000, Math.floor(W * H * 0.6));
    const cw = W / cols;
    const ch = H / rows;
    const t = s.animate ? time : 0;
    const drift = (s.pDrift / 100) * cw * 2.5;
    const splash = (s.pSplash / 100) * Math.min(W, H) * 0.25;
    const pull = 1 - (s.pGather / 100) * 0.85;
    const depth = s.pDepth / 100;
    const melt = s.pMelt;
    const packed = colors.map((c) => (255 << 24) | ((c[2] & 255) << 16) | ((c[1] & 255) << 8) | (c[0] & 255));
    for (let p = 0; p < count; p++) {
      const target = hash01(p * 2 + 1) * acc;
      let lo = 0, hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid] < target) lo = mid + 1;
        else hi = mid;
      }
      const cx = lo % cols;
      const cy = (lo / cols) | 0;
      const h1 = hash01(p * 5 + 11), h2 = hash01(p * 7 + 13), h3 = hash01(p * 11 + 17), z = hash01(p * 13 + 19);
      let x = (cx + h1) * cw;
      let y = (cy + h2) * ch;
      const zk = 1 - depth + depth * z * 1.6;
      let dx = Math.sin(t * 0.8 + h3 * 6.283) * drift * zk;
      let dy = Math.cos(t * 0.7 + h1 * 6.283) * drift * zk;
      if (splash > 0) {
        const ax = x - W / 2, ay = y - H / 2;
        const r = Math.hypot(ax, ay) || 1;
        const k = splash * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.6 + h3 * 3))) * h2;
        dx += (ax / r) * k;
        dy += (ay / r) * k;
      }
      x += dx * pull;
      y += dy * pull;
      if (melt) y += (((t * 0.15 * (0.5 + z) + h3) % 1) * H * 0.2);
      const xi = x | 0, yi = y | 0;
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
      const col = packed[lo];
      buf[yi * W + xi] = col;
      if (depth > 0 && z > 0.7 && xi + 1 < W && yi + 1 < H) {
        buf[yi * W + xi + 1] = col;
        buf[(yi + 1) * W + xi] = col;
        buf[(yi + 1) * W + xi + 1] = col;
      }
    }
    lay.putImageData(img, 0, 0);
  }

  private drawGrain(out: Ctx, W: number, H: number, amount: number, frame: number) {
    const g = ctx2d(this.grain);
    const d = g.createImageData(256, 256);
    for (let i = 0; i < 65536; i++) {
      const v = hash01(i + frame * 65536) * 255;
      d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v;
      d.data[i * 4 + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    const pat = out.createPattern(this.grain, 'repeat');
    if (!pat) return;
    out.globalCompositeOperation = 'overlay';
    out.globalAlpha = amount;
    out.fillStyle = pat;
    out.fillRect(0, 0, W, H);
    out.globalAlpha = 1;
    out.globalCompositeOperation = 'source-over';
  }

  private effects(out: Ctx, s: Settings, W: number, H: number, time: number, frame: number, bg: Rgb | null) {
    if (s.bloom > 0) {
      out.globalCompositeOperation = 'lighter';
      out.globalAlpha = (s.bloom / 100) * 0.9;
      out.filter = `blur(${(W * 0.006).toFixed(1)}px)`;
      out.drawImage(this.layer, 0, 0);
      out.filter = 'none';
      out.globalAlpha = 1;
      out.globalCompositeOperation = 'source-over';
    }
    if (s.chroma > 0) chromaShift(out, W, H, Math.max(1, Math.round((s.chroma / 100) * W * 0.006)));
    if (s.curvature > 0) this.curve(out, W, H, s.curvature / 100, bg);
    if (s.scanlines > 0) {
      const period = Math.max(2, Math.round(H / 300));
      out.fillStyle = `rgba(0,0,0,${(s.scanlines / 100) * 0.55})`;
      for (let y = 0; y < H; y += period) out.fillRect(0, y, W, Math.max(1, period / 2));
    }
    if (s.vignette > 0) {
      const g = out.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) / 2);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${(s.vignette / 100) * 0.85})`);
      out.fillStyle = g;
      out.fillRect(0, 0, W, H);
    }
    if (s.grain > 0) this.drawGrain(out, W, H, (s.grain / 100) * 0.5, s.animate ? frame * 2 + 1 : 1);
    if (s.animate && s.flicker > 0) {
      const f = hash01(frame * 977) * (s.flicker / 100) * 0.25;
      out.fillStyle = `rgba(0,0,0,${f})`;
      out.fillRect(0, 0, W, H);
    }
  }

  private curve(out: Ctx, W: number, H: number, k: number, bg: Rgb | null) {
    sizeTo(this.tmp, W, H);
    const t = ctx2d(this.tmp);
    t.globalCompositeOperation = 'copy';
    t.drawImage(out.canvas, 0, 0);
    t.globalCompositeOperation = 'source-over';
    const amt = k * 0.12;
    out.clearRect(0, 0, W, H);
    const step = Math.max(1, Math.round(H / 400));
    // horizontal squeeze per row band
    for (let y = 0; y < H; y += step) {
      const ny = (y / H) * 2 - 1;
      const sx = 1 - amt * ny * ny;
      out.drawImage(this.tmp, 0, y, W, step, (W - W * sx) / 2, y, W * sx, step);
    }
    t.globalCompositeOperation = 'copy';
    t.drawImage(out.canvas, 0, 0);
    t.globalCompositeOperation = 'source-over';
    out.clearRect(0, 0, W, H);
    const stepX = Math.max(1, Math.round(W / 400));
    for (let x = 0; x < W; x += stepX) {
      const nx = (x / W) * 2 - 1;
      const sy = 1 - amt * nx * nx;
      out.drawImage(this.tmp, x, 0, stepX, H, x, (H - H * sy) / 2, stepX, H * sy);
    }
    out.globalCompositeOperation = 'destination-over';
    out.fillStyle = bg ? 'rgb(0,0,0)' : 'rgba(0,0,0,0)';
    if (bg) out.fillRect(0, 0, W, H);
    out.globalCompositeOperation = 'source-over';
  }

  private ensureAtlas(chars: string[], family: string, cw: number, ch: number) {
    const aw = Math.max(1, Math.ceil(cw));
    const ah = Math.max(1, Math.ceil(ch));
    const key = `${chars.join('')}|${family}|${aw}|${ah}`;
    if (key === this.atlasKey) return;
    this.atlasKey = key;
    this.atlasCell = [aw, ah];
    sizeTo(this.atlas, aw * chars.length, ah);
    const a = ctx2d(this.atlas);
    a.clearRect(0, 0, this.atlas.width, ah);
    a.fillStyle = '#fff';
    const size = Math.min(ah * 0.95, aw / 0.6);
    a.font = `${size}px ${family}`;
    a.textAlign = 'center';
    a.textBaseline = 'middle';
    this.atlasIndex.clear();
    chars.forEach((c, i) => {
      this.atlasIndex.set(c, i);
      const code = c.codePointAt(0)!;
      if (code >= 0x2580 && code <= 0x259f) {
        drawBlock(a, code, i * aw, 0, aw, ah);
      } else {
        a.fillText(c, i * aw + aw / 2, ah / 2 + size * 0.04);
      }
    });
  }
}

function drawBlock(a: Ctx, code: number, x: number, y: number, w: number, h: number) {
  const shade: Record<number, number> = { 0x2591: 0.25, 0x2592: 0.5, 0x2593: 0.75, 0x2588: 1 };
  if (shade[code]) {
    a.globalAlpha = shade[code];
    a.fillRect(x, y, w, h);
    a.globalAlpha = 1;
    return;
  }
  const quads: Record<number, number> = { 0x2598: 1, 0x259d: 2, 0x2580: 3, 0x2596: 4, 0x258c: 5, 0x259e: 6, 0x259b: 7, 0x2597: 8, 0x259a: 9, 0x2590: 10, 0x259c: 11, 0x2584: 12, 0x2599: 13, 0x259f: 14 };
  const q = quads[code] ?? 15;
  const hw = w / 2, hh = h / 2;
  if (q & 1) a.fillRect(x, y, hw, hh);
  if (q & 2) a.fillRect(x + hw, y, hw, hh);
  if (q & 4) a.fillRect(x, y + hh, hw, hh);
  if (q & 8) a.fillRect(x + hw, y + hh, hw, hh);
}

const chromaScratch: HTMLCanvasElement[] = [];
/** RGB split on the GPU: isolate each channel with multiply, re-add with offsets. */
function chromaShift(out: Ctx, W: number, H: number, d: number) {
  while (chromaScratch.length < 2) chromaScratch.push(canvas());
  const [src, ch] = chromaScratch;
  sizeTo(src, W, H);
  sizeTo(ch, W, H);
  const sc = ctx2d(src);
  sc.globalCompositeOperation = 'copy';
  sc.drawImage(out.canvas, 0, 0);
  sc.globalCompositeOperation = 'source-over';
  const cc = ctx2d(ch);
  out.clearRect(0, 0, W, H);
  const parts: [string, number][] = [['#ff0000', -d], ['#00ff00', 0], ['#0000ff', d]];
  out.globalCompositeOperation = 'lighter';
  for (const [col, dx] of parts) {
    cc.globalCompositeOperation = 'copy';
    cc.drawImage(src, 0, 0);
    cc.globalCompositeOperation = 'multiply';
    cc.fillStyle = col;
    cc.fillRect(0, 0, W, H);
    cc.globalCompositeOperation = 'destination-in';
    cc.drawImage(src, 0, 0);
    out.drawImage(ch, dx, 0);
  }
  out.globalCompositeOperation = 'source-over';
}

function rowsToText(glyphs: string[], cols: number, rows: number): string {
  const lines: string[] = [];
  for (let y = 0; y < rows; y++) lines.push(glyphs.slice(y * cols, (y + 1) * cols).join('').replace(/\s+$/, ''));
  return lines.join('\n');
}

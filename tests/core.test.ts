import { describe, expect, it } from 'vitest';
import {
  brailleChar, boost, ditherThreshold, edgeGlyph, gradient, hexToRgb, levels, quadrantChar,
  rampIndex, rgbToHex, tone, type ToneParams,
} from '../src/core';

const T: ToneParams = { brightness: 0, contrast: 0, gamma: 1, hideShadows: 0, irregularity: 0, autoLevels: false, invert: false };

describe('tone', () => {
  it('is identity at defaults', () => {
    for (const v of [0, 0.25, 0.5, 1]) expect(tone(v, T, [0, 1], 0)).toBeCloseTo(v);
  });
  it('inverts', () => expect(tone(0.2, { ...T, invert: true }, [0, 1], 0)).toBeCloseTo(0.8));
  it('brightness shifts up and clamps', () => {
    expect(tone(0.5, { ...T, brightness: 100 }, [0, 1], 0)).toBe(1);
    expect(tone(0.5, { ...T, brightness: -100 }, [0, 1], 0)).toBe(0);
  });
  it('contrast keeps the midpoint', () => expect(tone(0.5, { ...T, contrast: 80 }, [0, 1], 0)).toBeCloseTo(0.5));
  it('hide shadows blanks the low end', () => {
    expect(tone(0.1, { ...T, hideShadows: 50 }, [0, 1], 0)).toBe(0);
    expect(tone(1, { ...T, hideShadows: 50 }, [0, 1], 0)).toBe(1);
  });
  it('auto levels stretches', () => expect(tone(0.6, { ...T, autoLevels: true }, [0.2, 0.6], 0)).toBeCloseTo(1));
  it('stays in range under jitter', () => {
    for (let i = 0; i < 500; i++) {
      const v = tone(Math.random(), { ...T, irregularity: 100, contrast: 50 }, [0, 1], i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('levels', () => {
  it('finds percentiles', () => {
    const a = new Float32Array(1000).map((_, i) => 0.2 + (i / 1000) * 0.5);
    const [lo, hi] = levels(a);
    expect(lo).toBeCloseTo(0.2, 1);
    expect(hi).toBeCloseTo(0.7, 1);
  });
  it('falls back on flat images', () => expect(levels(new Float32Array(100).fill(0.5))).toEqual([0, 1]));
});

describe('dither + ramp', () => {
  it('bayer thresholds are a permutation in (0,1)', () => {
    for (const [kind, n] of [['bayer4', 4], ['bayer8', 8]] as const) {
      const seen = new Set<number>();
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) seen.add(ditherThreshold(kind, x, y));
      expect(seen.size).toBe(n * n);
      for (const t of seen) expect(t > 0 && t < 1).toBe(true);
    }
  });
  it('ramp index rounds and clamps', () => {
    expect(rampIndex(0, 10, 0.5)).toBe(0);
    expect(rampIndex(1, 10, 0.5)).toBe(9);
    expect(rampIndex(0.5, 3, 0.5)).toBe(1);
    expect(rampIndex(2, 3, 0.9)).toBe(2);
  });
});

describe('glyph builders', () => {
  it('braille', () => {
    expect(brailleChar([0, 0, 0, 0, 0, 0, 0, 0])).toBe('⠀');
    expect(brailleChar([1, 1, 1, 1, 1, 1, 1, 1])).toBe('⣿');
    expect(brailleChar([1, 0, 0, 0, 0, 0, 0, 0])).toBe('⠁');
    expect(brailleChar([0, 0, 0, 0, 0, 0, 0, 1])).toBe('⢀');
  });
  it('quadrants', () => {
    expect(quadrantChar([0, 0, 0, 0])).toBe(' ');
    expect(quadrantChar([1, 1, 1, 1])).toBe('█');
    expect(quadrantChar([1, 0, 0, 1])).toBe('▚');
  });
  it('edges follow direction', () => {
    expect(edgeGlyph(1, 0)).toBe('|'); // horizontal gradient -> vertical edge
    expect(edgeGlyph(0, 1)).toBe('-');
  });
});

describe('colour', () => {
  it('hex round trip', () => {
    expect(hexToRgb('#5fe3a1')).toEqual([95, 227, 161]);
    expect(hexToRgb('fff')).toEqual([255, 255, 255]);
    expect(hexToRgb('#12345')).toBeNull();
    expect(rgbToHex([95, 227, 161])).toBe('#5fe3a1');
  });
  it('boost -100 is grey', () => {
    const [r, g, b] = boost(200, 50, 50, -100);
    expect(Math.abs(r - g)).toBeLessThan(1);
    expect(Math.abs(g - b)).toBeLessThan(1);
  });
  it('gradient endpoints', () => {
    expect(gradient([[0, 0, 0], [255, 255, 255]], 0)).toEqual([0, 0, 0]);
    expect(gradient([[0, 0, 0], [255, 255, 255]], 1)).toEqual([255, 255, 255]);
  });
});

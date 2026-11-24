import { describe, expect, it } from 'vitest';
import { normalizeHex, parseColor, toHex } from '../../src/lib/color';
import { contrastRatio } from '../../src/lib/checks';
import { mix } from '../../src/lib/table';

describe('one colour reader for the whole app', () => {
  it('reads short, long and alpha hex and rgb()', () => {
    expect(parseColor('#abc')).toEqual([170, 187, 204]);
    expect(parseColor('#1E40AF')).toEqual([30, 64, 175]);
    expect(parseColor('#1e40af80')).toEqual([30, 64, 175]);
    expect(parseColor('rgb(30, 64, 175)')).toEqual([30, 64, 175]);
    expect(parseColor('rgba(30 64 175 / 0.5)')).toEqual([30, 64, 175]);
    expect(parseColor('transparent')).toBeNull();
    expect(parseColor('#12')).toBeNull();
  });

  it('writes lower-case #rrggbb', () => {
    expect(toHex([255, 0, 127.6])).toBe('#ff0080');
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('rgb(0,0,0)')).toBe('#000000');
  });

  it('checks contrast on #RRGGBBAA colours instead of skipping them', () => {
    expect(contrastRatio('#000000ff', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('still mixes colours for table stripes', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

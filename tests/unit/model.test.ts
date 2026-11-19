import { describe, expect, it } from 'vitest';
import { PALETTES, SIZE_PRESETS, TEMPLATES, columnLefts, columnWidth, createPoster, makeElement, resolveColor, resolveFont, sizeFor, typeScale } from '../../src/model';
import type { Orientation } from '../../src/types';

const base = { name: 'Test', columns: 3, palette: PALETTES[0], headingFont: 'Montserrat', bodyFont: 'Open Sans', template: 'classic' as const };

describe('poster sizes', () => {
  it('stores every preset portrait and swaps for landscape', () => {
    for (const p of SIZE_PRESETS) {
      expect(p.w).toBeLessThan(p.h);
      const port = sizeFor(p.id, 'portrait');
      const land = sizeFor(p.id, 'landscape');
      expect(port).toEqual({ width: p.w, height: p.h });
      expect(land).toEqual({ width: p.h, height: p.w });
    }
  });

  it('has A0 at the ISO size', () => {
    expect(sizeFor('A0', 'portrait')).toEqual({ width: 841, height: 1189 });
  });

  it('accepts any custom size', () => {
    const p = createPoster({ ...base, width: 1000, height: 700, sizePreset: 'custom' });
    expect(p.width).toBe(1000);
    expect(p.height).toBe(700);
  });
});

describe('columns', () => {
  it('splits the usable width into equal columns with gutters', () => {
    const p = { width: 1000, margin: 20, gutter: 10, columns: 4 };
    const w = columnWidth(p);
    expect(w * 4 + 10 * 3 + 40).toBeCloseTo(1000);
    const lefts = columnLefts(p);
    expect(lefts).toHaveLength(4);
    expect(lefts[0]).toBe(20);
    expect(lefts[3] + w).toBeCloseTo(980);
  });
});

describe('templates', () => {
  const orientations: Orientation[] = ['portrait', 'landscape'];
  for (const t of TEMPLATES) {
    for (const o of orientations) {
      for (const cols of [1, 2, 3, 4, 5, 6]) {
        it(`${t.id} / ${o} / ${cols} columns keeps everything on the page`, () => {
          const size = sizeFor('A0', o);
          const p = createPoster({ ...base, ...size, sizePreset: 'A0', columns: cols, template: t.id });
          if (t.id === 'blank') return expect(p.elements).toHaveLength(0);
          expect(p.elements.length).toBeGreaterThan(3);
          for (const e of p.elements) {
            expect(e.x).toBeGreaterThanOrEqual(-0.01);
            expect(e.y).toBeGreaterThanOrEqual(-0.01);
            expect(e.x + e.w).toBeLessThanOrEqual(p.width + 0.01);
            expect(e.y + e.h).toBeLessThanOrEqual(p.height + 0.01);
            expect(e.w).toBeGreaterThan(0);
            expect(e.h).toBeGreaterThan(0);
          }
          expect(new Set(p.elements.map((e) => e.id)).size).toBe(p.elements.length);
          expect(p.elements.some((e) => e.type === 'title')).toBe(true);
        });
      }
    }
  }

  it('scales type to the poster size', () => {
    const a0 = createPoster({ ...base, ...sizeFor('A0', 'portrait'), sizePreset: 'A0' });
    const a3 = createPoster({ ...base, ...sizeFor('A3', 'portrait'), sizePreset: 'A3' });
    const title = (p: typeof a0) => p.elements.find((e) => e.type === 'title')!.style!.fontSize;
    expect(title(a0)).toBeGreaterThan(title(a3) * 2);
    expect(typeScale(a0)).toBe(1);
  });
});

describe('palette and font references', () => {
  const p = createPoster({ ...base, ...sizeFor('A1', 'portrait'), sizePreset: 'A1' });
  it('resolves palette roles and leaves hex colours alone', () => {
    expect(resolveColor('@primary', p.palette)).toBe(PALETTES[0].primary);
    expect(resolveColor('#123456', p.palette)).toBe('#123456');
    expect(resolveColor(undefined, p.palette)).toBe('transparent');
  });
  it('recolours linked elements when the palette changes', () => {
    const heading = makeElement('heading', p);
    expect(heading.style!.color).toBe('@primary');
    expect(resolveColor(heading.style!.color, PALETTES[2])).toBe(PALETTES[2].primary);
  });
  it('resolves theme fonts', () => {
    expect(resolveFont('@heading', p)).toBe('Montserrat');
    expect(resolveFont('@body', p)).toBe('Open Sans');
    expect(resolveFont('Lora', p)).toBe('Lora');
  });
});

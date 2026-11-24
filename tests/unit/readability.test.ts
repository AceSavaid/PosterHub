import { describe, expect, it } from 'vitest';
import { checkPoster, contrastRatio, minReadablePt, readableTextColor, sizeName } from '../../src/lib/checks';
import { PALETTES, createPoster, makeElement, sizeFor } from '../../src/model';
import type { Poster } from '../../src/types';

function blank(preset = 'A0', orientation: 'portrait' | 'landscape' = 'portrait'): Poster {
  return createPoster({ name: 't', ...sizeFor(preset, orientation), sizePreset: preset, columns: 3, palette: PALETTES[0], headingFont: 'Inter', bodyFont: 'Inter', template: 'blank' });
}
const style = (fontSize: number, color: string) => ({ fontFamily: '@body', fontSize, color, bold: false, italic: false, underline: false, align: 'left' as const, lineHeight: 1.3 });

describe('text too faint on its background', () => {
  it('offers the palette’s text colour for faint body text on a light page', () => {
    const p = blank();
    const t = makeElement('text', p, { html: 'Our results', y: 100, style: style(28, '#cccccc') });
    p.elements = [t];
    const issue = checkPoster(p).find((i) => i.id === 'contrast-' + t.id)!;
    expect(issue.title).toMatch(/too faint/);
    expect(issue.textColor).toMatchObject({ color: '@text', hex: PALETTES[0].text, from: '#cccccc' });
    expect(issue.textColor!.label).toBe('Use the palette’s Text colour');
    expect(issue.detail).toMatch(/Darker text, such as the palette’s Text colour, reads at \d+\.\d:1/);
  });

  it('tries the palette’s Primary first for a heading', () => {
    const p = blank();
    const h = makeElement('heading', p, { html: 'Methods', y: 100 });
    h.style!.color = '#e0e0e0';
    p.elements = [h];
    expect(checkPoster(p).find((i) => i.id === 'contrast-' + h.id)!.textColor!.color).toBe('@primary');
  });

  it('offers lighter text on a dark band, and says so', () => {
    const p = blank();
    const band = makeElement('shape', p, { x: 0, y: 0, w: 841, h: 200, fill: '@primary' });
    const t = makeElement('text', p, { html: 'On the band', x: 50, y: 50, w: 300, h: 50, style: style(28, '@secondary') });
    p.elements = [band, t];
    const issue = checkPoster(p).find((i) => i.id === 'contrast-' + t.id)!;
    expect(issue.detail).toMatch(/Lighter text/);
    // the background is white in this palette, and reads well on the dark primary band
    expect(issue.textColor!.color).toBe('@background');
  });

  it('falls back to black or white when no palette colour is clear enough', () => {
    const p = blank();
    p.palette = { name: 'mid', primary: '#888888', secondary: '#8a8a8a', accent: '#909090', background: '#ffffff', surface: '#999999', text: '#8c8c8c' };
    const t = makeElement('text', p, { html: 'Grey on grey', y: 100, fill: '#777777', style: style(28, '#8c8c8c') });
    p.elements = [t];
    const fix = readableTextColor(p, t, '#777777', 4.5)!;
    expect(fix.color).toBe('#000000');
    expect(fix.name).toBe('black');
    expect(contrastRatio(fix.hex, '#777777')!).toBeGreaterThanOrEqual(4.5);
  });

  it('never suggests the colour the text already has', () => {
    const p = blank();
    const t = makeElement('text', p, { html: 'x', style: style(28, '@text') });
    const fix = readableTextColor(p, t, '#ffffff', 4.5)!;
    expect(fix.color).not.toBe('@text');
  });

  it('leaves readable text alone', () => {
    const p = blank();
    p.elements = [makeElement('text', p, { html: 'Fine', y: 100, style: style(28, '@text') })];
    expect(checkPoster(p).some((i) => i.id.startsWith('contrast-'))).toBe(false);
  });
});

describe('text too small to read from 2 m', () => {
  it('names the poster size and offers the smallest readable size', () => {
    const p = blank('A0');
    const t = makeElement('text', p, { html: 'Tiny words', y: 100, style: style(12, '@text') });
    p.elements = [t];
    const issue = checkPoster(p).find((i) => i.id === 'small-' + t.id)!;
    expect(issue.title).toMatch(/too small to read from 2 m/);
    expect(issue.detail).toBe('It is 12 pt. People read posters from about 2 m away; on an A0 poster that needs at least 20 pt.');
    expect(issue.textSize).toEqual({ label: 'Make it 20 pt', pt: 20 });
  });

  it('asks for less on a smaller poster, which is read from closer', () => {
    const p = blank('A2', 'landscape');
    expect(minReadablePt(p)).toBe(10);
    const t = makeElement('text', p, { html: 'Words', y: 100, style: style(8, '@text') });
    p.elements = [t];
    expect(checkPoster(p).find((i) => i.id === 'small-' + t.id)!.textSize!.pt).toBe(10);
  });

  it('lets a reference list be smaller, and still offers a size', () => {
    const p = blank('A0');
    const refs = makeElement('text', p, { html: 'Smith (2020)', y: 100, refList: true, style: style(14, '@text') });
    const tiny = makeElement('text', p, { html: 'Jones (2021)', y: 300, refList: true, style: style(10, '@text') });
    p.elements = [refs, tiny];
    const found = checkPoster(p);
    expect(found.some((i) => i.id === 'small-' + refs.id)).toBe(false); // 14 pt ≥ 12 pt
    expect(found.find((i) => i.id === 'small-' + tiny.id)!.textSize!.pt).toBe(12);
  });

  it('offers a size for tables, equations and graph labels too', () => {
    const p = blank('A0');
    const table = makeElement('table', p, { y: 100, table: { rows: [['a', 'b']], headerRow: true, style: 'academic', align: 'auto', fontSize: 8 } });
    const eq = makeElement('equation', p, { y: 400, equation: { latex: 'E=mc^2', fontSize: 10, color: '@text', align: 'center' } });
    p.elements = [table, eq];
    const found = checkPoster(p);
    expect(found.find((i) => i.id === 'small-' + table.id)!.textSize).toEqual({ label: 'Make it 17 pt', pt: 17 });
    expect(found.find((i) => i.id === 'eqfont-' + eq.id)!.textSize!.pt).toBe(20);
  });

  it('describes the poster size in words', () => {
    expect(sizeName(blank('A0'))).toBe('an A0 poster');
    expect(sizeName(blank('36x48', 'landscape'))).toBe('a 36 × 48 in poster');
    expect(sizeName(blank('18x24'))).toBe('an 18 × 24 in poster');
    expect(sizeName({ width: 500, height: 700, sizePreset: 'custom' })).toBe('a poster this size');
    // a preset name left over after a custom resize is not trusted
    expect(sizeName({ width: 500, height: 700, sizePreset: 'A0' })).toBe('a poster this size');
  });
});

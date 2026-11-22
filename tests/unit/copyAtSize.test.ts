import { describe, expect, it } from 'vitest';
import { PALETTES, createPoster, makeElement, sizeFor, type TemplateId } from '../../src/model';
import { canRearrange, copyAtSize, defaultCopyName, defaultOptions, guessLayout, scaleContent, shapeChanges, sizeLabel, suggestColumns } from '../../src/lib/copyAtSize';
import type { Poster } from '../../src/types';

const make = (template: TemplateId = 'classic', preset = 'A0', landscape = false, columns = 3): Poster =>
  createPoster({ name: 'Sleep study', ...sizeFor(preset, landscape ? 'landscape' : 'portrait'), sizePreset: preset, columns, palette: PALETTES[0], headingFont: 'Montserrat', bodyFont: 'Open Sans', template });

function filled(template: TemplateId = 'classic') {
  const p = make(template);
  p.elements.find((e) => e.role === 'title')!.html = 'Sleep and memory in older adults';
  const h = p.elements.find((e) => e.role === 'heading' && e.html === 'Results')!;
  p.elements.find((e) => e.group === h.group && e.role === 'body')!.html = 'Recall improved by 18%.';
  p.elements.find((e) => e.group === h.group && e.role === 'figure')!.src = 'data:image/png;base64,RESULTS';
  p.notes = [{ id: 'n1', x: 400, y: 600, text: 'Check this', author: 'Sup', createdAt: 1, resolved: false }];
  p.thumbnail = 'data:image/png;base64,OLD';
  return p;
}

const inside = (p: Poster) => p.elements.every((e) => e.x >= -0.5 && e.y >= -0.5 && e.x + e.w <= p.width + 0.5 && e.y + e.h <= p.height + 0.5);

describe('scaleContent', () => {
  it('moves and resizes elements in proportion and scales text by the smaller factor', () => {
    const p = make('blank');
    p.elements.push(makeElement('text', p, { x: 100, y: 200, w: 300, h: 100 }));
    const e = p.elements[p.elements.length - 1];
    const font = e.style!.fontSize;
    scaleContent(p, p.width / 2, p.height / 4);
    expect(e).toMatchObject({ x: 50, y: 50, w: 150, h: 25 });
    expect(e.style!.fontSize).toBeCloseTo(font / 4, 0);
  });

  it('never makes text smaller than 4 pt', () => {
    const p = make('classic');
    scaleContent(p, 50, 70);
    for (const e of p.elements) if (e.style) expect(e.style.fontSize).toBeGreaterThanOrEqual(4);
  });
});

describe('sizes and suggestions', () => {
  it('spots when the shape changes', () => {
    const p = make();
    expect(shapeChanges(p, 594, 841)).toBe(false); // A0 → A1 portrait
    expect(shapeChanges(p, 1189, 841)).toBe(true); // → landscape
    expect(shapeChanges(p, 36 * 25.4, 48 * 25.4)).toBe(false); // close enough in shape
  });

  it('suggests more columns for landscape and fewer for portrait', () => {
    expect(suggestColumns(make(), 1189, 841)).toBe(4);
    expect(suggestColumns(make('classic', 'A0', true, 4), 841, 1189)).toBe(3);
    expect(suggestColumns(make(), 594, 841)).toBe(3);
  });

  it('labels sizes and names the copy', () => {
    expect(sizeLabel(841, 594, 'A1')).toBe('A1 landscape');
    expect(sizeLabel(36 * 25.4, 48 * 25.4, '36x48')).toBe('36 × 48 in portrait');
    expect(sizeLabel(500, 700, 'custom')).toBe('500 × 700 mm portrait');
    const p = make();
    expect(defaultCopyName(p, 841, 594, 'A1')).toBe('Sleep study (A1 landscape)');
    // Copying a copy doesn't pile up suffixes.
    expect(defaultCopyName({ ...p, name: 'Sleep study (A1 landscape)' }, 210, 297, 'A4')).toBe('Sleep study (A4 portrait)');
  });

  it('defaults to rearranging when the orientation flips, and scaling otherwise', () => {
    const p = make();
    expect(defaultOptions(p, 'A1', 'landscape')).toMatchObject({ mode: 'rearrange', width: 841, height: 594, columns: 4, template: 'classic' });
    expect(defaultOptions(p, 'A4', 'portrait')).toMatchObject({ mode: 'scale', width: 210, height: 297 });
    expect(defaultOptions(make('blank'), 'A0', 'landscape').mode).toBe('scale');
  });

  it('recognises which layout a poster was made from', () => {
    for (const t of ['classic', 'boxed', 'sidebar', 'takeaway', 'minimal'] as TemplateId[]) expect(guessLayout(make(t)), t).toBe(t);
    expect(canRearrange(make('blank'))).toBe(false);
  });
});

describe('copyAtSize', () => {
  it('A0 portrait → A4 handout: scales everything and leaves the original alone', () => {
    const p = filled();
    const before = JSON.stringify(p);
    const { poster: c, message } = copyAtSize(p, { width: 210, height: 297, sizePreset: 'A4', mode: 'scale' });
    expect(JSON.stringify(p)).toBe(before);
    expect(c.id).not.toBe(p.id);
    expect(c).toMatchObject({ width: 210, height: 297, sizePreset: 'A4', name: 'Sleep study (A4 portrait)', columns: 3 });
    expect(c.thumbnail).toBeUndefined();
    expect(c.elements).toHaveLength(p.elements.length);
    const title = c.elements.find((e) => e.role === 'title')!;
    const oldTitle = p.elements.find((e) => e.role === 'title')!;
    expect(title.style!.fontSize).toBeCloseTo(oldTitle.style!.fontSize * (210 / 841), 0);
    expect(c.margin).toBeCloseTo(p.margin * (210 / 841), 2);
    expect(c.notes![0].x).toBeCloseTo(400 * (210 / 841));
    expect(c.notes![0].y).toBeCloseTo(600 * (297 / 1189));
    expect(inside(c)).toBe(true);
    expect(message).toContain('A4 portrait');
  });

  it('A0 portrait → A1 landscape: rearranges into more columns and keeps all content', () => {
    const p = filled();
    const { poster: c, message } = copyAtSize(p, { width: 841, height: 594, sizePreset: 'A1', mode: 'rearrange' });
    expect(c).toMatchObject({ width: 841, height: 594, columns: 4 });
    const html = c.elements.map((e) => e.html ?? '').join('\n');
    expect(html).toContain('Sleep and memory in older adults');
    expect(html).toContain('Recall improved by 18%.');
    expect(c.elements.filter((e) => e.src === 'data:image/png;base64,RESULTS')).toHaveLength(1);
    expect(inside(c)).toBe(true);
    expect(new Set(c.elements.map((e) => e.id)).size).toBe(c.elements.length);
    // The title uses the layout's size for A1, not a squashed one.
    expect(c.elements.find((e) => e.role === 'title')!.style!.fontSize).toBeGreaterThan(30);
    expect(message).toMatch(/A1 landscape copy in 4 columns/);
  });

  it('uses the chosen layout and columns, and the person’s name', () => {
    const { poster: c } = copyAtSize(filled(), { width: 1189, height: 841, sizePreset: 'A0', mode: 'rearrange', template: 'sidebar', columns: 5, name: '  Conference version ' });
    expect(c.columns).toBe(5);
    expect(c.name).toBe('Conference version');
    expect(c.elements.some((e) => e.role === 'summary')).toBe(true);
  });

  it('falls back to scaling for a poster with no sections', () => {
    const p = make('blank');
    p.elements.push(makeElement('text', p, { x: 0, y: 0, w: 841, h: 1189, html: 'Freeform' }));
    const { poster: c } = copyAtSize(p, { width: 1189, height: 841, sizePreset: 'A0', mode: 'rearrange' });
    expect(c.elements).toHaveLength(1);
    expect(c.elements[0]).toMatchObject({ w: 1189, h: 841 });
  });
});

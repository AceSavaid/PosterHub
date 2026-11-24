import { describe, expect, it } from 'vitest';
import { backgroundBehind, checkPoster, contrastRatio, exportWarningFor, minReadablePt, splitDismissed, withDismissed, type Issue } from '../../src/lib/checks';
import { PALETTES, createPoster, makeElement, sizeFor } from '../../src/model';
import type { Poster } from '../../src/types';

function blank(): Poster {
  return createPoster({ name: 't', ...sizeFor('A0', 'portrait'), sizePreset: 'A0', columns: 3, palette: PALETTES[0], headingFont: 'Inter', bodyFont: 'Inter', template: 'blank' });
}
const ids = (issues: { id: string }[]) => issues.map((i) => i.id.split('-')[0]);

describe('contrast', () => {
  it('matches the WCAG formula', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
    expect(contrastRatio('#fff', '#fff')).toBe(1);
    expect(contrastRatio('red', '#fff')).toBeNull();
  });

  it('looks through to the filled shape behind a text box', () => {
    const p = blank();
    const band = makeElement('shape', p, { x: 0, y: 0, w: 841, h: 200, fill: '#123456' });
    const text = makeElement('text', p, { x: 50, y: 50, w: 300, h: 50 });
    p.elements = [band, text];
    expect(backgroundBehind(p, text)).toBe('#123456');
    text.fill = '#ffffff';
    expect(backgroundBehind(p, text)).toBe('#ffffff');
  });
});

describe('poster check', () => {
  it('flags an empty poster', () => {
    expect(ids(checkPoster(blank()))).toEqual(['empty']);
  });

  it('finds leftover example text in a new template', () => {
    const p = createPoster({ name: 't', ...sizeFor('A1', 'landscape'), sizePreset: 'A1', columns: 3, palette: PALETTES[0], headingFont: 'Inter', bodyFont: 'Inter', template: 'classic' });
    const found = checkPoster(p);
    expect(found.filter((i) => i.id.startsWith('ph-')).length).toBeGreaterThan(5);
    // the template itself has no contrast or size problems
    expect(found.filter((i) => i.severity === 'problem')).toEqual([]);
  });

  it('flags small text, low contrast, off-page elements and blurry images', () => {
    const p = blank();
    p.elements = [
      makeElement('text', p, { html: 'Real words', y: 100, style: { fontFamily: '@body', fontSize: 9, color: '#dddddd', bold: false, italic: false, underline: false, align: 'left', lineHeight: 1.2 } }),
      makeElement('heading', p, { html: 'Methods', x: 2000 }),
      makeElement('image', p, { src: 'data:image/png;base64,x', w: 300, y: 900 }),
    ];
    const found = checkPoster(p, new Map([[p.elements[2].id, { width: 600 }]]));
    const kinds = ids(found);
    expect(kinds).toContain('small');
    expect(kinds).toContain('contrast');
    expect(kinds).toContain('off');
    expect(kinds).toContain('dpi'); // 600 px over 300 mm ≈ 51 dpi
    expect(found[0].severity).toBe('problem'); // problems sort first
  });

  it('accepts a sharp image and readable text', () => {
    const p = blank();
    p.elements = [
      makeElement('text', p, { html: 'Real words', y: 900 }),
      makeElement('image', p, { src: 'data:image/png;base64,x', w: 100, y: 1000, alt: 'A chart' }),
    ];
    const found = checkPoster(p, new Map([[p.elements[1].id, { width: 2000 }]]));
    expect(found.filter((i) => i.severity !== 'tip')).toEqual([]);
  });

  it('reports hidden text and empty image placeholders', () => {
    const p = blank();
    const t = makeElement('text', p, { html: 'Real words', y: 900 });
    p.elements = [t, makeElement('image', p, { y: 1000 })];
    const kinds = ids(checkPoster(p, new Map(), new Set([t.id])));
    expect(kinds).toContain('overflow');
    expect(kinds).toContain('noimg');
  });

  it('scales the readable size to the poster', () => {
    const p = blank();
    expect(minReadablePt(p)).toBe(20);
    expect(minReadablePt({ ...p, ...sizeFor('A4', 'portrait') })).toBeLessThan(10);
  });
});

describe('Export menu warning', () => {
  const issue = (id: string, severity: 'problem' | 'warning', leftover = false) => ({ id, severity, leftover }) as unknown as Issue;
  it('is one line, most serious first', () => {
    expect(exportWarningFor([])).toBeNull();
    const w = exportWarningFor([issue('a', 'warning', true), issue('b', 'warning', true), issue('cmyk-1', 'warning'), issue('c', 'problem')]);
    expect(w).toEqual({ headline: '⛔ 1 problem to fix before printing', more: ['2 boxes still have example text or no picture', '🎨 1 colour will print duller'], urgent: true });
    expect(exportWarningFor([issue('a', 'warning', true)])).toEqual({ headline: '1 box still has example text or no picture', more: [], urgent: false });
  });
});

describe('dismissed check items', () => {
  const issues = [
    { id: 'ph-a', severity: 'warning', title: 'A', detail: '' },
    { id: 'small-b', severity: 'problem', title: 'B', detail: '' },
    { id: 'empty', severity: 'tip', title: 'C', detail: '' },
  ] as const;

  it('hides dismissed items and lists them separately', () => {
    const { shown, hidden } = splitDismissed([...issues], ['small-b', 'gone-z']);
    expect(shown.map((i) => i.id)).toEqual(['ph-a', 'empty']);
    expect(hidden.map((i) => i.id)).toEqual(['small-b']);
    expect(splitDismissed([...issues]).shown).toHaveLength(3);
    expect(splitDismissed([...issues], undefined).hidden).toEqual([]);
  });

  it('adds and removes ids without duplicates, and clears to undefined', () => {
    expect(withDismissed(undefined, ['a'], true)).toEqual(['a']);
    expect(withDismissed(['a'], ['a', 'b'], true)).toEqual(['a', 'b']);
    expect(withDismissed(['a', 'b'], ['a'], false)).toEqual(['b']);
    expect(withDismissed(['a'], ['a'], false)).toBeUndefined();
  });
});

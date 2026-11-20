import { describe, expect, it } from 'vitest';
import { IN_TO_MM, PALETTES, createPoster, makeElement, sizeFor } from '../../src/model';
import { checkPoster } from '../../src/lib/checks';
import { cleanRules, conferenceIssues, conferenceResults, hasRules, logoElements } from '../../src/lib/conference';
import { sanitizePoster } from '../../src/lib/sanitize';
import type { Poster } from '../../src/types';

const poster = (size = 'A0', o: 'portrait' | 'landscape' = 'portrait'): Poster =>
  createPoster({ name: 't', ...sizeFor(size, o), sizePreset: size, columns: 3, palette: PALETTES[0], headingFont: 'Inter', bodyFont: 'Inter', template: 'blank' });

const result = (p: Poster, id: string) => conferenceResults(p).find((r) => r.id === id);

describe('conference rules', () => {
  it('checks nothing until a rule is set', () => {
    const p = poster();
    expect(conferenceResults(p)).toEqual([]);
    p.conference = { name: 'Only a name' };
    expect(hasRules(p.conference)).toBe(false);
    expect(conferenceResults(p)).toEqual([]);
  });

  it('checks the exact size either way round unless orientation is set', () => {
    const p = poster('A0', 'landscape');
    p.conference = { width: 841, height: 1189 };
    expect(result(p, 'size')!.ok).toBe(true);
    p.conference.orientation = 'portrait';
    expect(result(p, 'size')!.ok).toBe(false);
    expect(result(p, 'orientation')!.ok).toBe(false);
    expect(result(p, 'orientation')!.detail).toContain('landscape');
    const q = poster('A1');
    q.conference = { width: 841, height: 1189 };
    expect(result(q, 'size')!.ok).toBe(false);
    expect(result(q, 'size')!.detail).toContain('594 × 841 mm');
  });

  it('allows smaller posters when the size is a maximum', () => {
    const p = poster('36x48');
    p.conference = { width: 42 * IN_TO_MM, height: 56 * IN_TO_MM, sizeMode: 'max' };
    expect(result(p, 'size')!.ok).toBe(true);
    expect(result(p, 'size')!.rule).toContain('at most');
    p.conference.width = 30 * IN_TO_MM;
    expect(result(p, 'size')!.ok).toBe(false);
    // a millimetre of rounding is still the same size
    const q = poster('A0');
    q.conference = { width: 842, height: 1188 };
    expect(result(q, 'size')!.ok).toBe(true);
  });

  it('finds text, table, graph and inline sizes under the minimum', () => {
    const p = poster();
    const body = makeElement('text', p, { html: 'Body' });
    body.style!.fontSize = 28;
    const inline = makeElement('text', p, { html: 'Big <span style="font-size: 12pt">small words</span>' });
    inline.style!.fontSize = 30;
    const empty = makeElement('text', p, { html: '' });
    empty.style!.fontSize = 6;
    const chart = makeElement('chart', p);
    chart.chart = { kind: 'bar', title: '', columns: ['a', 'b'], rows: [['x', '1']], xColumn: 0, yColumns: [1], rowStart: 0, rowEnd: 0, xLabel: '', yLabel: '', showLegend: false, fontSize: 18 };
    p.elements.push(body, inline, empty, chart);
    p.conference = { minFontPt: 24 };
    const r = result(p, 'min-font')!;
    expect(r.ok).toBe(false);
    expect(r.elementIds).toEqual([inline.id, chart.id]);
    expect(r.detail).toContain('down to 12 pt');
  });

  it('looks for the poster number however it is punctuated', () => {
    const p = poster();
    p.conference = { posterNumber: 'P-142' };
    expect(result(p, 'number')!.ok).toBe(false);
    p.elements.push(makeElement('text', p, { html: 'Poster <b>p 142</b>' }));
    expect(result(p, 'number')!.ok).toBe(true);
  });

  it('needs a real QR code and enough logos', () => {
    const p = poster();
    p.conference = { requireQr: true, logos: 2 };
    expect(result(p, 'qr')!.ok).toBe(false);
    const src = 'data:image/png;base64,iVBORw0KGgo=';
    p.elements.push(makeElement('image', p, { src, qr: 'https://doi.org/10.1/x', w: 80, h: 80 }));
    expect(result(p, 'qr')!.ok).toBe(true);
    // a filled logo slot, a small picture in the header, and a big figure in the middle
    p.elements.push(makeElement('image', p, { src, placeholder: 'Logo', x: 700, y: 20, w: 100, h: 70 }));
    expect(result(p, 'logos')!.ok).toBe(false);
    p.elements.push(makeElement('image', p, { src, x: 20, y: 20, w: 100, h: 70 }));
    p.elements.push(makeElement('image', p, { src, x: 100, y: 500, w: 600, h: 400 }));
    expect(logoElements(p)).toHaveLength(2);
    expect(result(p, 'logos')!.ok).toBe(true);
  });

  it('reports unmet rules in the poster check with the conference name', () => {
    const p = poster('A1');
    p.conference = { name: 'ISMB', width: 841, height: 1189, requireQr: true };
    const issues = conferenceIssues(p);
    expect(issues.map((i) => [i.id, i.severity])).toEqual([
      ['conf-size', 'problem'],
      ['conf-qr', 'warning'],
    ]);
    expect(issues[0].title).toBe('ISMB rule: Size: 841 × 1189 mm (33.1 × 46.8 in)');
    expect(checkPoster(p).some((i) => i.id === 'conf-size')).toBe(true);
  });

  it('cleans rules from an opened file', () => {
    expect(cleanRules({ name: 'X', width: -5, height: 'big', orientation: 'sideways', requireQr: 'yes', logos: 2.4, extra: '<script>' })).toEqual({ name: 'X', logos: 2 });
    expect(cleanRules('nope')).toBeUndefined();
    expect(cleanRules({})).toBeUndefined();
    const p = poster();
    (p as unknown as { conference: unknown }).conference = { minFontPt: 24, sizeMode: 'huge' };
    expect(sanitizePoster(p).conference).toEqual({ minFontPt: 24 });
  });
});

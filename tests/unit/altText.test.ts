import { describe, expect, it } from 'vitest';
import { altTextIssue, checkPoster } from '../../src/lib/checks';
import { PALETTES, createPoster, makeElement, sizeFor } from '../../src/model';
import type { ChartSpec, Poster } from '../../src/types';

function blank(): Poster {
  return createPoster({ name: 't', ...sizeFor('A0', 'portrait'), sizePreset: 'A0', columns: 3, palette: PALETTES[0], headingFont: 'Inter', bodyFont: 'Inter', template: 'blank' });
}
const chart = (title = ''): ChartSpec => ({ kind: 'bar', title, columns: ['x', 'y'], rows: [['a', '1']], xColumn: 0, yColumns: [1], rowStart: 0, rowEnd: 0, xLabel: '', yLabel: '', showLegend: false, fontSize: 30 });

describe('missing alt text', () => {
  const p = blank();

  it('asks for a description of pictures, graphs and icons', () => {
    const pic = altTextIssue(makeElement('image', p, { src: 'data:image/png;base64,x' }))!;
    expect(pic).toMatchObject({ severity: 'warning', title: 'A picture has no description', needsAlt: true });
    const graph = altTextIssue(makeElement('chart', p, { chart: chart('Recall by group') }))!;
    expect(graph).toMatchObject({ severity: 'warning', title: 'Graph “Recall by group” has no description' });
    expect(altTextIssue(makeElement('chart', p, { chart: chart() }))!.title).toBe('A graph has no description');
    const icon = altTextIssue(makeElement('icon', p, { icon: { id: 'flask' } as never }))!;
    expect(icon.severity).toBe('tip');
  });

  it('is gentler about logos', () => {
    expect(altTextIssue(makeElement('image', p, { src: 'data:image/png;base64,x', role: 'logo' }))).toMatchObject({ severity: 'tip', title: 'A logo has no description' });
  });

  it('skips described elements, QR codes, empty placeholders and text', () => {
    expect(altTextIssue(makeElement('image', p, { src: 'data:image/png;base64,x', alt: 'Lab bench' }))).toBeNull();
    expect(altTextIssue(makeElement('image', p, { src: 'data:image/png;base64,x', alt: '   ' }))).not.toBeNull();
    expect(altTextIssue(makeElement('image', p, { src: 'data:image/png;base64,x', qr: 'https://example.org' }))).toBeNull();
    expect(altTextIssue(makeElement('image', p, {}))).toBeNull();
    expect(altTextIssue(makeElement('chart', p, {}))).toBeNull();
    expect(altTextIssue(makeElement('text', p))).toBeNull();
  });

  it('appears in the full check, pointing at the element', () => {
    const q = blank();
    const img = makeElement('image', q, { src: 'data:image/png;base64,x', y: 400 });
    q.elements = [img];
    const found = checkPoster(q).filter((i) => i.needsAlt);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: 'alt-' + img.id, elementId: img.id });
    img.alt = 'Participants at the lab bench';
    expect(checkPoster(q).some((i) => i.needsAlt)).toBe(false);
  });
});

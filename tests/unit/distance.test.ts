import { describe, expect, it } from 'vitest';
import { PALETTES, createPoster, makeElement, sizeFor } from '../../src/model';
import { distanceZoom, hardToReadAt, readablePtAt } from '../../src/lib/distance';

const blank = () => createPoster({ name: 't', ...sizeFor('A0', 'portrait'), sizePreset: 'A0', columns: 3, palette: PALETTES[0], headingFont: 'Inter', bodyFont: 'Inter', template: 'blank' });

describe('viewing distance preview', () => {
  it('shrinks the poster in proportion to distance', () => {
    expect(distanceZoom(1)).toBeCloseTo(0.6);
    expect(distanceZoom(2)).toBeCloseTo(0.3);
    expect(distanceZoom(3)).toBeCloseTo(0.2);
    expect(distanceZoom(2, 0.5)).toBeCloseTo(0.25);
  });

  it('needs bigger text further away', () => {
    expect([1, 2, 3].map(readablePtAt)).toEqual([12, 24, 36]);
  });

  it('marks text and graph labels that are too small from that distance', () => {
    const p = blank();
    const body = makeElement('text', p, { html: 'Body text' });
    body.style!.fontSize = 20;
    const big = makeElement('title', p, { html: 'Title' });
    big.style!.fontSize = 90;
    const empty = makeElement('text', p, { html: '' });
    empty.style!.fontSize = 8;
    const chart = makeElement('chart', p);
    chart.chart = { kind: 'bar', title: '', columns: ['a', 'b'], rows: [['x', '1']], xColumn: 0, yColumns: [1], rowStart: 0, rowEnd: 0, xLabel: '', yLabel: '', showLegend: false, fontSize: 18 };
    p.elements.push(body, big, empty, chart);
    expect(hardToReadAt(p, 1)).toEqual(new Set());
    expect(hardToReadAt(p, 2)).toEqual(new Set([body.id, chart.id]));
    expect(hardToReadAt(p, 3).has(big.id)).toBe(false);
    expect(hardToReadAt(p, 3).has(empty.id)).toBe(false); // empty boxes aren't text
  });
});

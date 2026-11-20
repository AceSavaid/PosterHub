import { describe, expect, it } from 'vitest';
import { defaultYColumns, scaleMismatch } from '../../src/lib/chart';
import { defaultSpec, parseCsv } from '../../src/components/ChartDialog';
import { emptyFigureSlot, findFreeSpot, intersects } from '../../src/lib/arrange';
import { checkPoster } from '../../src/lib/checks';
import { PALETTES, createPoster, makeElement, sizeFor } from '../../src/model';
import type { PosterElement } from '../../src/types';

const mixed = `Condition,Accuracy,Speed,Errors
Baseline,0.62,410,0.3
Week 1,0.71,388,0.25
Week 2,0.78,371,0.2
`;

describe('graph defaults never hide a column', () => {
  it('ticks only columns of a similar size', () => {
    const { columns, rows } = parseCsv(mixed);
    const spec = defaultSpec(columns, rows, 24);
    // Accuracy and Errors (both under 1) together; Speed (~400) would flatten them
    expect(spec.yColumns.map((c) => columns[c])).toEqual(['Accuracy', 'Errors']);
    expect(scaleMismatch(spec)).toBeNull();
  });

  it('still ticks every similar column, up to three', () => {
    const { columns, rows } = parseCsv('g,a,b,c,d\nx,1,2,3,4\ny,5,6,7,8\n');
    expect(defaultSpec(columns, rows, 24).yColumns).toEqual([1, 2, 3]);
  });

  it('warns when ticked columns differ a lot in size', () => {
    const { columns, rows } = parseCsv(mixed);
    const spec = { ...defaultSpec(columns, rows, 24), yColumns: [1, 2] };
    expect(scaleMismatch(spec)).toEqual({ small: 'Accuracy', large: 'Speed' });
    // pies use one column, so there is nothing to compare
    expect(scaleMismatch({ ...spec, kind: 'pie' })).toBeNull();
  });

  it('copes with empty and zero columns', () => {
    const rows = [['a', '0', ''], ['b', '0', '']];
    expect(defaultYColumns({ rows, rowStart: 0, rowEnd: 1 }, [1, 2])).toEqual([1, 2]);
    expect(defaultYColumns({ rows, rowStart: 0, rowEnd: 1 }, [])).toEqual([]);
  });
});

describe('placing new elements', () => {
  const poster = (template: 'classic' | 'blank') =>
    createPoster({ name: 't', ...sizeFor('A0', 'portrait'), sizePreset: 'A0', columns: 3, palette: PALETTES[0], headingFont: 'Inter', bodyFont: 'Inter', template });
  const centre = { x: 420, y: 600 };

  it('finds free space that covers no text, picture or graph', () => {
    const p = poster('blank');
    const blocker: PosterElement = { ...makeElement('text', p), x: 300, y: 500, w: 240, h: 200 };
    p.elements.push(blocker);
    const spot = findFreeSpot(p, 200, 150, centre)!;
    expect(spot).not.toBeNull();
    expect(intersects({ ...spot, w: 200, h: 150 }, blocker)).toBe(false);
    // inside the margins
    expect(spot.x).toBeGreaterThanOrEqual(p.margin);
    expect(spot.y + 150).toBeLessThanOrEqual(p.height - p.margin);
  });

  it('lets new things sit on background panels and under short text', () => {
    const p = poster('classic');
    const el = makeElement('text', p);
    // the layout's text boxes reach down most of each column, so there is no room…
    expect(findFreeSpot(p, el.w, el.h, centre)).toBeNull();
    // …until we know their words only fill the top of each box
    const spot = findFreeSpot(p, el.w, el.h, centre, (e) => (e.type === 'text' ? 30 : e.h));
    expect(spot).not.toBeNull();
  });

  it('returns null when the element cannot fit at all', () => {
    const p = poster('blank');
    expect(findFreeSpot(p, p.width, 10, centre)).toBeNull();
  });

  it('picks the nearest empty figure box, never a logo or QR code spot', () => {
    const p = poster('classic');
    const slot = emptyFigureSlot(p, centre)!;
    expect(slot.type).toBe('image');
    expect(slot.placeholder).not.toMatch(/Logo|QR/);
    const others = p.elements.filter((e) => e.type === 'image' && !e.src && e.placeholder === slot.placeholder);
    const d = (e: PosterElement) => Math.hypot(e.x + e.w / 2 - centre.x, e.y + e.h / 2 - centre.y);
    for (const o of others) expect(d(slot)).toBeLessThanOrEqual(d(o));
    expect(emptyFigureSlot(poster('blank'), centre)).toBeNull();
  });
});

describe('poster check', () => {
  it('marks example text and empty figure boxes as leftovers, not mistakes', () => {
    const p = createPoster({ name: 't', ...sizeFor('A0', 'portrait'), sizePreset: 'A0', columns: 3, palette: PALETTES[0], headingFont: 'Inter', bodyFont: 'Inter', template: 'classic' });
    const issues = checkPoster(p);
    expect(issues.some((i) => i.leftover)).toBe(true);
    for (const i of issues.filter((x) => x.leftover)) expect(i.id).toMatch(/^(ph|noimg)-/);
    expect(issues.filter((i) => i.severity === 'problem')).toHaveLength(0);
  });
});

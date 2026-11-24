import { describe, expect, it } from 'vitest';
import { PALETTES, createPoster, makeElement, sizeFor } from '../../src/model';
import { existingGaps, gapLabel, neighbours, spacingFor } from '../../src/lib/spacing';
import { columnOf, tidyAxis, tidyUp } from '../../src/lib/tidy';
import { sectionSlots } from '../../src/lib/sections';
import { insertSection } from '../../src/lib/addSection';
import { intersects } from '../../src/lib/arrange';
import { sectionHeadings } from '../../src/lib/relayout';
import type { Poster, PosterElement } from '../../src/types';
import type { TemplateId } from '../../src/templates';

const make = (template: TemplateId, columns = 3): Poster =>
  createPoster({ name: 'T', ...sizeFor('A0', 'portrait'), sizePreset: 'A0', columns, palette: PALETTES[0], headingFont: 'Montserrat', bodyFont: 'Open Sans', template });

const box = (x: number, y: number, w = 100, h = 50) => ({ x, y, w, h });
const el = (id: string, x: number, y: number, w = 100, h = 50, extra: Partial<PosterElement> = {}): PosterElement => ({ id, type: 'text', x, y, w, h, ...extra });

describe('spacing guides', () => {
  it('finds the nearest box above and below that overlaps sideways', () => {
    const a = box(0, 0);
    const b = box(0, 200);
    const far = box(500, 60);
    const { before, after } = neighbours(box(0, 100), [a, b, far], 'y');
    expect(before).toBe(a);
    expect(after).toBe(b);
  });

  it('lists the gaps between neighbouring boxes', () => {
    const gaps = existingGaps([box(0, 0), box(0, 70), box(0, 140)], 'y');
    expect(gaps.map((g) => g.gap)).toEqual([20, 20]);
  });

  it('snaps a box so its gap matches a gap used elsewhere', () => {
    // Two boxes 20 mm apart on the left; on the right one box, and the dragged one 23 mm under it.
    const others = [box(0, 0), box(0, 70), box(300, 0)];
    const s = spacingFor(box(300, 73), others, 'y', 5);
    expect(s.delta).toBeCloseTo(-3);
    const matched = s.marks.filter((m) => m.match);
    expect(matched.length).toBe(2); // its own gap and the one it matches
    expect(matched.every((m) => Math.abs(m.to - m.from - 20) < 0.01)).toBe(true);
  });

  it('snaps a box halfway between the boxes above and below it', () => {
    const others = [box(0, 0), box(0, 200)];
    const s = spacingFor(box(0, 97), others, 'y', 5);
    expect(s.delta).toBeCloseTo(3); // at 100 it's 50 mm from both
    expect(s.marks.filter((m) => m.match).length).toBe(2);
  });

  it('shows the gaps without moving when snapping is off or nothing is close', () => {
    const others = [box(0, 0), box(0, 200)];
    const off = spacingFor(box(0, 72), others, 'y', 5, false);
    expect(off.delta).toBe(0);
    expect(off.marks.map((m) => Math.round(m.to - m.from))).toEqual([22, 78]);
    const far = spacingFor(box(0, 60), others, 'y', 5);
    expect(far.delta).toBe(0);
  });

  it('ignores a panel the box sits on', () => {
    const panel = box(-10, -10, 300, 300);
    const s = spacingFor(box(0, 100), [panel, box(0, 0)], 'y', 5);
    expect(s.marks).toHaveLength(1);
    expect(s.marks[0].to - s.marks[0].from).toBeCloseTo(50);
  });

  it('labels gaps in whole mm, with one decimal under 10 mm', () => {
    expect(gapLabel(23.4)).toBe('23 mm');
    expect(gapLabel(4.26)).toBe('4.3 mm');
  });
});

describe('tidy up', () => {
  it('evens out the gaps in a column, keeping the top box where it is', () => {
    const els = [el('a', 0, 0), el('b', 0, 62), el('c', 0, 130), el('d', 0, 195)];
    const gap = tidyUp(els, 10);
    expect(gap).toBe(15); // the typical gap already there (12, 18, 15)
    expect(els.map((e) => e.y)).toEqual([0, 65, 130, 195]);
  });

  it('works across a row too', () => {
    const els = [el('a', 0, 0), el('b', 110, 0), el('c', 230, 0)];
    expect(tidyAxis(els)).toBe('x');
    tidyUp(els, 10);
    expect(els.map((e) => e.x)).toEqual([0, 110, 220]);
  });

  it("moves a section's heading and text together, so the gap under the heading stays small", () => {
    const els = [
      el('h1', 0, 0, 100, 20, { group: 's1' }),
      el('t1', 0, 22, 100, 50, { group: 's1' }),
      el('h2', 0, 100, 100, 20, { group: 's2' }),
      el('t2', 0, 122, 100, 50, { group: 's2' }),
      el('h3', 0, 182, 100, 20, { group: 's3' }),
      el('t3', 0, 204, 100, 50, { group: 's3' }),
    ];
    tidyUp(els, 10);
    const y = Object.fromEntries(els.map((e) => [e.id, e.y]));
    expect(y.t2 - (y.h2 + 20)).toBe(2);
    expect(y.h2 - 72).toBe(y.h3 - (y.t2 + 50)); // equal gaps between sections
  });

  it('leaves a locked box in place', () => {
    const els = [el('a', 0, 0), el('b', 0, 60), el('c', 0, 150, 100, 50, { locked: true })];
    tidyUp(els, 10);
    expect(els[2].y).toBe(150);
  });

  it('does nothing for a single box', () => {
    expect(tidyUp([el('a', 0, 0)], 10)).toBeNull();
  });

  it('finds the boxes in the same column, not full-width bands', () => {
    const p = make('classic');
    const h = sectionHeadings(p.elements)[0];
    const col = columnOf(p, h);
    expect(col).toContain(h);
    expect(col.every((e) => e.w < p.width / 2)).toBe(true);
    expect(col.some((e) => e.role === 'title')).toBe(false);
  });
});

describe('the "+" between sections', () => {
  it('puts a button under every section', () => {
    const p = make('classic');
    const slots = sectionSlots(p);
    const heads = sectionHeadings(p.elements);
    expect(slots.length).toBe(heads.length);
    for (const s of slots) expect(s.y).toBeGreaterThan(p.elements.find((e) => e.id === s.headingId)!.y);
  });

  it('adds a heading, text and figure slot and moves the column down', () => {
    const p = make('classic');
    // Make room at the bottom of the first column, like a poster with short sections.
    const first = sectionHeadings(p.elements)[0];
    const col = columnOf(p, first);
    for (const e of col) if (e.type === 'text' && e.role === 'body') e.h = Math.min(e.h, 60);
    const before = structuredClone(p.elements);
    const r = insertSection(p, first.id, () => 0)!;
    expect(r).not.toBeNull();
    const added = r.ids.map((id) => p.elements.find((e) => e.id === id)!);
    expect(added[0].type).toBe('heading');
    expect(added.some((e) => e.type === 'text')).toBe(true);
    // nothing the poster had now overlaps the new section's boxes, other than panels behind
    const solid = p.elements.filter((e) => !r.ids.includes(e.id) && e.type !== 'shape');
    for (const a of added.filter((e) => e.type !== 'shape')) for (const o of solid) expect(intersects(a, o), `${a.type} overlaps ${o.type} ${o.role}`).toBe(false);
    // the new heading copies the look of the one above
    expect(added[0].style).toEqual(first.style);
    // all the new boxes share one section
    expect(new Set(added.map((e) => e.group)).size).toBe(1);
    // nothing passes the bottom margin
    for (const e of p.elements) if (e.w < p.width / 2) expect(e.y + e.h).toBeLessThanOrEqual(p.height - p.margin + 0.01);
    // and nothing outside the column moved
    for (const o of before) {
      const now = p.elements.find((e) => e.id === o.id)!;
      if (!col.some((c) => c.id === o.id) && o.x > first.x + first.w) expect(now.y).toBe(o.y);
    }
  });

  it('makes room in a full column by shrinking empty figure slots', () => {
    const p = make('classic');
    const heads = sectionHeadings(p.elements);
    const first = heads[0];
    const r = insertSection(p, first.id);
    if (r) {
      for (const e of p.elements) if (e.w < p.width / 2) expect(e.y + e.h).toBeLessThanOrEqual(p.height - p.margin + 0.01);
    }
  });

  it('says no when the column has no room at all', () => {
    const p = make('blank', 1);
    p.elements = [
      makeElement('heading', p, { id: 'h', x: p.margin, y: p.margin, html: 'Methods' }),
      el('t', p.margin, p.margin + 40, 200, p.height - 2 * p.margin - 40, { style: makeElement('text', p).style }),
    ];
    expect(insertSection(p, 'h', () => 0)).toBeNull();
    expect(insertSection(p, 'h', () => 500)).not.toBeNull(); // unless the text box has empty space to give
  });
});

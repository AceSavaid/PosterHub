import { describe, expect, it } from 'vitest';
import { align, boundsOf, distribute, intersects, matchSize } from '../../src/lib/arrange';
import type { PosterElement } from '../../src/types';

const box = (id: string, x: number, y: number, w: number, h: number, locked = false): PosterElement => ({ id, type: 'shape', x, y, w, h, locked });
const page = { x: 10, y: 10, w: 180, h: 280 };

describe('align', () => {
  it('lines several elements up with each other', () => {
    const els = [box('a', 20, 0, 10, 10), box('b', 50, 30, 30, 20), box('c', 35, 60, 20, 5)];
    align(els, 'left', page);
    expect(els.map((e) => e.x)).toEqual([20, 20, 20]);
    align(els, 'right', page);
    expect(els.map((e) => e.x + e.w)).toEqual([50, 50, 50]);
    align(els, 'bottom', page);
    expect(els.map((e) => e.y + e.h)).toEqual([65, 65, 65]);
  });

  it('centres a single element on the page area', () => {
    const els = [box('a', 0, 0, 80, 40)];
    align(els, 'hcenter', page);
    align(els, 'vcenter', page);
    expect(els[0].x).toBe(10 + (180 - 80) / 2);
    expect(els[0].y).toBe(10 + (280 - 40) / 2);
  });

  it('leaves locked elements where they are', () => {
    const els = [box('a', 0, 0, 10, 10), box('b', 40, 0, 10, 10, true)];
    align(els, 'right', page);
    expect(els[0].x).toBe(40);
    expect(els[1].x).toBe(40);
    align(els, 'left', page);
    expect(els[1].x).toBe(40);
  });
});

describe('distribute', () => {
  it('makes the gaps equal and keeps the ends fixed', () => {
    const els = [box('a', 0, 0, 10, 10), box('b', 15, 0, 20, 10), box('c', 90, 0, 10, 10)];
    distribute(els, 'x');
    const [a, b, c] = els;
    expect(a.x).toBe(0);
    expect(c.x).toBe(90);
    expect(b.x - (a.x + a.w)).toBeCloseTo(c.x - (b.x + b.w));
  });

  it('works vertically regardless of selection order', () => {
    const els = [box('c', 0, 100, 10, 10), box('a', 0, 0, 10, 10), box('b', 0, 20, 10, 30)];
    distribute(els, 'y');
    expect(els.find((e) => e.id === 'b')!.y).toBeCloseTo(40);
  });

  it('needs at least three elements', () => {
    const els = [box('a', 0, 0, 10, 10), box('b', 50, 0, 10, 10)];
    distribute(els, 'x');
    expect(els[1].x).toBe(50);
  });
});

describe('helpers', () => {
  it('matches size to the first selected', () => {
    const els = [box('a', 0, 0, 30, 12), box('b', 0, 0, 10, 10)];
    matchSize(els, 'w');
    expect(els[1].w).toBe(30);
    expect(els[1].h).toBe(10);
  });
  it('computes bounds and intersections', () => {
    expect(boundsOf([box('a', 5, 5, 10, 10), box('b', 20, 0, 5, 30)])).toEqual({ x: 5, y: 0, w: 20, h: 30 });
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 })).toBe(false);
  });
});

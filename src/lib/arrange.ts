// Pure helpers for arranging several elements. They mutate the given
// elements, so call them inside an `update` draft.
import type { PosterElement } from '../types';

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function boundsOf(els: Bounds[]): Bounds {
  const x = Math.min(...els.map((e) => e.x));
  const y = Math.min(...els.map((e) => e.y));
  const r = Math.max(...els.map((e) => e.x + e.w));
  const b = Math.max(...els.map((e) => e.y + e.h));
  return { x, y, w: r - x, h: b - y };
}

/**
 * Aligns elements to each other, or to `page` when only one is given
 * (so a single box can be centred on the poster).
 */
export function align(els: PosterElement[], mode: AlignMode, page: Bounds) {
  const movable = els.filter((e) => !e.locked);
  if (!movable.length) return;
  const ref = els.length === 1 ? page : boundsOf(els);
  for (const e of movable) {
    if (mode === 'left') e.x = ref.x;
    if (mode === 'hcenter') e.x = ref.x + (ref.w - e.w) / 2;
    if (mode === 'right') e.x = ref.x + ref.w - e.w;
    if (mode === 'top') e.y = ref.y;
    if (mode === 'vcenter') e.y = ref.y + (ref.h - e.h) / 2;
    if (mode === 'bottom') e.y = ref.y + ref.h - e.h;
  }
}

/** Spaces elements so the gaps between them are equal; the outermost two stay put. */
export function distribute(els: PosterElement[], axis: 'x' | 'y') {
  if (els.length < 3) return;
  const size = axis === 'x' ? 'w' : 'h';
  const sorted = [...els].sort((a, b) => a[axis] - b[axis]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = last[axis] + last[size] - first[axis];
  const total = sorted.reduce((s, e) => s + e[size], 0);
  const gap = (span - total) / (sorted.length - 1);
  let pos = first[axis];
  for (const e of sorted) {
    if (!e.locked) e[axis] = pos;
    pos += e[size] + gap;
  }
}

/** Makes every element the same width or height as the first selected one. */
export function matchSize(els: PosterElement[], dim: 'w' | 'h') {
  if (els.length < 2) return;
  const v = els[0][dim];
  for (const e of els.slice(1)) if (!e.locked) e[dim] = v;
}

export function intersects(a: Bounds, b: Bounds) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

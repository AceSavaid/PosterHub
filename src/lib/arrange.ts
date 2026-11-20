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

interface Page {
  width: number;
  height: number;
  margin: number;
  elements: PosterElement[];
}

const isFigureSlot = (e: PosterElement) => e.type === 'image' && !e.src && !e.qr && e.placeholder !== 'Logo' && e.placeholder !== 'QR code';

const centreDistance = (b: Bounds, p: { x: number; y: number }) => Math.hypot(b.x + b.w / 2 - p.x, b.y + b.h / 2 - p.y);

/** The empty figure box (from a layout) closest to `near`, for a new graph or picture to drop into. */
export function emptyFigureSlot(page: Page, near: { x: number; y: number }): PosterElement | null {
  const slots = page.elements.filter(isFigureSlot);
  if (!slots.length) return null;
  return slots.reduce((best, e) => (centreDistance(e, near) < centreDistance(best, near) ? e : best));
}

/**
 * Where to put a new w × h element so it covers nothing else: the free spot
 * inside the margins closest to `near` (usually the middle of the screen).
 * Background panels and other shapes may sit underneath; text, pictures and
 * graphs may not. `usedHeight` can report how much of a text box its words
 * fill, so the empty space under short text counts as free. Returns null when
 * there is no room.
 */
export function findFreeSpot(
  page: Page,
  w: number,
  h: number,
  near: { x: number; y: number },
  usedHeight: (e: PosterElement) => number = (e) => e.h,
  gap = 4,
): { x: number; y: number } | null {
  const m = page.margin;
  if (w > page.width - 2 * m || h > page.height - 2 * m) return null;
  const blockers = page.elements
    .filter((e) => e.type !== 'shape')
    .map((e) => ({ x: e.x - gap, y: e.y - gap, w: e.w + 2 * gap, h: Math.min(e.h, usedHeight(e)) + 2 * gap }));
  // Candidate edges: the margins, plus just right of / below every blocker.
  const xs = new Set([m, page.width - m - w, ...blockers.map((b) => b.x + b.w), ...blockers.map((b) => b.x - w)]);
  const ys = new Set([m, page.height - m - h, ...blockers.map((b) => b.y + b.h), ...blockers.map((b) => b.y - h)]);
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const x of xs) {
    if (x < m - 0.01 || x + w > page.width - m + 0.01) continue;
    for (const y of ys) {
      if (y < m - 0.01 || y + h > page.height - m + 0.01) continue;
      const box = { x, y, w, h };
      if (blockers.some((b) => intersects(box, b))) continue;
      const d = centreDistance(box, near);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  }
  return best;
}

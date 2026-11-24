// Spacing guides while dragging, like Canva's pink gap lines: the gap (in mm) between the
// box being dragged and its nearest neighbours, and a snap that makes that gap match the
// gaps already used between other boxes (or puts the box exactly halfway between two).
import type { Bounds } from './arrange';

export interface GapMark {
  /** 'x' is a horizontal gap (a box to the left or right), 'y' a vertical one (above or below). */
  axis: 'x' | 'y';
  /** where the gap starts and ends along `axis`, mm */
  from: number;
  to: number;
  /** where the mark is drawn across the gap, mm */
  at: number;
  /** the gap matches another gap (drawn bolder) */
  match?: boolean;
}

export interface SpacingSnap {
  /** move the box by this much along the axis to make the gaps equal */
  delta: number;
  marks: GapMark[];
}

const EPS = 0.25; // mm: gaps this close count as equal

type Side = { lo: number; hi: number }; // a range along one axis

const range = (b: Bounds, axis: 'x' | 'y'): Side => (axis === 'x' ? { lo: b.x, hi: b.x + b.w } : { lo: b.y, hi: b.y + b.h });
const cross = (axis: 'x' | 'y') => (axis === 'x' ? 'y' : 'x');
const overlap = (a: Side, b: Side) => Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo);

/** The middle of where two boxes overlap across the gap, so the mark sits between them. */
function markAt(a: Bounds, b: Bounds, axis: 'x' | 'y') {
  const ca = range(a, cross(axis));
  const cb = range(b, cross(axis));
  return (Math.max(ca.lo, cb.lo) + Math.min(ca.hi, cb.hi)) / 2;
}

/** The closest box before and after `box` along `axis` that it would bump into. */
export function neighbours(box: Bounds, others: Bounds[], axis: 'x' | 'y') {
  const c = range(box, cross(axis));
  const r = range(box, axis);
  let before: Bounds | null = null;
  let after: Bounds | null = null;
  for (const o of others) {
    if (overlap(range(o, cross(axis)), c) <= 0) continue;
    const ro = range(o, axis);
    if (ro.hi <= r.lo + EPS && (!before || ro.hi > range(before, axis).hi)) before = o;
    if (ro.lo >= r.hi - EPS && (!after || ro.lo < range(after, axis).lo)) after = o;
  }
  return { before, after };
}

/** Gaps between neighbouring boxes already on the poster, each with the pair that makes it. */
export function existingGaps(boxes: Bounds[], axis: 'x' | 'y') {
  const out: { gap: number; a: Bounds; b: Bounds }[] = [];
  for (const a of boxes) {
    const { after } = neighbours(a, boxes.filter((b) => b !== a), axis);
    if (!after) continue;
    const gap = range(after, axis).lo - range(a, axis).hi;
    if (gap > EPS) out.push({ gap, a, b: after });
  }
  return out;
}

/**
 * Gap marks and the best equal-spacing snap for `box` along one axis.
 * `others` are the boxes it can line up with (not the ones being dragged, not panels behind it).
 */
export function spacingFor(box: Bounds, others: Bounds[], axis: 'x' | 'y', threshold: number, doSnap = true): SpacingSnap {
  // Only boxes it doesn't sit on top of count (a section's panel behind it is not a neighbour).
  const free = others.filter((o) => overlap(range(o, 'x'), range(box, 'x')) <= EPS || overlap(range(o, 'y'), range(box, 'y')) <= EPS);
  const { before, after } = neighbours(box, free, axis);
  const r = range(box, axis);
  const size = r.hi - r.lo;
  const gaps = existingGaps(free, axis);

  // Candidate positions (start of the box along the axis) that make a gap equal to another one.
  const cands: { lo: number; kind: 'before' | 'after' | 'between'; gap: number }[] = [];
  if (before && after) {
    const lo = (range(before, axis).hi + range(after, axis).lo - size) / 2;
    if (lo > range(before, axis).hi) cands.push({ lo, kind: 'between', gap: lo - range(before, axis).hi });
  }
  for (const g of gaps) {
    if (before) cands.push({ lo: range(before, axis).hi + g.gap, kind: 'before', gap: g.gap });
    if (after) cands.push({ lo: range(after, axis).lo - g.gap - size, kind: 'after', gap: g.gap });
  }
  let best: (typeof cands)[number] | null = null;
  if (doSnap)
    for (const c of cands) {
      const d = Math.abs(c.lo - r.lo);
      if (d <= threshold && (!best || d < Math.abs(best.lo - r.lo))) best = c;
    }

  const delta = best ? best.lo - r.lo : 0;
  const moved: Bounds = axis === 'x' ? { ...box, x: box.x + delta } : { ...box, y: box.y + delta };
  const m = range(moved, axis);
  const marks: GapMark[] = [];
  const gapBefore = before ? m.lo - range(before, axis).hi : null;
  const gapAfter = after ? range(after, axis).lo - m.hi : null;
  const same = (g: number | null, h: number) => g != null && Math.abs(g - h) < EPS;
  const target = best?.gap;
  if (before && gapBefore! > EPS)
    marks.push({ axis, from: range(before, axis).hi, to: m.lo, at: markAt(before, moved, axis), match: target != null && same(gapBefore, target) });
  if (after && gapAfter! > EPS)
    marks.push({ axis, from: m.hi, to: range(after, axis).lo, at: markAt(moved, after, axis), match: target != null && same(gapAfter, target) });
  // Show the gaps it now matches elsewhere, so it's clear what it lined up with.
  if (target != null)
    for (const g of gaps)
      if (same(g.gap, target) && g.a !== before && g.b !== after)
        marks.push({ axis, from: range(g.a, axis).hi, to: range(g.b, axis).lo, at: markAt(g.a, g.b, axis), match: true });
  return { delta, marks };
}

/** How a gap reads on screen: whole mm, or one decimal under 10 mm. */
export function gapLabel(mm: number) {
  const v = mm < 10 ? Math.round(mm * 10) / 10 : Math.round(mm);
  return `${v} mm`;
}

// "Tidy up": evens out the gaps between boxes in one click, like Canva and Figma.
// A section's heading, text and figure move as one block, so the small gap under a heading
// stays small; only the gaps between blocks become equal. The first block stays where it is.
import type { Poster, PosterElement } from '../types';
import { boundsOf, type Bounds } from './arrange';

const EPS = 1; // mm

interface Block {
  els: PosterElement[];
  box: Bounds;
}

/** Elements of one section (or one group) form one block; everything else is its own block. */
function blocks(els: PosterElement[]): Block[] {
  const byKey = new Map<string, PosterElement[]>();
  const out: PosterElement[][] = [];
  for (const e of els) {
    const k = e.groupId ? 'g:' + e.groupId : e.group ? 's:' + e.group : null;
    if (!k) out.push([e]);
    else if (byKey.has(k)) byKey.get(k)!.push(e);
    else {
      const list = [e];
      byKey.set(k, list);
      out.push(list);
    }
  }
  return out.map((b) => ({ els: b, box: boundsOf(b) }));
}

/** 'y' when the boxes stack downwards (a column), 'x' when they sit side by side (a row). */
export function tidyAxis(boxes: Bounds[]): 'x' | 'y' {
  const b = boundsOf(boxes);
  const sumW = boxes.reduce((t, e) => t + e.w, 0);
  const sumH = boxes.reduce((t, e) => t + e.h, 0);
  // How much they'd overlap if squashed onto one axis: a column's widths overlap, its heights don't.
  return sumH - b.h <= sumW - b.w ? 'y' : 'x';
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : 0;
};

/**
 * Makes the gaps between the blocks equal (mutates; call inside an `update` draft).
 * The gap used is the most typical one already there, so nothing jumps far. Returns the gap
 * in mm, or null when there was nothing to tidy.
 */
export function tidyUp(els: PosterElement[], fallbackGap: number, axis?: 'x' | 'y'): number | null {
  const bs = blocks(els);
  if (bs.length < 2) return null;
  const ax = axis ?? tidyAxis(bs.map((b) => b.box));
  const size = ax === 'x' ? 'w' : 'h';
  bs.sort((a, b) => a.box[ax] - b.box[ax]);
  const gaps = bs.slice(1).map((b, i) => b.box[ax] - (bs[i].box[ax] + bs[i].box[size]));
  const positive = gaps.filter((g) => g > 0.5);
  const gap = positive.length ? median(positive) : fallbackGap;
  let pos = bs[0].box[ax] + bs[0].box[size] + gap;
  for (const b of bs.slice(1)) {
    const d = pos - b.box[ax];
    if (!b.els.some((e) => e.locked)) for (const e of b.els) e[ax] += d;
    else pos = b.box[ax]; // a locked block stays put; keep going from it
    pos += b.box[size] + gap;
  }
  return gap;
}

/** The boxes in the same column as `el`, for "Tidy up this column" (no full-width bands or panels behind). */
export function columnOf(p: Poster, el: PosterElement): PosterElement[] {
  const share = (a: Bounds, b: Bounds) => {
    const o = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    return o <= 0 ? 0 : o / Math.min(a.w, b.w);
  };
  // The column's extent: the element's own group or section when it has one.
  const mates = p.elements.filter((e) => e === el || (el.groupId && e.groupId === el.groupId) || (el.group && e.group === el.group));
  const col = boundsOf(mates);
  const contains = (a: Bounds, b: Bounds) => a.x <= b.x + EPS && a.x + a.w >= b.x + b.w - EPS && a.y <= b.y + EPS && a.y + a.h >= b.y + b.h - EPS;
  const inCol = p.elements.filter((e) => share(col, e) >= 0.5 && e.w <= col.w * 1.3 + EPS && !e.rotation);
  // Panels behind other boxes (and the poster's background) are left alone unless they're part of a section.
  return inCol.filter((e) => !(e.type === 'shape' && !e.group && !e.groupId && inCol.some((o) => o !== e && contains(e, o))));
}

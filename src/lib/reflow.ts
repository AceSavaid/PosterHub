// Keeps a column tidy when a text box changes height: the boxes below it in the same
// column move down (or back up), so a long paragraph never runs into the next section.
import type { Poster, PosterElement } from '../types';

/** How much of `a`'s width overlaps `b`, as a share of the narrower of the two. */
function overlapShare(a: PosterElement, b: PosterElement) {
  const o = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  return o <= 0 ? 0 : o / Math.min(a.w, b.w);
}

const EPS = 1; // mm

/** Only body text boxes give up their empty space; headings and captions keep their size. */
const givesSpace = (e: PosterElement) => e.type === 'text' && !e.refList && e.role !== 'caption' && e.role !== 'qrCaption';

export interface ReflowResult {
  /** the height the box got (mm) */
  h: number;
  /** mm of text that still didn't fit because the column is full */
  short: number;
}

/**
 * Sets text box `id` to `wantH` mm tall and moves the column below it to match.
 *
 * - Boxes below it in the same column move down by the growth (back up when it shrinks).
 * - Text boxes below give up their own empty space first, so the move stops where there is room.
 * - Panels the box sits on (a section's card) grow with it.
 * - Nothing passes the bottom margin or a full-width band below the column (such as the
 *   references footer): the box then grows only as far as fits, and `short` says by how much.
 * - A box only shrinks back by what this has grown it (`grew`), so template slots keep their size.
 *
 * `spare(id)` gives the empty mm at the bottom of a text box (0 when unknown).
 */
export function reflowColumn(p: Poster, id: string, wantH: number, spare: (id: string) => number = () => 0): ReflowResult {
  const el = p.elements.find((e) => e.id === id);
  if (!el) return { h: wantH, short: 0 };
  const grew = el.grew ?? 0;
  let delta = wantH - el.h;
  if (delta < 0) delta = -Math.min(grew, -delta); // only give back what we added
  if (Math.abs(delta) < 0.05) return { h: el.h, short: 0 };

  const oldBottom = el.y + el.h;
  const others = p.elements.filter((e) => e.id !== id);
  // full-width bands below (footer, references strip) and the bottom margin are the floor
  let floor = p.height - p.margin;
  const below: PosterElement[] = [];
  const panels: PosterElement[] = [];
  for (const e of others) {
    const share = overlapShare(el, e);
    if (!share) continue;
    const contains = e.x <= el.x + EPS && e.x + e.w >= el.x + el.w - EPS && e.y <= el.y + EPS && e.y + e.h >= oldBottom - EPS;
    if (contains && e.type === 'shape' && e.w <= el.w * 1.5 + EPS && !e.locked) {
      panels.push(e);
      continue;
    }
    if (e.y < oldBottom - EPS) continue;
    if (e.w > el.w * 1.5 + EPS || e.locked) {
      floor = Math.min(floor, e.y);
      continue;
    }
    if (share >= 0.5) below.push(e);
  }
  below.sort((a, b) => a.y - b.y);
  const lowest = (d: number) => {
    let shift = d;
    let bottom = oldBottom + d;
    for (const e of below) {
      const y = e.y + shift;
      let h = e.h;
      if (shift > 0 && givesSpace(e)) {
        const take = Math.min(Math.max(0, spare(e.id)), shift);
        h -= take;
        shift -= take;
      }
      bottom = Math.max(bottom, y + h);
    }
    return bottom;
  };

  let short = 0;
  if (delta > 0) {
    const over = lowest(delta) - floor;
    if (over > 0.05) {
      // grow only as much as fits (never less than the box already is)
      const room = Math.max(0, delta - over);
      short = delta - room;
      delta = room;
      if (delta < 0.05) return { h: el.h, short };
    }
  }

  let shift = delta;
  const byId = new Map(p.elements.map((e) => [e.id, e]));
  for (const e of below) {
    const t = byId.get(e.id)!;
    t.y += shift;
    if (shift > 0 && givesSpace(t)) {
      const take = Math.min(Math.max(0, spare(t.id)), shift);
      t.h -= take;
      shift -= take;
    }
  }
  for (const panel of panels) byId.get(panel.id)!.h += delta;
  el.h += delta;
  el.grew = Math.max(0, grew + delta) || undefined;
  return { h: el.h, short };
}

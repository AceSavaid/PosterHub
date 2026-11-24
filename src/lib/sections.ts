// The "+" between sections: the poster's sections and where the buttons go.
// Adding the section itself is in addSection.ts, loaded when a "+" is clicked.
import type { Poster, PosterElement } from '../types';
import { headingOwner, sectionHeadings } from './sectionOwner';

export const EPS = 1; // mm

export interface SectionSlot {
  /** the heading of the section the "+" sits under */
  headingId: string;
  /** the column the section spans */
  x: number;
  w: number;
  /** where the button's centre goes, mm */
  y: number;
  /** the boxes of this section and the next one: the button shows while one of them is under the mouse or selected */
  near: string[];
}

export interface Section {
  heading: PosterElement;
  members: PosterElement[];
  x: number;
  w: number;
  top: number;
  bottom: number;
}

export const overlapShare = (a: { x: number; w: number }, b: { x: number; w: number }) => {
  const o = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  return o <= 0 ? 0 : o / Math.min(a.w, b.w);
};

export const isFigureSlot = (e: PosterElement) => e.type === 'image' && !e.src && !e.qr && e.placeholder !== 'Logo' && e.placeholder !== 'QR code';
export const givesSpace = (e: PosterElement) => e.type === 'text' && !e.refList && e.role !== 'caption' && e.role !== 'qrCaption';

/** The poster's sections: each heading with what belongs to it (by section, else by position). */
export function sections(p: Poster): Section[] {
  const heads = sectionHeadings(p.elements);
  const owner = headingOwner(heads);
  return heads.map((h) => {
    const members = [h, ...p.elements.filter((e) => e !== h && owner(e) === h && e.w <= h.w * 1.5 + EPS && e.y >= h.y - EPS * 20)];
    const x = Math.min(...members.map((e) => e.x));
    const right = Math.max(...members.map((e) => e.x + e.w));
    return { heading: h, members, x, w: right - x, top: Math.min(...members.map((e) => e.y)), bottom: Math.max(...members.map((e) => e.y + e.h)) };
  });
}

/** The section that comes next below `s` in the same column, if any. */
export function nextIn(all: Section[], s: Section) {
  let next: Section | undefined;
  for (const o of all) if (o !== s && o.top >= s.bottom - EPS && overlapShare(o, s) >= 0.5 && (!next || o.top < next.top)) next = o;
  return next;
}

/** The usual gap between one section and the next on this poster. */
export function sectionGap(p: Poster, all: Section[]) {
  const gaps = all.map((s) => nextIn(all, s)).flatMap((n, i) => (n ? [n.top - all[i].bottom] : [])).filter((g) => g > 0.5).sort((a, b) => a - b);
  return gaps.length ? gaps[Math.floor(gaps.length / 2)] : p.gutter * 0.75;
}

/** Where the "+" buttons go: one under each section, in the gap before the next one. */
export function sectionSlots(p: Poster): SectionSlot[] {
  const all = sections(p);
  const gap = sectionGap(p, all);
  return all
    .filter((s) => !s.heading.locked)
    .map((s) => {
      const next = nextIn(all, s);
      const y = next ? (s.bottom + next.top) / 2 : Math.min(s.bottom + gap / 2, p.height - p.margin / 2);
      const near = [...s.members, ...(next?.members ?? [])].map((e) => e.id);
      return { headingId: s.heading.id, x: s.x, w: s.w, y, near };
    });
}


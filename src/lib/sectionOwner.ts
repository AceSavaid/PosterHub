// Which section each element belongs to. Small and free of the layout builder, so the
// editor can use it (for the "+" between sections) without loading layout switching.
import type { PosterElement } from '../types';

const strip = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const overlapX = (a: PosterElement, b: PosterElement) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);

/** Section headings on a poster (not the numbers in numbered layouts). */
export function sectionHeadings(elements: PosterElement[]): PosterElement[] {
  return elements.filter((e) => e.type === 'heading' && (e.role ?? 'heading') === 'heading' && !/^\s*\d+\s*$/.test(strip(e.html ?? '')));
}

/** Finds the section heading an element belongs to: its group, else the closest heading above it in the same column. */
export function headingOwner(headings: PosterElement[]): (e: PosterElement) => PosterElement | undefined {
  const groupHeading = new Map<string, PosterElement>();
  for (const h of headings) if (h.group) groupHeading.set(h.group, h);
  return (e) => {
    if (e.group && groupHeading.has(e.group)) return groupHeading.get(e.group);
    if (e.group) return undefined;
    let best: PosterElement | undefined;
    for (const h of headings) {
      if (h.y > e.y + 0.5 || overlapX(h, e) < Math.min(h.w, e.w) * 0.5) continue;
      if (!best || h.y > best.y) best = h;
    }
    return best;
  };
}


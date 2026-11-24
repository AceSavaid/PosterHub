// "8 of 11 boxes filled": how much of a layout's example text and empty figure boxes
// the person has replaced, and which box to fill next.
import type { Poster, PosterElement } from '../types';
import { PLACEHOLDER_TEXT } from './checks';
import { htmlToText } from './textTools';

/** Still shows the layout's example text, or is an empty picture box. */
export function isLeftover(el: PosterElement) {
  if (el.style) return PLACEHOLDER_TEXT.some((t) => htmlToText(el.html ?? '').includes(t));
  return el.type === 'image' && !el.src && !!el.placeholder;
}

/** Layout boxes that start with example text or no picture (headings start out already right). */
const CONTENT_ROLES = new Set(['title', 'subtitle', 'body', 'figure', 'caption', 'logo', 'qr', 'references', 'summary', 'keyFinding']);

const issueId = (el: PosterElement) => (el.style ? 'ph-' : 'noimg-') + el.id;

/** Sort key for reading order: down each column, columns left to right; full-width boxes first or last. */
function readingKey(p: Poster) {
  const colW = Math.max(1, (p.width - 2 * p.margin) / Math.max(1, p.columns));
  const col = (e: PosterElement) => Math.floor((e.x + Math.min(e.w, colW) / 2 - p.margin) / colW);
  const band = (e: PosterElement) => (e.w > colW * 1.6 ? (e.y < p.height / 2 ? -1 : 99) : col(e));
  return (a: PosterElement, b: PosterElement) => band(a) - band(b) || a.y - b.y || a.x - b.x;
}

/** Boxes to fill, in reading order: down each column, columns left to right. */
export function fillProgress(p: Poster) {
  const off = new Set(p.dismissedIssues ?? []);
  // a box counts while it is a leftover, or once it was a layout box that has been filled
  const fillable = p.elements.filter((e) => !off.has(issueId(e)) && (isLeftover(e) || (!!e.role && CONTENT_ROLES.has(e.role))));
  const left = fillable.filter(isLeftover).sort(readingKey(p));
  return { total: fillable.length, filled: fillable.length - left.length, left };
}

/** The next box to fill after `currentId` in reading order (wrapping round), or the first one. */
export function nextToFill(p: Poster, currentId: string | null): PosterElement | null {
  const { left } = fillProgress(p);
  const cur = currentId ? p.elements.find((e) => e.id === currentId) : undefined;
  if (!left.length) return null;
  if (!cur) return left[0];
  const key = readingKey(p);
  return left.find((e) => e.id !== cur.id && key(e, cur) > 0) ?? left.find((e) => e.id !== cur.id) ?? left[0];
}

// The first step of a new poster: the title and authors typed in the New poster dialog
// go straight onto the poster, and the poster's name follows its title.
import type { Poster } from '../types';
import { esc } from './refs/format';
import { htmlToText } from './textTools';

export const UNTITLED = 'Untitled poster';

const isTitle = (e: Poster['elements'][number]) => e.role === 'title' || (!e.role && e.type === 'title');
const isAuthorLine = (e: Poster['elements'][number]) =>
  (e.role === 'subtitle' || e.type === 'subtitle') && !e.authors && /Author One/.test(e.html ?? '');

/** Puts the typed title and authors into the layout's title and author line (first of each). */
export function applyStartText(p: Poster, o: { title?: string; authors?: string }) {
  const title = o.title?.trim();
  const authors = o.authors?.trim();
  const t = title ? p.elements.find(isTitle) : undefined;
  if (t && title) t.html = esc(title);
  const a = authors ? p.elements.find(isAuthorLine) : undefined;
  if (a && authors) a.html = esc(authors);
  return p;
}

/** The poster's title as plain text ('' when it has none). */
export function titleText(p: Poster) {
  const t = p.elements.find(isTitle);
  return t ? htmlToText(t.html ?? '').replace(/\s+/g, ' ').trim() : '';
}

/**
 * The name a poster should get after its title changed from `before` to `after`:
 * it follows the title while it is still unnamed or was named after the old title.
 * Returns null to keep the current name.
 */
export function nameAfterTitleEdit(name: string, before: string, after: string): string | null {
  const next = after.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!next || /^Your Poster Title Goes Here$/i.test(next) || next === name) return null;
  return name === UNTITLED || !name.trim() || name === before ? next : null;
}

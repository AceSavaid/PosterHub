// Author and affiliation blocks: turns a structured list into the familiar
// "Ana Silva¹², Ben Okafor²*" line with numbered affiliations below.
import type { Author, AuthorList } from '../types';

export const emptyAuthorList = (): AuthorList => ({
  authors: [{ name: '', affiliations: [0], presenter: true, corresponding: true }],
  affiliations: [''],
  email: '',
  showOrcid: false,
});

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Accepts a bare ORCID iD or an orcid.org link; returns "0000-0000-0000-0000" or null. */
export function normalizeOrcid(raw: string | undefined): string | null {
  const m = (raw ?? '').trim().match(/(\d{4})-?(\d{4})-?(\d{4})-?(\d{3}[\dX])$/i);
  return m ? `${m[1]}-${m[2]}-${m[3]}-${m[4].toUpperCase()}` : null;
}

/** True when the ORCID iD's check digit is right (ISO 7064 11,2). */
export function validOrcid(id: string): boolean {
  const digits = id.replace(/-/g, '');
  if (!/^\d{15}[\dX]$/.test(digits)) return false;
  let total = 0;
  for (const c of digits.slice(0, 15)) total = (total + Number(c)) * 2;
  const r = (12 - (total % 11)) % 11;
  return digits[15] === (r === 10 ? 'X' : String(r));
}

const filled = (list: AuthorList) => list.authors.filter((a) => a.name.trim());

/**
 * Numbers affiliations in the order authors first use them, skipping blank or
 * unused ones. Returns the printed order (indexes into list.affiliations) and
 * a lookup from index to printed number.
 */
export function numberAffiliations(list: AuthorList) {
  const order: number[] = [];
  for (const a of filled(list))
    for (const i of a.affiliations) if (list.affiliations[i]?.trim() && !order.includes(i)) order.push(i);
  const number = new Map(order.map((i, n) => [i, n + 1]));
  return { order, number };
}

function marks(a: Author, number: Map<number, number>, many: boolean) {
  const nums = a.affiliations.map((i) => number.get(i)).filter((n): n is number => n != null).sort((x, y) => x - y);
  const parts = many ? nums.map(String) : [];
  if (a.corresponding) parts.push('*');
  return parts.length ? `<sup>${parts.join(',')}</sup>` : '';
}

/** The HTML for the text box. Plain tags only (sup, u, i, br) so it exports cleanly. */
export function authorsHtml(list: AuthorList): string {
  const authors = filled(list);
  if (!authors.length) return '';
  const { order, number } = numberAffiliations(list);
  // With a single affiliation the numbers add nothing, so they're left out.
  const many = order.length > 1;
  const names = authors.map((a) => {
    const name = esc(a.name.trim());
    return (a.presenter ? `<u>${name}</u>` : name) + marks(a, number, many);
  });
  const lines = [names.join(', ')];
  if (order.length) lines.push('<i>' + order.map((i) => (many ? `<sup>${number.get(i)}</sup>` : '') + esc(list.affiliations[i].trim())).join('; ') + '</i>');
  const contact: string[] = [];
  const email = list.email?.trim();
  if (email && authors.some((a) => a.corresponding)) contact.push(`*Contact: ${esc(email)}`);
  else if (email) contact.push(`Contact: ${esc(email)}`);
  if (list.showOrcid) {
    const ids = authors.map((a) => ({ a, id: normalizeOrcid(a.orcid) })).filter((x) => x.id);
    if (ids.length) contact.push('ORCID: ' + ids.map(({ a, id }) => `${esc(a.name.trim())} ${id}`).join(', '));
  }
  if (contact.length) lines.push(contact.join(' · '));
  return lines.join('<br>');
}

/** Short problems to show in the dialog before inserting. */
export function authorListProblems(list: AuthorList): string[] {
  const out: string[] = [];
  const authors = filled(list);
  if (!authors.length) out.push('Add at least one author name.');
  for (const a of authors) {
    if (!a.affiliations.some((i) => list.affiliations[i]?.trim()) && list.affiliations.some((x) => x.trim())) out.push(`${a.name.trim()} has no affiliation ticked.`);
    if (a.orcid?.trim()) {
      const id = normalizeOrcid(a.orcid);
      if (!id || !validOrcid(id)) out.push(`${a.name.trim()}'s ORCID iD doesn't look right (it should be like 0000-0002-1825-0097).`);
    }
  }
  const email = list.email?.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) out.push('The contact email doesn\'t look like an email address.');
  return out;
}

/** Keeps affiliation ticks pointing at the right rows after one is removed. */
export function removeAffiliation(list: AuthorList, index: number): AuthorList {
  return {
    ...list,
    affiliations: list.affiliations.filter((_, i) => i !== index),
    authors: list.authors.map((a) => ({ ...a, affiliations: a.affiliations.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)) })),
  };
}

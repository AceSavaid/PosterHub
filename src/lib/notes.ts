// Review notes: sticky notes from supervisors and co-authors that are saved in
// the poster file but never printed. Pure helpers so they can be unit tested.
//
// Notes arrive in files people email to each other, so everything read from a
// file is treated as untrusted: it is validated here and the UI only ever
// renders note text as plain text (React text nodes / textarea values).
import type { Poster, PosterElement, ReviewNote } from '../types';
import { uid } from '../model';

export const MAX_NOTE_LENGTH = 2000;
export const MAX_AUTHOR_LENGTH = 60;
export const MAX_NOTES = 500;
export const REVIEWER_KEY = 'posterhub.reviewer';

// Control characters other than tab and newline, plus bidi overrides that can
// make text display differently from what it says.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f‪-‮⁦-⁩]/g;

/** Plain text with a length limit; anything that is not a string becomes ''. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\r\n?/g, '\n').replace(UNSAFE_CHARS, '').slice(0, max);
}

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/**
 * Keeps only well-formed notes from an opened file: unknown fields are
 * dropped, text is cleaned and capped, positions are kept on the poster.
 */
export function sanitizeNotes(raw: unknown, size?: { width: number; height: number }): ReviewNote[] {
  if (!Array.isArray(raw)) return [];
  const out: ReviewNote[] = [];
  const seen = new Set<string>();
  for (const r of raw.slice(0, MAX_NOTES)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    let id = typeof o.id === 'string' && /^[\w-]{1,64}$/.test(o.id) ? o.id : uid();
    if (seen.has(id)) id = uid();
    seen.add(id);
    let x = num(o.x, 0);
    let y = num(o.y, 0);
    if (size) {
      x = Math.min(Math.max(0, x), size.width);
      y = Math.min(Math.max(0, y), size.height);
    }
    const note: ReviewNote = {
      id,
      x,
      y,
      text: cleanText(o.text, MAX_NOTE_LENGTH),
      author: cleanText(o.author, MAX_AUTHOR_LENGTH).replace(/\n/g, ' ').trim(),
      createdAt: num(o.createdAt, Date.now()),
      resolved: o.resolved === true,
    };
    if (typeof o.elementId === 'string' && /^[\w-]{1,64}$/.test(o.elementId)) note.elementId = o.elementId;
    out.push(note);
  }
  return out;
}

export function createNote(at: { x: number; y: number }, author: string, elementId?: string): ReviewNote {
  const n: ReviewNote = { id: uid(), x: at.x, y: at.y, text: '', author: cleanText(author, MAX_AUTHOR_LENGTH).trim(), createdAt: Date.now(), resolved: false };
  if (elementId) n.elementId = elementId;
  return n;
}

/** Where a new note on an element goes: just inside its top-right corner. */
export function notePositionFor(el: Pick<PosterElement, 'x' | 'y' | 'w'>, p: Pick<Poster, 'width' | 'height'>) {
  return { x: Math.min(p.width, Math.max(0, el.x + el.w - 4)), y: Math.min(p.height, Math.max(0, el.y + 4)) };
}

export const notesOf = (p: Pick<Poster, 'notes'>) => p.notes ?? [];
export const openNotes = (p: Pick<Poster, 'notes'>) => notesOf(p).filter((n) => !n.resolved);

/** Display name for a note's author. */
export const authorName = (n: Pick<ReviewNote, 'author'>) => n.author || 'Someone';

/** Short one-line preview of a note. */
export function preview(text: string, max = 40) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return '(empty note)';
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", or a date. */
export function timeAgo(t: number, now = Date.now()) {
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) {
    const d = Math.floor(s / 86400);
    return d === 1 ? 'yesterday' : `${d} days ago`;
  }
  return new Date(t).toLocaleDateString();
}

/** The name people sign their notes with, remembered on this computer. */
export function loadReviewerName(): string {
  try {
    return cleanText(localStorage.getItem(REVIEWER_KEY) ?? '', MAX_AUTHOR_LENGTH).trim();
  } catch {
    return '';
  }
}

export function saveReviewerName(name: string) {
  try {
    localStorage.setItem(REVIEWER_KEY, cleanText(name, MAX_AUTHOR_LENGTH));
  } catch {
    /* storage unavailable: the name just won't be remembered */
  }
}

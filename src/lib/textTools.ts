// Text tools that work across the whole poster: find & replace and word
// counts. Text boxes store HTML, so these functions read and edit only the
// text between tags and never touch the markup (bold, colours, line breaks).
// They are pure string functions so they can be unit tested without a browser.
import type { Poster, PosterElement } from '../types';

// ---------------------------------------------------------------- HTML text

/** One piece of the HTML: either markup (kept as is) or text (decoded). */
type Token = { tag: string } | { text: string; raw: string };

// Tags that start a new line: a word or a search match never runs across them.
const BLOCK_TAG = /^<\/?(br|p|div|li|ul|ol|h[1-6]|tr|td|th|table|blockquote)\b/i;

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

export function encodeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');
}

function tokenize(html: string): Token[] {
  const out: Token[] = [];
  const re = /<!--[\s\S]*?-->|<[^>]*>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m.index > last) {
      const raw = html.slice(last, m.index);
      out.push({ text: decodeEntities(raw), raw });
    }
    out.push({ tag: m[0] });
    last = m.index + m[0].length;
  }
  if (last < html.length) {
    const raw = html.slice(last);
    out.push({ text: decodeEntities(raw), raw });
  }
  return out;
}

/** The readable text of some HTML, with a line break wherever the markup starts a new line. */
export function htmlToText(html = ''): string {
  return tokenize(html)
    .map((t) => ('tag' in t ? (BLOCK_TAG.test(t.tag) ? '\n' : '') : t.text))
    .join('')
    .replace(/ /g, ' ');
}

// ---------------------------------------------------------------- find

export interface FindOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A regular expression that finds `query` as typed (no special characters). Spaces match any run of spaces. */
export function searchPattern(query: string, opts: FindOptions = {}): RegExp | null {
  const q = query.trim() ? query : '';
  if (!q) return null;
  let src = escapeRegExp(q).replace(/\s+/g, '[\\s\\u00a0]+');
  if (opts.wholeWord) src = `(?<![\\p{L}\\p{N}_])${src}(?![\\p{L}\\p{N}_])`;
  return new RegExp(src, 'gu' + (opts.matchCase ? '' : 'i'));
}

interface TextMap {
  tokens: Token[];
  /** joined text, with "\n" for block tags */
  text: string;
  /** for each character of `text`: [token index, offset in that token's decoded text], or null for a block break */
  pos: ([number, number] | null)[];
}

function mapText(html: string): TextMap {
  const tokens = tokenize(html);
  let text = '';
  const pos: ([number, number] | null)[] = [];
  tokens.forEach((t, i) => {
    if ('tag' in t) {
      if (BLOCK_TAG.test(t.tag)) {
        text += '\n';
        pos.push(null);
      }
      return;
    }
    for (let j = 0; j < t.text.length; j++) pos.push([i, j]);
    text += t.text;
  });
  return { tokens, text, pos };
}

/** The text that search offsets refer to: decoded text with "\n" for each block tag (non-breaking spaces kept). */
export function searchableText(html = ''): string {
  return mapText(html).text;
}

/** Tag names that count as a line break, for walking the rendered page the same way as the HTML. */
export const BLOCK_TAG_NAMES = new Set(['BR', 'P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR', 'TD', 'TH', 'TABLE', 'BLOCKQUOTE']);

export interface TextMatch {
  /** start and end in the element's readable text */
  start: number;
  end: number;
  /** the matched words as they appear on the poster */
  found: string;
  /** a little text either side, for showing the match in a list */
  before: string;
  after: string;
}

function matchesIn(map: TextMap, re: RegExp): TextMatch[] {
  const out: TextMatch[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(map.text))) {
    if (!m[0]) {
      re.lastIndex++;
      continue;
    }
    // A match may not span a line break made by markup.
    if (map.pos.slice(m.index, m.index + m[0].length).includes(null)) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      found: m[0],
      before: map.text.slice(Math.max(0, m.index - 24), m.index).replace(/\s+/g, ' '),
      after: map.text.slice(m.index + m[0].length, m.index + m[0].length + 24).replace(/\s+/g, ' '),
    });
  }
  return out;
}

/** Every match of `query` in some HTML. */
export function findInHtml(html: string, query: string, opts: FindOptions = {}): TextMatch[] {
  const re = searchPattern(query, opts);
  return re ? matchesIn(mapText(html), re) : [];
}

/**
 * Replaces matches of `query` in some HTML, keeping all formatting.
 * `which` limits it to the n-th match (0-based) of this element; leave it out to replace all.
 * Returns the new HTML and how many replacements were made.
 */
export function replaceInHtml(html: string, query: string, replacement: string, opts: FindOptions = {}, which?: number): { html: string; count: number } {
  const re = searchPattern(query, opts);
  if (!re) return { html, count: 0 };
  const map = mapText(html);
  let matches = matchesIn(map, re);
  if (which != null) matches = matches[which] ? [matches[which]] : [];
  if (!matches.length) return { html, count: 0 };

  // Work on decoded text per token; go backwards so earlier offsets stay valid.
  const texts = map.tokens.map((t) => ('tag' in t ? null : t.text));
  const changed = new Set<number>();
  for (const mt of [...matches].reverse()) {
    const chars = map.pos.slice(mt.start, mt.end) as [number, number][];
    // group the matched characters by token
    const byToken = new Map<number, number[]>();
    for (const [ti, off] of chars) byToken.set(ti, [...(byToken.get(ti) ?? []), off]);
    const first = chars[0][0];
    for (const [ti, offs] of [...byToken.entries()].reverse()) {
      const s = texts[ti]!;
      const a = offs[0];
      const b = offs[offs.length - 1] + 1;
      texts[ti] = s.slice(0, a) + (ti === first ? replacement : '') + s.slice(b);
      changed.add(ti);
    }
  }
  const out = map.tokens.map((t, i) => ('tag' in t ? t.tag : changed.has(i) ? encodeText(texts[i]!) : t.raw)).join('');
  return { html: out, count: matches.length };
}

/** Elements that hold text the user wrote. */
export function textElements(p: Poster): PosterElement[] {
  return p.elements.filter((e) => e.style && typeof e.html === 'string');
}

export interface PosterMatch extends TextMatch {
  elementId: string;
  /** index of this match within its element */
  index: number;
}

/** All matches across the poster, in reading order (top to bottom, then left to right). */
export function findInPoster(p: Poster, query: string, opts: FindOptions = {}): PosterMatch[] {
  const els = readingOrder(textElements(p));
  return els.flatMap((el) => findInHtml(el.html ?? '', query, opts).map((m, index) => ({ ...m, elementId: el.id, index })));
}

/** Replaces every match on the poster in place. Returns how many were replaced. */
export function replaceAllInPoster(p: Poster, query: string, replacement: string, opts: FindOptions = {}): number {
  let total = 0;
  for (const el of textElements(p)) {
    const r = replaceInHtml(el.html ?? '', query, replacement, opts);
    if (r.count) {
      el.html = r.html;
      total += r.count;
    }
  }
  return total;
}

/** Sorts elements the way a reader scans a column layout: by column, then down. */
export function readingOrder<T extends PosterElement>(els: T[]): T[] {
  return [...els].sort((a, b) => {
    // Overlapping vertically-ish rows that span the page (titles) come first by y.
    const ay = Math.round(a.y);
    const by = Math.round(b.y);
    const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
    if (overlapX) return ay - by || a.x - b.x;
    return a.x - b.x || ay - by;
  });
}

// ---------------------------------------------------------------- word count

/** Counts words the way word processors do: runs of letters or digits, with hyphens and apostrophes kept inside a word and numbers like 0.05 or 1,200 counted once. */
export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:(?:['’\-‐]|(?<=\p{N})[.,](?=\p{N}))[\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export interface SectionCount {
  /** heading text, or a name like "Title and authors" */
  name: string;
  /** element ids in the section, heading first */
  elementIds: string[];
  words: number;
}

export interface WordCount {
  total: number;
  sections: SectionCount[];
}

/**
 * Word count per section. A section is a header plus the text boxes below it
 * in the same column, up to the next header. The title and subtitle form their
 * own group, and text that sits under no header is counted as "Other text".
 */
export function wordCount(p: Poster): WordCount {
  const els = textElements(p);
  const words = new Map(els.map((e) => [e.id, countWords(htmlToText(e.html))]));
  const headings = els.filter((e) => e.type === 'heading');
  const top: string[] = [];
  const other: string[] = [];
  const bySection = new Map<string, string[]>(headings.map((h) => [h.id, [h.id]]));

  for (const el of els) {
    if (el.type === 'heading') continue;
    if (el.type === 'title' || el.type === 'subtitle') {
      top.push(el.id);
      continue;
    }
    // nearest header above whose column overlaps this box
    let best: PosterElement | null = null;
    for (const h of headings) {
      const overlap = Math.min(h.x + h.w, el.x + el.w) - Math.max(h.x, el.x);
      if (overlap < Math.min(h.w, el.w) * 0.3 || h.y > el.y + 1) continue;
      if (!best || h.y > best.y) best = h;
    }
    if (best) bySection.get(best.id)!.push(el.id);
    else other.push(el.id);
  }

  const sum = (ids: string[]) => ids.reduce((n, id) => n + (words.get(id) ?? 0), 0);
  const sections: SectionCount[] = [];
  if (top.length) sections.push({ name: 'Title and authors', elementIds: top, words: sum(top) });
  for (const h of readingOrder(headings)) {
    const ids = bySection.get(h.id)!;
    const name = htmlToText(h.html).replace(/\s+/g, ' ').trim() || 'Untitled section';
    sections.push({ name, elementIds: ids, words: sum(ids) });
  }
  if (other.length) sections.push({ name: 'Other text', elementIds: other, words: sum(other) });
  return { total: sum(els.map((e) => e.id)), sections };
}

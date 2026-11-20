// Keeps in-text citation markers and the reference list in step with the
// reference library. Markers are stored in text-box HTML as
//   <span class="cite" data-cite="refA,refB" contenteditable="false">[1, 2]</span>
// and their visible text is rewritten whenever the poster changes, so numbers
// follow the reading order and every export (PDF, PPTX, PNG) gets them for free.
import type { CitationStyle, Poster, PosterElement, Reference } from '../../types';
import { columnLefts, columnWidth } from '../../model';
import { citeAuthors, compressNumbers, esc, formatReference, isNumeric, sortKey, DEFAULT_STYLE } from './format';

export const CITE_SELECTOR = 'span[data-cite]';

/** An inert parser: nothing in the HTML runs or loads. */
function parse(html: string): DocumentFragment {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content;
}
function serialise(frag: DocumentFragment): string {
  const d = document.createElement('div');
  d.appendChild(frag.cloneNode(true));
  return d.innerHTML;
}

export const citeIds = (span: Element) => (span.getAttribute('data-cite') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Text boxes in the order a reader goes through the poster: column by column, top to bottom. */
export function readingOrder(p: Poster): PosterElement[] {
  const lefts = columnLefts(p);
  const colW = columnWidth(p);
  const key = (e: PosterElement) => {
    // wide boxes (title band, banner, footer) come before or after the columns
    if (e.w > colW * 1.5) return e.y + e.h / 2 < p.height / 2 ? -1 : lefts.length;
    let c = 0;
    lefts.forEach((l, k) => {
      if (e.x + e.w / 2 >= l - p.gutter / 2) c = k;
    });
    return c;
  };
  return p.elements
    .filter((e) => e.style && !e.refList && e.html?.includes('data-cite'))
    .map((e) => ({ e, k: key(e) }))
    .sort((a, b) => a.k - b.k || a.e.y - b.e.y || a.e.x - b.e.x)
    .map((x) => x.e);
}

/** Reference ids in the order they are first cited. */
export function citedOrder(p: Poster): string[] {
  const known = new Set((p.references ?? []).map((r) => r.id));
  const seen: string[] = [];
  for (const el of readingOrder(p)) {
    parse(el.html!).querySelectorAll(CITE_SELECTOR).forEach((s) => {
      for (const id of citeIds(s)) if (known.has(id) && !seen.includes(id)) seen.push(id);
    });
  }
  return seen;
}

export interface Bibliography {
  style: CitationStyle;
  /** references in list order */
  ordered: Reference[];
  /** reference id → number (numeric styles) */
  numbers: Map<string, number>;
  /** reference id → "a"/"b" for same author-and-year works (author-date styles) */
  suffix: Map<string, string>;
}

export function bibliography(p: Poster): Bibliography {
  const style = p.citationStyle ?? DEFAULT_STYLE;
  const refs = p.references ?? [];
  const numbers = new Map<string, number>();
  const suffix = new Map<string, string>();
  let ordered: Reference[];
  if (isNumeric(style)) {
    const cited = citedOrder(p);
    const byId = new Map(refs.map((r) => [r.id, r]));
    // cited works first in citation order, then any not cited yet
    ordered = [...cited.map((id) => byId.get(id)!), ...refs.filter((r) => !cited.includes(r.id))];
    ordered.forEach((r, k) => numbers.set(r.id, k + 1));
  } else {
    ordered = [...refs].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const groups = new Map<string, Reference[]>();
    for (const r of ordered) {
      const g = `${citeAuthors(r, style)}|${r.year ?? ''}`;
      groups.set(g, [...(groups.get(g) ?? []), r]);
    }
    for (const g of groups.values()) if (g.length > 1) g.forEach((r, k) => suffix.set(r.id, String.fromCharCode(97 + (k % 26))));
  }
  return { style, ordered, numbers, suffix };
}

/** Visible HTML of a citation marker for the given reference ids. */
export function markerHtml(ids: string[], bib: Bibliography, refs: Reference[]): string {
  const byId = new Map(refs.map((r) => [r.id, r]));
  const found = ids.filter((id) => byId.has(id));
  if (!found.length) return isNumeric(bib.style) ? '[?]' : '(?)';
  if (isNumeric(bib.style)) {
    const nums = found.map((id) => bib.numbers.get(id)!).filter(Boolean);
    if (bib.style === 'nature') return `<sup>${compressNumbers(nums, ',')}</sup>`;
    return `[${compressNumbers(nums)}]`;
  }
  // author-date: (Jones, 2019; Smith, 2020a); Chicago drops the comma
  const comma = bib.style === 'chicago' ? ' ' : ', ';
  const items = found
    .map((id) => byId.get(id)!)
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    .map((r) => `${citeAuthors(r, bib.style)}${comma}${r.year ?? (bib.style === 'harvard' ? 'no date' : 'n.d.')}${bib.suffix.get(r.id) ?? ''}`);
  return `(${esc(items.join('; '))})`;
}

/** The reference list as HTML. */
export function listHtml(p: Poster, bib: Bibliography, title = 'References'): string {
  const head = title ? `<div><b>${esc(title)}</b></div>` : '';
  if (!bib.ordered.length) return head + '<div>Add references with Insert → References.</div>';
  const numeric = isNumeric(bib.style);
  const items = bib.ordered.map((r) => {
    const body = formatReference(r, bib.style, bib.suffix.get(r.id) ?? '');
    if (!numeric) return `<div class="ref-entry">${body}</div>`;
    const n = bib.numbers.get(r.id)!;
    return `<div class="ref-entry">${bib.style === 'ieee' ? `[${n}]` : `${n}.`} ${body}</div>`;
  });
  return head + items.join('');
}

/** Rewrites marker text in one piece of HTML. Returns the same string if nothing changed. */
export function renderMarkers(html: string, bib: Bibliography, refs: Reference[]): string {
  if (!html.includes('data-cite')) return html;
  const frag = parse(html);
  let changed = false;
  frag.querySelectorAll(CITE_SELECTOR).forEach((s) => {
    const want = markerHtml(citeIds(s), bib, refs);
    if (s.innerHTML !== want) {
      s.innerHTML = want;
      changed = true;
    }
    if (s.getAttribute('contenteditable') !== 'false') {
      s.setAttribute('contenteditable', 'false');
      changed = true;
    }
    if (!s.classList.contains('cite')) {
      s.classList.add('cite');
      changed = true;
    }
  });
  return changed ? serialise(frag) : html;
}

/** Brings every marker and reference list on the poster up to date (mutates `p`). */
export function syncCitations(p: Poster): void {
  const hasList = p.elements.some((e) => e.refList);
  const hasCites = p.elements.some((e) => e.html?.includes('data-cite'));
  if (!hasList && !hasCites) return;
  const refs = p.references ?? [];
  const bib = bibliography(p);
  for (const el of p.elements) {
    if (el.refList) {
      const html = listHtml(p, bib, el.refTitle ?? 'References');
      if (el.html !== html) el.html = html;
    } else if (el.html && el.style) {
      const html = renderMarkers(el.html, bib, refs);
      if (html !== el.html) el.html = html;
    }
  }
}

/** A new marker element, ready to insert at the caret. */
export function makeMarker(ids: string[], p: Poster): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = 'cite';
  s.setAttribute('data-cite', ids.join(','));
  s.setAttribute('contenteditable', 'false');
  s.innerHTML = markerHtml(ids, bibliography(p), p.references ?? []);
  return s;
}

/** Updates marker text inside a live, editable DOM node (the text box being typed in). */
export function refreshMarkersIn(node: HTMLElement, p: Poster) {
  const bib = bibliography(p);
  node.querySelectorAll(CITE_SELECTOR).forEach((s) => {
    const want = markerHtml(citeIds(s), bib, p.references ?? []);
    if (s.innerHTML !== want) s.innerHTML = want;
  });
}

/** How many times each reference is cited on the poster. */
export function citeCounts(p: Poster): Map<string, number> {
  const counts = new Map<string, number>();
  for (const el of p.elements) {
    if (!el.html?.includes('data-cite') || el.refList) continue;
    parse(el.html).querySelectorAll(CITE_SELECTOR).forEach((s) => {
      for (const id of citeIds(s)) counts.set(id, (counts.get(id) ?? 0) + 1);
    });
  }
  return counts;
}

/** Removes a reference everywhere: from the library and from markers (markers left empty are deleted). */
export function removeReference(p: Poster, id: string) {
  p.references = (p.references ?? []).filter((r) => r.id !== id);
  for (const el of p.elements) {
    if (!el.html?.includes('data-cite') || el.refList) continue;
    const frag = parse(el.html);
    let changed = false;
    frag.querySelectorAll(CITE_SELECTOR).forEach((s) => {
      const ids = citeIds(s);
      if (!ids.includes(id)) return;
      changed = true;
      const rest = ids.filter((x) => x !== id);
      if (rest.length) s.setAttribute('data-cite', rest.join(','));
      else {
        // also drop the space typed before the marker
        const prev = s.previousSibling;
        if (prev?.nodeType === Node.TEXT_NODE) prev.textContent = (prev.textContent ?? '').replace(/[  ]$/, '');
        s.remove();
      }
    });
    if (changed) el.html = serialise(frag);
  }
}

/** Is this the same work as one already in the library? (by DOI, BibTeX key, or title + year) */
export function findDuplicate(refs: Reference[], r: Reference): Reference | undefined {
  const norm = (s?: string) => (s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return refs.find(
    (x) =>
      (r.doi && x.doi && r.doi.toLowerCase() === x.doi.toLowerCase()) ||
      (r.key && x.key && r.key === x.key) ||
      (norm(r.title) && norm(r.title) === norm(x.title) && (r.year ?? '') === (x.year ?? '')),
  );
}

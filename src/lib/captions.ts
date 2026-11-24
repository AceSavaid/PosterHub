// Numbered figure and table captions.
//
// A caption is an ordinary text box with `captionOf` set to the id of the image,
// graph or table it describes. Its HTML starts with a label marker
//   <b class="fig-label" data-fig="" contenteditable="false">Figure 2:</b>
// that is rewritten whenever the poster changes, so numbers follow the reading
// order (column by column, top to bottom) and every export gets them for free,
// just like citation numbers. The caption stays attached to its figure: moving
// or resizing the figure carries the caption along, and dragging the caption
// moves the figure with it.
import type { Poster, PosterElement } from '../types';
import { defaultStyle, makeElement, typeScale } from '../model';
import { sortByReadingOrder } from './refs/citations';

export const FIG_SELECTOR = '[data-fig]';
export type CaptionPos = 'above' | 'below';
export type CaptionKind = 'Figure' | 'Table';

/** Images (not QR codes), graphs and tables can have a numbered caption. */
export function canCaption(el: PosterElement | null | undefined): el is PosterElement {
  if (!el) return false;
  if (el.type === 'image') return el.qr == null && el.placeholder !== 'QR code' && el.role !== 'logo' && el.role !== 'qr';
  return el.type === 'chart' || el.type === 'table';
}

export const captionKind = (fig: PosterElement): CaptionKind => (fig.type === 'table' ? 'Table' : 'Figure');

/** The caption box attached to a figure, if it has one. */
export function captionOf(p: Pick<Poster, 'elements'>, figId: string): PosterElement | undefined {
  return p.elements.find((e) => e.captionOf === figId);
}

/** Space between a figure and its caption, in mm. */
export const captionGap = (p: Pick<Poster, 'width' | 'height'>) => Math.max(1, Math.round(Math.min(p.width, p.height) / 300 * 10) / 10);

/** Figure id → its label ("Figure 1", "Table 2"). Figures and tables are counted separately, in reading order. */
export function figureNumbers(p: Poster): Map<string, string> {
  const captioned = new Set(p.elements.filter((e) => e.captionOf).map((e) => e.captionOf!));
  const figs = sortByReadingOrder(p, p.elements.filter((e) => captioned.has(e.id) && canCaption(e)));
  const counts: Record<CaptionKind, number> = { Figure: 0, Table: 0 };
  const out = new Map<string, string>();
  for (const f of figs) {
    const kind = captionKind(f);
    out.set(f.id, `${kind} ${++counts[kind]}`);
  }
  return out;
}

// ---------------------------------------------------------------- HTML

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
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const labelHtml = (label: string) => `<b class="fig-label" data-fig="" contenteditable="false">${esc(label)}:</b>`;

/** Where the label goes: inside the first block (div/p) when the text is wrapped in blocks. */
function labelParent(frag: DocumentFragment): ParentNode {
  const first = Array.from(frag.childNodes).find((n) => n.nodeType !== Node.TEXT_NODE || n.textContent?.trim());
  return first instanceof HTMLElement && /^(DIV|P)$/.test(first.tagName) ? first : frag;
}

/** Puts the right label at the start of a caption's HTML (adding it if it was deleted). Same string when nothing changed. */
export function renderLabel(html: string, label: string): string {
  const frag = parse(html);
  const marks = Array.from(frag.querySelectorAll(FIG_SELECTOR));
  const want = esc(label) + ':';
  const mark = marks[0];
  if (mark && marks.length === 1 && mark.innerHTML === want && mark.getAttribute('contenteditable') === 'false') return html;
  marks.slice(1).forEach((m) => m.remove());
  if (mark) {
    mark.innerHTML = want;
    mark.setAttribute('contenteditable', 'false');
    mark.classList.add('fig-label');
  } else {
    const parent = labelParent(frag);
    const t = document.createElement('template');
    t.innerHTML = labelHtml(label) + ' ';
    parent.insertBefore(t.content, parent.firstChild);
  }
  return serialise(frag);
}

/** Removes the label marker (and the space after it). */
export function stripLabel(html: string): string {
  if (!html.includes('data-fig')) return html;
  const frag = parse(html);
  frag.querySelectorAll(FIG_SELECTOR).forEach((m) => {
    const next = m.nextSibling;
    if (next?.nodeType === Node.TEXT_NODE) next.textContent = (next.textContent ?? '').replace(/^[\s ]+/, '');
    m.remove();
  });
  return serialise(frag);
}

/** Removes a typed-in "Figure 1." / "Fig. 2:" / "Table 3 –" at the start (template captions have one). */
export function stripTypedLabel(html: string): string {
  const frag = parse(html);
  const re = /^[\s ]*(figure|fig\.?|table)[\s ]*\d+[a-z]?[\s ]*[.:\-–—]?[\s ]*/i;
  // walk text nodes from the start until the label has been consumed
  const walker = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT);
  let text = '';
  const nodes: Text[] = [];
  while (walker.nextNode() && text.length < 40) {
    const n = walker.currentNode as Text;
    nodes.push(n);
    text += n.data;
  }
  const m = text.match(re);
  if (!m) return html;
  let left = m[0].length;
  for (const n of nodes) {
    if (left <= 0) break;
    const cut = Math.min(left, n.data.length);
    n.data = n.data.slice(cut);
    left -= cut;
  }
  // drop formatting tags the label lived in (e.g. <i>Figure 1.</i>) now that they are empty
  frag.querySelectorAll('b, i, em, strong, span, u').forEach((e) => {
    if (!e.textContent && !e.querySelector('br')) e.remove();
  });
  return serialise(frag);
}

/** The caption's words, without the label (plain text). */
export function captionText(cap: PosterElement): string {
  const frag = parse(stripLabel(cap.html ?? '').replace(/<br\s*\/?>/gi, '\n'));
  const blocks = frag.querySelectorAll('div, p');
  blocks.forEach((b) => b.after('\n'));
  const text = frag.textContent ?? '';
  // (trailing spaces typed in the Properties panel are kept so typing isn't interrupted)
  return blocks.length ? text.replace(/\n+$/, '') : text;
}

/** Caption HTML for plain text typed in the Properties panel (keeps the label). */
export function captionHtml(text: string, label = 'Figure 1'): string {
  return labelHtml(label) + ' ' + esc(text.replace(/^[\s\u00a0]+/, '')).replace(/\n/g, '<br>');
}

// ---------------------------------------------------------------- layout

const moved = (a: PosterElement, b: PosterElement) => a.x !== b.x || a.y !== b.y;
const resized = (a: PosterElement, b: PosterElement) => a.w !== b.w || a.h !== b.h;

/** Puts a caption right above or below its figure, the same width. */
function place(p: Poster, cap: PosterElement, fig: PosterElement) {
  const gap = captionGap(p);
  cap.x = fig.x;
  cap.w = fig.w;
  cap.y = cap.captionPos === 'above' ? fig.y - cap.h - gap : fig.y + fig.h + gap;
  if (cap.rotation) delete cap.rotation;
}

/**
 * Keeps every caption attached to its figure and numbered (mutates `p`).
 * Pass the poster before the change so that dragging a caption on its own moves its figure too.
 */
export function syncCaptions(p: Poster, prev?: Poster): void {
  if (!p.elements.some((e) => e.captionOf || e.html?.includes('data-fig'))) return;
  const byId = new Map(p.elements.map((e) => [e.id, e]));
  const before = prev ? new Map(prev.elements.map((e) => [e.id, e])) : undefined;
  const seen = new Set<string>();
  for (const cap of p.elements) {
    if (!cap.captionOf) continue;
    const fig = byId.get(cap.captionOf);
    // a caption whose figure was deleted (or a second caption for the same figure) becomes plain text
    if (!fig || !canCaption(fig) || seen.has(fig.id) || !cap.style) {
      delete cap.captionOf;
      delete cap.captionPos;
      delete cap.captionRoom;
      continue;
    }
    seen.add(fig.id);
    const oldCap = before?.get(cap.id);
    const oldFig = before?.get(fig.id);
    // the caption was dragged on its own: bring the figure along
    if (oldCap?.captionOf === fig.id && oldFig && !moved(fig, oldFig) && !resized(fig, oldFig) && moved(cap, oldCap) && !resized(cap, oldCap) && !fig.locked) {
      fig.x += cap.x - oldCap.x;
      fig.y += cap.y - oldCap.y;
    }
    place(p, cap, fig);
  }
  const numbers = figureNumbers(p);
  for (const el of p.elements) {
    if (!el.html) continue;
    const label = el.captionOf ? numbers.get(el.captionOf) : undefined;
    const html = label ? renderLabel(el.html, label) : el.html.includes('data-fig') ? stripLabel(el.html) : el.html;
    if (html !== el.html) el.html = html;
  }
}

/** Font size for a new caption: a little smaller than the poster's body text. */
function captionFontSize(p: Poster): number {
  const sizes = p.elements.filter((e) => e.type === 'text' && e.style && !e.captionOf && !e.refList).map((e) => e.style!.fontSize).sort((a, b) => a - b);
  const body = sizes.length ? sizes[Math.floor(sizes.length / 2)] : defaultStyle('text', typeScale(p)).fontSize;
  return Math.max(6, Math.round(body * 0.85));
}

const PT_TO_MM = 25.4 / 72;

/** An unlinked caption that a template already put right under (or over) this figure. */
function findTemplateCaption(p: Poster, fig: PosterElement): PosterElement | undefined {
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(captionGap(p) * 4, fig.h * 0.08);
  return p.elements.find((e) => {
    if (e.id === fig.id || !e.style || e.captionOf || e.refList || e.type !== 'text') return false;
    if (p.elements.some((x) => x.captionOf === fig.id)) return false;
    const looksLike = e.role === 'caption' || /^[\s ]*(figure|fig\.?|table)[\s ]*\d/i.test(e.html?.replace(/<[^>]*>/g, '') ?? '');
    if (!looksLike) return false;
    const overlap = Math.min(e.x + e.w, fig.x + fig.w) - Math.max(e.x, fig.x);
    if (overlap < Math.min(e.w, fig.w) * 0.5) return false;
    // next to the figure, or anywhere in the same template section (a picture can be shorter than its box)
    return near(e.y, fig.y + fig.h) || near(e.y + e.h, fig.y) || (!!fig.group && e.group === fig.group && e.role === 'caption');
  });
}

/**
 * Gives a figure a numbered caption (mutates `p`; call inside an `update`).
 * A caption the template already placed next to the figure is reused. Otherwise a new
 * box is made, taking its room from the figure so nothing else on the poster moves.
 * Returns the caption's id.
 */
export function addCaption(p: Poster, figId: string, pos: CaptionPos = 'below', text = ''): string | undefined {
  const fig = p.elements.find((e) => e.id === figId);
  if (!canCaption(fig)) return;
  const existing = captionOf(p, figId);
  if (existing) {
    setCaptionPos(p, figId, pos);
    return existing.id;
  }
  const found = findTemplateCaption(p, fig);
  if (found) {
    found.captionOf = fig.id;
    found.captionPos = found.y >= fig.y + fig.h / 2 ? 'below' : 'above';
    found.html = stripTypedLabel(found.html ?? '');
    if (found.captionPos !== pos) setCaptionPos(p, figId, pos);
    syncCaptions(p);
    return found.id;
  }
  const size = captionFontSize(p);
  const style = { ...defaultStyle('text', typeScale(p)), fontSize: size, align: 'left' as const };
  const lines = text.length > 60 ? 2 : 1;
  const h = Math.round((lines * size * PT_TO_MM * style.lineHeight + 1) * 10) / 10;
  const gap = captionGap(p);
  const room = h + gap;
  const cap = makeElement('text', p, { html: captionHtml(text), style, h, captionOf: fig.id, captionPos: pos });
  // take the space from the figure when it is big enough, so the caption doesn't cover what's next to it
  if (fig.h - room >= fig.h * 0.55 && !fig.locked) {
    fig.h -= room;
    if (pos === 'above') fig.y += room;
    cap.captionRoom = room;
  }
  const i = p.elements.indexOf(fig);
  p.elements.splice(i + 1, 0, cap);
  syncCaptions(p);
  return cap.id;
}

/** Moves a caption to the other side of its figure, keeping the pair where it was. */
export function setCaptionPos(p: Poster, figId: string, pos: CaptionPos) {
  const fig = p.elements.find((e) => e.id === figId);
  const cap = captionOf(p, figId);
  if (!fig || !cap || cap.captionPos === pos) return;
  const gap = captionGap(p);
  const top = Math.min(fig.y, cap.y);
  if (pos === 'above') {
    cap.y = top;
    fig.y = top + cap.h + gap;
  } else fig.y = top;
  cap.captionPos = pos;
  syncCaptions(p);
}

/** Deletes a figure's caption and gives the figure back the room the caption took. */
export function removeCaption(p: Poster, figId: string) {
  const fig = p.elements.find((e) => e.id === figId);
  const cap = captionOf(p, figId);
  if (!fig || !cap) return;
  if (cap.captionRoom) {
    if (cap.captionPos === 'above') fig.y -= cap.captionRoom;
    fig.h += cap.captionRoom;
  }
  p.elements = p.elements.filter((e) => e !== cap);
  syncCaptions(p);
}

/** Sets the words of a figure's caption from plain text. */
export function setCaptionText(p: Poster, figId: string, text: string) {
  const cap = captionOf(p, figId);
  if (!cap) return;
  cap.html = captionHtml(text, figureNumbers(p).get(figId));
}

/** `ids` plus the captions of any figures among them (so copies and deletes take the caption along). */
export function withCaptions(ids: string[], elements: PosterElement[]): string[] {
  const set = new Set(ids);
  const extra = elements.filter((e) => e.captionOf && set.has(e.captionOf) && !set.has(e.id)).map((e) => e.id);
  return [...ids, ...extra];
}

/** After copying elements with new ids, points copied captions at their copied figures (or unlinks them). */
export function relinkCopies(copies: PosterElement[], idMap: Map<string, string>) {
  for (const c of copies) {
    if (!c.captionOf) continue;
    const to = idMap.get(c.captionOf);
    if (to) c.captionOf = to;
    else {
      delete c.captionOf;
      delete c.captionPos;
      delete c.captionRoom;
      if (c.html) c.html = stripLabel(c.html);
    }
  }
  return copies;
}

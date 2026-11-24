// Adding a new section (a heading, a text box and an empty figure slot) under the one whose
// "+" was clicked. Everything below it in the same column moves down. When the column is
// already full, empty space at the bottom of text boxes and half of any empty figure slot
// below are given up to make room. Loaded only when a "+" is clicked.
import type { Poster, PosterElement } from '../types';
import { makeElement, typeScale, uid } from '../model';
import { EPS, givesSpace, isFigureSlot, overlapShare, sectionGap, sections } from './sections';

/**
 * Adds a new section under the one headed by `headingId` (mutates `p`; call inside an
 * `update` draft). It copies the look of that section: heading style, text style, figure
 * slot and the panel behind it. Returns the new elements' ids (heading first), or null
 * when the column has no room at all.
 *
 * `spare(id)` gives the empty mm at the bottom of a text box, so a full column can still make room.
 */
export function insertSection(p: Poster, headingId: string, spare: (id: string) => number = () => 0): { ids: string[]; figure: boolean } | null {
  const all = sections(p);
  const ref = all.find((s) => s.heading.id === headingId);
  if (!ref) return null;
  const s = typeScale(p);
  const gap = sectionGap(p, all);
  const col = { x: ref.x, w: ref.w };
  const memberIds = new Set(ref.members.map((e) => e.id));

  // What moves down, and the floor it can't pass (bottom margin, a full-width footer, anything locked).
  let floor = p.height - p.margin;
  const movers: PosterElement[] = [];
  for (const e of p.elements) {
    if (memberIds.has(e.id) || e.y < ref.bottom - EPS || overlapShare(col, e) < 0.5) continue;
    if (e.w > col.w * 1.5 + EPS || e.locked) floor = Math.min(floor, e.y);
    else movers.push(e);
  }
  // Panels behind other movers (a section's card) follow their contents instead of moving on their own.
  const contains = (a: PosterElement, b: PosterElement) => a.x <= b.x + EPS && a.x + a.w >= b.x + b.w - EPS && a.y <= b.y + EPS && a.y + a.h >= b.y + b.h - EPS;
  const panels = movers.filter((m) => m.type === 'shape' && movers.some((o) => o !== m && contains(m, o)));
  const walkers = movers.filter((m) => !panels.includes(m)).sort((a, b) => a.y - b.y);
  const lowest = Math.max(ref.bottom, ...movers.map((m) => m.y + m.h));
  const bottomFree = Math.max(0, floor - lowest);
  const canGive = (e: PosterElement) => (givesSpace(e) ? Math.max(0, spare(e.id)) : isFigureSlot(e) ? e.h * 0.5 : 0);
  // The section's own last text box can give up its empty space too.
  const card0 = ref.members.find((e) => e.type === 'shape' && contains(e, ref.heading));
  const last = ref.members.filter((e) => e !== card0).reduce((a, b) => (b.y + b.h > a.y + a.h ? b : a));
  const refSpare = last !== ref.heading && givesSpace(last) ? Math.max(0, Math.min(spare(last.id), last.h - 10)) : 0;
  const room = bottomFree + refSpare + walkers.reduce((t, e) => t + canGive(e), 0);

  // The look to copy from the section above.
  const h0 = ref.heading;
  const body = ref.members.filter((e) => e.type === 'text' && e.role !== 'caption').sort((a, b) => a.y - b.y)[0];
  const fig = ref.members.find(isFigureSlot);
  const card = card0;
  const below = ref.members.filter((e) => e !== h0 && e !== card && e.y >= h0.y + h0.h - EPS).sort((a, b) => a.y - b.y)[0];
  const inner = below ? Math.max(2 * s, Math.min(12 * s, below.y - (h0.y + h0.h))) : 6 * s;
  const padTop = card ? h0.y - card.y : 0;
  const padBottom = card ? Math.max(0, card.y + card.h - Math.max(...ref.members.filter((e) => e !== card).map((e) => e.y + e.h))) : 0;
  const bodyX = body?.x ?? h0.x;
  const bodyW = body?.w ?? h0.w;

  const minText = 30 * s;
  const fixed = gap + padTop + h0.h + inner + padBottom;
  if (room < fixed + minText - 0.01) return null;
  let textH = Math.min(80 * s, room - fixed);
  let figH = Math.min(bodyW * 0.6, 150 * s);
  if (room < fixed + textH + inner + figH) {
    const left = room - fixed - textH - inner;
    figH = left >= 40 * s ? left : 0;
    if (!figH) textH = Math.min(80 * s, room - fixed);
  }
  const blockH = padTop + h0.h + inner + textH + (figH ? inner + figH : 0) + padBottom;
  const need = gap + blockH;

  // Make room: everything below moves down; if the bottom fills up, text boxes give up their
  // empty space and empty figure slots shrink, top to bottom.
  const panelPads = panels.map((pn) => {
    const inside = movers.filter((o) => o !== pn && contains(pn, o));
    const top = Math.min(...inside.map((o) => o.y));
    const bot = Math.max(...inside.map((o) => o.y + o.h));
    return { pn, inside, padT: top - pn.y, padB: pn.y + pn.h - bot };
  });
  let shrink = Math.max(0, need - bottomFree);
  const fromRef = Math.min(refSpare, shrink);
  if (fromRef > 0) {
    last.h -= fromRef;
    if (last.grew) last.grew = Math.max(0, last.grew - fromRef) || undefined;
    if (card0) card0.h -= fromRef;
    shrink -= fromRef;
  }
  let shift = need - fromRef;
  for (const e of walkers) {
    e.y += shift;
    const take = Math.min(canGive(e), shrink);
    if (take > 0) {
      e.h -= take;
      if (e.grew) e.grew = Math.max(0, e.grew - take) || undefined;
      shift -= take;
      shrink -= take;
    }
  }
  for (const { pn, inside, padT, padB } of panelPads) {
    const top = Math.min(...inside.map((o) => o.y));
    const bot = Math.max(...inside.map((o) => o.y + o.h));
    pn.y = top - padT;
    pn.h = bot - top + padT + padB;
  }

  // Build the new section.
  const group = 'sec-' + uid();
  const top = ref.bottom - fromRef + gap;
  const out: PosterElement[] = [];
  if (card) out.push({ ...JSON.parse(JSON.stringify(card)), id: uid(), y: top, h: blockH, group, groupId: undefined, locked: undefined, grew: undefined });
  let y = top + padTop;
  const head = makeElement('heading', p, {
    x: h0.x, y, w: h0.w, h: h0.h, group,
    style: h0.style && JSON.parse(JSON.stringify(h0.style)), fill: h0.fill, gradient: h0.gradient, padding: h0.padding, radius: h0.radius, borderColor: h0.borderColor, borderWidth: h0.borderWidth,
  });
  out.push(head);
  y += h0.h + inner;
  const text = makeElement('text', p, { x: bodyX, y, w: bodyW, h: textH, group, role: 'body' });
  if (body) Object.assign(text, { style: body.style && JSON.parse(JSON.stringify(body.style)), fill: body.fill, padding: body.padding, radius: body.radius });
  out.push(text);
  y += textH + inner;
  if (figH) {
    out.push(
      makeElement('image', p, {
        x: fig?.x ?? bodyX, y, w: fig?.w ?? bodyW, h: figH, group, placeholder: 'Figure', role: 'figure',
        fill: fig?.fill ?? '@surface', fit: fig?.fit ?? 'contain', radius: fig?.radius, borderColor: fig?.borderColor, borderWidth: fig?.borderWidth,
      }),
    );
  }
  for (const e of out) for (const k of Object.keys(e) as (keyof PosterElement)[]) if (e[k] === undefined) delete e[k];
  // Just after the section it follows, so the reading order stays the same.
  const at = Math.max(...ref.members.map((m) => p.elements.indexOf(m))) + 1;
  p.elements.splice(at, 0, ...out);
  return { ids: [head.id, ...out.filter((e) => e !== head).map((e) => e.id)], figure: !!figH };
}

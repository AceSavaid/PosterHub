// "Copy at another size": a new poster at another paper size or orientation, made from an
// existing one. The original is never changed.
//
// Two ways to fit the content:
// - 'scale' moves and resizes every element in proportion and scales text by the smaller of the
//   two stretch factors, so text still fits its box (same as Layout → Size with "Scale content").
//   Best when the shape stays the same, e.g. A0 → A1 or an A4 handout.
// - 'rearrange' first scales, then rebuilds the poster in a starter layout with a column count
//   that suits the new shape and moves the person's content into it (src/lib/relayout.ts).
//   Best when the orientation flips, where stretching would squash everything.

import type { Orientation, Poster, PosterElement } from '../types';
import { SIZE_PRESETS, TEMPLATES, buildTemplate, sizeFor, typeScale, uid, type TemplateId } from '../model';
import { applyLayout, describeReport, sectionHeadings } from './relayout';
import { syncCaptions } from './captions';

export type CopyMode = 'scale' | 'rearrange';

export interface CopyOptions {
  width: number;
  height: number;
  sizePreset: string;
  mode: CopyMode;
  /** layout for 'rearrange' (default: the one the poster looks closest to) */
  template?: TemplateId;
  /** columns for 'rearrange' (default: suggestColumns) */
  columns?: number;
  name?: string;
}

export const orientationOf = (p: { width: number; height: number }): Orientation => (p.width > p.height ? 'landscape' : 'portrait');

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Scales a poster's content to a new page size, in place. `textFactor` scales font sizes,
 * margins and gaps (default: the smaller stretch factor, so text keeps fitting its box).
 */
export function scaleContent(d: Poster, width: number, height: number, textFactor?: number) {
  const sx = width / d.width;
  const sy = height / d.height;
  const fs = textFactor ?? Math.min(sx, sy);
  for (const e of d.elements) {
    e.x *= sx;
    e.w *= sx;
    e.y *= sy;
    e.h *= sy;
    if (e.style) e.style.fontSize = Math.max(4, round1(e.style.fontSize * fs));
    if (e.chart) e.chart.fontSize = Math.max(4, Math.round(e.chart.fontSize * fs));
    if (e.table) e.table.fontSize = Math.max(4, round1(e.table.fontSize * fs));
    if (e.equation) e.equation.fontSize = Math.max(4, round1(e.equation.fontSize * fs));
    if (e.borderWidth) e.borderWidth = Math.max(0.25, round1(e.borderWidth * fs));
    if (e.radius) e.radius *= fs;
    if (e.padding) e.padding *= fs;
  }
  for (const n of d.notes ?? []) {
    n.x *= sx;
    n.y *= sy;
  }
  d.margin *= fs;
  d.gutter *= fs;
}

/** True when the new size has a clearly different shape (orientation flips, or a much wider/taller page). */
export function shapeChanges(p: { width: number; height: number }, width: number, height: number) {
  const r = width / height / (p.width / p.height);
  return r > 1.2 || r < 1 / 1.2;
}

/** A column count that suits the new shape: about the same column width relative to the page. */
export function suggestColumns(p: Pick<Poster, 'width' | 'height' | 'columns'>, width: number, height: number) {
  const r = Math.sqrt(width / height / (p.width / p.height));
  return Math.min(6, Math.max(1, Math.round(p.columns * r)));
}

/** Whether the poster has sections that a starter layout can rearrange (not a blank or freeform poster). */
export const canRearrange = (p: Poster) => sectionHeadings(p.elements).length > 0;

/** The starter layout this poster looks most like: the one whose title, headings, logos etc. sit in the same places. */
export function guessLayout(p: Poster): TemplateId {
  const tol = Math.min(p.width, p.height) * 0.03;
  const roled = p.elements.filter((e) => e.role);
  let best: TemplateId = 'classic';
  let bestScore = 0;
  for (const t of TEMPLATES) {
    if (t.id === 'blank') continue;
    const built = buildTemplate(t.id, p);
    let score = 0;
    for (const e of roled) if (built.some((b) => b.role === e.role && Math.abs(b.x - e.x) < tol && Math.abs(b.y - e.y) < tol)) score++;
    // Penalise layouts with many parts the poster doesn't have.
    score -= built.filter((b) => b.role && !roled.some((e) => e.role === b.role)).length * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = t.id;
    }
  }
  return best;
}

/** Short label for a size: "A1 landscape" or "600 × 900 mm portrait". */
export function sizeLabel(width: number, height: number, preset: string) {
  const o = orientationOf({ width, height });
  const p = SIZE_PRESETS.find((s) => s.id === preset);
  const name = p ? (/^\d/.test(p.id) ? p.id.replace('x', ' × ') + ' in' : p.id === 'letter' ? 'Letter' : p.id === '11x17' ? 'Tabloid' : p.id) : `${Math.round(width)} × ${Math.round(height)} mm`;
  return `${name} ${o}`;
}

export function defaultCopyName(p: Poster, width: number, height: number, preset: string) {
  return `${p.name.replace(/\s*\([^()]*(portrait|landscape)\)$/, '') || 'Poster'} (${sizeLabel(width, height, preset)})`;
}

/** Sensible starting options for copying `p` at a preset size and orientation. */
export function defaultOptions(p: Poster, preset: string, orientation: Orientation): CopyOptions {
  const { width, height } = sizeFor(preset, orientation);
  const rearrange = shapeChanges(p, width, height) && canRearrange(p);
  return {
    width,
    height,
    sizePreset: preset,
    mode: rearrange ? 'rearrange' : 'scale',
    template: guessLayout(p),
    columns: suggestColumns(p, width, height),
  };
}

/** Makes the copy. Returns the new poster (not yet saved) and a sentence describing what happened. */
export function copyAtSize(p: Poster, o: CopyOptions): { poster: Poster; message: string } {
  const now = Date.now();
  const copy: Poster = structuredClone(p);
  copy.id = uid();
  copy.name = o.name?.trim() || defaultCopyName(p, o.width, o.height, o.sizePreset);
  copy.createdAt = now;
  copy.updatedAt = now;
  delete copy.thumbnail;

  const label = sizeLabel(o.width, o.height, o.sizePreset);
  const rearrange = o.mode === 'rearrange' && canRearrange(p);
  // Rearranging rebuilds text at the layout's own sizes, so scale margins and any extra
  // elements by the page's type scale rather than squashing them to the narrower side.
  scaleContent(copy, o.width, o.height, rearrange ? typeScale({ width: o.width, height: o.height }) / typeScale(p) : undefined);
  copy.width = o.width;
  copy.height = o.height;
  copy.sizePreset = o.sizePreset;

  if (!rearrange) {
    syncCaptions(copy);
    return { poster: copy, message: `Made a ${label} copy with everything scaled to fit.` };
  }

  copy.columns = Math.min(6, Math.max(1, Math.round(o.columns ?? suggestColumns(p, o.width, o.height))));
  const template = o.template ?? guessLayout(p);
  const { elements, report } = applyLayout(copy, template);
  copy.elements = keepIds(elements);
  syncCaptions(copy);
  const moved = describeReport(report).replace(/^Layout applied\. ?/, '').replace(/ ?Undo with Ctrl\/⌘ Z\.$/, '');
  return { poster: copy, message: `Made a ${label} copy in ${copy.columns} column${copy.columns > 1 ? 's' : ''}. ${moved}`.trim() };
}

/** Element ids must be unique; applyLayout can carry a moved element next to a fresh one. */
function keepIds(els: PosterElement[]) {
  const seen = new Set<string>();
  return els.map((e) => {
    if (!seen.has(e.id)) {
      seen.add(e.id);
      return e;
    }
    const n = { ...e, id: uid() };
    seen.add(n.id);
    return n;
  });
}

/** A same-size copy with a new id and name. */
export function exactCopy(p: Poster, name: string): Poster {
  const now = Date.now();
  return { ...structuredClone(p), id: uid(), name: name.trim() || `${p.name} (copy)`, createdAt: now, updatedAt: now };
}

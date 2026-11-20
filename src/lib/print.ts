// Print-shop extras for PDF export: bleed (artwork that runs a few millimetres
// past the trim so no white sliver shows if the cut is slightly off) and crop
// marks (thin lines outside the poster that show the printer where to cut).
// Pure geometry so it can be unit tested; the PDF exporters do the drawing.
import type { Poster, PosterElement } from '../types';
import { isPolygon } from './shapes';

export interface PrintOptions {
  /** How far artwork extends past each trim edge, in mm (0 = no bleed). */
  bleedMm: number;
  /** Draw crop (trim) marks in a margin around the poster. */
  cropMarks: boolean;
}

export const NO_PRINT_EXTRAS: PrintOptions = { bleedMm: 0, cropMarks: false };

/** Choices offered in the Export menu. ⅛ inch is the usual North American bleed. */
export const BLEED_CHOICES: { mm: number; label: string }[] = [
  { mm: 0, label: 'None' },
  { mm: 3, label: '3 mm' },
  { mm: 3.175, label: '⅛ inch (3.2 mm)' },
  { mm: 5, label: '5 mm' },
];

/** Crop marks start this far outside the trim (or at the bleed edge, if further) so they never print on the poster. */
export const MARK_OFFSET_MM = 3;
export const MARK_LENGTH_MM = 6;
/** Hairline width used by print shops for crop marks. */
export const MARK_WIDTH_PT = 0.25;

export interface PrintGeometry {
  bleedMm: number;
  /** Space added around the trim on every side of the PDF page (bleed, plus room for marks). */
  marginMm: number;
  pageWidthMm: number;
  pageHeightMm: number;
}

export function sanitizePrintOptions(o: Partial<PrintOptions> | undefined): PrintOptions {
  const bleed = Number(o?.bleedMm);
  return {
    bleedMm: Number.isFinite(bleed) ? Math.min(25, Math.max(0, bleed)) : 0,
    cropMarks: o?.cropMarks === true,
  };
}

export function printGeometry(p: Pick<Poster, 'width' | 'height'>, opts?: Partial<PrintOptions>): PrintGeometry {
  const o = sanitizePrintOptions(opts);
  const marginMm = o.cropMarks ? markOffset(o.bleedMm) + MARK_LENGTH_MM + 1 : o.bleedMm;
  return { bleedMm: o.bleedMm, marginMm, pageWidthMm: p.width + 2 * marginMm, pageHeightMm: p.height + 2 * marginMm };
}

const markOffset = (bleedMm: number) => Math.max(MARK_OFFSET_MM, bleedMm);

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The eight crop-mark lines, in poster mm (0,0 = top-left trim corner; negative
 * values are outside the poster). Each corner gets one horizontal and one
 * vertical line in line with the trim edge.
 */
export function cropMarkLines(p: Pick<Poster, 'width' | 'height'>, bleedMm = 0): Segment[] {
  const off = markOffset(bleedMm);
  const len = MARK_LENGTH_MM;
  const W = p.width;
  const H = p.height;
  const out: Segment[] = [];
  for (const x of [0, W]) {
    for (const y of [0, H]) {
      const sx = x === 0 ? -1 : 1;
      const sy = y === 0 ? -1 : 1;
      out.push({ x1: x + sx * off, y1: y, x2: x + sx * (off + len), y2: y }); // horizontal
      out.push({ x1: x, y1: y + sy * off, x2: x, y2: y + sy * (off + len) }); // vertical
    }
  }
  return out;
}

/** Elements this close to a trim edge (mm) are treated as touching it. */
const EDGE_TOLERANCE_MM = 1;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The box to paint an element's background in when bleed is on: plain boxes
 * that touch (or run past) a trim edge are stretched out to the bleed edge on
 * that side, so a full-width header band still reaches the edge after cutting.
 * Rounded, round and outlined items keep their shape and are not stretched.
 */
export function bleedBox(el: PosterElement, p: Pick<Poster, 'width' | 'height'>, bleedMm: number): Box {
  const box = { x: el.x, y: el.y, w: el.w, h: el.h };
  if (bleedMm <= 0 || !canBleed(el)) return box;
  const t = EDGE_TOLERANCE_MM;
  let x1 = el.x;
  let y1 = el.y;
  let x2 = el.x + el.w;
  let y2 = el.y + el.h;
  // Only stretch along an edge the element actually covers part of.
  const spansX = x2 > 0 && x1 < p.width;
  const spansY = y2 > 0 && y1 < p.height;
  if (spansY && x1 <= t) x1 = Math.min(x1, -bleedMm);
  if (spansY && x2 >= p.width - t) x2 = Math.max(x2, p.width + bleedMm);
  if (spansX && y1 <= t) y1 = Math.min(y1, -bleedMm);
  if (spansX && y2 >= p.height - t) y2 = Math.max(y2, p.height + bleedMm);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function canBleed(el: PosterElement): boolean {
  if (el.radius || el.borderWidth) return false;
  if (el.type === 'shape') return el.shape !== 'ellipse' && !isPolygon(el);
  // Photos only when they already fill their box; a "fit inside" picture would just gain empty space.
  if (el.type === 'image') return !!el.src && el.fit === 'cover' && !el.padding;
  return true;
}

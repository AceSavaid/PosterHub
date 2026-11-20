// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { MARK_LENGTH_MM, MARK_OFFSET_MM, bleedBox, canBleed, cropMarkLines, printGeometry, sanitizePrintOptions } from '../../src/lib/print';
import { buildVectorPdf } from '../../src/lib/pdf/vectorPdf';
import { MM_TO_PX, PALETTES, createPoster, makeElement } from '../../src/model';
import type { Poster } from '../../src/types';
import { pageContent } from '../helpers/pdf';

const MM_TO_PT = 72 / 25.4;

function a4(): Poster {
  const p = createPoster({ name: 'Print', width: 210, height: 297, sizePreset: 'A4', columns: 2, palette: PALETTES[0], headingFont: 'Open Sans', bodyFont: 'Open Sans', template: 'blank' });
  p.elements = [];
  return p;
}

/** Stand-in for the on-screen poster: enough for posters without text boxes. */
const fakeNode = (p: Poster) => ({ getBoundingClientRect: () => ({ left: 0, top: 0, width: p.width * MM_TO_PX }), querySelector: () => null }) as unknown as HTMLElement;

describe('print geometry', () => {
  it('adds nothing by default', () => {
    expect(printGeometry({ width: 210, height: 297 })).toEqual({ bleedMm: 0, marginMm: 0, pageWidthMm: 210, pageHeightMm: 297 });
  });

  it('grows the page by the bleed on every side', () => {
    const g = printGeometry({ width: 210, height: 297 }, { bleedMm: 3 });
    expect(g.marginMm).toBe(3);
    expect(g.pageWidthMm).toBe(216);
    expect(g.pageHeightMm).toBe(303);
  });

  it('leaves room outside the bleed for crop marks', () => {
    expect(printGeometry({ width: 100, height: 100 }, { cropMarks: true }).marginMm).toBe(MARK_OFFSET_MM + MARK_LENGTH_MM + 1);
    // marks start at the bleed edge when the bleed is wider than the usual offset
    expect(printGeometry({ width: 100, height: 100 }, { bleedMm: 5, cropMarks: true }).marginMm).toBe(5 + MARK_LENGTH_MM + 1);
  });

  it('cleans up odd option values', () => {
    expect(sanitizePrintOptions({ bleedMm: -4, cropMarks: 'yes' as never })).toEqual({ bleedMm: 0, cropMarks: false });
    expect(sanitizePrintOptions({ bleedMm: NaN })).toEqual({ bleedMm: 0, cropMarks: false });
    expect(sanitizePrintOptions({ bleedMm: 400 }).bleedMm).toBe(25);
    expect(sanitizePrintOptions(undefined)).toEqual({ bleedMm: 0, cropMarks: false });
  });
});

describe('crop marks', () => {
  it('puts two lines at each corner, in line with the trim and clear of the bleed', () => {
    const lines = cropMarkLines({ width: 100, height: 200 }, 3);
    expect(lines).toHaveLength(8);
    for (const l of lines) {
      const horizontal = l.y1 === l.y2;
      expect(horizontal || l.x1 === l.x2).toBe(true);
      // on a trim line
      if (horizontal) expect([0, 200]).toContain(l.y1);
      else expect([0, 100]).toContain(l.x1);
      // entirely outside the poster plus bleed
      const outside = (v: number, max: number) => v <= -3 || v >= max + 3;
      if (horizontal) expect(outside(l.x1, 100) && outside(l.x2, 100)).toBe(true);
      else expect(outside(l.y1, 200) && outside(l.y2, 200)).toBe(true);
      expect(Math.hypot(l.x2 - l.x1, l.y2 - l.y1)).toBeCloseTo(MARK_LENGTH_MM);
    }
    expect(lines).toContainEqual({ x1: -3, y1: 0, x2: -9, y2: 0 });
    expect(lines).toContainEqual({ x1: 100, y1: 203, x2: 100, y2: 209 });
  });
});

describe('bleed', () => {
  it('stretches a full-width header band to the bleed edge', () => {
    const p = a4();
    const band = makeElement('shape', p, { x: 0, y: 0, w: 210, h: 40, fill: '@primary' });
    expect(bleedBox(band, p, 3)).toEqual({ x: -3, y: -3, w: 216, h: 43 });
  });

  it('stretches only the sides that touch the edge (within 1 mm)', () => {
    const p = a4();
    const footer = makeElement('shape', p, { x: 0.5, y: 280, w: 100, h: 17, fill: '@primary' });
    expect(bleedBox(footer, p, 3)).toEqual({ x: -3, y: 280, w: 103.5, h: 20 });
  });

  it('leaves items away from the edge, and rounded, round or outlined shapes, alone', () => {
    const p = a4();
    const mid = makeElement('shape', p, { x: 20, y: 20, w: 50, h: 50 });
    expect(bleedBox(mid, p, 3)).toEqual({ x: 20, y: 20, w: 50, h: 50 });
    for (const extra of [{ radius: 4 }, { shape: 'ellipse' as const }, { shape: 'star' as const }, { borderWidth: 2 }]) {
      const el = makeElement('shape', p, { x: 0, y: 0, w: 210, h: 40, ...extra });
      expect(canBleed(el)).toBe(false);
      expect(bleedBox(el, p, 3)).toEqual({ x: 0, y: 0, w: 210, h: 40 });
    }
  });

  it('only stretches photos that already fill their box', () => {
    const p = a4();
    const photo = makeElement('image', p, { x: 0, y: 0, w: 210, h: 100, src: 'data:image/png;base64,', fit: 'cover' });
    expect(canBleed(photo)).toBe(true);
    expect(canBleed({ ...photo, fit: 'contain' })).toBe(false);
    expect(canBleed({ ...photo, padding: 2 })).toBe(false);
  });

  it('does nothing without bleed', () => {
    const p = a4();
    const band = makeElement('shape', p, { x: 0, y: 0, w: 210, h: 40 });
    expect(bleedBox(band, p, 0)).toEqual({ x: 0, y: 0, w: 210, h: 40 });
  });
});

describe('PDF with bleed and crop marks', () => {
  it('keeps the page exactly poster-sized when the options are off', async () => {
    const p = a4();
    const { bytes } = await buildVectorPdf(fakeNode(p), p);
    const page = (await PDFDocument.load(bytes)).getPage(0);
    expect(page.getWidth()).toBeCloseTo(210 * MM_TO_PT, 1);
    expect(page.getHeight()).toBeCloseTo(297 * MM_TO_PT, 1);
    expect(await pageContent(bytes)).not.toMatch(/ K\b/);
  });

  it('enlarges the page, records trim and bleed boxes and draws registration crop marks', async () => {
    const p = a4();
    p.elements = [makeElement('shape', p, { x: 0, y: 0, w: 210, h: 40, fill: '#123456' })];
    const { bytes } = await buildVectorPdf(fakeNode(p), p, { print: { bleedMm: 3, cropMarks: true } });
    const page = (await PDFDocument.load(bytes)).getPage(0);
    const m = 3 + MARK_LENGTH_MM + 1;
    expect(page.getWidth()).toBeCloseTo((210 + 2 * m) * MM_TO_PT, 1);
    expect(page.getHeight()).toBeCloseTo((297 + 2 * m) * MM_TO_PT, 1);
    const trim = page.getTrimBox();
    expect(trim.x).toBeCloseTo(m * MM_TO_PT, 1);
    expect(trim.width).toBeCloseTo(210 * MM_TO_PT, 1);
    expect(trim.height).toBeCloseTo(297 * MM_TO_PT, 1);
    const bleed = page.getBleedBox();
    expect(bleed.x).toBeCloseTo((m - 3) * MM_TO_PT, 1);
    expect(bleed.width).toBeCloseTo(216 * MM_TO_PT, 1);

    const content = await pageContent(bytes);
    expect(content).toMatch(/1 1 1 1 K/); // registration colour
    expect((content.match(/ l\n/g) ?? []).length).toBeGreaterThanOrEqual(8); // eight mark lines
    // the header band is painted from the bleed edge: x = -3 mm, width 216 mm (in poster px)
    const px = (mm: number) => String(Math.round(mm * MM_TO_PX * 10000) / 10000);
    expect(content).toContain(`${px(-3)} ${px(-3)} ${px(216)} ${px(43)} re`);
  });

  it('draws triangles, stars and arrows as their real outlines', async () => {
    const p = a4();
    p.elements = [makeElement('shape', p, { x: 10, y: 10, w: 40, h: 40, shape: 'triangle', fill: '#aa0000' })];
    const content = await pageContent((await buildVectorPdf(fakeNode(p), p)).bytes);
    // apex at the top middle of the box, then two bottom corners
    const px = (mm: number) => String(Math.round(mm * MM_TO_PX * 10000) / 10000);
    expect(content).toContain(`${px(30)} ${px(10)} m`);
    expect(content).toContain(`${px(50)} ${px(50)} l`);
    expect(content).toContain(`${px(10)} ${px(50)} l`);
  });
});

// Vector PDF export: text stays real text with embedded fonts, shapes and
// charts stay vectors, and photos keep their full original resolution. This
// is what makes a poster print sharply at A0 and beyond.
import { PDFDocument, PDFName, PDFNumber, type PDFImage } from 'pdf-lib';
import { BasicPlatform, Chart, registerables, type ChartConfiguration } from 'chart.js';
import type { Poster, PosterElement } from '../../types';
import { MM_TO_PX, fontStack, resolveColor, resolveFont } from '../../model';
import { buildChartConfig } from '../chart';
import { parseColor, type RGBA } from './color';
import { FontRegistry, fontkit, type Fetcher } from './fonts';
import { Painter } from './painter';
import { PdfCanvasContext, RecordingPath2D } from './canvas2d';
import { extractText, frameOf, type TextPiece } from './domText';

Chart.register(...registerables);

const PT_PER_PX = 0.75;
/** Largest page side most PDF readers accept without a UserUnit (200 in). */
const MAX_PDF_UNITS = 14400;

export interface VectorPdfOptions {
  fetcher?: Fetcher;
  /** Image fallbacks for charts that cannot be drawn as vectors, by element id. */
  chartImage?: (id: string) => string | undefined;
}

export interface VectorPdfResult {
  bytes: Uint8Array;
  /** Notes about anything that could not be kept as vectors. */
  warnings: string[];
}

const isTextType = (e: PosterElement) => e.type === 'title' || e.type === 'subtitle' || e.type === 'heading' || e.type === 'text';

export async function buildVectorPdf(node: HTMLElement, p: Poster, opts: VectorPdfOptions = {}): Promise<VectorPdfResult> {
  const warnings: string[] = [];
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(p.name || 'Poster');
  doc.setCreator('PosterHub');
  doc.setProducer('PosterHub (pdf-lib)');

  const W = p.width * MM_TO_PX;
  const H = p.height * MM_TO_PX;
  const wPt = W * PT_PER_PX;
  const hPt = H * PT_PER_PX;
  const unit = Math.max(1, Math.max(wPt, hPt) / MAX_PDF_UNITS);
  const page = doc.addPage([wPt / unit, hPt / unit]);
  if (unit > 1) page.node.set(PDFName.of('UserUnit'), PDFNumber.of(unit));

  const painter = new Painter(doc, page);
  // Poster px with y down → PDF units with y up.
  painter.transform([PT_PER_PX / unit, 0, 0, -PT_PER_PX / unit, 0, hPt / unit]);

  const fonts = new FontRegistry(doc, p, opts.fetcher);

  // 1. Measure all text as laid out by the browser.
  const frame = frameOf(node, W);
  const textByEl = new Map<string, TextPiece[]>();
  for (const e of p.elements) {
    if (!isTextType(e)) continue;
    const body = node.querySelector<HTMLElement>(`.el[data-id="${CSS.escape(e.id)}"] .el-body`);
    if (body) textByEl.set(e.id, extractText(body, frame));
  }

  // 2. Load the fonts that text needs.
  const requests = new Map<string, { family: string; weight: number; italic: boolean; text: string }>();
  const want = (family: string, weight: number, italic: boolean, text: string) => {
    const k = `${family}|${weight}|${italic}`;
    const r = requests.get(k);
    if (r) r.text += text;
    else requests.set(k, { family, weight, italic, text });
  };
  textByEl.forEach((pieces) => pieces.forEach((t) => want(t.family, t.weight, t.italic, t.text)));
  const chartFont = resolveFont('@body', p);
  for (const e of p.elements) {
    if (e.type !== 'chart' || !e.chart) continue;
    const s = e.chart;
    const text = [s.title, s.xLabel, s.yLabel, ...s.columns, ...s.rows.flat(), '0123456789.,-−+eE%kMB '].join('');
    want(chartFont, 400, false, text);
    want(chartFont, 700, false, text);
  }
  for (const r of requests.values()) await fonts.prepare(r.family, r.weight, r.italic, r.text);

  // 3. Paint.
  const pal = p.palette;
  const bg = parseColor(resolveColor('@background', pal));
  if (bg) {
    painter.rect(0, 0, W, H);
    painter.fill(bg);
  }
  const images = new ImageCache(doc);
  if (p.backgroundImage) {
    const img = await images.get(p.backgroundImage, W, H);
    if (img) drawImageFit(painter, img, 0, 0, W, H, 'cover');
    else warnings.push('The background image could not be read.');
  }

  for (const e of p.elements) {
    const x = e.x * MM_TO_PX;
    const y = e.y * MM_TO_PX;
    const w = e.w * MM_TO_PX;
    const h = e.h * MM_TO_PX;
    if (e.type === 'shape' && e.shape === 'line') {
      const c = parseColor(resolveColor(e.fill ?? '@primary', pal));
      if (c) {
        painter.rect(x, y, w, h);
        painter.fill(c);
      }
      continue;
    }
    const bw = ((e.borderWidth ?? 0) * 96) / 72;
    const ellipse = e.type === 'shape' && e.shape === 'ellipse';
    const r = (e.radius ?? 0) * MM_TO_PX;
    const outline = (inset: number) =>
      ellipse ? painter.ellipse(x + inset, y + inset, w - 2 * inset, h - 2 * inset) : painter.roundRect(x + inset, y + inset, w - 2 * inset, h - 2 * inset, Math.max(0, r - inset));

    const fill = parseColor(resolveColor(e.fill, pal));
    if (fill) {
      outline(0);
      painter.fill(fill);
    }

    // Content is clipped to the inside of the border, like the editor's overflow: hidden.
    painter.save();
    outline(bw);
    painter.clip();
    const pad = (e.padding ?? 0) * MM_TO_PX;
    const cx = x + bw + pad;
    const cy = y + bw + pad;
    const cw = Math.max(0, w - 2 * (bw + pad));
    const ch = Math.max(0, h - 2 * (bw + pad));

    if (e.type === 'image' && e.src) {
      const img = await images.get(e.src, cw, ch);
      if (img) {
        painter.save();
        painter.rect(cx, cy, cw, ch);
        painter.clip();
        drawImageFit(painter, img, cx, cy, cw, ch, e.fit ?? 'contain');
        painter.restore();
      } else warnings.push('An image could not be read.');
    } else if (e.type === 'chart' && e.chart) {
      const mark = painter.ops.length;
      try {
        drawChart(painter, fonts, e, p, cx, cy, cw, ch);
      } catch (err) {
        console.warn('Vector chart failed, using an image instead', err);
        painter.ops.length = mark;
        const src = opts.chartImage?.(e.id);
        const img = src ? await images.get(src, cw, ch) : null;
        if (img) drawImageFit(painter, img, cx, cy, cw, ch, 'fill');
        warnings.push('A chart was exported as an image.');
      }
    } else if (isTextType(e)) {
      drawText(painter, fonts, textByEl.get(e.id) ?? []);
    }
    painter.restore();

    if (bw > 0) {
      const c = parseColor(resolveColor(e.borderColor ?? '@primary', pal));
      if (c) {
        outline(bw / 2);
        painter.stroke(c, { width: bw });
      }
    }
  }

  painter.flush();
  const bytes = await doc.save({ useObjectStreams: true });
  return { bytes, warnings };
}

// ---------------------------------------------------------------- text

export function drawText(painter: Painter, fonts: FontRegistry, pieces: TextPiece[]) {
  const lines: { y: number; x0: number; x1: number; size: number; face: ReturnType<FontRegistry['primaryFace']>; color: RGBA; key: string; strike: boolean }[] = [];
  for (const t of pieces) {
    const color = parseColor(t.color);
    if (!color) continue;
    const segs = fonts.resolve(t.family, t.weight, t.italic, t.text);
    const face = fonts.primaryFace(t.family, t.weight, t.italic, t.text);
    const baseline = t.top + (t.height * face.ascent) / (face.ascent + face.descent || 1);
    const natural = segs.reduce((w, s) => w + s.face.advance(s.text) * t.size, 0);
    // Stretch by at most a few percent so each word spans exactly the width the browser gave it.
    const ratio = t.width > 0 && natural > 0 ? t.width / natural : 1;
    const hs = ratio > 0.8 && ratio < 1.25 ? ratio : 1;
    let pen = t.alignRight ? t.x - natural : t.x;
    for (const seg of segs) {
      painter.textSegment(seg, t.size, color, [hs, 0, 0, -1, pen, baseline]);
      pen += seg.face.advance(seg.text) * t.size * hs;
    }
    if (t.underline || t.strike) {
      const add = (strike: boolean) => {
        const y = strike ? baseline - face.ascent * t.size * 0.32 : baseline + face.underlinePosition * t.size;
        const prev = lines.find((l) => l.strike === strike && Math.abs(l.y - y) < 0.5 && l.key === t.color && t.x - l.x1 < t.size * 0.6 && t.x >= l.x0);
        if (prev) prev.x1 = Math.max(prev.x1, t.x + t.width);
        else lines.push({ y, x0: t.x, x1: t.x + t.width, size: t.size, face, color, key: t.color, strike });
      };
      if (t.underline) add(false);
      if (t.strike) add(true);
    }
  }
  for (const l of lines) {
    const th = Math.max(0.5, l.face.underlineThickness * l.size);
    painter.rect(l.x0, l.y - th / 2, l.x1 - l.x0, th);
    painter.fill(l.color);
  }
}

// ---------------------------------------------------------------- charts

export function drawChart(painter: Painter, fonts: FontRegistry, e: PosterElement, p: Poster, x: number, y: number, w: number, h: number) {
  if (w < 1 || h < 1) return;
  const cfg = buildChartConfig(e.chart!, p.palette, fontStack(resolveFont('@body', p)), resolveColor('@text', p.palette));
  cfg.options = { ...cfg.options, devicePixelRatio: 1, animation: false };
  const ctx = new PdfCanvasContext(painter, fonts, [1, 0, 0, 1, x, y], w, h);
  ctx.canvas.getContext = () => ctx;
  const g = globalThis as { Path2D?: unknown };
  const saved = g.Path2D;
  g.Path2D = RecordingPath2D;
  painter.save();
  try {
    const chart = new Chart(ctx.canvas as unknown as HTMLCanvasElement, { ...(cfg as ChartConfiguration), platform: BasicPlatform });
    // Chart.js draws synchronously on creation when animation is off.
    chart.destroy();
  } finally {
    g.Path2D = saved;
    painter.restore();
  }
}

// ---------------------------------------------------------------- images

function drawImageFit(painter: Painter, img: PDFImage, x: number, y: number, w: number, h: number, fit: 'contain' | 'cover' | 'fill') {
  if (fit === 'fill') return painter.image(img, x, y, w, h);
  const s = fit === 'cover' ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height);
  const iw = img.width * s;
  const ih = img.height * s;
  painter.image(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

class ImageCache {
  private cache = new Map<string, Promise<PDFImage | null>>();
  constructor(private doc: PDFDocument) {}

  get(src: string, boxW: number, boxH: number) {
    let p = this.cache.get(src);
    if (!p) {
      p = this.load(src, boxW, boxH).catch((err) => {
        console.warn('Could not embed image', err);
        return null;
      });
      this.cache.set(src, p);
    }
    return p;
  }

  private async load(src: string, boxW: number, boxH: number): Promise<PDFImage | null> {
    const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
    if (isPng(bytes)) return this.doc.embedPng(bytes);
    if (isJpeg(bytes) && jpegOrientation(bytes) <= 1 && !isCmykJpeg(bytes)) return this.doc.embedJpg(bytes);
    // Anything else (rotated phone photos, WebP, GIF, SVG…) goes through the browser.
    const png = await rasterize(src, boxW, boxH);
    return png ? this.doc.embedPng(png) : null;
  }
}

const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8;

/** Reads the EXIF orientation tag (1 = upright). */
export function jpegOrientation(b: Uint8Array): number {
  let i = 2;
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) return 1;
    const marker = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker === 0xe1 && String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]) === 'Exif') {
      const t = i + 10;
      const le = b[t] === 0x49;
      const u16 = (o: number) => (le ? b[t + o] | (b[t + o + 1] << 8) : (b[t + o] << 8) | b[t + o + 1]);
      const u32 = (o: number) => (le ? u16(o) | (u16(o + 2) << 16) : (u16(o) << 16) | u16(o + 2));
      const ifd = u32(4);
      const n = u16(ifd);
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12;
        if (u16(e) === 0x0112) return u16(e + 8);
      }
      return 1;
    }
    if (marker === 0xda) return 1;
    i += 2 + len;
  }
  return 1;
}

/** Adobe CMYK JPEGs are stored inverted; let the browser convert those. */
function isCmykJpeg(b: Uint8Array): boolean {
  let i = 2;
  while (i + 9 < b.length && b[i] === 0xff) {
    const marker = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return b[i + 9] === 4;
    if (marker === 0xda) return false;
    i += 2 + len;
  }
  return false;
}

async function rasterize(src: string, boxW: number, boxH: number): Promise<Uint8Array | null> {
  const img = new Image();
  img.decoding = 'sync';
  img.src = src;
  await img.decode();
  let w = img.naturalWidth || boxW;
  let h = img.naturalHeight || boxH;
  // Vector images (SVG) have no real pixel size: render them at 300 dpi for their box.
  if (/^data:image\/svg/i.test(src) || /\.svg($|\?)/i.test(src)) {
    const k = Math.max((boxW * 300) / 96 / w, (boxH * 300) / 96 / h, 1);
    w *= k;
    h *= k;
  }
  const cap = Math.min(1, 8000 / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * cap));
  canvas.height = Math.max(1, Math.round(h * cap));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

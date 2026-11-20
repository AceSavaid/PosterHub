import { toBlob, toCanvas, toJpeg } from 'html-to-image';
import type { ChartSpec, Poster, PosterElement } from '../types';
import { MM_TO_IN, MM_TO_PX, resolveColor, resolveFont } from '../model';
import { fontEmbedCss } from './fonts';
import { downloadBlob, safeFileName } from './storage';
import { histogramData, seriesData } from './chart';
import { cleanHtml } from './sanitize';
import { cropMarkLines, MARK_WIDTH_PT, printGeometry, type PrintOptions } from './print';
import { CELL_PAD, cellLook, columnAlign, columnWeights, normalizeTable, type Border } from './table';
import { PT_TO_PX, layoutEquation, loadMath, mathSvg, typesetLatex } from './math';

const MAX_SIDE = 16000;
const MAX_AREA = 120_000_000;

/** Pixel ratio for a target DPI, clamped to what browsers can rasterise. */
export function pixelRatioFor(p: Poster, dpi: number) {
  const w = p.width * MM_TO_PX;
  const h = p.height * MM_TO_PX;
  let r = dpi / 96;
  r = Math.min(r, MAX_SIDE / Math.max(w, h));
  r = Math.min(r, Math.sqrt(MAX_AREA / (w * h)));
  return r;
}

export function effectiveDpi(p: Poster, dpi: number) {
  return Math.round(pixelRatioFor(p, dpi) * 96);
}

function captureOptions(p: Poster, pixelRatio: number, fontCss: string) {
  return {
    pixelRatio,
    width: Math.round(p.width * MM_TO_PX),
    height: Math.round(p.height * MM_TO_PX),
    cacheBust: false,
    fontEmbedCSS: fontCss,
    style: { transform: 'none', margin: '0', boxShadow: 'none' },
    filter: (n: Node) => !(n instanceof HTMLElement && n.classList.contains('ui-only')),
    backgroundColor: resolveColor('@background', p.palette),
    skipAutoScale: true,
  };
}

async function withExportMode<T>(node: HTMLElement, fn: () => Promise<T>): Promise<T> {
  node.classList.add('exporting');
  try {
    await document.fonts.ready;
    return await fn();
  } finally {
    node.classList.remove('exporting');
  }
}

export async function renderPng(node: HTMLElement, p: Poster, dpi: number): Promise<Blob> {
  const css = await fontEmbedCss();
  return withExportMode(node, async () => {
    const blob = await toBlob(node, captureOptions(p, pixelRatioFor(p, dpi), css));
    if (!blob) throw new Error('Could not render the poster image.');
    return blob;
  });
}

export async function exportPng(node: HTMLElement, p: Poster, dpi: number) {
  downloadBlob(await renderPng(node, p, dpi), safeFileName(p.name) + '.png');
}

/**
 * Print-quality PDF: real text with embedded fonts, vector shapes and charts,
 * full-resolution images. Falls back to the image-based PDF if anything fails.
 */
export async function exportPdf(
  node: HTMLElement,
  p: Poster,
  dpi: number,
  chartImage?: (id: string) => string | undefined,
  print?: Partial<PrintOptions>,
): Promise<{ vector: boolean; warnings: string[] }> {
  try {
    const { buildVectorPdf } = await import('./pdf/vectorPdf');
    const { bytes, warnings } = await withExportMode(node, () => buildVectorPdf(node, p, { chartImage, print }));
    downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), safeFileName(p.name) + '.pdf');
    return { vector: true, warnings };
  } catch (err) {
    console.warn('Vector PDF export failed; using an image-based PDF instead.', err);
    await exportPdfRaster(node, p, dpi, print);
    return { vector: false, warnings: [] };
  }
}

/** The previous PDF export: one high-resolution picture of the poster. */
export async function exportPdfRaster(node: HTMLElement, p: Poster, dpi: number, print?: Partial<PrintOptions>) {
  const { jsPDF } = await import('jspdf');
  const css = await fontEmbedCss();
  const canvas = await withExportMode(node, () => toCanvas(node, captureOptions(p, pixelRatioFor(p, dpi), css)));
  const g = printGeometry(p, print);
  const m = g.marginMm;
  const pdf = new jsPDF({ unit: 'mm', format: [g.pageWidthMm, g.pageHeightMm], orientation: g.pageWidthMm > g.pageHeightMm ? 'landscape' : 'portrait', compress: true });
  pdf.setProperties({ title: p.name, creator: 'PosterHub' });
  if (g.bleedMm > 0) {
    // A picture can't be stretched sensibly, so the bleed is the background colour.
    pdf.setFillColor(resolveColor('@background', p.palette));
    pdf.rect(m - g.bleedMm, m - g.bleedMm, p.width + 2 * g.bleedMm, p.height + 2 * g.bleedMm, 'F');
  }
  pdf.addImage(canvas, 'PNG', m, m, p.width, p.height, undefined, 'FAST');
  if (print?.cropMarks) {
    pdf.setDrawColor(0);
    pdf.setLineWidth(MARK_WIDTH_PT * (25.4 / 72));
    for (const l of cropMarkLines(p, g.bleedMm)) pdf.line(l.x1 + m, l.y1 + m, l.x2 + m, l.y2 + m);
  }
  pdf.save(safeFileName(p.name) + '.pdf');
}

export async function copyImageToClipboard(node: HTMLElement, p: Poster) {
  // Pass a promise so Safari keeps the user-gesture context.
  const blobPromise = renderPng(node, p, 110);
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') throw new Error('Your browser does not allow copying images. Use Export → PNG instead.');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
}

export async function makeThumbnail(node: HTMLElement, p: Poster): Promise<string | undefined> {
  try {
    const ratio = 320 / (Math.max(p.width, p.height) * MM_TO_PX);
    return await withExportMode(node, () =>
      toJpeg(node, { ...captureOptions(p, ratio, ''), quality: 0.7, fontEmbedCSS: '' }),
    );
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- PowerPoint

const hex = (c: string) => c.replace('#', '').slice(0, 6).toUpperCase();

interface Run {
  text: string;
  options: { bold?: boolean; italic?: boolean; underline?: { style: 'sng' }; breakLine?: boolean; superscript?: boolean; subscript?: boolean; color?: string };
}

/** Converts the limited HTML produced by the editor into PptxGenJS text runs. */
export function htmlToRuns(html: string): Run[] {
  const root = document.createElement('div');
  root.innerHTML = cleanHtml(html);
  const runs: Run[] = [];
  const BLOCK = /^(DIV|P|LI|H[1-6]|UL|OL)$/;
  const walk = (n: Node, f: { b?: boolean; i?: boolean; u?: boolean; sup?: boolean; sub?: boolean; color?: string }) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = (n.textContent ?? '').replace(/ /g, ' ');
      if (t) runs.push({ text: t, options: { bold: f.b, italic: f.i, underline: f.u ? { style: 'sng' } : undefined, superscript: f.sup, subscript: f.sub, color: f.color } });
      return;
    }
    if (!(n instanceof HTMLElement)) return;
    if (n.tagName === 'BR') {
      runs.push({ text: '', options: { breakLine: true } });
      return;
    }
    const nf = { ...f };
    if (/^(B|STRONG)$/.test(n.tagName) || n.style.fontWeight === 'bold' || Number(n.style.fontWeight) >= 600) nf.b = true;
    if (/^(I|EM)$/.test(n.tagName) || n.style.fontStyle === 'italic') nf.i = true;
    if (n.tagName === 'U' || n.style.textDecoration.includes('underline')) nf.u = true;
    if (n.tagName === 'SUP') nf.sup = true;
    if (n.tagName === 'SUB') nf.sub = true;
    const col = n.getAttribute('color') || n.style.color;
    if (col) nf.color = cssColorToHex(col);
    const isBlock = BLOCK.test(n.tagName);
    if (isBlock && runs.length && !runs[runs.length - 1].options.breakLine) runs.push({ text: '', options: { breakLine: true } });
    if (n.tagName === 'LI') runs.push({ text: '• ', options: {} });
    n.childNodes.forEach((c) => walk(c, nf));
    if (isBlock && runs.length && !runs[runs.length - 1].options.breakLine) runs.push({ text: '', options: { breakLine: true } });
  };
  root.childNodes.forEach((c) => walk(c, {}));
  while (runs.length && runs[runs.length - 1].options.breakLine && !runs[runs.length - 1].text) runs.pop();
  // PptxGenJS wants breakLine on the run *before* the break.
  const out: Run[] = [];
  for (const r of runs) {
    if (r.options.breakLine && !r.text) {
      if (out.length) out[out.length - 1].options.breakLine = true;
      else out.push({ text: '', options: { breakLine: true } });
    } else out.push(r);
  }
  return out.length ? out : [{ text: '', options: {} }];
}

function cssColorToHex(c: string): string | undefined {
  if (c.startsWith('#')) return hex(c.length === 4 ? '#' + [...c.slice(1)].map((x) => x + x).join('') : c);
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('').toUpperCase();
  return undefined;
}

const PPT_MAX_IN = 56;

export async function exportPptx(p: Poster, chartImages: Map<string, string>) {
  const { pptx, k } = await buildPptx(p, chartImages);
  await pptx.writeFile({ fileName: safeFileName(p.name) + '.pptx' });
  return k;
}

/** Builds the PowerPoint in memory; `k` is the scale applied to fit PowerPoint's 56 inch limit. */
export async function buildPptx(p: Poster, chartImages: Map<string, string> = new Map()) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  let wIn = p.width * MM_TO_IN;
  let hIn = p.height * MM_TO_IN;
  // PowerPoint slides cannot exceed 56 inches; scale down proportionally if needed.
  const k = Math.min(1, PPT_MAX_IN / Math.max(wIn, hIn));
  wIn *= k;
  hIn *= k;
  pptx.defineLayout({ name: 'POSTER', width: wIn, height: hIn });
  pptx.layout = 'POSTER';
  pptx.title = p.name;
  const slide = pptx.addSlide();
  const pal = p.palette;
  const col = (c?: string) => hex(resolveColor(c, pal));
  const pos = (e: PosterElement) => ({ x: e.x * MM_TO_IN * k, y: e.y * MM_TO_IN * k, w: e.w * MM_TO_IN * k, h: e.h * MM_TO_IN * k });
  slide.background = p.backgroundImage ? { data: p.backgroundImage } : { color: col('@background') };
  if (p.elements.some((e) => e.type === 'equation')) await loadMath();

  for (const e of p.elements) {
    const box = pos(e);
    const fill = e.fill && resolveColor(e.fill, pal) !== 'transparent' ? { color: col(e.fill) } : undefined;
    const line = e.borderWidth ? { color: col(e.borderColor ?? '@primary'), width: e.borderWidth * k } : undefined;
    switch (e.type) {
      case 'shape': {
        const ST = pptx.ShapeType;
        const arrows = { right: ST.rightArrow, left: ST.leftArrow, up: ST.upArrow, down: ST.downArrow };
        const shapeType =
          e.shape === 'ellipse' ? ST.ellipse
          : e.shape === 'line' ? ST.line
          : e.shape === 'triangle' ? ST.triangle
          : e.shape === 'diamond' ? ST.diamond
          : e.shape === 'star' ? ST.star5
          : e.shape === 'arrow' ? arrows[e.direction ?? 'right']
          : e.radius ? ST.roundRect
          : ST.rect;
        slide.addShape(shapeType, {
          ...box,
          fill: e.shape === 'line' ? undefined : (fill ?? { type: 'none' }),
          line: e.shape === 'line' ? { color: col(e.fill ?? '@primary'), width: Math.max(1, (e.h * 72) / 25.4) * k } : line,
          rectRadius: e.radius ? Math.min(0.5, e.radius / Math.min(e.w, e.h)) : undefined,
        } as never);
        break;
      }
      case 'image':
        if (e.src) {
          const fit = e.fit ?? 'contain';
          slide.addImage({ data: e.src, ...box, altText: e.alt || e.qr || undefined, sizing: fit === 'fill' ? undefined : { type: fit, w: box.w, h: box.h } } as never);
        }
        break;
      case 'equation': {
        if (fill || line) slide.addShape(e.radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, { ...box, fill: fill ?? { type: 'none' }, line, rectRadius: e.radius ? Math.min(0.5, e.radius / Math.min(e.w, e.h)) : undefined } as never);
        const img = equationImage(e, p);
        if (img) slide.addImage({ data: img.data, x: img.x * k, y: img.y * k, w: img.w * k, h: img.h * k, altText: e.equation!.latex } as never);
        break;
      }
      case 'chart': {
        if (!e.chart) break;
        if (fill) slide.addShape(pptx.ShapeType.rect, { ...box, fill, line } as never);
        const ok = addNativeChart(pptx, slide, e, box, p, k);
        if (!ok) {
          const img = chartImages.get(e.id);
          if (img) slide.addImage({ data: img, ...box, altText: e.alt || e.chart.title || undefined });
        }
        break;
      }
      case 'table':
        if (fill) slide.addShape(pptx.ShapeType.rect, { ...box, fill, line } as never);
        addTable(slide, e, box, p, k);
        break;
      default: {
        const st = e.style!;
        if (e.html?.includes('<table') && addNativeTable(slide, e, box, p, k)) break;
        const pad = (e.padding ?? 0) * MM_TO_IN * 72 * k;
        slide.addText(htmlToRuns(e.html ?? '') as never, {
          ...box,
          fontFace: resolveFont(st.fontFamily, p),
          fontSize: st.fontSize * k,
          color: col(st.color),
          bold: st.bold,
          italic: st.italic,
          underline: st.underline ? { style: 'sng' } : undefined,
          align: st.align,
          valign: 'top',
          lineSpacingMultiple: st.lineHeight,
          margin: [pad, pad, pad, pad],
          fill,
          line,
          rectRadius: e.radius ? Math.min(0.5, e.radius / Math.min(e.w, e.h)) : undefined,
          shape: e.radius ? pptx.ShapeType.roundRect : undefined,
          fit: 'none',
          paraSpaceAfter: 0,
        } as never);
      }
    }
  }
  return { pptx, k };
}

/** A table element as a real, editable PowerPoint table in the same style. */
function addTable(slide: any, e: PosterElement, box: { x: number; y: number; w: number; h: number }, p: Poster, k: number) {
  const t = normalizeTable(e.table);
  const pad = (e.padding ?? 0) * MM_TO_IN * k;
  const inner = { x: box.x + pad, y: box.y + pad, w: Math.max(0.1, box.w - 2 * pad), h: Math.max(0.1, box.h - 2 * pad) };
  const aligns = columnAlign(t);
  const fs = t.fontSize * k;
  // Cell margins in points (PptxGenJS reads values of 1 or more as points).
  const mv = Math.max(1, fs * CELL_PAD.v);
  const mh = Math.max(1, fs * CELL_PAD.h);
  const edge = (b: Border | null) => (b ? { type: 'solid', pt: Math.max(0.25, b.pt * k), color: hex(b.color) } : { type: 'none' });
  const rows = t.rows.map((row, r) =>
    row.map((text, c) => {
      const look = cellLook(t, p.palette, r, c);
      return {
        text,
        options: {
          fill: look.fill ? { color: hex(look.fill) } : undefined,
          color: hex(look.color),
          bold: look.bold,
          align: aligns[c],
          valign: 'middle',
          margin: [mv, mh, mv, mh],
          border: [edge(look.top), edge(look.right), edge(look.bottom), edge(look.left)],
        },
      };
    }),
  );
  const weights = columnWeights(t);
  const total = weights.reduce((a, b) => a + b, 0);
  slide.addTable(rows, {
    ...inner,
    colW: weights.map((w) => (w / total) * inner.w),
    rowH: inner.h / t.rows.length,
    fontFace: resolveFont('@body', p),
    fontSize: fs,
  });
}

/**
 * An equation as an SVG picture placed where it sits on the poster (inches).
 * PowerPoint draws the SVG as vectors; PptxGenJS adds a PNG copy for old
 * versions, made from the SVG's pixel size, so that is set to about 300 dpi.
 */
export function equationImage(e: PosterElement, p: Poster): { data: string; x: number; y: number; w: number; h: number } | null {
  const eq = e.equation;
  if (!eq) return null;
  const res = typesetLatex(eq.latex);
  if (!res.ok) return null;
  const bw = ((e.borderWidth ?? 0) * 96) / 72;
  const inset = (e.padding ?? 0) * MM_TO_PX + bw;
  const box = { x: e.x * MM_TO_PX + inset, y: e.y * MM_TO_PX + inset, w: e.w * MM_TO_PX - 2 * inset, h: e.h * MM_TO_PX - 2 * inset };
  const at = layoutEquation(res.render, eq.fontSize * PT_TO_PX, box, eq.align);
  if (at.w <= 0 || at.h <= 0) return null;
  const px = Math.min(300 / 96, 4000 / Math.max(at.w, at.h));
  const svg = mathSvg(res.render, resolveColor(eq.color, p.palette), at.w * px, at.h * px);
  const data = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  const toIn = 1 / 96;
  return { data, x: at.x * toIn, y: at.y * toIn, w: at.w * toIn, h: at.h * toIn };
}

/** Exports a text element holding an HTML table (e.g. imported from PowerPoint) as a real PowerPoint table. */
export function tableRowsFromHtml(html: string) {
  const root = document.createElement('div');
  root.innerHTML = cleanHtml(html);
  const table = root.querySelector('table');
  if (!table) return null;
  const widths = Array.from(table.querySelectorAll('col')).map((c) => parseFloat((c as HTMLElement).style.width) || 0);
  const rows = Array.from(table.rows).map((tr) =>
    Array.from(tr.cells).map((td) => {
      const s = td.style;
      const runs = htmlToRuns(td.innerHTML);
      return {
        text: runs as never,
        options: {
          fill: s.backgroundColor ? { color: cssColorToHex(s.backgroundColor) } : undefined,
          color: s.color ? cssColorToHex(s.color) : undefined,
          bold: s.fontWeight === 'bold' || Number(s.fontWeight) >= 600 ? true : undefined,
          fontSize: s.fontSize.endsWith('pt') ? parseFloat(s.fontSize) : undefined,
          align: (s.textAlign || undefined) as 'left' | 'center' | 'right' | 'justify' | undefined,
          valign: s.verticalAlign === 'middle' ? 'middle' : s.verticalAlign === 'bottom' ? 'bottom' : 'top',
          colspan: td.colSpan > 1 ? td.colSpan : undefined,
          rowspan: td.rowSpan > 1 ? td.rowSpan : undefined,
        },
      };
    }),
  );
  return { rows, widths };
}

function addNativeTable(slide: any, e: PosterElement, box: { x: number; y: number; w: number; h: number }, p: Poster, k: number): boolean {
  try {
    const t = tableRowsFromHtml(e.html ?? '');
    if (!t || !t.rows.length) return false;
    const st = e.style!;
    const total = t.widths.reduce((a, b) => a + b, 0);
    for (const row of t.rows) for (const c of row) if (c.options.fontSize) c.options.fontSize *= k;
    slide.addTable(t.rows, {
      ...box,
      colW: total ? t.widths.map((w) => (w / total) * box.w) : undefined,
      fontFace: resolveFont(st.fontFamily, p),
      fontSize: st.fontSize * k,
      color: hex(resolveColor(st.color, p.palette)),
      border: { type: 'solid', pt: 0.75, color: 'BFBFBF' },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * PowerPoint has no box plot chart, and pptxgenjs cannot add trend lines, so those
 * charts go in as a picture of the editor's chart instead of an editable chart.
 */
export function hasNativePptxChart(spec: ChartSpec): boolean {
  return spec.kind !== 'box' && !(spec.kind === 'scatter' && spec.trendline);
}

function addNativeChart(pptx: any, slide: any, e: PosterElement, box: object, p: Poster, k: number): boolean {
  const spec = e.chart!;
  if (!hasNativePptxChart(spec)) return false;
  try {
    const d = seriesData(spec);
    const textColor = hex(resolveColor('@text', p.palette));
    const colors = [p.palette.primary, p.palette.accent, p.palette.secondary, '#6b8e23', '#8e44ad', '#16a085', '#d35400', '#7f8c8d'].map(hex);
    const font = resolveFont('@body', p);
    const fs = spec.fontSize * k;
    let type;
    let data;
    const common: Record<string, unknown> = {
      ...box,
      showLegend: spec.showLegend,
      legendPos: 'b',
      legendFontSize: fs,
      legendFontFace: font,
      legendColor: textColor,
      showTitle: !!spec.title,
      title: spec.title,
      titleFontSize: fs * 1.25,
      titleFontFace: font,
      titleColor: textColor,
      catAxisLabelFontSize: fs,
      valAxisLabelFontSize: fs,
      catAxisLabelColor: textColor,
      valAxisLabelColor: textColor,
      catAxisLabelFontFace: font,
      valAxisLabelFontFace: font,
      showCatAxisTitle: !!spec.xLabel,
      catAxisTitle: spec.xLabel,
      showValAxisTitle: !!spec.yLabel,
      valAxisTitle: spec.yLabel,
      catAxisTitleFontSize: fs,
      valAxisTitleFontSize: fs,
      catAxisTitleColor: textColor,
      valAxisTitleColor: textColor,
      chartColors: colors,
    };
    const clean = (v: (number | null)[]) => v.map((x) => x ?? 0);
    switch (spec.kind) {
      case 'bar':
      case 'horizontalBar':
      case 'stackedBar':
        type = pptx.ChartType.bar;
        common.barDir = spec.kind === 'horizontalBar' ? 'bar' : 'col';
        if (spec.kind === 'stackedBar') {
          common.barGrouping = 'stacked';
          common.barGapWidthPct = 60;
        }
        data = d.series.map((s) => ({ name: s.name, labels: d.labels, values: clean(s.values) }));
        break;
      case 'histogram': {
        const h = histogramData(spec);
        type = pptx.ChartType.bar;
        common.barDir = 'col';
        common.barGapWidthPct = h.series.length > 1 ? 20 : 0;
        common.valAxisMinVal = 0;
        data = h.series.map((s) => ({ name: s.name, labels: h.labels, values: s.counts }));
        break;
      }
      case 'line':
        type = pptx.ChartType.line;
        data = d.series.map((s) => ({ name: s.name, labels: d.labels, values: clean(s.values) }));
        common.lineSize = 3;
        break;
      case 'pie':
      case 'doughnut':
        type = spec.kind === 'pie' ? pptx.ChartType.pie : pptx.ChartType.doughnut;
        data = [{ name: d.series[0]?.name ?? '', labels: d.labels, values: clean(d.series[0]?.values ?? []) }];
        common.showPercent = true;
        common.dataLabelColor = 'FFFFFF';
        common.dataLabelFontSize = fs;
        break;
      case 'scatter': {
        type = pptx.ChartType.scatter;
        const keep = d.xNumbers.map((x, i) => x != null && d.series.every((s) => s.values[i] != null));
        const pick = <T,>(arr: T[]) => arr.filter((_, i) => keep[i]);
        data = [{ name: 'X', values: pick(d.xNumbers) as number[] }, ...d.series.map((s) => ({ name: s.name, values: pick(s.values) as number[] }))];
        common.lineSize = 0;
        common.lineDataSymbolSize = 8;
        break;
      }
    }
    slide.addChart(type, data, common);
    return true;
  } catch (err) {
    console.warn('Native chart export failed, using image', err);
    return false;
  }
}

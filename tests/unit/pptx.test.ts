import { describe, expect, it, vi } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { importPptx } from '../../src/lib/pptxImport';
import { hasNativePptxChart, htmlToRuns } from '../../src/lib/exporters';
import { createPoster, makeElement, PALETTES } from '../../src/model';
import type { ChartSpec } from '../../src/types';

// 1x1 red PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

async function makeDeck() {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'P', width: 33.1, height: 46.8 }); // ~A0 portrait
  pptx.layout = 'P';
  pptx.theme = { headFontFace: 'Georgia', bodyFontFace: 'Verdana' };
  const s = pptx.addSlide();
  s.background = { color: 'F0F4FA' };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 33.1, h: 5, fill: { color: '123456' } });
  s.addText('Big Poster Title', { x: 1, y: 1, w: 31, h: 3, fontSize: 90, bold: true, color: 'FFFFFF', align: 'center' });
  s.addText([{ text: 'Plain then ' }, { text: 'bold', options: { bold: true } }], { x: 1, y: 6, w: 10, h: 4, fontSize: 28 });
  s.addImage({ data: PNG, x: 12, y: 6, w: 8, h: 6 });
  const buf = (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
  return new Blob([buf]);
}

describe('PowerPoint template import', () => {
  it('brings in size, background, shapes, text and images', async () => {
    const r = await importPptx(await makeDeck());
    expect(r.slideCount).toBe(1);
    expect(r.poster.width).toBeCloseTo(33.1 * 25.4, 0);
    expect(r.poster.height).toBeCloseTo(46.8 * 25.4, 0);
    expect(r.poster.palette.background).toBe('#f0f4fa');

    const els = r.poster.elements;
    const band = els.find((e) => e.type === 'shape');
    expect(band?.fill).toBe('#123456');
    expect(band!.w).toBeCloseTo(33.1 * 25.4, 0);

    const title = els.find((e) => e.html?.includes('Big Poster Title'));
    expect(title).toBeTruthy();
    expect(title!.style!.fontSize).toBe(90);
    expect(title!.style!.bold).toBe(true);
    expect(title!.style!.align).toBe('center');
    expect(title!.style!.color).toBe('#ffffff');

    const mixed = els.find((e) => e.html?.includes('Plain then'));
    expect(mixed!.html).toContain('<b>bold</b>');

    const img = els.find((e) => e.type === 'image');
    expect(img?.src?.startsWith('data:image/png;base64,')).toBe(true);
    expect(img!.x).toBeCloseTo(12 * 25.4, 0);
  });

  it('rejects files that are not presentations', async () => {
    await expect(importPptx(new Blob(['hello']))).rejects.toThrow();
  });
});

describe('editor HTML to PowerPoint text runs', () => {
  it('keeps bold, italic and line breaks', () => {
    const runs = htmlToRuns('Hello <b>bold</b> and <i>it</i><br>next<div>para</div>');
    expect(runs.map((r) => r.text).join('|')).toBe('Hello |bold| and |it|next|para');
    expect(runs.find((r) => r.text === 'bold')!.options.bold).toBe(true);
    expect(runs.find((r) => r.text === 'it')!.options.italic).toBe(true);
    expect(runs.find((r) => r.text === 'it')!.options.breakLine).toBe(true);
    expect(runs.find((r) => r.text === 'next')!.options.breakLine).toBe(true);
  });
  it('handles bullet lists and coloured spans', () => {
    const runs = htmlToRuns('<ul><li>one</li><li><span style="color: rgb(255, 0, 0)">two</span></li></ul>');
    expect(runs.map((r) => r.text).join('')).toBe('• one• two');
    expect(runs.find((r) => r.text === 'two')!.options.color).toBe('FF0000');
  });
  it('returns one empty run for empty text', () => {
    expect(htmlToRuns('')).toHaveLength(1);
  });
});

describe('PowerPoint export of the newer graph types', () => {
  async function exportWith(chart: Partial<ChartSpec>) {
    const { exportPptx } = await import('../../src/lib/exporters');
    const p = createPoster({ name: 'g', width: 210, height: 297, sizePreset: 'A4', columns: 2, palette: PALETTES[0], headingFont: 'Open Sans', bodyFont: 'Open Sans', template: 'blank' });
    const el = makeElement('chart', p, { id: 'c1' });
    const rows = [['A', '1', '4'], ['A', '2', '5'], ['B', '3', '9'], ['B', '7', '8']];
    el.chart = { kind: 'bar', title: 'G', columns: ['Group', 'X', 'Y'], rows, xColumn: 0, yColumns: [1, 2], rowStart: 0, rowEnd: 3, xLabel: '', yLabel: '', showLegend: true, fontSize: 12, ...chart };
    p.elements = [el];
    let out: ArrayBuffer | undefined;
    const spy = vi.spyOn(PptxGenJS.prototype, 'writeFile').mockImplementation(async function (this: PptxGenJS) {
      out = (await this.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
      return 'ok';
    });
    try {
      await exportPptx(p, new Map([['c1', PNG]]));
    } finally {
      spy.mockRestore();
    }
    const zip = await JSZip.loadAsync(out!);
    const charts = Object.keys(zip.files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f));
    const media = Object.keys(zip.files).filter((f) => f.startsWith('ppt/media/'));
    const xml = charts.length ? await zip.file(charts[0])!.async('string') : '';
    return { charts, media, xml };
  }

  it('keeps stacked bars as an editable stacked chart', async () => {
    const r = await exportWith({ kind: 'stackedBar' });
    expect(r.charts).toHaveLength(1);
    expect(r.xml).toContain('<c:grouping val="stacked"/>');
  });

  it('exports a histogram as an editable column chart of counts', async () => {
    const r = await exportWith({ kind: 'histogram', yColumns: [1], bins: 3 });
    expect(r.charts).toHaveLength(1);
    expect(r.xml).toContain('<c:barDir val="col"/>');
    expect(r.xml).toMatch(/1–3/);
  });

  it('falls back to a picture for box plots and trend lines', async () => {
    expect(hasNativePptxChart({ kind: 'box' } as ChartSpec)).toBe(false);
    expect(hasNativePptxChart({ kind: 'scatter', trendline: true } as ChartSpec)).toBe(false);
    expect(hasNativePptxChart({ kind: 'scatter' } as ChartSpec)).toBe(true);
    const r = await exportWith({ kind: 'box', boxGroups: 'category', yColumns: [2] });
    expect(r.charts).toHaveLength(0);
    expect(r.media.length).toBeGreaterThan(0);
  });
});

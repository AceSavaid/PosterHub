// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { parseColor } from '../../src/lib/pdf/color';
import { parseCssFont, PdfCanvasContext } from '../../src/lib/pdf/canvas2d';
import { FontRegistry, fontkit, fontsourceId, fontsourceUrl, weightCandidates, type Fetcher } from '../../src/lib/pdf/fonts';
import { Painter } from '../../src/lib/pdf/painter';
import { drawChart, drawText, jpegOrientation } from '../../src/lib/pdf/vectorPdf';
import { createPoster, PALETTES } from '../../src/model';
import type { ChartSpec, Poster } from '../../src/types';
import { fixture, inspectPdf, localFontsource, pdfText } from '../helpers/pdf';

const localFetcher: Fetcher = async (url) => localFontsource(url);
const italianaUrl = 'data:font/ttf;base64,' + Buffer.from(fixture('Italiana-Regular.ttf')).toString('base64');

async function setup(customFonts: Poster['customFonts'] = [], fetcher = localFetcher) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([600, 400]);
  const painter = new Painter(doc, page);
  painter.transform([0.75, 0, 0, -0.75, 0, 400]);
  const fonts = new FontRegistry(doc, { customFonts }, fetcher);
  const finish = async () => {
    painter.flush();
    return doc.save();
  };
  return { doc, page, painter, fonts, finish };
}

describe('colour parsing', () => {
  it('reads hex, rgb() and rgba()', () => {
    expect(parseColor('#ff0000')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseColor('#0f08')).toMatchObject({ r: 0, g: 1, b: 0 });
    expect(parseColor('#0f08')!.a).toBeCloseTo(0.533, 2);
    expect(parseColor('rgb(0, 0, 255)')).toEqual({ r: 0, g: 0, b: 1, a: 1 });
    expect(parseColor('rgba(128,128,128,0.25)')!.a).toBe(0.25);
    expect(parseColor('rgb(255 255 255 / 50%)')).toEqual({ r: 1, g: 1, b: 1, a: 0.5 });
    expect(parseColor('white')).toEqual({ r: 1, g: 1, b: 1, a: 1 });
  });
  it('treats transparent and empty as nothing to paint', () => {
    expect(parseColor('transparent')).toBeNull();
    expect(parseColor('')).toBeNull();
    expect(parseColor(undefined)).toBeNull();
    expect(parseColor('rgba(0,0,0,0)')).toBeNull();
  });
});

describe('CSS font strings', () => {
  it('parses Chart.js style font strings', () => {
    expect(parseCssFont('bold 21.33px "Open Sans", sans-serif')).toEqual({ family: 'Open Sans', size: 21.33, weight: 700, italic: false });
    expect(parseCssFont('italic 600 12px Lora')).toEqual({ family: 'Lora', size: 12, weight: 600, italic: true });
    expect(parseCssFont('16px sans-serif')).toEqual({ family: 'sans-serif', size: 16, weight: 400, italic: false });
  });
});

describe('font sources', () => {
  it('builds Fontsource URLs for Google families', () => {
    expect(fontsourceId('Source Sans 3')).toBe('source-sans-3');
    expect(fontsourceUrl('Open Sans', 'latin', 700, true)).toBe('https://cdn.jsdelivr.net/npm/@fontsource/open-sans@5/files/open-sans-latin-700-italic.woff');
  });
  it('tries the nearest weights first', () => {
    expect(weightCandidates(700)[0]).toBe(700);
    expect(weightCandidates(700).slice(1, 3).sort()).toEqual([600, 800]);
    expect(weightCandidates(400)[0]).toBe(400);
  });
});

describe('FontRegistry', () => {
  it('embeds uploaded fonts as real fonts', async () => {
    const { fonts } = await setup([{ family: 'Italiana', dataUrl: italianaUrl }]);
    await fonts.prepare('Italiana', 400, false, 'Hello');
    const [seg] = fonts.resolve('Italiana', 400, false, 'Hello');
    expect(seg.face.kind).toBe('embedded');
    expect(seg.face.family).toBe('Italiana');
    expect(seg.text).toBe('Hello');
    expect(seg.fakeBold).toBe(false);
  });

  it('synthesises bold for an uploaded font with only one weight', async () => {
    const { fonts } = await setup([{ family: 'Italiana', dataUrl: italianaUrl }]);
    await fonts.prepare('Italiana', 700, false, 'Bold');
    const [seg] = fonts.resolve('Italiana', 700, false, 'Bold');
    expect(seg.face.kind).toBe('embedded');
    expect(seg.fakeBold).toBe(true);
  });

  it('loads the real bold and italic files of a Google font', async () => {
    const { fonts } = await setup();
    await fonts.prepare('Open Sans', 700, false, 'Bold');
    await fonts.prepare('Open Sans', 400, true, 'Italic');
    const bold = fonts.resolve('Open Sans', 700, false, 'Bold')[0];
    const ital = fonts.resolve('Open Sans', 400, true, 'Italic')[0];
    expect(bold.face).toMatchObject({ kind: 'embedded', weight: 700, italic: false });
    expect(bold.fakeBold).toBe(false);
    expect(ital.face).toMatchObject({ kind: 'embedded', weight: 400, italic: true });
    expect(ital.fakeItalic).toBe(false);
  });

  it('fetches extra character sets (Greek) only when needed', async () => {
    const requested: string[] = [];
    const { fonts } = await setup([], async (url) => {
      requested.push(url);
      return localFontsource(url);
    });
    await fonts.prepare('Open Sans', 400, false, 'plain text');
    expect(requested.filter((u) => u.includes('open-sans'))).toEqual([fontsourceUrl('Open Sans', 'latin', 400, false)]);
    await fonts.prepare('Open Sans', 400, false, 'p = 0.05, αβγ');
    expect(requested).toContain(fontsourceUrl('Open Sans', 'greek', 400, false));
    const segs = fonts.resolve('Open Sans', 400, false, 'p αβ');
    expect(segs.map((s) => s.text)).toEqual(['p ', 'αβ']);
    expect(segs.every((s) => s.face.kind === 'embedded')).toBe(true);
  });

  it('uses metric-compatible open fonts for system fonts', async () => {
    const requested: string[] = [];
    const { fonts } = await setup([], async (url) => {
      requested.push(url);
      return null;
    });
    await fonts.prepare('Arial', 400, false, 'Hi');
    expect(requested[0]).toBe(fontsourceUrl('Arimo', 'latin', 400, false));
    // Offline: falls back to the PDF's built-in Helvetica.
    const [seg] = fonts.resolve('Arial', 400, false, 'Hi');
    expect(seg.face.kind).toBe('standard');
  });

  it('replaces characters no font can draw instead of failing', async () => {
    const { fonts } = await setup([], async () => null);
    await fonts.prepare('Nope', 400, false, 'a☃');
    const segs = fonts.resolve('Nope', 400, false, 'a☃');
    expect(segs.map((s) => s.text).join('')).toBe('a?');
  });

  it('draws WOFF2-only fonts as vector outlines', async () => {
    const woff2 = localFontsource(fontsourceUrl('Open Sans', 'latin', 400, false).replace(/\.woff$/, '.woff2'))!;
    const url = 'data:font/woff2;base64,' + Buffer.from(woff2).toString('base64');
    const { fonts, painter, finish } = await setup([{ family: 'Webfont', dataUrl: url }]);
    await fonts.prepare('Webfont', 400, false, 'Outlined');
    const segs = fonts.resolve('Webfont', 400, false, 'Outlined');
    expect(segs[0].face.kind).toBe('outline');
    painter.textSegment(segs[0], 30, { r: 0, g: 0, b: 0, a: 1 }, [1, 0, 0, -1, 20, 60]);
    const bytes = await finish();
    // Still searchable thanks to the invisible text layer.
    expect(await pdfText(bytes)).toContain('Outlined');
  });
});

describe('text drawing', () => {
  it('writes searchable text with embedded fonts, including underlines', async () => {
    const { fonts, painter, finish } = await setup();
    const base = { top: 10, height: 30, size: 22, color: 'rgb(20, 30, 40)', underline: false, strike: false, italic: false };
    const pieces = [
      { ...base, text: 'Sleep', x: 10, width: 60, family: 'Open Sans', weight: 400 },
      { ...base, text: 'quality', x: 76, width: 75, family: 'Open Sans', weight: 700, underline: true },
      { ...base, text: 'improved', x: 157, width: 95, family: 'Montserrat', weight: 400, italic: true },
    ];
    for (const p of pieces) await fonts.prepare(p.family, p.weight, p.italic, p.text);
    const opsBefore = painter.ops.length;
    drawText(painter, fonts, pieces);
    expect(painter.ops.length).toBeGreaterThan(opsBefore);
    const bytes = await finish();
    expect(await pdfText(bytes)).toMatch(/Sleep\s*quality\s*improved/);
    const info = await inspectPdf(bytes);
    expect(info.images).toHaveLength(0);
    expect(info.fonts.length).toBeGreaterThanOrEqual(3);
    expect(info.fonts.every((f) => f.embedded)).toBe(true);
    expect(info.fonts.map((f) => f.name).join(' ')).toMatch(/OpenSans-Bold/);
    expect(info.fonts.map((f) => f.name).join(' ')).toMatch(/Montserrat-Italic/);
  });
});

describe('vector charts', () => {
  const spec: ChartSpec = {
    kind: 'bar',
    title: 'Mean score',
    columns: ['Group', 'Score'],
    rows: [
      ['Control', '12'],
      ['Treatment', '18'],
    ],
    xColumn: 0,
    yColumns: [1],
    rowStart: 0,
    rowEnd: 1,
    xLabel: 'Condition',
    yLabel: 'Points',
    showLegend: true,
    fontSize: 12,
  };

  for (const kind of ['bar', 'horizontalBar', 'line', 'scatter', 'pie', 'doughnut'] as const) {
    it(`draws a ${kind} chart as shapes and text, not a picture`, async () => {
      const poster = createPoster({ name: 'c', width: 210, height: 297, sizePreset: 'A4', columns: 2, palette: PALETTES[0], headingFont: 'Open Sans', bodyFont: 'Open Sans', template: 'blank' });
      const { fonts, painter, finish } = await setup();
      const s = kind === 'scatter' ? { ...spec, columns: ['Dose', 'Score'], rows: [['1', '12'], ['2', '18']] } : { ...spec, kind };
      await fonts.prepare('Open Sans', 400, false, 'Mean score Control Treatment Condition Points Score 0123456789.');
      await fonts.prepare('Open Sans', 700, false, 'Mean score');
      drawChart(painter, fonts, { id: 'x', type: 'chart', x: 0, y: 0, w: 100, h: 80, chart: { ...s, kind } }, poster, 20, 20, 500, 400);
      const bytes = await finish();
      const text = await pdfText(bytes);
      expect(text).toContain('Mean score');
      if (kind !== 'scatter') expect(text).toContain('Control');
      if (kind === 'bar') {
        expect(text).toContain('Condition');
        expect(text).toContain('Points');
      }
      expect((await inspectPdf(bytes)).images).toHaveLength(0);
    });
  }
});

describe('canvas geometry', () => {
  it('approximates arcs with curves that end in the right place', async () => {
    const { painter, fonts } = await setup();
    const ctx = new PdfCanvasContext(painter, fonts, [1, 0, 0, 1, 100, 50], 10, 10);
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI / 2);
    ctx.fillStyle = '#000';
    ctx.fill();
    const curve = painter.ops.map(String).filter((o) => o.endsWith(' c'));
    expect(curve).toHaveLength(1);
    expect(curve[0].split(' ').slice(4, 6).map(Number)).toEqual([100, 60]);
  });

  it('applies transforms and line dashes', async () => {
    const { painter, fonts } = await setup();
    const ctx = new PdfCanvasContext(painter, fonts, [1, 0, 0, 1, 0, 0], 10, 10);
    ctx.scale(2, 2);
    ctx.translate(5, 5);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(10, 0);
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,0,0,0.5)';
    ctx.stroke();
    const ops = painter.ops.map(String);
    expect(ops).toContain('10 10 m');
    expect(ops).toContain('30 10 l');
    expect(ops).toContain('3 w');
    expect(ops.find((o) => o.endsWith(' d'))?.replace(/\s+/g, ' ')).toBe('[ 4 6 ] 0 d');
    expect(ops.some((o) => o.endsWith(' gs'))).toBe(true); // 50% alpha
  });
});

describe('JPEG orientation', () => {
  it('reads the EXIF orientation tag', () => {
    // SOI, APP1 "Exif\0\0", big-endian TIFF header, one IFD entry: Orientation = 6
    const tiff = [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0];
    const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    const len = app1.length + 2;
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...app1, 0xff, 0xda, 0, 2]);
    expect(jpegOrientation(jpeg)).toBe(6);
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBe(1);
  });
});

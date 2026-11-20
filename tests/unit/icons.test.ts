import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import {
  ICON_CATEGORIES,
  ICONS,
  TINT_OPACITY,
  hasSecondTone,
  iconArt,
  iconColors,
  iconInfo,
  iconSvg,
  layoutIcon,
  loadIcons,
  parseIconSvg,
  pathPaint,
  searchIcons,
} from '../../src/lib/icons/library';
import { buildVectorPdf } from '../../src/lib/pdf/vectorPdf';
import { iconImage } from '../../src/lib/exporters';
import { sanitizeElement, sanitizePoster } from '../../src/lib/sanitize';
import { elementLabel } from '../../src/lib/a11y';
import { posterColors, replaceColor } from '../../src/lib/printColor';
import { checkPoster } from '../../src/lib/checks';
import { MM_TO_PX, PALETTES, createPoster, makeElement } from '../../src/model';
import type { Poster, PosterElement } from '../../src/types';
import { inspectPdf, pageContent } from '../helpers/pdf';

const ROOT = path.resolve(__dirname, '../..');

beforeAll(async () => {
  await loadIcons();
});

function a4(): Poster {
  const p = createPoster({ name: 'Icons', width: 210, height: 297, sizePreset: 'A4', columns: 2, palette: PALETTES[0], headingFont: 'Open Sans', bodyFont: 'Open Sans', template: 'blank' });
  p.elements = [];
  return p;
}
const fakeNode = (p: Poster) => ({ getBoundingClientRect: () => ({ left: 0, top: 0, width: p.width * MM_TO_PX }), querySelector: () => null }) as unknown as HTMLElement;
const icon = (p: Poster, id = 'phosphor/flask', extra: Partial<PosterElement> = {}) => makeElement('icon', p, { id: 'i1', x: 20, y: 30, w: 40, h: 40, icon: { id, color: '@primary' }, ...extra });

describe('the bundled icon library', () => {
  it('has a good number of science icons with unique ids in every category', () => {
    expect(ICONS.length).toBeGreaterThanOrEqual(150);
    expect(new Set(ICONS.map((i) => i.id)).size).toBe(ICONS.length);
    for (const c of ICON_CATEGORIES) expect(ICONS.filter((i) => i.category === c.id).length, c.id).toBeGreaterThanOrEqual(8);
    for (const i of ICONS) expect(i.category, i.id).toMatch(new RegExp(ICON_CATEGORIES.map((c) => c.id).join('|')));
  });

  it('includes the kinds of picture researchers ask for', () => {
    for (const id of ['health/cell-nuclei', 'health/dna', 'health/bacteria', 'health/antibody', 'phosphor/atom', 'phosphor/flask', 'health/microscope', 'health/test-tubes', 'health/animal-rat', 'health/person', 'phosphor/chart-bar'])
      expect(iconInfo(id), id).toBeDefined();
  });

  it('has artwork for every icon, made only of filled paths', () => {
    for (const i of ICONS) {
      const art = iconArt(i.id);
      expect(art, i.id).toBeDefined();
      expect(art!.paths.length).toBeGreaterThan(0);
      for (const p of art!.paths) expect(p.d).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9\s,.\-e]+$/);
    }
  });

  it('ships each source with its licence and only free licences (CC0, MIT)', () => {
    const dir = path.join(ROOT, 'src/assets/icons');
    const sources = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isDirectory());
    expect(sources.sort()).toEqual(['health', 'phosphor']);
    expect(fs.readFileSync(path.join(dir, 'health/LICENSE'), 'utf8')).toMatch(/CC0 1\.0/);
    expect(fs.readFileSync(path.join(dir, 'phosphor/LICENSE'), 'utf8')).toMatch(/MIT License/);
    for (const s of sources) {
      for (const f of fs.readdirSync(path.join(dir, s)).filter((f) => f.endsWith('.svg'))) {
        const svg = fs.readFileSync(path.join(dir, s, f), 'utf8');
        expect(svg, f).not.toMatch(/<(script|image|use|foreignObject|style|a)\b|on\w+=|href/i);
        expect(svg.replace(/<path [^>]*\/>/g, '').replace(/<svg [^>]*>|<\/svg>/g, '').trim(), f).toBe('');
      }
    }
  });

  it('marks Phosphor duotone shading as the second tone', () => {
    expect(hasSecondTone(iconArt('phosphor/flask'))).toBe(true);
    expect(hasSecondTone(iconArt('health/dna'))).toBe(false);
    expect(iconArt('health/dna')!.paths[0].evenOdd).toBe(true);
  });

  it('returns nothing for ids that are not in the library', () => {
    expect(iconArt('health/not-an-icon')).toBeUndefined();
    expect(iconInfo('../etc/passwd')).toBeUndefined();
    expect(parseIconSvg('<svg><path d="M0 0"/></svg>')).toBeNull(); // no viewBox
  });
});

describe('searching icons', () => {
  const ids = (q: string, c?: Parameters<typeof searchIcons>[1]) => searchIcons(q, c).map((i) => i.id);

  it('lists everything (or a whole category) with no search words', () => {
    expect(searchIcons('').length).toBe(ICONS.length);
    expect(searchIcons('  ', 'lab').every((i) => i.category === 'lab')).toBe(true);
  });

  it('puts icons whose name starts with the word first', () => {
    expect(ids('flask')[0]).toBe('phosphor/flask');
    expect(ids('microscope').slice(0, 3)).toContain('health/microscope');
  });

  it('finds icons by search words and common research terms', () => {
    expect(ids('mouse')).toContain('health/animal-rat');
    expect(ids('genetics')).toEqual(expect.arrayContaining(['health/dna', 'phosphor/dna']));
    expect(ids('neuroscience')).toContain('phosphor/brain');
  });

  it('handles plurals, capitals and accents, and needs every word to match', () => {
    expect(ids('Cells')).toContain('health/blood-cells');
    expect(ids('bactéria')).toContain('health/bacteria');
    expect(ids('blood cells')[0]).toBe('health/blood-cells');
    expect(ids('flask zebra')).toEqual([]);
  });

  it('can be narrowed to a category', () => {
    expect(ids('chart', 'data').length).toBeGreaterThan(3);
    expect(ids('flask', 'people')).toEqual([]);
  });
});

describe('colours and layout', () => {
  const pal = PALETTES[0];

  it('follows the palette roles', () => {
    const c = iconColors({ color: '@primary', color2: '@accent' }, pal);
    expect(c).toEqual({ main: pal.primary, second: pal.accent });
    expect(iconColors({ color: '#123456' }, pal)).toEqual({ main: '#123456', second: null });
  });

  it('shades the second tone with a pale tint unless a colour is chosen', () => {
    const tone2 = { d: 'M0 0', evenOdd: false, tone: 2 as const };
    expect(pathPaint(tone2, { main: '#111111', second: null })).toEqual({ fill: '#111111', opacity: TINT_OPACITY });
    expect(pathPaint(tone2, { main: '#111111', second: '#ff0000' })).toEqual({ fill: '#ff0000', opacity: 1 });
    expect(pathPaint({ ...tone2, tone: 1 }, { main: '#111111', second: '#ff0000' })).toEqual({ fill: '#111111', opacity: 1 });
  });

  it('fits the artwork inside its box, centred, keeping its shape', () => {
    const art = { viewBox: [0, 0, 48, 48] as [number, number, number, number], paths: [] };
    expect(layoutIcon(art, { x: 10, y: 0, w: 200, h: 100 })).toEqual({ x: 60, y: 0, w: 100, h: 100, scale: 100 / 48 });
  });

  it('builds a clean standalone SVG in the chosen colours', () => {
    const svg = iconSvg(iconArt('phosphor/flask')!, { main: '#1f4e79', second: null }, 300, 300);
    expect(svg).toContain('fill="#1f4e79"');
    expect(svg).toContain(`fill-opacity="${TINT_OPACITY}"`);
    expect(svg).toContain('width="300"');
    expect(new DOMParser().parseFromString(svg, 'image/svg+xml').getElementsByTagName('parsererror')).toHaveLength(0);
    // A hostile colour string can't break out of the attribute.
    expect(iconSvg(iconArt('health/dna')!, { main: '"/><script>x</script>', second: null })).not.toContain('<script');
  });
});

describe('icon elements', () => {
  it('are square and use the primary colour by default', () => {
    const el = makeElement('icon', a4());
    expect(el.w).toBeCloseTo(el.h);
    expect(el.icon?.color).toBe('@primary');
    expect(iconInfo(el.icon!.id)).toBeDefined();
  });

  it('are named for screen readers by their alt text or icon name', () => {
    const p = a4();
    expect(elementLabel(icon(p, 'health/animal-rat'))).toBe('Icon: Rat / mouse');
    expect(elementLabel(icon(p, 'health/animal-rat', { alt: 'Mouse model' }))).toBe('Icon: Mouse model');
    expect(elementLabel(icon(p, 'nope/missing'))).toBe('Icon');
  });

  it('are cleaned when opened from a file', () => {
    const bad = { id: 'x', type: 'icon', x: 0, y: 0, w: 10, h: 10, icon: { id: 'phosphor/flask', color: 'red;}</style><script>', color2: 'url(https://evil)', extra: 1 } } as unknown as PosterElement;
    expect(sanitizeElement(bad).icon).toEqual({ id: 'phosphor/flask', color: '@primary' });
    const ok = { id: 'y', type: 'icon', x: 0, y: 0, w: 10, h: 10, icon: { id: 'health/dna', color: '#AABBCC', color2: '@accent' } } as PosterElement;
    expect(sanitizeElement(ok).icon).toEqual({ id: 'health/dna', color: '#AABBCC', color2: '@accent' });
    const path = { id: 'z', type: 'icon', x: 0, y: 0, w: 10, h: 10, icon: { id: '../../x', color: '@primary' } } as PosterElement;
    expect(sanitizeElement(path).icon).toBeUndefined();
    const p = a4();
    p.elements = [bad];
    expect(sanitizePoster(p).elements[0].icon?.color).toBe('@primary');
  });

  it('take part in the print colour check and its one-click fix', () => {
    const p = a4();
    p.elements = [icon(p, 'phosphor/flask', { icon: { id: 'phosphor/flask', color: '#00ff00', color2: '#00ff00' } })];
    expect(posterColors(p).find((u) => u.hex === '#00ff00')?.elementIds).toEqual(['i1']);
    const fixed = replaceColor(p, '#00ff00', '#2e8b57');
    expect(fixed.elements[0].icon).toMatchObject({ color: '#2e8b57', color2: '#2e8b57' });
    expect(checkPoster(fixed).some((i) => i.id.startsWith('cmyk-'))).toBe(false);
  });
});

describe('exporting icons', () => {
  it('draws icons as vector paths in the palette colour in the PDF', async () => {
    const p = a4();
    p.elements = [icon(p, 'health/dna'), icon(p, 'phosphor/flask', { id: 'i2', x: 100 })];
    const { bytes, warnings } = await buildVectorPdf(fakeNode(p), p);
    expect(warnings).toEqual([]);
    const content = await pageContent(bytes);
    expect(content).toMatch(/0\.1216 0\.3059 0\.4745 rg/); // Academic Blue primary #1f4e79
    expect(content).toMatch(/^f\*$/m); // Health Icons use even-odd fills
    expect((content.match(/ c$/gm) ?? []).length).toBeGreaterThan(20); // curves, not a picture
    expect((await inspectPdf(bytes)).images).toEqual([]);
  });

  it('draws the second tone see-through (the pale tint) in the PDF', async () => {
    const p = a4();
    p.elements = [icon(p, 'phosphor/flask')];
    const { bytes } = await buildVectorPdf(fakeNode(p), p);
    const doc = await (await import('pdf-lib')).PDFDocument.load(bytes);
    const gs = doc.getPage(0).node.Resources()?.toString() ?? '';
    expect(gs).toMatch(/ExtGState/);
    expect(await pageContent(bytes)).toMatch(/^\/GS[-\w]* gs$/m);
  });

  it('warns and leaves out an icon that is not in the library', async () => {
    const p = a4();
    p.elements = [icon(p, 'health/from-a-newer-version')];
    const { warnings } = await buildVectorPdf(fakeNode(p), p);
    expect(warnings.join(' ')).toMatch(/icon was not found/);
  });

  it('makes a sharp SVG picture for PowerPoint, placed inside the box', () => {
    const p = a4();
    const el = icon(p, 'phosphor/atom', { w: 80, h: 40, padding: 2 });
    const img = iconImage(el, p)!;
    expect(img.data).toMatch(/^data:image\/svg\+xml;base64,/);
    const svg = atob(img.data.split(',')[1]);
    expect(svg).toContain(`fill="${p.palette.primary}"`);
    // 36 mm square, centred in the 76 × 36 mm content area.
    const mmToIn = 1 / 25.4;
    expect(img.h).toBeCloseTo(36 * mmToIn, 3);
    expect(img.w).toBeCloseTo(36 * mmToIn, 3);
    expect(img.x).toBeCloseTo((20 + 2 + 20) * mmToIn, 3);
    expect(iconImage(icon(p, 'health/missing'), p)).toBeNull();
  });

  it('adds icons to the PowerPoint slide as SVG pictures with alt text', async () => {
    const { exportPptx } = await import('../../src/lib/exporters');
    const p = a4();
    p.elements = [icon(p, 'health/animal-rat')];
    let out: ArrayBuffer | undefined;
    const spy = vi.spyOn(PptxGenJS.prototype, 'writeFile').mockImplementation(async function (this: PptxGenJS) {
      out = (await this.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
      return 'ok';
    });
    try {
      await exportPptx(p, new Map());
    } finally {
      spy.mockRestore();
    }
    const zip = await JSZip.loadAsync(out!);
    const media = Object.keys(zip.files).filter((f) => f.startsWith('ppt/media/'));
    expect(media.some((f) => f.endsWith('.svg'))).toBe(true);
    const slide = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(slide).toContain('descr="Rat / mouse"');
  });
});

describe('icon names', () => {
  it('are unique, so screen readers and the grid never show two icons with the same name', () => {
    const labels = ICONS.map((i) => i.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
  });
});

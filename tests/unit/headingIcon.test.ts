import { beforeAll, describe, expect, it, vi } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { loadIcons } from '../../src/lib/icons/library';
import { HEADING_ICON_EM, HEADING_ICON_GAP_EM, canHaveHeadingIcon, headingIconLayout, headingIconSpec } from '../../src/lib/headingIcon';
import { buildVectorPdf } from '../../src/lib/pdf/vectorPdf';
import { headingIconImage } from '../../src/lib/exporters';
import { sanitizeElement } from '../../src/lib/sanitize';
import { posterColors, replaceColor } from '../../src/lib/printColor';
import { applyLayout } from '../../src/lib/relayout';
import { MM_TO_PX, PALETTES, createPoster, makeElement } from '../../src/model';
import type { Poster, PosterElement } from '../../src/types';
import { pageContent } from '../helpers/pdf';

beforeAll(async () => {
  if (!globalThis.CSS) vi.stubGlobal('CSS', { escape: (s: string) => s });
  await loadIcons();
});

const PT = 96 / 72;

function a4(template: Parameters<typeof createPoster>[0]['template'] = 'blank'): Poster {
  const p = createPoster({ name: 'Heading icons', width: 210, height: 297, sizePreset: 'A4', columns: 2, palette: PALETTES[0], headingFont: 'Open Sans', bodyFont: 'Open Sans', template });
  if (template === 'blank') p.elements = [];
  return p;
}
const fakeNode = (p: Poster) => ({ getBoundingClientRect: () => ({ left: 0, top: 0, width: p.width * MM_TO_PX }), querySelector: () => null }) as unknown as HTMLElement;

function heading(p: Poster, extra: Partial<PosterElement> = {}): PosterElement {
  const h = makeElement('heading', p, { id: 'h1', x: 20, y: 30, w: 100, h: 20, html: 'Methods', headingIcon: { id: 'health/microscope' }, ...extra });
  h.style = { ...h.style!, fontSize: 30, lineHeight: 1.2, align: 'left', color: '@primary' };
  return h;
}

describe('where a heading icon goes', () => {
  it('only headings take one', () => {
    expect(canHaveHeadingIcon({ type: 'heading' })).toBe(true);
    for (const type of ['text', 'title', 'icon', 'image'] as const) expect(canHaveHeadingIcon({ type })).toBe(false);
    const p = a4();
    const text = makeElement('text', p, { headingIcon: { id: 'health/dna' } });
    expect(headingIconLayout(text)).toBeNull();
    expect(headingIconLayout(heading(p, { headingIcon: undefined }))).toBeNull();
  });

  it('is sized from the font, sits against the right edge and is centred on the first line', () => {
    const p = a4();
    const h = heading(p);
    const at = headingIconLayout(h)!;
    const font = 30 * PT;
    expect(at.size).toBeCloseTo(font * HEADING_ICON_EM, 5);
    expect(at.x + at.size).toBeCloseTo(100 * MM_TO_PX, 5); // flush with the right edge
    expect(at.y + at.size / 2).toBeCloseTo((font * 1.2) / 2, 5); // middle of line one
    expect(at.reserve).toBeCloseTo(at.size + font * HEADING_ICON_GAP_EM, 5);
    expect(at.reserveLeft).toBe(0);
  });

  it('follows the text size, so a bigger heading gets a bigger icon', () => {
    const p = a4();
    const small = headingIconLayout(heading(p))!;
    const big = heading(p, { h: 40 });
    big.style!.fontSize = 60;
    expect(headingIconLayout(big)!.size).toBeCloseTo(small.size * 2, 5);
  });

  it('keeps inside the border and padding', () => {
    const p = a4();
    const at = headingIconLayout(heading(p, { padding: 3, borderWidth: 3 }))!;
    const inside = 100 * MM_TO_PX - 2 * (3 * MM_TO_PX + 4);
    expect(at.x + at.size).toBeCloseTo(inside, 5);
  });

  it('keeps centred headings centred by leaving the same room on both sides', () => {
    const p = a4();
    const h = heading(p);
    h.style!.align = 'center';
    const at = headingIconLayout(h)!;
    expect(at.reserveLeft).toBeCloseTo(at.reserve, 5);
  });

  it('never grows taller than a line or wider than a third of a narrow box', () => {
    const p = a4();
    const tight = heading(p);
    tight.style!.lineHeight = 0.9;
    expect(headingIconLayout(tight)!.size).toBeCloseTo(30 * PT, 5);
    const narrow = heading(p, { w: 15 });
    expect(headingIconLayout(narrow)!.size).toBeCloseTo((15 * MM_TO_PX) / 3, 5);
  });

  it('uses the heading text colour unless it has its own', () => {
    const p = a4();
    expect(headingIconSpec(heading(p))).toEqual({ color: '@primary' });
    expect(headingIconSpec(heading(p, { headingIcon: { id: 'health/dna', color: '@accent', color2: '#ff0000' } }))).toEqual({ color: '@accent', color2: '#ff0000' });
  });
});

describe('heading icons in files', () => {
  it('are cleaned when a poster file is opened', () => {
    const p = a4();
    const ok = sanitizeElement(heading(p, { headingIcon: { id: 'phosphor/flask', color: 'url(https://evil)', color2: '#123456' } }));
    expect(ok.headingIcon).toEqual({ id: 'phosphor/flask', color2: '#123456' });
    const bad = sanitizeElement(heading(p, { headingIcon: { id: '../../x<script>' } }));
    expect(bad.headingIcon).toBeUndefined();
    const junk = sanitizeElement(heading(p, { headingIcon: 'health/dna' as never }));
    expect(junk.headingIcon).toBeUndefined();
  });

  it('take part in the print colour check and its fix', () => {
    const p = a4();
    p.elements = [heading(p, { headingIcon: { id: 'phosphor/flask', color: '#00ff00' } })];
    expect(posterColors(p).find((u) => u.hex === '#00ff00')?.elementIds).toEqual(['h1']);
    expect(replaceColor(p, '#00ff00', '#2e8b57').elements[0].headingIcon).toMatchObject({ id: 'phosphor/flask', color: '#2e8b57' });
  });

  it('move with their section when the layout is changed', () => {
    const p = a4('classic');
    const methods = p.elements.find((e) => e.type === 'heading' && /method/i.test(e.html ?? ''));
    expect(methods).toBeDefined();
    methods!.headingIcon = { id: 'health/microscope' };
    const { elements } = applyLayout(p, 'boxed');
    const moved = elements.filter((e) => e.headingIcon);
    expect(moved).toHaveLength(1);
    expect(moved[0].html).toMatch(/method/i);
    expect(moved[0].headingIcon).toEqual({ id: 'health/microscope' });
  });
});

describe('exporting heading icons', () => {
  it('draws the icon as vector paths in the PDF, in the heading colour', async () => {
    const p = a4();
    p.palette = { ...p.palette, primary: '#ff0000' };
    p.elements = [heading(p)];
    const { bytes, warnings } = await buildVectorPdf(fakeNode(p), p);
    expect(warnings).toEqual([]);
    const content = await pageContent(bytes);
    expect(content).toMatch(/^1 0 0 rg$/m);
    expect((content.match(/ c$/gm) ?? []).length).toBeGreaterThan(10);
  });

  it('warns when the icon is not in the library', async () => {
    const p = a4();
    p.elements = [heading(p, { headingIcon: { id: 'health/from-the-future' } })];
    const { warnings } = await buildVectorPdf(fakeNode(p), p);
    expect(warnings.join(' ')).toMatch(/heading icon was not found/);
  });

  it('places the PowerPoint picture at the right-hand end of the heading', () => {
    const p = a4();
    const h = heading(p, { padding: 2 });
    const img = headingIconImage(h, p)!;
    const at = headingIconLayout(h)!;
    const toIn = 1 / 96;
    expect(img.data).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(atob(img.data.split(',')[1])).toContain(`fill="${p.palette.primary}"`);
    // Square artwork fills the square exactly; its right edge meets the padding.
    expect(img.x + img.w).toBeCloseTo((20 * MM_TO_PX + 2 * MM_TO_PX + at.x + at.size) * toIn, 3);
    expect(img.w).toBeLessThanOrEqual(at.size * toIn + 1e-6);
    expect(headingIconImage(heading(p, { headingIcon: undefined }), p)).toBeNull();
  });

  it('adds the icon to the slide and keeps the text clear of it', async () => {
    const { exportPptx } = await import('../../src/lib/exporters');
    const p = a4();
    p.elements = [heading(p)];
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
    expect(Object.keys(zip.files).some((f) => f.startsWith('ppt/media/') && f.endsWith('.svg'))).toBe(true);
    const slide = await zip.file('ppt/slides/slide1.xml')!.async('string');
    const rIns = Number(/rIns="(\d+)"/.exec(slide)?.[1]);
    const lIns = Number(/lIns="(\d+)"/.exec(slide)?.[1]);
    expect(rIns).toBeGreaterThan(lIns); // room on the right for the icon
  });
});

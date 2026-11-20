import { beforeEach, describe, expect, it } from 'vitest';
import { PALETTES, createPoster, makeElement } from '../../src/model';
import type { Poster } from '../../src/types';
import { PLACEHOLDER_TEXT } from '../../src/lib/checks';
import { htmlToText } from '../../src/lib/sanitize';
import {
  deleteTemplate,
  exampleText,
  importTemplateText,
  isLikelyLogo,
  listTemplates,
  memoryTemplateStore,
  parseTemplateText,
  posterFromTemplate,
  posterToTemplate,
  renameTemplate,
  saveAsTemplate,
  setTemplateStore,
  templateFileName,
  templateToText,
  uniqueName,
} from '../../src/lib/userTemplates';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** A filled-in poster: real title, body text, a figure, a logo, a graph, a table, an equation, references and notes. */
function filledPoster(): Poster {
  const p = createPoster({ name: 'Sleep study', width: 841, height: 1189, sizePreset: 'A0', columns: 3, palette: PALETTES[2], template: 'boxed', headingFont: 'Lora', bodyFont: 'Lato' });
  p.backgroundImage = PNG;
  p.margin = 31;
  for (const e of p.elements) {
    if (e.type === 'title') e.html = 'Sleep spindles predict overnight memory gains in older adults';
    else if (e.type === 'text' && !e.refList && !e.role?.startsWith('qr')) e.html = '<p>We recorded 42 participants over two nights and found that spindle density predicts recall.</p>';
    else if (e.type === 'image' && e.placeholder === 'Logo') e.src = PNG;
    else if (e.type === 'image' && e.placeholder !== 'QR code') {
      e.src = PNG;
      e.alt = 'Spindle density by age group';
    }
  }
  p.elements.push(
    makeElement('chart', p, { x: 50, y: 600, w: 200, h: 150, chart: { kind: 'bar', title: 'Recall', columns: ['Age', 'Night 1', 'Night 2'], rows: [['60', '3', '4'], ['70', '2', '3']], xColumn: 0, yColumns: [1, 2], rowStart: 0, rowEnd: 1, xLabel: 'Age', yLabel: 'Words', showLegend: true, fontSize: 24 } }),
    makeElement('table', p, { x: 300, y: 600, w: 200, h: 80, table: { rows: [['Group', 'n'], ['Young', '21'], ['Old', '21']], headerRow: true, style: 'academic', fontSize: 24, align: 'auto' } }),
    makeElement('equation', p, { x: 550, y: 600, w: 200, h: 40, equation: { latex: 'S = \\frac{n}{t}', fontSize: 30, color: '@text', align: 'center' } }),
  );
  p.references = [{ id: 'r1', kind: 'article', authors: [{ family: 'Walker', given: 'M' }], title: 'Sleep and memory', year: '2017' }];
  p.notes = [{ id: 'n1', x: 10, y: 10, text: 'Shorten this', author: 'Supervisor', createdAt: 1, resolved: false }];
  p.ignoredWords = ['spindle'];
  p.thumbnail = PNG;
  return p;
}

const allText = (p: Poster) => p.elements.map((e) => htmlToText(e.html ?? '')).join(' ');

describe('turning a poster into a template', () => {
  it('keeps the look: size, grid, colours, fonts, background and every element position and role', () => {
    const p = filledPoster();
    const t = posterToTemplate(p, 'Lab template');
    expect(t.name).toBe('Lab template');
    const q = t.poster;
    expect([q.width, q.height, q.columns, q.margin, q.gutter]).toEqual([p.width, p.height, p.columns, p.margin, p.gutter]);
    expect(q.palette).toEqual(p.palette);
    expect([q.headingFont, q.bodyFont]).toEqual(['Lora', 'Lato']);
    expect(q.backgroundImage).toBe(PNG);
    expect(q.elements.map((e) => [e.type, e.x, e.y, e.w, e.h, e.role, e.fill, e.style?.fontSize])).toEqual(
      p.elements.map((e) => [e.type, e.x, e.y, e.w, e.h, e.role, e.fill, e.style?.fontSize]),
    );
  });

  it('swaps the content for example text that the Check panel will flag', () => {
    const p = filledPoster();
    const q = posterToTemplate(p, 'T').poster;
    const text = allText(q);
    expect(text).not.toContain('Sleep spindles');
    expect(text).not.toContain('42 participants');
    const title = q.elements.find((e) => e.type === 'title')!;
    expect(PLACEHOLDER_TEXT.some((ph) => htmlToText(title.html).includes(ph))).toBe(true);
    const body = q.elements.find((e) => e.type === 'text' && e.role === 'body')!;
    expect(PLACEHOLDER_TEXT.some((ph) => htmlToText(body.html).includes(ph))).toBe(true);
  });

  it('keeps section headings', () => {
    const p = filledPoster();
    const before = p.elements.filter((e) => e.type === 'heading').map((e) => e.html);
    const after = posterToTemplate(p, 'T').poster.elements.filter((e) => e.type === 'heading').map((e) => e.html);
    expect(after).toEqual(before);
    expect(after).toContain('Methods');
  });

  it('keeps logos but empties figures and QR codes by default', () => {
    const p = filledPoster();
    const q = posterToTemplate(p, 'T').poster;
    const logos = q.elements.filter((e) => e.placeholder === 'Logo');
    expect(logos.length).toBeGreaterThan(0);
    for (const l of logos) expect(l.src).toBe(PNG);
    const figures = q.elements.filter((e) => e.type === 'image' && e.placeholder !== 'Logo');
    expect(figures.length).toBeGreaterThan(0);
    for (const f of figures) {
      expect(f.src).toBeUndefined();
      expect(f.alt).toBeUndefined();
      expect(f.placeholder).toBeTruthy();
    }
  });

  it('lets the user choose exactly which pictures to keep', () => {
    const p = filledPoster();
    const figure = p.elements.find((e) => e.type === 'image' && e.src && e.placeholder !== 'Logo')!;
    const q = posterToTemplate(p, 'T', { keepPictures: [figure.id] }).poster;
    expect(q.elements.find((e) => e.id === figure.id)!.src).toBe(PNG);
    for (const l of q.elements.filter((e) => e.placeholder === 'Logo')) expect(l.src).toBeUndefined();
  });

  it('replaces graph data, table cells and equations with examples of the same shape', () => {
    const q = posterToTemplate(filledPoster(), 'T').poster;
    const chart = q.elements.find((e) => e.type === 'chart')!.chart!;
    expect(chart.kind).toBe('bar');
    expect(chart.yColumns).toHaveLength(2);
    expect(chart.columns).not.toContain('Night 1');
    expect(chart.rows.length).toBeGreaterThan(2);
    expect(chart.rowEnd).toBe(chart.rows.length - 1);
    const table = q.elements.find((e) => e.type === 'table')!.table!;
    expect(table.rows).toHaveLength(3);
    expect(table.rows[0]).toEqual(['Column 1', 'Column 2']);
    expect(table.rows.flat()).not.toContain('Young');
    expect(q.elements.find((e) => e.type === 'equation')!.equation!.latex).not.toContain('frac');
  });

  it('drops references, review notes, ignored words and the thumbnail', () => {
    const q = posterToTemplate(filledPoster(), 'T').poster;
    expect(q.references).toEqual([]);
    expect(q.notes).toBeUndefined();
    expect(q.ignoredWords).toBeUndefined();
    expect(q.thumbnail).toBeUndefined();
    expect(allText(q)).not.toContain('Walker');
  });

  it('replaces an authors block with example authors', () => {
    const p = filledPoster();
    p.elements.push(makeElement('subtitle', p, { authors: { authors: [{ name: 'Ana Silva', affiliations: [0] }], affiliations: ['Real University'] }, html: 'Ana Silva' }));
    const q = posterToTemplate(p, 'T').poster;
    const a = q.elements[q.elements.length - 1];
    expect(a.html).toContain('Author One');
    expect(a.html).not.toContain('Ana Silva');
    expect(a.authors!.authors[0].name).toBe('Author One');
  });

  it('does not change the original poster', () => {
    const p = filledPoster();
    const snapshot = JSON.stringify(p);
    posterToTemplate(p, 'T');
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('makes example text about as long as the original', () => {
    const n = (s: string) => s.split(' ').length;
    expect(n(exampleText(3))).toBeGreaterThanOrEqual(5);
    expect(Math.abs(n(exampleText(40)) - 40)).toBeLessThanOrEqual(10);
    expect(exampleText(40).startsWith('Replace this text with your own.')).toBe(true);
  });

  it('guesses which pictures are logos', () => {
    const p = createPoster({ name: 'x', width: 841, height: 1189, sizePreset: 'A0', columns: 3, palette: PALETTES[0], template: 'blank', headingFont: 'Arial', bodyFont: 'Arial' });
    const small = (y: number) => makeElement('image', p, { x: 10, y, w: 60, h: 40, src: PNG });
    expect(isLikelyLogo(small(20), p)).toBe(true);
    expect(isLikelyLogo(small(1100), p)).toBe(true);
    expect(isLikelyLogo(small(600), p)).toBe(false);
    expect(isLikelyLogo(makeElement('image', p, { x: 10, y: 20, w: 600, h: 400, src: PNG }), p)).toBe(false);
    expect(isLikelyLogo(makeElement('image', p, { x: 10, y: 20, w: 60, h: 60, qr: 'https://x', src: PNG }), p)).toBe(false);
  });
});

describe('making a poster from a template', () => {
  it('gives the poster and every element new ids, keeping groups together', () => {
    const t = posterToTemplate(filledPoster(), 'T');
    t.poster.elements[0].groupId = 'g1';
    t.poster.elements[1].groupId = 'g1';
    const a = posterFromTemplate(t, 'My new poster');
    const b = posterFromTemplate(t, '');
    expect(a.name).toBe('My new poster');
    expect(b.name).toBe('Untitled poster');
    expect(a.id).not.toBe(t.poster.id);
    expect(a.id).not.toBe(b.id);
    const ids = new Set(t.poster.elements.map((e) => e.id));
    for (const e of a.elements) expect(ids.has(e.id)).toBe(false);
    expect(new Set(a.elements.map((e) => e.id)).size).toBe(a.elements.length);
    expect(a.elements[0].groupId).toBeTruthy();
    expect(a.elements[0].groupId).toBe(a.elements[1].groupId);
    expect(a.elements[0].groupId).not.toBe('g1');
    // section groups stay together too
    const sections = (p: Poster) => new Set(p.elements.map((e) => e.group).filter(Boolean)).size;
    expect(sections(a)).toBe(sections(t.poster));
    // and the template itself is untouched
    expect(t.poster.elements[0].groupId).toBe('g1');
  });
});

describe('template files', () => {
  it('round-trips through export and import with a new id', () => {
    const t = posterToTemplate(filledPoster(), 'Lab template');
    const back = parseTemplateText(templateToText(t));
    expect(back.name).toBe('Lab template');
    expect(back.id).not.toBe(t.id);
    expect(back.poster.elements.length).toBe(t.poster.elements.length);
    expect(back.poster.palette).toEqual(t.poster.palette);
    expect(templateFileName(t)).toBe('Lab-template.postertemplate.json');
  });

  it('rejects files that are not templates', () => {
    expect(() => parseTemplateText('not json')).toThrow(/not a PosterHub template/);
    expect(() => parseTemplateText(JSON.stringify({ app: 'posterhub', elements: [], width: 1, height: 1 }))).toThrow(/not a PosterHub template/);
    expect(() => parseTemplateText(JSON.stringify({ app: 'posterhub-template', poster: { elements: [] } }))).toThrow(/not a PosterHub template/);
  });

  it('cleans unsafe content from imported files', () => {
    const t = posterToTemplate(filledPoster(), 'Evil');
    t.poster.elements[0].html = '<img src=x onerror="alert(1)">Title<script>alert(2)</script>';
    t.poster.elements.find((e) => e.type === 'image')!.src = 'javascript:alert(3)';
    t.poster.backgroundImage = 'https://tracker.example/bg.png';
    const back = parseTemplateText(templateToText(t));
    const html = back.poster.elements[0].html!;
    expect(html).not.toMatch(/onerror|<script/i);
    expect(back.poster.elements.find((e) => e.type === 'image')!.src).toBeUndefined();
    expect(back.poster.backgroundImage).toBeUndefined();
  });
});

describe('saved templates', () => {
  beforeEach(() => setTemplateStore(memoryTemplateStore()));

  it('saves, lists newest first, renames and deletes', async () => {
    const a = await saveAsTemplate(filledPoster(), 'First');
    await new Promise((r) => setTimeout(r, 2));
    const b = await saveAsTemplate(filledPoster(), 'Second');
    expect((await listTemplates()).map((t) => t.name)).toEqual(['Second', 'First']);
    await renameTemplate(a.id, '  Lab style  ');
    const list = await listTemplates();
    expect(list.map((t) => t.name)).toEqual(['Lab style', 'Second']);
    expect(list[0].poster.name).toBe('Lab style');
    await renameTemplate(b.id, '   ');
    expect((await listTemplates()).map((t) => t.name)).toContain('Second');
    await deleteTemplate(a.id);
    expect((await listTemplates()).map((t) => t.name)).toEqual(['Second']);
  });

  it('never gives two templates the same name', async () => {
    await saveAsTemplate(filledPoster(), 'Lab');
    const second = await saveAsTemplate(filledPoster(), 'lab');
    expect(second.name).toBe('lab (2)');
    const imported = await importTemplateText(templateToText(second));
    expect(imported.name).toBe('lab (3)');
    expect((await listTemplates())).toHaveLength(3);
    expect(uniqueName('X', ['x', 'X (2)'])).toBe('X (3)');
  });
});

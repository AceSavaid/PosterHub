import { describe, expect, it } from 'vitest';
import type { Poster, PosterElement } from '../../src/types';
import { PALETTES, createPoster, makeElement, sizeFor } from '../../src/model';
import {
  addCaption,
  canCaption,
  captionGap,
  captionOf,
  captionText,
  figureNumbers,
  relinkCopies,
  removeCaption,
  renderLabel,
  setCaptionPos,
  setCaptionText,
  stripTypedLabel,
  syncCaptions,
  withCaptions,
} from '../../src/lib/captions';
import { cleanHtml } from '../../src/lib/sanitize';
import { posterFromTemplate, posterToTemplate } from '../../src/lib/userTemplates';
import { htmlToText } from '../../src/lib/textTools';

const blank = (template: 'blank' | 'central' = 'blank'): Poster =>
  createPoster({ name: 't', ...sizeFor('A0', 'portrait'), sizePreset: 'A0', columns: 3, palette: PALETTES[0], headingFont: 'Inter', bodyFont: 'Inter', template });

function addFig(p: Poster, type: 'image' | 'chart' | 'table', x: number, y: number): PosterElement {
  const el = makeElement(type, p, { x, y, w: 200, h: 150, src: type === 'image' ? 'data:image/png;base64,AA==' : undefined });
  p.elements.push(el);
  return el;
}

const label = (p: Poster, figId: string) => htmlToText(captionOf(p, figId)!.html).match(/^(Figure|Table) \d+:/)?.[0];

describe('figure captions', () => {
  it('adds a "Figure 1:" caption under a picture, taking its room from the picture', () => {
    const p = blank();
    const img = addFig(p, 'image', 50, 100);
    const id = addCaption(p, img.id, 'below', 'Cells under the microscope')!;
    const cap = p.elements.find((e) => e.id === id)!;
    expect(cap.captionOf).toBe(img.id);
    expect(htmlToText(cap.html)).toBe('Figure 1: Cells under the microscope');
    // the pair takes exactly the space the picture had
    expect(img.y).toBe(100);
    expect(cap.y + cap.h).toBeCloseTo(250, 5);
    expect(cap.x).toBe(img.x);
    expect(cap.w).toBe(img.w);
    expect(captionText(cap)).toBe('Cells under the microscope');
  });

  it('can put the caption above, and switch sides without moving the pair', () => {
    const p = blank();
    const img = addFig(p, 'image', 50, 100);
    addCaption(p, img.id, 'above');
    const cap = captionOf(p, img.id)!;
    expect(cap.y).toBe(100);
    expect(img.y).toBeCloseTo(100 + cap.h + captionGap(p), 5);
    setCaptionPos(p, img.id, 'below');
    expect(img.y).toBe(100);
    expect(cap.y).toBeCloseTo(img.y + img.h + captionGap(p), 5);
    expect(cap.captionPos).toBe('below');
  });

  it('numbers figures in reading order (down each column, then across) and tables separately', () => {
    const p = blank();
    const right = addFig(p, 'chart', 600, 100); // third column
    const leftLow = addFig(p, 'image', 30, 600);
    const leftTop = addFig(p, 'image', 30, 100);
    const table = addFig(p, 'table', 320, 100);
    for (const f of [right, leftLow, leftTop, table]) addCaption(p, f.id);
    const n = figureNumbers(p);
    expect(n.get(leftTop.id)).toBe('Figure 1');
    expect(n.get(leftLow.id)).toBe('Figure 2');
    expect(n.get(right.id)).toBe('Figure 3');
    expect(n.get(table.id)).toBe('Table 1');
    expect(label(p, right.id)).toBe('Figure 3:');
    expect(label(p, table.id)).toBe('Table 1:');
  });

  it('renumbers when a figure is moved or deleted', () => {
    const p = blank();
    const a = addFig(p, 'image', 30, 100);
    const b = addFig(p, 'image', 30, 600);
    addCaption(p, a.id);
    addCaption(p, b.id);
    expect(label(p, b.id)).toBe('Figure 2:');
    // move b above a
    const prev = structuredClone(p);
    b.y = 20;
    syncCaptions(p, prev);
    expect(label(p, b.id)).toBe('Figure 1:');
    expect(label(p, a.id)).toBe('Figure 2:');
    // delete b: a becomes Figure 1 again, and b's caption is unlinked
    const bCap = captionOf(p, b.id)!;
    p.elements = p.elements.filter((e) => e.id !== b.id);
    syncCaptions(p);
    expect(label(p, a.id)).toBe('Figure 1:');
    expect(bCap.captionOf).toBeUndefined();
    expect(bCap.html).not.toContain('data-fig');
  });

  it('keeps the caption with its figure, and dragging the caption brings the figure along', () => {
    const p = blank();
    const img = addFig(p, 'image', 50, 100);
    addCaption(p, img.id);
    const cap = captionOf(p, img.id)!;
    let prev = structuredClone(p);
    img.x += 40;
    img.y += 10;
    img.w = 300;
    syncCaptions(p, prev);
    expect(cap.x).toBe(img.x);
    expect(cap.w).toBe(300);
    expect(cap.y).toBeCloseTo(img.y + img.h + captionGap(p), 5);
    // drag only the caption
    prev = structuredClone(p);
    const imgY = img.y;
    cap.y += 25;
    cap.x -= 5;
    syncCaptions(p, prev);
    expect(img.y).toBeCloseTo(imgY + 25, 5);
    expect(cap.x).toBe(img.x);
  });

  it('puts the label back if it is deleted while typing, and fixes a wrong number', () => {
    expect(htmlToText(renderLabel('Some words', 'Figure 2'))).toBe('Figure 2: Some words');
    expect(htmlToText(renderLabel('<div>Some words</div>', 'Figure 2')).trim()).toBe('Figure 2: Some words');
    const wrong = '<b class="fig-label" data-fig="" contenteditable="false">Figure 9:</b> Words';
    expect(htmlToText(renderLabel(wrong, 'Figure 3'))).toBe('Figure 3: Words');
    const right = renderLabel('Words', 'Figure 1');
    expect(renderLabel(right, 'Figure 1')).toBe(right);
  });

  it('keeps the label through the HTML cleaner used for opened files', () => {
    const p = blank();
    const img = addFig(p, 'image', 50, 100);
    addCaption(p, img.id, 'below', 'Hi');
    const html = captionOf(p, img.id)!.html!;
    expect(cleanHtml(html)).toBe(html);
  });

  it('reuses a caption the template put under a figure box, dropping its typed "Figure 1."', () => {
    const p = blank('central');
    const fig = p.elements.find((e) => e.type === 'image' && e.placeholder === 'Figure')!;
    const before = p.elements.length;
    const tCap = p.elements.find((e) => e.role === 'caption')!;
    const id = addCaption(p, fig.id);
    expect(id).toBe(tCap.id);
    expect(p.elements.length).toBe(before);
    expect(htmlToText(tCap.html)).toBe('Figure 1: Describe what the figure shows and why it matters.');
  });

  it('strips typed labels in their different spellings', () => {
    expect(htmlToText(stripTypedLabel('<i>Figure 1.</i> Text'))).toBe('Text');
    expect(htmlToText(stripTypedLabel('Fig. 2: Text'))).toBe('Text');
    expect(htmlToText(stripTypedLabel('Table 3 – Text'))).toBe('Text');
    expect(stripTypedLabel('Figures show')).toBe('Figures show');
  });

  it('removing a caption gives the figure its room back', () => {
    const p = blank();
    const img = addFig(p, 'image', 50, 100);
    addCaption(p, img.id, 'above');
    removeCaption(p, img.id);
    expect(captionOf(p, img.id)).toBeUndefined();
    expect(img.y).toBeCloseTo(100, 5);
    expect(img.h).toBeCloseTo(150, 5);
  });

  it('sets caption text from plain text, escaping HTML', () => {
    const p = blank();
    const img = addFig(p, 'image', 50, 100);
    addCaption(p, img.id);
    setCaptionText(p, img.id, 'a < b & <script>');
    syncCaptions(p);
    const cap = captionOf(p, img.id)!;
    expect(cap.html).not.toContain('<script>');
    expect(htmlToText(cap.html)).toBe('Figure 1: a < b & <script>');
    expect(captionText(cap)).toBe('a < b & <script>');
  });

  it('only offers captions for pictures, graphs and tables (not QR codes or logos)', () => {
    const p = blank();
    expect(canCaption(makeElement('image', p))).toBe(true);
    expect(canCaption(makeElement('chart', p))).toBe(true);
    expect(canCaption(makeElement('table', p))).toBe(true);
    expect(canCaption(makeElement('image', p, { placeholder: 'QR code' }))).toBe(false);
    expect(canCaption(makeElement('image', p, { role: 'logo' }))).toBe(false);
    expect(canCaption(makeElement('text', p))).toBe(false);
    expect(canCaption(makeElement('equation', p))).toBe(false);
  });

  it('copies take their caption along, linked to the copy', () => {
    const p = blank();
    const img = addFig(p, 'image', 50, 100);
    addCaption(p, img.id);
    const cap = captionOf(p, img.id)!;
    expect(withCaptions([img.id], p.elements)).toEqual([img.id, cap.id]);
    const copies = [{ ...structuredClone(img), id: 'img2' }, { ...structuredClone(cap), id: 'cap2' }];
    relinkCopies(copies, new Map([[img.id, 'img2'], [cap.id, 'cap2']]));
    expect(copies[1].captionOf).toBe('img2');
    // a caption copied on its own is just text
    const lone = [{ ...structuredClone(cap), id: 'cap3' }];
    relinkCopies(lone, new Map([[cap.id, 'cap3']]));
    expect(lone[0].captionOf).toBeUndefined();
    expect(lone[0].html).not.toContain('data-fig');
  });

  it('a second caption pointing at the same figure becomes plain text', () => {
    const p = blank();
    const img = addFig(p, 'image', 50, 100);
    addCaption(p, img.id);
    const dupe = { ...structuredClone(captionOf(p, img.id)!), id: 'dupe' };
    p.elements.push(dupe);
    syncCaptions(p);
    expect(dupe.captionOf).toBeUndefined();
    expect(p.elements.filter((e) => e.captionOf === img.id)).toHaveLength(1);
  });

  it('templates made from a poster keep captions linked to the right figures', () => {
    const p = blank();
    const img = addFig(p, 'image', 50, 100);
    addCaption(p, img.id, 'below', 'My secret result');
    const t = posterToTemplate(p, 'T');
    const tCap = t.poster.elements.find((e) => e.captionOf)!;
    expect(htmlToText(tCap.html)).toBe('Figure 1: Describe what the figure shows.');
    const fresh = posterFromTemplate(t, 'New');
    const cap = fresh.elements.find((e) => e.captionOf)!;
    const fig = fresh.elements.find((e) => e.id === cap.captionOf)!;
    expect(fig.type).toBe('image');
    expect(fig.id).not.toBe(img.id);
  });
});

describe('figure captions in the editor history', () => {
  it('linking a template caption that sits further down does not drag the figure to it', () => {
    const p = blank('central');
    const fig = p.elements.find((e) => e.type === 'image' && e.placeholder === 'Figure')!;
    fig.h = fig.h / 2; // a wide picture is shorter than its box
    const prev = structuredClone(p);
    const y = fig.y;
    addCaption(p, fig.id);
    syncCaptions(p, prev);
    expect(fig.y).toBe(y);
    const cap = captionOf(p, fig.id)!;
    expect(cap.y).toBeCloseTo(fig.y + fig.h + captionGap(p), 5);
  });
});

import { describe, expect, it } from 'vitest';
import { createPoster, PALETTES } from '../../src/model';
import type { Poster, PosterElement } from '../../src/types';
import { reflowColumn } from '../../src/lib/reflow';
import { applyStartText, nameAfterTitleEdit, titleText, UNTITLED } from '../../src/lib/startText';
import { fillProgress, nextToFill } from '../../src/lib/fillProgress';
import { sanitizePrefs } from '../../src/lib/uiPrefs';
import { toolbarPosition } from '../../src/components/TextToolbar';

const text = (id: string, x: number, y: number, w: number, h: number, extra: Partial<PosterElement> = {}): PosterElement => ({
  id, type: 'text', x, y, w, h, html: 'x', style: { fontFamily: '@body', fontSize: 24, color: '@text', bold: false, italic: false, underline: false, align: 'left', lineHeight: 1.3 }, ...extra,
});
const page = (elements: PosterElement[]): Poster => ({ ...createPoster({ name: 't', width: 600, height: 800, sizePreset: 'custom', columns: 2, palette: PALETTES[0], template: 'blank', headingFont: 'Arial', bodyFont: 'Arial' }), margin: 20, elements });

describe('reflowColumn', () => {
  it('moves the boxes below down by the growth and leaves other columns alone', () => {
    const p = page([text('a', 20, 100, 270, 100), text('b', 20, 220, 270, 50), text('c', 310, 220, 270, 50)]);
    const r = reflowColumn(p, 'a', 160);
    expect(r).toEqual({ h: 160, short: 0 });
    expect(p.elements.find((e) => e.id === 'b')!.y).toBe(280);
    expect(p.elements.find((e) => e.id === 'c')!.y).toBe(220);
    expect(p.elements[0].grew).toBe(60);
  });

  it('takes empty space from text boxes below before moving further boxes', () => {
    const p = page([text('a', 20, 100, 270, 100), text('b', 20, 220, 270, 200), { id: 'f', type: 'image', x: 20, y: 440, w: 270, h: 100 }]);
    reflowColumn(p, 'a', 140, (id) => (id === 'b' ? 30 : 0));
    const [b, f] = ['b', 'f'].map((id) => p.elements.find((e) => e.id === id)!);
    expect(b.y).toBe(260);
    expect(b.h).toBe(170);
    expect(f.y).toBe(450); // moved only by what b couldn't absorb
  });

  it('stops at the bottom margin and a full-width footer, and says how much did not fit', () => {
    const p = page([text('a', 20, 100, 270, 100), text('b', 20, 220, 270, 400), { id: 'foot', type: 'shape', x: 0, y: 700, w: 600, h: 100 }]);
    const r = reflowColumn(p, 'a', 200);
    expect(r.h).toBe(180); // b may move down 80 before touching the footer at 700
    expect(r.short).toBe(20);
    expect(p.elements.find((e) => e.id === 'b')!.y).toBe(300);
  });

  it('grows the section card the box sits on', () => {
    const p = page([{ id: 'card', type: 'shape', x: 15, y: 80, w: 280, h: 130 }, text('a', 20, 100, 270, 100)]);
    reflowColumn(p, 'a', 150);
    expect(p.elements[0].h).toBe(180);
  });

  it('shrinks back only by what it grew, pulling the column back up', () => {
    const p = page([text('a', 20, 100, 270, 100), text('b', 20, 220, 270, 50)]);
    reflowColumn(p, 'a', 160);
    reflowColumn(p, 'a', 40);
    expect(p.elements[0].h).toBe(100);
    expect(p.elements[0].grew).toBeUndefined();
    expect(p.elements[1].y).toBe(220);
  });

  it('never moves locked boxes; they act as the floor', () => {
    const p = page([text('a', 20, 100, 270, 100), text('b', 20, 230, 270, 50, { locked: true })]);
    const r = reflowColumn(p, 'a', 200);
    expect(p.elements[1].y).toBe(230);
    expect(r.h).toBe(130);
  });
});

describe('start text', () => {
  const fresh = () => createPoster({ name: UNTITLED, width: 841, height: 1189, sizePreset: 'A0', columns: 3, palette: PALETTES[0], template: 'classic', headingFont: 'Arial', bodyFont: 'Arial' });

  it('puts the title and authors on the poster, escaped', () => {
    const p = applyStartText(fresh(), { title: 'Sleep & <memory>', authors: 'A. Lee — Psychology' });
    expect(p.elements.find((e) => e.role === 'title')!.html).toBe('Sleep &amp; &lt;memory&gt;');
    expect(p.elements.find((e) => e.role === 'subtitle')!.html).toBe('A. Lee — Psychology');
    expect(titleText(p)).toBe('Sleep & <memory>');
  });

  it('leaves the example text when nothing was typed', () => {
    const p = applyStartText(fresh(), { title: '  ', authors: '' });
    expect(titleText(p)).toBe('Your Poster Title Goes Here');
  });

  it('names an unnamed poster after its title, and keeps a name it already has', () => {
    expect(nameAfterTitleEdit(UNTITLED, 'Sleep and memory')).toBe('Sleep and memory');
    expect(nameAfterTitleEdit('Sleep', 'Sleep and memory')).toBeNull();
    expect(nameAfterTitleEdit(UNTITLED, 'Your Poster Title Goes Here')).toBeNull();
    expect(nameAfterTitleEdit(UNTITLED, '')).toBeNull();
  });
});

describe('fillProgress', () => {
  const fresh = () => createPoster({ name: 'x', width: 841, height: 1189, sizePreset: 'A0', columns: 3, palette: PALETTES[0], template: 'classic', headingFont: 'Arial', bodyFont: 'Arial' });

  it('counts layout boxes still showing example text or no picture, headings excluded', () => {
    const p = fresh();
    const { total, filled, left } = fillProgress(p);
    expect(filled).toBe(0);
    expect(total).toBe(left.length);
    expect(left.some((e) => e.role === 'heading')).toBe(false);
    expect(left[0].role).toBe('title'); // the title band reads first
  });

  it('goes down each column, then to the next, and skips dismissed boxes', () => {
    const p = fresh();
    const body = p.elements.find((e) => e.role === 'body')!;
    body.html = 'Real words';
    expect(fillProgress(p).filled).toBe(1);
    const first = nextToFill(p, null)!;
    p.dismissedIssues = ['ph-' + first.id];
    expect(nextToFill(p, null)!.id).not.toBe(first.id);
    // after a box, the next is further along in reading order
    const left = fillProgress(p).left;
    expect(nextToFill(p, left[1].id)!.id).toBe(left[2].id);
    expect(nextToFill(p, left[left.length - 1].id)!.id).toBe(left[0].id);
  });
});

describe('remembered New poster choices', () => {
  it('keeps well-formed choices and drops broken ones', () => {
    const good = { template: 'boxed', palette: 'Forest', orientation: 'landscape', preset: 'A1', width: 841, height: 594, columns: 4, headingFont: 'Lora', bodyFont: 'Inter' };
    expect(sanitizePrefs({ newPoster: good }).newPoster).toEqual(good);
    expect(sanitizePrefs({ newPoster: { ...good, columns: 9 } }).newPoster).toBeNull();
    expect(sanitizePrefs({ newPoster: { ...good, width: -1 } }).newPoster).toBeNull();
    expect(sanitizePrefs({}).newPoster).toBeNull();
  });
});

describe('toolbarPosition', () => {
  const bar = { width: 300, height: 40 };
  const view = { width: 1200, height: 800, top: 50 };
  it('sits centred above the target', () => {
    expect(toolbarPosition({ top: 300, bottom: 340, left: 400, width: 200 }, bar, view)).toEqual({ top: 252, left: 350 });
  });
  it('flips below when there is no room above, and stays on screen', () => {
    expect(toolbarPosition({ top: 60, bottom: 100, left: 1100, width: 200 }, bar, view)).toEqual({ top: 108, left: 896 });
  });
});

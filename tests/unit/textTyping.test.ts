import { describe, expect, it } from 'vitest';
import { createPoster, PALETTES } from '../../src/model';
import type { Poster, PosterElement } from '../../src/types';
import { styleForKey, styleNameOf } from '../../src/lib/textStyles';
import { applyTextStyle, lookOf, updateStyleToMatch, defaultLook } from '../../src/lib/textStyleApply';
import { curlQuote, dashBefore, listFor } from '../../src/lib/autoformat';
import { plainTextHtml, simplifyPastedHtml } from '../../src/lib/paste';
import { SPECIAL_CHARS, recentChars, rememberChar, searchChars } from '../../src/lib/specialChars';
import { sanitizeElement } from '../../src/lib/sanitize';
import { sanitizePrefs } from '../../src/lib/uiPrefs';
import { SHORTCUTS } from '../../src/lib/shortcuts';

const style = (over = {}) => ({ fontFamily: '@body', fontSize: 24, color: '@text', bold: false, italic: false, underline: false, align: 'left' as const, lineHeight: 1.3, ...over });
const el = (id: string, extra: Partial<PosterElement> = {}): PosterElement => ({ id, type: 'text', x: 0, y: 0, w: 100, h: 20, html: 'x', role: 'body', style: style(), ...extra });
const page = (elements: PosterElement[]): Poster => ({ ...createPoster({ name: 't', width: 841, height: 1189, sizePreset: 'A0', columns: 2, palette: PALETTES[0], template: 'blank', headingFont: 'Arial', bodyFont: 'Arial' }), elements });
const find = (p: Poster, id: string) => p.elements.find((e) => e.id === id)!;

describe('text styles', () => {
  it('names the style a box uses from its type and role', () => {
    expect(styleNameOf(el('a', { type: 'heading', role: 'heading' }))).toBe('heading');
    expect(styleNameOf(el('a'))).toBe('normal');
    expect(styleNameOf(el('a', { role: 'caption' }))).toBe('caption');
    expect(styleNameOf(el('a', { type: 'heading', textStyle: 'subheading' }))).toBe('subheading');
    expect(styleNameOf(el('a', { type: 'title' }))).toBeNull();
    expect(styleNameOf(el('a', { refList: true }))).toBeNull();
  });

  it('a new heading copies the look of the headings already on the poster', () => {
    const h = el('h', { type: 'heading', role: 'heading', style: style({ fontSize: 60, color: '@accent', bold: true }) });
    const p = page([h, el('b', { html: 'Methods', style: style({ align: 'justify' }) })]);
    expect(applyTextStyle(p, 'b', 'heading')).toBe(true);
    const b = find(p, 'b');
    expect(b.type).toBe('heading');
    expect(b.role).toBe('heading');
    expect(b.html).toBe('Methods');
    expect(b.style).toMatchObject({ fontSize: 60, color: '@accent', bold: true });
    expect(b.style).not.toBe(h.style);
  });

  it('uses the built-in look when no box has the style yet, and keeps a body box’s alignment', () => {
    const p = page([el('a', { style: style({ align: 'center' }) })]);
    applyTextStyle(p, 'a', 'caption');
    const a = find(p, 'a');
    expect(a.textStyle).toBe('caption');
    expect(a.role).toBe('caption');
    expect(a.style).toMatchObject({ ...defaultLook(p, 'caption'), align: 'center' });
    expect(a.style!.italic).toBe(true);
  });

  it('turning a heading back into normal text drops its heading icon and caption marker', () => {
    const p = page([el('a', { type: 'heading', role: 'heading', headingIcon: { id: 'science/flask', size: 1, color: '@primary' } as never })]);
    applyTextStyle(p, 'a', 'normal');
    const a = find(p, 'a');
    expect(a.type).toBe('text');
    expect(a.role).toBe('body');
    expect(a.headingIcon).toBeUndefined();
    expect(a.textStyle).toBeUndefined();
  });

  it('a subheading is a heading box with its own look', () => {
    const p = page([el('a')]);
    applyTextStyle(p, 'a', 'subheading');
    expect(find(p, 'a')).toMatchObject({ type: 'heading', textStyle: 'subheading' });
    expect(find(p, 'a').style!.fontSize).toBeLessThan(defaultLook(p, 'heading').fontSize);
    expect(lookOf(p, 'subheading')).toEqual(find(p, 'a').style);
  });

  it('keeps special roles such as a summary when restyled', () => {
    const p = page([el('a', { role: 'summary' })]);
    applyTextStyle(p, 'a', 'heading');
    expect(find(p, 'a').role).toBe('summary');
  });

  it('won’t restyle the title, author line or reference list', () => {
    const p = page([el('t', { type: 'title', role: 'title' }), el('r', { refList: true })]);
    expect(applyTextStyle(p, 't', 'heading')).toBe(false);
    expect(applyTextStyle(p, 'r', 'heading')).toBe(false);
    expect(find(p, 't').type).toBe('title');
  });

  it('“Update to match” restyles every box with the same style but keeps each one’s alignment', () => {
    const p = page([
      el('h1', { type: 'heading', role: 'heading', style: style({ fontSize: 70, color: '#ff0000' }) }),
      el('h2', { type: 'heading', role: 'heading', style: style({ fontSize: 50, align: 'center' }) }),
      el('b', { style: style({ fontSize: 24 }) }),
    ]);
    expect(updateStyleToMatch(p, 'h1')).toBe(1);
    expect(find(p, 'h2').style).toMatchObject({ fontSize: 70, color: '#ff0000', align: 'center' });
    expect(find(p, 'b').style!.fontSize).toBe(24);
  });

  it('reads Ctrl/⌘ Alt 1, 2, 0 and 9 by key position', () => {
    const k = (code: string, o = {}) => styleForKey({ ctrlKey: true, metaKey: false, altKey: true, shiftKey: false, code, ...o });
    expect(k('Digit1')).toBe('heading');
    expect(k('Digit2')).toBe('subheading');
    expect(k('Digit0')).toBe('normal');
    expect(k('Numpad9')).toBe('caption');
    expect(k('Digit5')).toBeNull();
    expect(k('Digit1', { altKey: false })).toBeNull();
    expect(k('Digit1', { shiftKey: true })).toBeNull();
    expect(k('Digit1', { ctrlKey: false, metaKey: true })).toBe('heading');
  });

  it('drops an unknown style from an opened file', () => {
    expect(sanitizeElement(el('a', { textStyle: 'evil' as never })).textStyle).toBeUndefined();
    expect(sanitizeElement(el('a', { textStyle: 'caption' })).textStyle).toBe('caption');
  });
});

describe('formatting while typing', () => {
  it('curls quotes by what comes before', () => {
    expect(curlQuote('', '"')).toBe('“');
    expect(curlQuote(' ', '"')).toBe('“');
    expect(curlQuote('(', "'")).toBe('‘');
    expect(curlQuote('d', '"')).toBe('”');
    expect(curlQuote('n', "'")).toBe('’'); // don’t
  });

  it('starts a list from "- ", "* " or "1. " at the start of a line only', () => {
    expect(listFor('-')).toBe('ul');
    expect(listFor('*')).toBe('ul');
    expect(listFor('1.')).toBe('ol');
    expect(listFor('1)')).toBe('ol');
    expect(listFor('a -')).toBeNull();
    expect(listFor('2.')).toBeNull();
    expect(listFor('')).toBeNull();
  });

  it('makes number ranges use an en dash, but not dates or other hyphens', () => {
    expect(dashBefore('pages 10-', '2')).toBe(true);
    expect(dashBefore('n = 3-', '5')).toBe(true);
    expect(dashBefore('COVID-', '1')).toBe(false);
    expect(dashBefore('2024-11-', '2')).toBe(false);
    expect(dashBefore('10-', 'a')).toBe(false);
  });

  it('can be turned off in Settings (on by default)', () => {
    expect(sanitizePrefs({}).autoFormat).toBe(true);
    expect(sanitizePrefs({ autoFormat: false }).autoFormat).toBe(false);
  });
});

describe('pasting', () => {
  it('keeps bold, italic, underline, super/subscript and lists but drops fonts, sizes and colours', () => {
    const out = simplifyPastedHtml('<p style="font-family:Times;font-size:30px;color:red"><strong>Bold</strong> and <em>it</em> CO<sub>2</sub> x<sup>2</sup> <u>u</u></p><ul><li>one</li><li>two</li></ul>');
    expect(out).toBe('<b>Bold</b> and <i>it</i> CO<sub>2</sub> x<sup>2</sup> <u>u</u><br><ul><li>one</li><li>two</li></ul>');
    expect(out).not.toMatch(/Times|color|font-size/);
  });

  it('understands Google Docs’ copied HTML (styles on spans, a <b> wrapper that isn’t bold)', () => {
    const html = '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr"><span style="font-weight:700;">Key</span><span style="font-style:italic;"> result</span></p><p><span style="vertical-align:super;">a</span></p></b>';
    expect(simplifyPastedHtml(html)).toBe('<b>Key</b><i> result</i><br><sup>a</sup>');
  });

  it('turns paragraphs into line breaks and removes scripts, links and images', () => {
    const out = simplifyPastedHtml('<p>One</p><p>Two <a href="javascript:alert(1)">link</a><img src=x onerror=alert(1)></p><script>alert(1)</script>');
    expect(out).toBe('One<br>Two link');
  });

  it('gives nothing back when only formatting was copied', () => {
    expect(simplifyPastedHtml('<b></b><p> </p>')).toBe('');
  });

  it('plain text keeps its line breaks and can’t inject HTML', () => {
    expect(plainTextHtml('a <b>\r\nb')).toBe('a &lt;b&gt;<br>b');
  });
});

describe('special characters', () => {
  it('finds characters by name, group or the character itself', () => {
    expect(searchChars('alpha').map((c) => c.ch)).toEqual(['α']);
    expect(searchChars('plus minus').map((c) => c.ch)).toContain('±');
    expect(searchChars('degree').map((c) => c.ch)).toEqual(expect.arrayContaining(['°', '℃']));
    expect(searchChars('µ').map((c) => c.ch)).toEqual(['µ']);
    expect(searchChars('greek').length).toBeGreaterThan(20);
    expect(searchChars('')).toBe(SPECIAL_CHARS);
    expect(searchChars('zzz')).toEqual([]);
  });

  it('has no character twice', () => {
    const all = SPECIAL_CHARS.map((c) => c.ch);
    expect(new Set(all).size).toBe(all.length);
  });

  it('remembers the last few used, newest first', () => {
    localStorage.removeItem('posterhub.recentChars');
    rememberChar('α');
    rememberChar('±');
    rememberChar('α');
    expect(recentChars()).toEqual(['α', '±']);
    localStorage.setItem('posterhub.recentChars', '["<script>", 5, "µ"]');
    expect(recentChars()).toEqual(['µ']);
  });
});

describe('shortcut list', () => {
  it('lists the new typing shortcuts', () => {
    const all = SHORTCUTS.flatMap((g) => g.items.flatMap((i) => i.combos));
    for (const c of ['Ctrl/⌘ Alt 1', 'Ctrl/⌘ Alt 0', 'Ctrl/⌘ Shift V', 'Ctrl/⌘ Shift 8', 'Ctrl/⌘ .']) expect(all).toContain(c);
  });
});

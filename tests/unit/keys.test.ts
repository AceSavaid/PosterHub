import { afterEach, describe, expect, it } from 'vitest';
import { keys, setMacForTests, isMac } from '../../src/lib/keys';
import { SHORTCUTS, searchShortcuts } from '../../src/lib/shortcuts';
import { elementTip } from '../../src/lib/tips';
import type { PosterElement } from '../../src/types';

afterEach(() => setMacForTests(undefined));

describe('shortcut labels', () => {
  it('uses Mac symbols on a Mac', () => {
    expect(keys('Ctrl/⌘ Z', true)).toBe('⌘Z');
    expect(keys('Ctrl/⌘ Shift Z', true)).toBe('⌘⇧Z');
    expect(keys('⌘/Ctrl ⇧ G', true)).toBe('⌘⇧G');
    expect(keys('Alt-drag', true)).toBe('⌥-drag');
    expect(keys('Alt-drag', false)).toBe('Alt-drag');
    expect(keys('Ctrl/⌘ Alt N', true)).toBe('⌘⌥N');
    expect(keys('Shift F10', true)).toBe('⇧F10');
    expect(keys('Ctrl/⌘ \\', true)).toBe('⌘\\');
  });

  it('uses Ctrl+ names elsewhere', () => {
    expect(keys('Ctrl/⌘ Z', false)).toBe('Ctrl+Z');
    expect(keys('Ctrl/⌘ Shift Z', false)).toBe('Ctrl+Shift+Z');
    expect(keys('⌘/Ctrl ⇧ G', false)).toBe('Ctrl+Shift+G');
    expect(keys('Ctrl/⌘ =', false)).toBe('Ctrl+=');
    expect(keys('Ctrl/⌘ Enter', false)).toBe('Ctrl+Enter');
  });

  it('rewrites shortcuts inside sentences but leaves ordinary words alone', () => {
    expect(keys('Note deleted. Press Ctrl/⌘ Z to undo.', true)).toBe('Note deleted. Press ⌘Z to undo.');
    expect(keys('Ctrl/⌘-click picks one out; Ctrl/⌘ Shift G ungroups.', false)).toBe('Ctrl-click picks one out; Ctrl+Shift+G ungroups.');
    expect(keys('drag a corner (Shift lets it stretch)', true)).toBe('drag a corner (Shift lets it stretch)');
    expect(keys('Ctrl/⌘ C / X / V', false)).toBe('Ctrl+C / X / V');
  });

  it('can be forced for tests', () => {
    setMacForTests(true);
    expect(isMac()).toBe(true);
    expect(keys('Ctrl/⌘ D')).toBe('⌘D');
  });
});

describe('shortcut list', () => {
  it('lists each action once, and every shortcut has a description', () => {
    const all = SHORTCUTS.flatMap((g) => g.items);
    expect(new Set(all.map((s) => s.what)).size).toBe(all.length);
    for (const s of all) expect(s.combos.length && s.what).toBeTruthy();
  });

  it('searches by what it does, by group and by keys (written either way)', () => {
    const names = (q: string, mac?: boolean) => searchShortcuts(q, SHORTCUTS, mac).flatMap((g) => g.items.map((s) => s.what));
    expect(names('undo')).toEqual(['Undo']);
    expect(names('ctrl+shift+g', false)).toContain('Ungroup');
    expect(names('⌘⇧z', true)).toContain('Redo');
    expect(names('zoom').length).toBe(2);
    expect(searchShortcuts('nothing like this')).toEqual([]);
    expect(searchShortcuts('  ')).toBe(SHORTCUTS);
  });
});

describe('element tips', () => {
  const el = (p: Partial<PosterElement>) => ({ id: 'a', type: 'text', x: 0, y: 0, w: 10, h: 10, ...p }) as PosterElement;
  it('has a tip for every kind of element', () => {
    for (const type of ['title', 'subtitle', 'heading', 'text', 'image', 'chart', 'shape', 'table', 'equation', 'icon'] as const) expect(elementTip(el({ type }))).not.toBe('');
  });
  it('tailors tips to empty pictures, QR codes, reference lists and author lines', () => {
    expect(elementTip(el({ type: 'image' }))).toMatch(/choose a picture/);
    expect(elementTip(el({ type: 'image', src: 'data:image/png;base64,x' }))).toMatch(/Crop/);
    expect(elementTip(el({ type: 'image', src: 'data:', qr: 'https://x' }))).toMatch(/Scan/);
    expect(elementTip(el({ refList: true }))).toMatch(/citation style/);
    expect(elementTip(el({ authors: { authors: [], affiliations: [] } }))).toMatch(/authors and affiliations/);
  });
});

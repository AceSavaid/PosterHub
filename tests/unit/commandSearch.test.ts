import { describe, expect, it } from 'vitest';
import { searchCommands, type Command } from '../../src/lib/commands';
import { searchShortcuts } from '../../src/lib/shortcuts';
import { isCommandSearchKey, keys } from '../../src/lib/keys';

const noop = () => {};
const list: Command[] = [
  { id: 'qr', group: 'Insert', label: 'Add a QR code', keywords: 'link url scan', run: noop },
  { id: 'land', group: 'Poster', label: 'Make the poster landscape (wide)', keywords: 'orientation horizontal', run: noop },
  { id: 'port', group: 'Poster', label: 'Make the poster portrait (tall)', keywords: 'orientation vertical', run: noop, disabled: true },
  { id: 'pic', group: 'Insert', label: 'Add a picture…', keywords: 'image photo figure', run: noop },
  { id: 'undo', group: 'Edit', label: 'Undo', run: noop },
  { id: 'fig', group: 'Insert', label: 'Figure caption', run: noop },
];
const ids = (q: string) => searchCommands(q, list).map((c) => c.id);

describe('search the menus', () => {
  it('finds a command by the start of any word in its name', () => {
    expect(ids('qr')).toEqual(['qr']);
    expect(ids('land')).toEqual(['land']);
    expect(ids('QR CODE')).toEqual(['qr']);
  });

  it('finds commands by other words people use', () => {
    expect(ids('horizontal')).toEqual(['land']);
    expect(ids('photo')).toEqual(['pic']);
    expect(ids('url')).toEqual(['qr']);
  });

  it('needs every typed word to match', () => {
    expect(ids('poster wide')).toEqual(['land']);
    expect(ids('poster banana')).toEqual([]);
  });

  it('only matches at the start of words, so "do" does not find Undo', () => {
    expect(ids('do')).toEqual([]);
    expect(ids('und')).toEqual(['undo']);
  });

  it('puts a name match before a keyword match, and greyed-out commands last', () => {
    // "figure" is the start of "Figure caption" but only a keyword of "Add a picture"
    expect(ids('figure')).toEqual(['fig', 'pic']);
    expect(ids('orientation')).toEqual(['land', 'port']);
  });

  it('lists everything (up to the limit) when nothing is typed', () => {
    expect(searchCommands('', list, 3).map((c) => c.id)).toEqual(['qr', 'land', 'port']);
    expect(searchCommands('  ', list)).toHaveLength(list.length);
  });

  it('ignores accents and punctuation', () => {
    expect(ids('pictüre…')).toEqual(['pic']);
  });

  it('opens with Alt+/ (Option+/ types ÷ on a Mac) but not with Ctrl or ⌘', () => {
    expect(isCommandSearchKey({ altKey: true, ctrlKey: false, metaKey: false, key: '/', code: 'Slash' })).toBe(true);
    expect(isCommandSearchKey({ altKey: true, ctrlKey: false, metaKey: false, key: '÷', code: 'Slash' })).toBe(true);
    expect(isCommandSearchKey({ altKey: false, ctrlKey: false, metaKey: false, key: '/', code: 'Slash' })).toBe(false);
    expect(isCommandSearchKey({ altKey: true, ctrlKey: true, metaKey: false, key: '/', code: 'Slash' })).toBe(false);
  });

  it('is listed in the keyboard shortcuts, written for each computer', () => {
    expect(searchShortcuts('search the menus').flatMap((g) => g.items.map((s) => s.combos[0]))).toEqual(['Alt /']);
    expect(keys('Alt /', false)).toBe('Alt+/');
    expect(keys('Alt /', true)).toBe('⌥/');
  });
});

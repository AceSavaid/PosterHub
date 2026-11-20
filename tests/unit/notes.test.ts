import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_NOTE_LENGTH, REVIEWER_KEY, cleanText, createNote, loadReviewerName, notePositionFor, openNotes, preview, sanitizeNotes, saveReviewerName, timeAgo } from '../../src/lib/notes';
import { checkPoster } from '../../src/lib/checks';
import { readPosterFile } from '../../src/lib/storage';
import { PALETTES, createPoster, makeElement, sizeFor } from '../../src/model';
import type { Poster } from '../../src/types';

function blank(): Poster {
  return createPoster({ name: 't', ...sizeFor('A0', 'portrait'), sizePreset: 'A0', columns: 3, palette: PALETTES[0], headingFont: 'Inter', bodyFont: 'Inter', template: 'blank' });
}

beforeEach(() => localStorage.clear());

describe('review notes', () => {
  it('creates an open note at a point, signed by the reviewer', () => {
    const n = createNote({ x: 10, y: 20 }, '  Dr. Lee ', 'el1');
    expect(n).toMatchObject({ x: 10, y: 20, text: '', author: 'Dr. Lee', resolved: false, elementId: 'el1' });
    expect(n.id).toMatch(/^\w+$/);
    expect(createNote({ x: 0, y: 0 }, '')).not.toHaveProperty('elementId');
  });

  it('puts a note on an element just inside its top-right corner, kept on the poster', () => {
    expect(notePositionFor({ x: 100, y: 50, w: 200 }, { width: 841, height: 1189 })).toEqual({ x: 296, y: 54 });
    expect(notePositionFor({ x: 800, y: -30, w: 200 }, { width: 841, height: 1189 })).toEqual({ x: 841, y: 0 });
  });

  it('counts only unresolved notes as open, and handles posters without notes', () => {
    const p = blank();
    expect(openNotes(p)).toEqual([]);
    p.notes = [createNote({ x: 0, y: 0 }, 'A'), { ...createNote({ x: 0, y: 0 }, 'B'), resolved: true }];
    expect(openNotes(p).map((n) => n.author)).toEqual(['A']);
  });

  it('previews and dates notes in plain words', () => {
    expect(preview('  hello\n\n world  ')).toBe('hello world');
    expect(preview('')).toBe('(empty note)');
    expect(preview('a'.repeat(50), 10)).toBe('aaaaaaaaa…');
    const now = 1_700_000_000_000;
    expect(timeAgo(now - 5_000, now)).toBe('just now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(timeAgo(now - 86_400_000, now)).toBe('yesterday');
    expect(timeAgo(now - 3 * 86_400_000, now)).toBe('3 days ago');
  });

  it('remembers the reviewer name on this computer', () => {
    expect(loadReviewerName()).toBe('');
    saveReviewerName('Sam Patel');
    expect(localStorage.getItem(REVIEWER_KEY)).toBe('Sam Patel');
    expect(loadReviewerName()).toBe('Sam Patel');
  });
});

describe('notes from shared files are untrusted', () => {
  it('keeps text as plain text but strips control and direction-override characters', () => {
    expect(cleanText('fine <b>bold</b>\r\nnext', 100)).toBe('fine <b>bold</b>\nnext');
    expect(cleanText('a\u0000b‮c⁦d\te', 100)).toBe('abcd\te');
    expect(cleanText({ toString: () => 'x' }, 100)).toBe('');
  });

  it('drops malformed notes and unknown fields, caps sizes and clamps positions', () => {
    const raw = [
      { id: 'n1', x: 50, y: 60, text: '<img src=x onerror=alert(1)>', author: 'Eve\nMallory', createdAt: 5, resolved: true, elementId: 'abc', onclick: 'evil()', html: '<script>' },
      { id: 'n1', x: -10, y: 99999, text: 'x'.repeat(MAX_NOTE_LENGTH + 500), author: 42, resolved: 'yes' },
      { id: 'bad id"><script>', x: 'NaN', y: Infinity, text: null, elementId: '"><x>' },
      null,
      'a string',
      7,
    ];
    const notes = sanitizeNotes(raw, { width: 841, height: 1189 });
    expect(notes).toHaveLength(3);
    const [a, b, c] = notes;
    expect(a).toEqual({ id: 'n1', x: 50, y: 60, text: '<img src=x onerror=alert(1)>', author: 'Eve Mallory', createdAt: 5, resolved: true, elementId: 'abc' });
    // duplicate id gets a fresh one; values are cleaned
    expect(b.id).not.toBe('n1');
    expect(b).toMatchObject({ x: 0, y: 1189, author: '', resolved: false });
    expect(b.text).toHaveLength(MAX_NOTE_LENGTH);
    expect(c.id).toMatch(/^\w+$/);
    expect(c).toMatchObject({ x: 0, y: 0, text: '' });
    expect(c).not.toHaveProperty('elementId');
    expect(sanitizeNotes('nope')).toEqual([]);
    expect(sanitizeNotes(undefined)).toEqual([]);
  });

  it('cleans notes when a project file is opened, and leaves files without notes alone', async () => {
    const p = blank();
    const file = (data: object) => new File([JSON.stringify({ app: 'posterhub', ...data })], 'x.poster.json');
    const back = await readPosterFile(file({ ...p, notes: [{ id: 'k', x: 1, y: 2, text: 'Check fig 2', author: 'Dr. Lee', createdAt: 9, resolved: false, extra: 1 }, 'junk'] }));
    expect(back.notes).toEqual([{ id: 'k', x: 1, y: 2, text: 'Check fig 2', author: 'Dr. Lee', createdAt: 9, resolved: false }]);
    expect(await readPosterFile(file(p))).not.toHaveProperty('notes');
  });
});

describe('poster check and notes', () => {
  it('lists each unresolved note, and not resolved ones', () => {
    const p = blank();
    p.elements = [makeElement('heading', p, { html: 'Methods' })];
    p.notes = [
      { ...createNote({ x: 10, y: 10 }, 'Dr. Lee'), text: 'Is n=12 enough? Add a power analysis.' },
      { ...createNote({ x: 20, y: 20 }, ''), text: 'old', resolved: true },
      { ...createNote({ x: 30, y: 30 }, ''), text: '' },
    ];
    const notes = checkPoster(p).filter((i) => i.noteId);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ noteId: p.notes[0].id, severity: 'warning' });
    expect(notes[0].title).toContain('Dr. Lee');
    expect(notes[0].title).toContain('Is n=12 enough?');
    expect(notes[1].title).toContain('Someone');
    expect(notes[1].title).toContain('(empty note)');
  });

  it('reports open notes even on an empty poster', () => {
    const p = blank();
    p.notes = [createNote({ x: 1, y: 1 }, 'A')];
    expect(checkPoster(p).map((i) => i.id.split('-')[0])).toEqual(['note', 'empty']);
  });
});

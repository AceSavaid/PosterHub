import { describe, expect, it } from 'vitest';
import { combineSpellers, findMisspellings, loadSpeller, wordsToCheck } from '../../src/lib/spelling';
import { PALETTES, createPoster, makeElement, sizeFor } from '../../src/model';
import type { Poster } from '../../src/types';

function blank(): Poster {
  return createPoster({ name: 't', ...sizeFor('A0', 'portrait'), sizePreset: 'A0', columns: 3, palette: PALETTES[0], headingFont: 'Inter', bodyFont: 'Inter', template: 'blank' });
}

describe('words to check', () => {
  it('skips acronyms, gene names, numbers and links', () => {
    expect(wordsToCheck('DNA and mRNA from BRCA1 in 2025, see https://x.org/abc or me@uni.edu')).toEqual(['and', 'from', 'in', 'see', 'or']);
  });

  it('checks hyphenated words part by part and drops possessives', () => {
    expect(wordsToCheck('well-known participant’s data')).toEqual(['well', 'known', 'participant', 'data']);
  });

  it('keeps contractions whole and ignores single letters', () => {
    expect(wordsToCheck("don't a I x")).toEqual(["don't"]);
  });
});

describe('finding misspellings', () => {
  const fake = { correct: (w: string) => !/^(recieve|teh)$/i.test(w) };

  it('lists each unknown word once, with where it appears', () => {
    const p = blank();
    const a = makeElement('text', p, { x: 20, y: 20, w: 200, h: 50, html: 'We <b>recieve</b> teh data' });
    const b = makeElement('text', p, { x: 20, y: 100, w: 200, h: 50, html: 'and recieve more' });
    p.elements = [a, b];
    const found = findMisspellings(p, fake);
    expect(found).toEqual([
      { word: 'recieve', elementIds: [a.id, b.id], count: 2 },
      { word: 'teh', elementIds: [a.id], count: 1 },
    ]);
  });

  it('respects the poster’s ignored words, whatever the case', () => {
    const p = blank();
    p.elements = [makeElement('text', p, { html: 'Teh recieve' })];
    p.ignoredWords = ['teh'];
    expect(findMisspellings(p, fake).map((m) => m.word)).toEqual(['recieve']);
  });

  it('accepts a word that any dictionary knows', () => {
    const us = { correct: (w: string) => w === 'color', suggest: () => ['color'] };
    const gb = { correct: (w: string) => w === 'colour', suggest: () => ['colour', 'color'] };
    const both = combineSpellers([us, gb]);
    expect(both.correct('color') && both.correct('colour')).toBe(true);
    expect(both.correct('colr')).toBe(false);
    expect(both.suggest('colr')).toEqual(['color', 'colour']);
  });
});

describe('bundled dictionaries', () => {
  it('load offline and know US and UK spellings', async () => {
    const s = await loadSpeller();
    for (const w of ['color', 'colour', 'analyse', 'analyze', 'participants', 'methodology', 'hypothesis']) expect(s.correct(w), w).toBe(true);
    expect(s.correct('recieve')).toBe(false);
    expect(s.suggest('recieve')).toContain('receive');
  }, 20_000);
});

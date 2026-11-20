// Offline spelling check. The English dictionaries (US and UK spellings) ship
// with the app and are loaded only when the spelling list is first opened, so
// nothing is ever sent over the internet.
import type { Poster } from '../types';
import { htmlToText, readingOrder, textElements } from './textTools';

export interface Speller {
  correct(word: string): boolean;
  suggest(word: string): string[];
}

/**
 * Words worth checking in some text. Skips things a dictionary cannot judge:
 * acronyms and gene names (DNA, mRNA, BRCA1), anything with digits, web and
 * email addresses, and single letters. Hyphenated words are checked part by part.
 */
export function wordsToCheck(text: string): string[] {
  const out: string[] = [];
  const cleaned = text.replace(/\S*(?:https?:\/\/|www\.|@)\S*/gi, ' ');
  for (const m of cleaned.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu)) {
    let w = m[0].replace(/’/g, "'");
    if (/\d/.test(w)) continue;
    w = w.replace(/'s$/i, '');
    if (w.length < 2) continue;
    // ALLCAPS or a capital after the first letter: an acronym or a name like "iPhone"
    if (/\p{Lu}/u.test(w.slice(1))) continue;
    out.push(w);
  }
  return out;
}

export interface Misspelling {
  word: string;
  /** boxes the word appears in, in reading order */
  elementIds: string[];
  /** how many times it appears */
  count: number;
}

/** Normalises a word for the poster's "ignore" list. */
export const ignoreKey = (w: string) => w.toLowerCase();

/** Words on the poster the dictionary does not know, in the order they appear. */
export function findMisspellings(p: Poster, speller: Pick<Speller, 'correct'>): Misspelling[] {
  const ignored = new Set((p.ignoredWords ?? []).map(ignoreKey));
  const found = new Map<string, Misspelling>();
  const verdict = new Map<string, boolean>();
  for (const el of readingOrder(textElements(p))) {
    for (const w of wordsToCheck(htmlToText(el.html))) {
      if (ignored.has(ignoreKey(w))) continue;
      let ok = verdict.get(w);
      if (ok === undefined) {
        ok = speller.correct(w);
        verdict.set(w, ok);
      }
      if (ok) continue;
      const m = found.get(w) ?? { word: w, elementIds: [], count: 0 };
      m.count++;
      if (!m.elementIds.includes(el.id)) m.elementIds.push(el.id);
      found.set(w, m);
    }
  }
  return [...found.values()];
}

/** Accepts a word if any of the spellers knows it; suggestions are merged without repeats. */
export function combineSpellers(spellers: Speller[]): Speller {
  return {
    correct: (w) => spellers.some((s) => s.correct(w)),
    suggest: (w) => [...new Set(spellers.flatMap((s) => s.suggest(w)))].slice(0, 5),
  };
}

let loading: Promise<Speller> | null = null;

/** Loads the bundled US and UK English dictionaries (once). */
export function loadSpeller(): Promise<Speller> {
  loading ??= (async () => {
    const [{ default: nspell }, usAff, usDic, gbAff, gbDic] = await Promise.all([
      import('nspell'),
      import('../../node_modules/dictionary-en/index.aff?raw'),
      import('../../node_modules/dictionary-en/index.dic?raw'),
      import('../../node_modules/dictionary-en-gb/index.aff?raw'),
      import('../../node_modules/dictionary-en-gb/index.dic?raw'),
    ]);
    return combineSpellers([nspell(usAff.default, usDic.default), nspell(gbAff.default, gbDic.default)]);
  })();
  loading.catch(() => (loading = null));
  return loading;
}

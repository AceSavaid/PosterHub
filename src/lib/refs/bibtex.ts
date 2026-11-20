// A small, forgiving BibTeX reader. It turns entries into plain-text
// references: LaTeX accents become real letters and markup is dropped, so
// nothing from the file is ever treated as HTML.
import type { RefKind, RefName, Reference } from '../../types';
import { uid } from '../../model';

const MONTHS: Record<string, string> = {
  jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June',
  jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December',
};

/** Combining marks for LaTeX accent commands. */
const ACCENTS: Record<string, string> = {
  "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃', '=': '̄', '.': '̇',
  u: '̆', v: '̌', H: '̋', c: '̧', k: '̨', r: '̊', d: '̣', b: '̱',
};
const SYMBOLS: Record<string, string> = {
  TeX: 'TeX', LaTeX: 'LaTeX', BibTeX: 'BibTeX', ss: 'ß', o: 'ø', O: 'Ø', aa: 'å', AA: 'Å', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', l: 'ł', L: 'Ł', i: 'ı', j: 'ȷ',
  textendash: '–', textemdash: '—', textquoteright: '’', textquoteleft: '‘', S: '§', P: '¶', dag: '†', copyright: '©',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', kappa: 'κ', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', tau: 'τ', omega: 'ω', Delta: 'Δ', Omega: 'Ω',
};

/** Converts LaTeX-flavoured BibTeX text into plain Unicode text. */
export function latexToText(s: string): string {
  let t = s;
  // accents: \'{e}  {\'e}  \'e  \c{c}  \v s
  t = t.replace(/\\([`'^"~=.])\s*\{?\\?([A-Za-z])\}?/g, (_, a: string, ch: string) => (ch === 'i' ? 'i' : ch) + ACCENTS[a]);
  t = t.replace(/\\([uvHckrdb])(?:\s*\{\\?([A-Za-z])\}|\s+\\?([A-Za-z]))/g, (_, a: string, c1?: string, c2?: string) => (c1 ?? c2 ?? '') + ACCENTS[a]);
  t = t.replace(/\\([A-Za-z]+)(?![A-Za-z])\s?(\{\})?/g, (m, name: string) => (name in SYMBOLS ? SYMBOLS[name] : m));
  // formatting commands keep their argument: \textit{x} \emph{x} \url{x}
  for (let i = 0; i < 3; i++) t = t.replace(/\\[A-Za-z]+\*?\s*\{([^{}]*)\}/g, '$1');
  t = t
    .replace(/\\([&%$#_{}])/g, '$1')
    .replace(/\\\\/g, ' ')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/``|''/g, '"')
    .replace(/(^|[^\\])~/g, '$1 ')
    .replace(/\$([^$]*)\$/g, '$1')
    .replace(/\\[A-Za-z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.normalize('NFC');
}

/** Splits at the top level (outside braces) on a separator regex. */
function splitTop(s: string, sep: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth = Math.max(0, depth - 1);
    if (depth === 0) {
      const m = s.slice(i).match(sep);
      if (m && m.index === 0) {
        out.push(cur);
        cur = '';
        i += m[0].length - 1;
        continue;
      }
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** Parses one BibTeX name: "Last, First", "Last, Jr, First", "First von Last" or "{Organisation}". */
export function parseName(raw: string): RefName {
  const s = raw.trim();
  if (/^\{.*\}$/.test(s) && splitTop(s.slice(1, -1), /^\s*,/).length === 1 && !/\}\s*\S/.test(s.slice(1, -1))) return { family: latexToText(s) };
  const parts = splitTop(s, /^,/);
  if (parts.length >= 2) {
    const family = latexToText(parts[0]);
    const given = latexToText(parts.length === 3 ? parts[2] : parts[1]);
    return given ? { family, given } : { family };
  }
  const words = splitTop(s, /^\s+/);
  if (words.length === 1) return { family: latexToText(words[0]) };
  // "von" particles (lower-case words) start the family name
  let i = words.length - 1;
  while (i > 1 && /^[a-z]/.test(latexToText(words[i - 1]))) i--;
  return { family: latexToText(words.slice(i).join(' ')), given: latexToText(words.slice(0, i).join(' ')) };
}

export function parseNames(raw: string | undefined): RefName[] {
  if (!raw) return [];
  return splitTop(raw, /^\s+and\s+/i)
    .filter((n) => n.toLowerCase() !== 'others')
    .map(parseName)
    .filter((n) => n.family);
}

interface RawEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

/** Reads every entry (raw field values, still LaTeX) from a BibTeX string. */
export function parseBibtexEntries(src: string): RawEntry[] {
  const entries: RawEntry[] = [];
  const macros: Record<string, string> = { ...MONTHS };
  let i = 0;
  const n = src.length;

  const skipWs = () => {
    while (i < n && /\s/.test(src[i])) i++;
  };
  /** Reads a {balanced} or "quoted" value, i at the opening delimiter. */
  const readDelimited = (): string => {
    const open = src[i];
    const close = open === '{' ? '}' : '"';
    let depth = 0;
    const start = ++i;
    while (i < n) {
      const ch = src[i];
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') {
        if (depth === 0 && close === '}') break;
        depth--;
      } else if (ch === '"' && close === '"' && depth === 0) break;
      i++;
    }
    const v = src.slice(start, i);
    i++; // closing delimiter
    return v;
  };
  const readValue = (): string => {
    let out = '';
    for (;;) {
      skipWs();
      if (src[i] === '{' || src[i] === '"') out += readDelimited();
      else {
        const m = /^[^\s,#})]+/.exec(src.slice(i, i + 200));
        if (!m) break;
        i += m[0].length;
        const word = m[0];
        out += /^\d+$/.test(word) ? word : (macros[word.toLowerCase()] ?? word);
      }
      skipWs();
      if (src[i] === '#') {
        i++;
        continue;
      }
      break;
    }
    return out;
  };

  while (i < n) {
    const at = src.indexOf('@', i);
    if (at < 0) break;
    i = at + 1;
    const tm = /^([A-Za-z]+)\s*([{(])/.exec(src.slice(i, i + 40));
    if (!tm) continue;
    const type = tm[1].toLowerCase();
    i += tm[0].length;
    const closer = tm[2] === '{' ? '}' : ')';
    if (type === 'comment' || type === 'preamble') {
      i--;
      if (src[i] === '{') readDelimited();
      continue;
    }
    if (type === 'string') {
      skipWs();
      const nm = /^[^\s=]+/.exec(src.slice(i));
      if (!nm) continue;
      i += nm[0].length;
      skipWs();
      if (src[i] === '=') i++;
      macros[nm[0].toLowerCase()] = readValue();
      skipWs();
      if (src[i] === closer) i++;
      continue;
    }
    skipWs();
    const km = /^[^,\s}]*/.exec(src.slice(i))!;
    const key = km[0];
    i += key.length;
    const fields: Record<string, string> = {};
    for (;;) {
      skipWs();
      if (src[i] === ',') i++;
      skipWs();
      if (i >= n || src[i] === closer) {
        i++;
        break;
      }
      const fm = /^([A-Za-z][\w:.+-]*)\s*=/.exec(src.slice(i, i + 80));
      if (!fm) {
        // malformed: skip to the next entry
        const next = src.indexOf('@', i);
        i = next < 0 ? n : next;
        break;
      }
      i += fm[0].length;
      fields[fm[1].toLowerCase()] = readValue();
    }
    entries.push({ type, key, fields });
  }
  return entries;
}

const KIND: Record<string, RefKind> = {
  article: 'article', book: 'book', booklet: 'book', inbook: 'chapter', incollection: 'chapter',
  inproceedings: 'conference', conference: 'conference', proceedings: 'book', phdthesis: 'thesis', mastersthesis: 'thesis',
  thesis: 'thesis', techreport: 'report', report: 'report', online: 'web', electronic: 'web', www: 'web', manual: 'report',
};

export function cleanPages(p?: string) {
  return p ? p.replace(/\s*(-{1,3}|–|—)\s*/g, '–').trim() : undefined;
}

export function cleanDoi(d?: string) {
  if (!d) return undefined;
  const m = /10\.\d{4,9}\/\S+/.exec(d);
  return m ? m[0].replace(/[.,;]+$/, '') : undefined;
}

/** Turns BibTeX text into references. Unknown entry types become "other". */
export function parseBibtex(src: string): Reference[] {
  return parseBibtexEntries(src).map(({ type, key, fields: f }) => {
    const t = (k: string) => (f[k] != null ? latexToText(f[k]) || undefined : undefined);
    let kind: RefKind = KIND[type] ?? 'other';
    if (type === 'misc' && (f.url || f.howpublished?.includes('url'))) kind = 'web';
    const isThesisPhd = type === 'phdthesis';
    const ref: Reference = {
      id: uid(),
      kind,
      authors: parseNames(f.author),
      title: t('title') ?? t('booktitle') ?? '',
      year: (t('year') ?? t('date'))?.match(/\d{4}/)?.[0],
      volume: t('volume'),
      issue: t('number') ?? t('issue'),
      pages: cleanPages(t('pages')),
      publisher: t('publisher') ?? t('school') ?? t('institution') ?? t('organization'),
      place: t('address') ?? t('location'),
      edition: t('edition'),
      doi: cleanDoi(f.doi),
      url: f.url ? latexToText(f.url).replace(/\s/g, '') : undefined,
      key: key || undefined,
    };
    const editors = parseNames(f.editor);
    if (editors.length) ref.editors = editors;
    if (kind === 'article') ref.container = t('journal') ?? t('journaltitle');
    else if (kind === 'chapter' || kind === 'conference') ref.container = t('booktitle') ?? t('journal');
    else if (kind === 'web') ref.container = t('organization') ?? t('howpublished')?.replace(/^\\?url.*$/i, '') ?? undefined;
    else if (kind === 'thesis') ref.container = isThesisPhd ? 'Doctoral dissertation' : type === 'mastersthesis' ? "Master's thesis" : t('type');
    else if (kind === 'other') ref.container = t('journal') ?? t('howpublished');
    if (kind === 'web' && ref.publisher === ref.container) delete ref.publisher;
    for (const k of Object.keys(ref) as (keyof Reference)[]) if (ref[k] === undefined || ref[k] === '') delete ref[k];
    return ref;
  });
}

/** True if the text looks like it contains BibTeX entries. */
export const looksLikeBibtex = (s: string) => /@[A-Za-z]+\s*[{(]/.test(s);

// Citation styles. Each reference is rendered as a small piece of HTML built
// only from escaped text plus <i>/<b>, so imported data can never inject markup.
import type { CitationStyle, RefName, Reference } from '../../types';

export interface StyleInfo {
  id: CitationStyle;
  label: string;
  /** numeric styles cite as [1]; author-date styles as (Smith, 2020) */
  numeric: boolean;
  example: string;
}

export const CITATION_STYLES: StyleInfo[] = [
  { id: 'vancouver', label: 'Vancouver (numbered)', numeric: true, example: '[1]' },
  { id: 'ieee', label: 'IEEE (numbered)', numeric: true, example: '[1]' },
  { id: 'nature', label: 'Nature (superscript numbers)', numeric: true, example: '¹' },
  { id: 'apa', label: 'APA 7th (author, year)', numeric: false, example: '(Smith, 2020)' },
  { id: 'harvard', label: 'Harvard (author, year)', numeric: false, example: '(Smith, 2020)' },
  { id: 'chicago', label: 'Chicago author-date', numeric: false, example: '(Smith 2020)' },
];

export const DEFAULT_STYLE: CitationStyle = 'vancouver';
export const styleInfo = (s: CitationStyle | undefined) => CITATION_STYLES.find((x) => x.id === s) ?? CITATION_STYLES[0];
export const isNumeric = (s: CitationStyle | undefined) => styleInfo(s).numeric;

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const i = (s: string) => `<i>${esc(s)}</i>`;

/** "John Ronald" → ["J", "R"]; "Jean-Paul" → ["J-P"] */
function initialList(given: string): string[] {
  return given
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.split('-').map((p) => p.replace(/[^\p{L}]/gu, '').charAt(0).toUpperCase()).filter(Boolean).join('-'))
    .filter(Boolean);
}
const dotted = (given?: string) => (given ? initialList(given).map((x) => x.replace(/-/g, '.-') + '.').join(' ') : '');
const compact = (given?: string) => (given ? initialList(given).join('').replace(/-/g, '') : '');

/** "Smith, J. R." */
const familyDotted = (n: RefName) => (n.given ? `${n.family}, ${dotted(n.given)}` : n.family);
/** "J. R. Smith" */
const dottedFamily = (n: RefName) => (n.given ? `${dotted(n.given)} ${n.family}` : n.family);

function joinList(items: string[], sep: string, lastSep: string, pairSep = lastSep): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return items[0] + pairSep + items[1];
  return items.slice(0, -1).join(sep) + lastSep + items[items.length - 1];
}

const end = (s: string) => (/[.?!]$/.test(s.replace(/<[^>]+>/g, '')) ? s : s + '.');
const doiUrl = (r: Reference) => (r.doi ? `https://doi.org/${r.doi}` : r.url ?? '');
const ordinalEd = (e: string | undefined, suffix: string) => {
  if (!e) return '';
  const n = parseInt(e, 10);
  if (!n) return e;
  if (n === 1) return '';
  const ord = n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
  return `${n}${ord} ${suffix}`;
};

// ---------------------------------------------------------------- APA 7

function apaAuthors(list: RefName[]): string {
  const a = list.map(familyDotted);
  if (a.length > 20) return [...a.slice(0, 19)].join(', ') + ', … ' + a[a.length - 1];
  return joinList(a, ', ', ', & ', ', & ');
}

function apa(r: Reference, suffix: string): string {
  const year = `(${r.year ?? 'n.d.'}${suffix})`;
  const container = r.container ?? '';
  const titleItalic = r.kind === 'book' || r.kind === 'thesis' || r.kind === 'report' || r.kind === 'web';
  const title = titleItalic ? i(r.title) : esc(r.title);
  const parts: string[] = [];
  if (r.authors.length) parts.push(`${esc(apaAuthors(r.authors))} ${year}.`, end(title));
  else parts.push(end(title), `${year}.`);
  const ed = ordinalEd(r.edition, 'ed.');
  switch (r.kind) {
    case 'article':
    case 'other': {
      let src = container ? i(container) : '';
      if (r.volume) src += `, ${i(r.volume)}`;
      if (r.issue) src += `(${esc(r.issue)})`;
      if (r.pages) src += `, ${esc(r.pages)}`;
      if (src) parts.push(src + '.');
      break;
    }
    case 'chapter':
    case 'conference': {
      const eds = r.editors?.length ? `${esc(joinList(r.editors.map(dottedFamily), ', ', ', & ', ' & '))} (${r.editors.length > 1 ? 'Eds.' : 'Ed.'}), ` : '';
      if (container) parts.push(`In ${eds}${i(container)}${r.pages ? ` (pp. ${esc(r.pages)})` : ''}.`);
      if (r.publisher) parts.push(end(esc(r.publisher)));
      break;
    }
    case 'thesis':
      if (container || r.publisher) parts[parts.length - 1] = parts[parts.length - 1].replace(/\.$/, '') + ` [${esc([container, r.publisher].filter(Boolean).join(', '))}].`;
      break;
    default:
      if (ed) parts[r.authors.length ? 1 : 0] = parts[r.authors.length ? 1 : 0].replace(/\.$/, '') + ` (${esc(ed)}).`;
      if (r.kind === 'web' && container) parts.push(end(esc(container)));
      if (r.publisher) parts.push(end(esc(r.publisher)));
  }
  const link = doiUrl(r);
  if (link) parts.push(esc(link));
  return parts.join(' ');
}

// ---------------------------------------------------------------- Harvard (Cite Them Right)

function harvard(r: Reference, suffix: string): string {
  const names = r.authors.map(familyDotted);
  const who = names.length > 3 ? `${names[0]} et al.` : joinList(names, ', ', ' and ');
  const year = `(${r.year ?? 'no date'}${suffix})`;
  const lead = who ? `${esc(who)} ${year}` : '';
  const ed = ordinalEd(r.edition, 'edn.');
  const pub = [r.place, r.publisher].filter(Boolean).join(': ');
  let out: string;
  switch (r.kind) {
    case 'article':
    case 'other': {
      let src = r.container ? `, ${i(r.container)}` : '';
      if (r.volume) src += `, ${esc(r.volume)}`;
      if (r.issue) src += `(${esc(r.issue)})`;
      if (r.pages) src += `, pp. ${esc(r.pages)}`;
      out = `${lead ? lead + ' ' : ''}‘${esc(r.title)}’${lead ? '' : ' ' + year}${src}.`;
      break;
    }
    case 'chapter':
    case 'conference': {
      const eds = r.editors?.length ? `${esc(joinList(r.editors.map(familyDotted), ', ', ' and '))} (${r.editors.length > 1 ? 'eds' : 'ed.'}) ` : '';
      out = `${lead ? lead + ' ' : ''}‘${esc(r.title)}’${lead ? '' : ' ' + year}, in ${eds}${r.container ? i(r.container) : ''}.${pub ? ' ' + esc(pub) + (r.pages ? `, pp. ${esc(r.pages)}.` : '.') : r.pages ? ` pp. ${esc(r.pages)}.` : ''}`;
      break;
    }
    case 'thesis':
      out = `${lead ? lead + ' ' : ''}${i(r.title)}${lead ? '' : ' ' + year}. ${esc([r.container, r.publisher].filter(Boolean).join('. '))}.`;
      break;
    default:
      out = `${lead ? lead + ' ' : ''}${i(r.title)}${lead ? '' : ' ' + year}.${ed ? ' ' + esc(ed) : ''}${r.kind === 'web' && r.container ? ' ' + end(esc(r.container)) : ''}${pub ? ' ' + end(esc(pub)) : ''}`;
  }
  if (r.doi) out += ` doi:${esc(r.doi)}.`;
  else if (r.url) out += ` Available at: ${esc(r.url)}.`;
  return out.replace(/\.\./g, '.');
}

// ---------------------------------------------------------------- Chicago author-date

function chicagoAuthors(list: RefName[]): string {
  const a = list.map((n, k) => (k === 0 ? (n.given ? `${n.family}, ${n.given}` : n.family) : n.given ? `${n.given} ${n.family}` : n.family));
  if (a.length > 10) return a.slice(0, 7).join(', ') + ', et al.';
  return joinList(a, ', ', ', and ', ' and ');
}

function chicago(r: Reference, suffix: string): string {
  const year = `${r.year ?? 'n.d.'}${suffix}`;
  const lead = r.authors.length ? `${end(esc(chicagoAuthors(r.authors)))} ${year}.` : '';
  const pub = [r.place, r.publisher].filter(Boolean).join(': ');
  let out: string;
  switch (r.kind) {
    case 'article':
    case 'other': {
      let src = r.container ? ` ${i(r.container)}` : '';
      if (r.volume) src += ` ${esc(r.volume)}`;
      if (r.issue) src += ` (${esc(r.issue)})`;
      if (r.pages) src += `: ${esc(r.pages)}`;
      out = `${lead ? lead + ' ' : ''}“${end(esc(r.title))}”${lead ? '' : ' ' + year + '.'}${src}${src ? '.' : ''}`;
      break;
    }
    case 'chapter':
    case 'conference': {
      const eds = r.editors?.length ? `, edited by ${esc(joinList(r.editors.map((n) => (n.given ? `${n.given} ${n.family}` : n.family)), ', ', ', and ', ' and '))}` : '';
      out = `${lead ? lead + ' ' : ''}“${end(esc(r.title))}”${lead ? '' : ' ' + year + '.'} In ${r.container ? i(r.container) : ''}${eds}${r.pages ? `, ${esc(r.pages)}` : ''}.${pub ? ' ' + end(esc(pub)) : ''}`;
      break;
    }
    case 'thesis':
      out = `${lead ? lead + ' ' : ''}“${end(esc(r.title))}”${lead ? '' : ' ' + year + '.'} ${end(esc([r.container, r.publisher].filter(Boolean).join(', ')))}`;
      break;
    default: {
      const ed = ordinalEd(r.edition, 'ed.');
      out = `${lead ? lead + ' ' : ''}${end(i(r.title))}${lead ? '' : ' ' + year + '.'}${ed ? ' ' + esc(ed) : ''}${r.kind === 'web' && r.container ? ' ' + end(esc(r.container)) : ''}${pub ? ' ' + end(esc(pub)) : ''}`;
    }
  }
  const link = doiUrl(r);
  if (link) out += ` ${esc(link)}.`;
  return out.trim();
}

// ---------------------------------------------------------------- Vancouver

function vancouver(r: Reference): string {
  const a = r.authors.map((n) => (n.given ? `${n.family} ${compact(n.given)}` : n.family));
  const who = a.length > 6 ? a.slice(0, 6).join(', ') + ', et al' : a.join(', ');
  const parts: string[] = [];
  if (who) parts.push(end(esc(who)));
  parts.push(end(esc(r.title)));
  const pub = [r.place, r.publisher].filter(Boolean).join(': ');
  switch (r.kind) {
    case 'article':
    case 'other': {
      if (r.container) parts.push(end(esc(r.container)));
      let src = r.year ?? '';
      if (r.volume) src += `;${r.volume}`;
      if (r.issue) src += `(${r.issue})`;
      if (r.pages) src += `:${r.pages}`;
      if (src) parts.push(esc(src) + '.');
      break;
    }
    case 'chapter':
    case 'conference': {
      const eds = r.editors?.length ? `${esc(r.editors.map((n) => (n.given ? `${n.family} ${compact(n.given)}` : n.family)).join(', '))}, editor${r.editors.length > 1 ? 's' : ''}. ` : '';
      parts.push(`In: ${eds}${end(esc(r.container ?? ''))}`);
      parts.push(`${pub ? esc(pub) + '; ' : ''}${esc(r.year ?? '')}${r.pages ? `. p. ${esc(r.pages)}` : ''}.`);
      break;
    }
    default: {
      const ed = ordinalEd(r.edition, 'ed.');
      if (r.kind === 'thesis' && r.container) parts[parts.length - 1] = parts[parts.length - 1].replace(/\.$/, '') + ` [${esc(r.container)}].`;
      if (ed) parts.push(esc(ed));
      if (r.kind === 'web' && r.container) parts.push(end(esc(r.container)));
      parts.push(`${pub ? esc(pub) + '; ' : ''}${esc(r.year ?? '')}.`);
    }
  }
  if (r.doi) parts.push(`doi:${esc(r.doi)}`);
  else if (r.url) parts.push(`Available from: ${esc(r.url)}`);
  return parts.join(' ').replace(/ \./g, '.');
}

// ---------------------------------------------------------------- IEEE

function ieee(r: Reference): string {
  const a = r.authors.map(dottedFamily);
  const who = a.length > 6 ? `${a[0]} et al.` : joinList(a, ', ', ', and ', ' and ');
  const lead = who ? esc(who) + ', ' : '';
  const pub = [r.place, r.publisher].filter(Boolean).join(': ');
  let out: string;
  switch (r.kind) {
    case 'article':
    case 'other': {
      const bits = [r.container && i(r.container), r.volume && `vol. ${esc(r.volume)}`, r.issue && `no. ${esc(r.issue)}`, r.pages && `${/[–-]/.test(r.pages) ? 'pp.' : 'p.'} ${esc(r.pages)}`, r.year && esc(r.year)].filter(Boolean);
      out = `${lead}“${esc(r.title)},” ${bits.join(', ')}`;
      break;
    }
    case 'chapter':
    case 'conference': {
      const eds = r.editors?.length ? `, ${esc(joinList(r.editors.map(dottedFamily), ', ', ', and ', ' and '))}, Ed${r.editors.length > 1 ? 's' : ''}.` : '';
      const bits = r.kind === 'conference'
        ? [`in ${r.container ? i(r.container) : ''}`, r.year && esc(r.year), r.pages && `pp. ${esc(r.pages)}`]
        : [`in ${r.container ? i(r.container) : ''}${eds}`, pub && esc(pub), r.year && esc(r.year), r.pages && `pp. ${esc(r.pages)}`];
      out = `${lead}“${esc(r.title)},” ${bits.filter(Boolean).join(', ')}`;
      break;
    }
    case 'thesis':
      out = `${lead}“${esc(r.title)},” ${[r.container, r.publisher, r.place, r.year].filter(Boolean).map((x) => esc(x!)).join(', ')}`;
      break;
    default: {
      const ed = ordinalEd(r.edition, 'ed.');
      out = `${lead}${end(i(r.title) + (ed ? ', ' + esc(ed) : ''))} ${[pub, r.year].filter(Boolean).map((x) => esc(x!)).join(', ')}`;
    }
  }
  out = out.replace(/[,. ]+$/, '') + '.';
  if (r.doi) out += ` doi: ${esc(r.doi)}.`;
  else if (r.url) out += ` [Online]. Available: ${esc(r.url)}`;
  return out;
}

// ---------------------------------------------------------------- Nature

function nature(r: Reference): string {
  const a = r.authors.map(familyDotted);
  const who = a.length > 5 ? `${a[0]} et al.` : joinList(a, ', ', ' & ', ' & ');
  const lead = who ? end(esc(who)) + ' ' : '';
  const pub = [r.publisher, r.year].filter(Boolean).join(', ');
  let out: string;
  switch (r.kind) {
    case 'article':
    case 'other':
      out = `${lead}${end(esc(r.title))} ${[r.container && i(r.container), r.volume && `<b>${esc(r.volume)}</b>`].filter(Boolean).join(' ')}${r.pages ? ', ' + esc(r.pages) : ''} (${esc(r.year ?? 'n.d.')}).`;
      break;
    case 'chapter':
    case 'conference': {
      const eds = r.editors?.length ? ` (eds ${esc(r.editors.map(dottedFamily).join(', '))})` : '';
      out = `${lead}in ${r.container ? i(r.container) : ''}${eds} ${r.pages ? esc(r.pages) + ' ' : ''}(${esc(pub)}).`;
      out = `${lead}${end(esc(r.title))} ` + out.slice(lead.length);
      break;
    }
    default:
      out = `${lead}${i(r.title)}${r.kind === 'thesis' && r.container ? '. ' + esc(r.container) : ''} (${esc(pub || 'n.d.')}).`;
  }
  if (r.doi) out += ` https://doi.org/${esc(r.doi)}`;
  else if (r.url) out += ` ${esc(r.url)}`;
  return out;
}

/** One formatted reference (HTML). `suffix` is the a/b letter for same-author, same-year works. */
export function formatReference(r: Reference, style: CitationStyle, suffix = ''): string {
  switch (style) {
    case 'apa':
      return apa(r, suffix);
    case 'harvard':
      return harvard(r, suffix);
    case 'chicago':
      return chicago(r, suffix);
    case 'ieee':
      return ieee(r);
    case 'nature':
      return nature(r);
    default:
      return vancouver(r);
  }
}

/** The author part of an author-date citation: "Smith", "Smith & Jones", "Smith et al." */
export function citeAuthors(r: Reference, style: CitationStyle): string {
  const fam = r.authors.map((n) => n.family);
  const and = style === 'apa' ? ' & ' : ' and ';
  if (!fam.length) return `“${r.title.length > 40 ? r.title.slice(0, 37).trimEnd() + '…' : r.title}”`;
  if (fam.length === 1) return fam[0];
  if (fam.length === 2) return fam[0] + and + fam[1];
  if (fam.length === 3 && style !== 'apa') return `${fam[0]}, ${fam[1]}${style === 'chicago' ? ',' : ''} and ${fam[2]}`;
  return `${fam[0]} et al.`;
}

/** Compresses numbers: [1, 2, 3, 5] → "1–3, 5". */
export function compressNumbers(nums: number[], sep = ', '): string {
  const s = [...new Set(nums)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let k = 0; k < s.length; ) {
    let j = k;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j - k >= 2 ? `${s[k]}–${s[j]}` : j === k ? `${s[k]}` : `${s[k]}${sep}${s[j]}`);
    k = j + 1;
  }
  return out.join(sep);
}

/** Short label for lists and pickers: "Smith et al. 2020 — Title" */
export function shortLabel(r: Reference): string {
  const who = r.authors.length ? (r.authors.length > 2 ? `${r.authors[0].family} et al.` : r.authors.map((a) => a.family).join(' & ')) : '';
  return [who, r.year].filter(Boolean).join(' ') || r.title || 'Untitled reference';
}

/** Key for sorting author-date reference lists. */
export function sortKey(r: Reference): string {
  const who = r.authors.map((a) => `${a.family} ${a.given ?? ''}`).join(' ') || r.title;
  return `${who.toLocaleLowerCase()}\u0000${r.year ?? '0000'}\u0000${r.title.toLocaleLowerCase()}`;
}

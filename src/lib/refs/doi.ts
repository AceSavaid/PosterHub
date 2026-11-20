// Looking up references by DOI. Crossref holds almost all journal, book and
// conference DOIs; DataCite holds arXiv, Zenodo and data-repository DOIs.
// Both answer browsers directly (CORS), so no server is needed.
import type { RefKind, RefName, Reference } from '../../types';
import { uid } from '../../model';
import { cleanDoi, cleanPages } from './bibtex';

/** Hosts contacted for DOI lookups. A Content-Security-Policy must allow these in connect-src. */
export const LOOKUP_ORIGINS = ['https://api.crossref.org', 'https://api.datacite.org'] as const;

/**
 * Finds DOIs in pasted text: bare DOIs, doi.org links, "doi:" prefixes and
 * arXiv ids (which have DataCite DOIs). Duplicates are dropped.
 */
export function extractDois(text: string): string[] {
  const out: string[] = [];
  const add = (d: string) => {
    const c = d.replace(/[.,;:)\]}>'"]+$/, '');
    if (!out.some((x) => x.toLowerCase() === c.toLowerCase())) out.push(c);
  };
  for (const m of text.matchAll(/10\.\d{4,9}\/[^\s"<>]+/g)) add(decodeURIComponent(m[0]));
  for (const m of text.matchAll(/arxiv[:\s/]*(?:abs\/)?(\d{4}\.\d{4,5})(?:v\d+)?/gi)) add(`10.48550/arXiv.${m[1]}`);
  return out;
}

/** Plain text from a title that may contain JATS/MathML tags or entities (common in Crossref data). */
export function stripMarkup(s: string | undefined): string {
  if (!s) return '';
  const t = document.createElement('template');
  t.innerHTML = s;
  return (t.content.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const first = (v: unknown): string | undefined => {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === 'string' || typeof x === 'number' ? stripMarkup(String(x)) || undefined : undefined;
};

type Json = Record<string, unknown>;

function names(list: unknown): RefName[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((a: Json): RefName | null => {
      const family = stripMarkup((a.family ?? a.familyName) as string);
      const given = stripMarkup((a.given ?? a.givenName) as string);
      if (family) return given ? { family, given } : { family };
      const literal = stripMarkup((a.literal ?? a.name) as string);
      if (!literal) return null;
      // DataCite personal names are "Family, Given"
      if (a.nameType === 'Personal' && literal.includes(',')) {
        const [f, g] = literal.split(/,\s*/, 2);
        return { family: f, given: g };
      }
      return { family: literal };
    })
    .filter((n): n is RefName => !!n);
}

const CSL_KIND: Record<string, RefKind> = {
  'article-journal': 'article', 'journal-article': 'article', article: 'article', 'article-magazine': 'article', 'article-newspaper': 'article',
  book: 'book', monograph: 'book', 'edited-book': 'book', 'reference-book': 'book',
  chapter: 'chapter', 'book-chapter': 'chapter', 'book-section': 'chapter', 'entry-encyclopedia': 'chapter', 'reference-entry': 'chapter',
  'paper-conference': 'conference', 'proceedings-article': 'conference',
  thesis: 'thesis', dissertation: 'thesis', report: 'report', webpage: 'web', 'post-weblog': 'web',
};

function yearOf(m: Json): string | undefined {
  for (const k of ['issued', 'published', 'published-print', 'published-online', 'created']) {
    const d = m[k] as { 'date-parts'?: number[][]; raw?: string } | undefined;
    const y = d?.['date-parts']?.[0]?.[0];
    if (y) return String(y);
    const raw = d?.raw?.match(/\d{4}/)?.[0];
    if (raw) return raw;
  }
  return undefined;
}

/** Maps a CSL-JSON item, or a Crossref "message" (nearly the same shape), to a reference. */
export function fromCsl(m: Json): Reference {
  const type = String(m.type ?? '');
  const kind = CSL_KIND[type] ?? (type === 'posted-content' ? 'other' : 'other');
  const ref: Reference = {
    id: uid(),
    kind,
    authors: names(m.author),
    title: first(m.title) ?? '',
    container: first(m['container-title']) ?? (type === 'posted-content' ? first(m.institution) ?? first(m['group-title']) : undefined),
    year: yearOf(m),
    volume: first(m.volume),
    issue: first(m.issue),
    pages: cleanPages(first(m.page)),
    publisher: first(m.publisher),
    place: first(m['publisher-place']),
    edition: first(m.edition),
    doi: cleanDoi(first(m.DOI)),
    url: first(m.URL),
  };
  const editors = names(m.editor);
  if (editors.length) ref.editors = editors;
  if (kind === 'thesis' && !ref.container) ref.container = first(m.genre) ?? 'Doctoral dissertation';
  if (ref.doi) delete ref.url; // the DOI link is enough
  for (const k of Object.keys(ref) as (keyof Reference)[]) if (ref[k] === undefined || ref[k] === '') delete ref[k];
  return ref;
}

const DATACITE_KIND: Record<string, RefKind> = {
  JournalArticle: 'article', Book: 'book', BookChapter: 'chapter', ConferencePaper: 'conference', ConferenceProceeding: 'conference',
  Dissertation: 'thesis', Report: 'report', Preprint: 'other', Dataset: 'other', Software: 'other', Text: 'other',
};

/** Maps a DataCite REST API record (data.attributes) to a reference. */
export function fromDataCite(a: Json): Reference {
  const types = (a.types ?? {}) as Json;
  const titles = (a.titles ?? []) as Json[];
  const publisher = typeof a.publisher === 'string' ? a.publisher : ((a.publisher as Json | undefined)?.name as string | undefined);
  const container = (a.container as Json | undefined)?.title as string | undefined;
  const doi = String(a.doi ?? '');
  const ref: Reference = {
    id: uid(),
    kind: DATACITE_KIND[String(types.resourceTypeGeneral)] ?? 'other',
    authors: names(a.creators),
    title: stripMarkup(titles[0]?.title as string),
    year: a.publicationYear ? String(a.publicationYear) : undefined,
    publisher: stripMarkup(publisher) || undefined,
    container: stripMarkup(container) || undefined,
    doi: cleanDoi(doi),
  };
  // arXiv preprints read better with the archive named
  if (/^10\.48550\/arxiv\./i.test(doi) && !ref.container) ref.container = 'arXiv';
  if (ref.container === ref.publisher) delete ref.publisher;
  for (const k of Object.keys(ref) as (keyof Reference)[]) if (ref[k] === undefined || ref[k] === '') delete ref[k];
  return ref;
}

export class LookupError extends Error {}

/** Fetches one DOI's metadata, trying Crossref first and then DataCite. */
export async function lookupDoi(doi: string, fetchFn: typeof fetch = fetch, signal?: AbortSignal): Promise<Reference> {
  const enc = encodeURIComponent(doi);
  let offline = false;
  try {
    const r = await fetchFn(`${LOOKUP_ORIGINS[0]}/works/${enc}`, { signal, headers: { Accept: 'application/json' } });
    if (r.ok) {
      const j = (await r.json()) as { message?: Json };
      if (j.message) return fromCsl(j.message);
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    offline = true;
  }
  try {
    const r = await fetchFn(`${LOOKUP_ORIGINS[1]}/dois/${enc}`, { signal, headers: { Accept: 'application/vnd.api+json' } });
    if (r.ok) {
      const j = (await r.json()) as { data?: { attributes?: Json } };
      if (j.data?.attributes) return fromDataCite(j.data.attributes);
    }
    offline = false;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
  }
  throw new LookupError(offline ? `Couldn't reach the DOI service for ${doi}. Check your internet connection, or paste BibTeX instead.` : `No record found for DOI ${doi}.`);
}

/** Pasted CSL-JSON (an item or an array of items), as exported by Zotero and Mendeley. */
export function parseCslJson(text: string): Reference[] | null {
  const t = text.trim();
  if (!/^[[{]/.test(t)) return null;
  try {
    const j = JSON.parse(t) as unknown;
    const items = (Array.isArray(j) ? j : [j]) as Json[];
    if (!items.every((x) => x && typeof x === 'object' && ('title' in x || 'type' in x))) return null;
    return items.map(fromCsl);
  } catch {
    return null;
  }
}

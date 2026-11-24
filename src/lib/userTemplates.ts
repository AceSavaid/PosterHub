// "My templates": any poster can be saved as a reusable starting point.
//
// A saved template keeps the poster's size, grid, colours, fonts, background,
// element positions and section roles, plus any pictures the user chose to
// keep (usually logos). Everything else that is content (text, figures, graph
// data, table cells, equations, references, review notes) is swapped for
// example text, so a new poster made from it starts clean.
//
// Templates are kept in their own IndexedDB database (separate from the
// posters library) and can be exported to / imported from a
// `.postertemplate.json` file to share with colleagues.
import type { AuthorList, ChartSpec, Poster, PosterElement } from '../types';
import { uid } from '../model';
import { authorsHtml } from './authors';
import { htmlToText, sanitizePoster } from './sanitize';
import { safeFileName } from './posterFile';
import { syncCitations } from './refs/citations';
import { captionHtml, relinkCopies, syncCaptions } from './captions';

export interface UserTemplate {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** The poster with its content replaced by example text. */
  poster: Poster;
}

export const TEMPLATE_EXT = '.postertemplate.json';
const FILE_APP = 'posterhub-template';

// ---------------------------------------------------------------- content → example text

const EXAMPLE_SENTENCES = [
  'Replace this text with your own.',
  'Keep paragraphs short and readable from two metres away.',
  'Use figures to tell the story and text to support them.',
  'Lead with what you found, then explain how.',
  'One idea per paragraph works best on a poster.',
  'Cut anything a visitor would not miss.',
];

/** Example text with about `words` words, so the box stays about as full as it was. */
export function exampleText(words: number): string {
  const target = Math.max(5, Math.min(words, 400));
  const out: string[] = [];
  let n = 0;
  for (let i = 0; n < target; i++) {
    const s = EXAMPLE_SENTENCES[i % EXAMPLE_SENTENCES.length];
    const ws = s.split(' ');
    if (n + ws.length > target + 3 && out.length) break;
    out.push(s);
    n += ws.length;
  }
  return out.join(' ');
}

const wordCount = (html: string | undefined) => htmlToText(html ?? '').split(/\s+/).filter(Boolean).length;

export const EXAMPLE_AUTHORS: AuthorList = {
  authors: [
    { name: 'Author One', affiliations: [0], presenter: true, corresponding: true },
    { name: 'Author Two', affiliations: [1] },
  ],
  affiliations: ['Department, University', 'Institute, University'],
  email: 'you@university.edu',
  showOrcid: false,
};

// These match PLACEHOLDER_TEXT in checks.ts, so the Check panel reminds people to replace them.
const EXAMPLE_TITLE = 'Your Poster Title Goes Here';
const EXAMPLE_LATEX = 'y = \\beta_0 + \\beta_1 x + \\varepsilon';

/** Example graph data in the same shape (kind, number of series) as the original. */
function exampleChart(c: ChartSpec): ChartSpec {
  const series = Math.max(1, Math.min(c.yColumns.length || 1, 4));
  const columns = ['Group', ...Array.from({ length: series }, (_, i) => `Series ${i + 1}`)];
  const values = [[12, 9, 14, 7], [18, 13, 11, 10], [15, 17, 9, 12], [21, 15, 13, 8], [16, 11, 16, 14]];
  const rows = values.map((v, r) => [`Group ${String.fromCharCode(65 + r)}`, ...v.slice(0, series).map(String)]);
  if (c.kind === 'scatter') rows.forEach((row, r) => (row[0] = String(r + 1)));
  return {
    ...c,
    title: c.title ? 'Graph title' : '',
    columns,
    rows,
    xColumn: 0,
    yColumns: columns.slice(1).map((_, i) => i + 1),
    rowStart: 0,
    rowEnd: rows.length - 1,
    xLabel: c.xLabel ? 'X axis label' : '',
    yLabel: c.yLabel ? 'Y axis label' : '',
  };
}

const isQr = (e: PosterElement) => !!e.qr || e.role === 'qr' || e.placeholder === 'QR code';

/**
 * Pictures that are most likely part of the look (logos, decoration) rather
 * than the poster's content. They start ticked in the "Save as template" box.
 */
export function isLikelyLogo(e: PosterElement, poster: Pick<Poster, 'width' | 'height'>): boolean {
  if (e.type !== 'image' || isQr(e)) return false;
  if (e.role === 'logo' || e.role === 'decor' || e.placeholder === 'Logo') return true;
  if (e.role) return false;
  const small = e.w * e.h < poster.width * poster.height * 0.03;
  const cy = e.y + e.h / 2;
  return small && (cy < poster.height * 0.2 || cy > poster.height * 0.85);
}

/** Pictures on the poster (with an image in them) that the user can choose to keep. */
export const templatePictures = (p: Poster) => p.elements.filter((e) => e.type === 'image' && !!e.src && !isQr(e));

function exampleElement(src: PosterElement, keep: Set<string>): PosterElement {
  const e = structuredClone(src);
  switch (e.type) {
    case 'title':
      e.html = EXAMPLE_TITLE;
      break;
    case 'subtitle':
      if (e.authors) {
        e.authors = structuredClone(EXAMPLE_AUTHORS);
        e.html = authorsHtml(e.authors);
      } else e.html = 'Author One, Author Two · Department, University';
      break;
    case 'heading':
      // Section names ("Methods", "Results") are part of the layout: keep them.
      break;
    case 'text':
      if (e.authors) {
        e.authors = structuredClone(EXAMPLE_AUTHORS);
        e.html = authorsHtml(e.authors);
      } else if (e.refList) {
        // Regenerated from the (now empty) reference library.
        e.html = '';
      } else if (e.role === 'title') e.html = EXAMPLE_TITLE;
      else if (e.role === 'heading' || e.role === 'summaryHeading' || e.role === 'number' || e.role === 'qrCaption') {
        // structural labels: keep
      } else if (e.captionOf) e.html = captionHtml('Describe what the figure shows.');
      else if (e.role === 'caption') e.html = 'Figure 1. Describe what the figure shows.';
      else e.html = exampleText(wordCount(e.html));
      break;
    case 'image':
      if (isQr(e)) {
        delete e.src;
        delete e.qr;
        delete e.crop;
        delete e.alt;
        e.placeholder = 'QR code';
      } else if (!(e.src && keep.has(e.id))) {
        delete e.src;
        delete e.crop;
        delete e.alt;
        e.placeholder = e.placeholder || (e.role === 'logo' ? 'Logo' : 'Figure');
      }
      break;
    case 'chart':
      if (e.chart) e.chart = exampleChart(e.chart);
      delete e.alt;
      break;
    case 'table':
      if (e.table) {
        const t = e.table;
        t.rows = t.rows.map((row, r) => row.map((_, c) => (t.headerRow && r === 0 ? `Column ${c + 1}` : c === 0 ? `Row ${r + (t.headerRow ? 0 : 1)}` : '0.0')));
      }
      break;
    case 'equation':
      if (e.equation) e.equation.latex = EXAMPLE_LATEX;
      break;
    case 'shape':
      if (e.html) e.html = exampleText(wordCount(e.html));
      break;
  }
  return e;
}

export interface MakeTemplateOptions {
  /** ids of pictures to keep as they are; defaults to the ones that look like logos */
  keepPictures?: string[];
}

/** Turns a poster into a template: same look and layout, example content. Does not change `poster`. */
export function posterToTemplate(poster: Poster, name: string, opts: MakeTemplateOptions = {}): UserTemplate {
  const keep = new Set(opts.keepPictures ?? templatePictures(poster).filter((e) => isLikelyLogo(e, poster)).map((e) => e.id));
  const p = structuredClone(poster);
  delete p.thumbnail;
  delete p.notes;
  delete p.ignoredWords;
  p.references = [];
  p.elements = poster.elements.map((e) => exampleElement(e, keep));
  const clean = name.trim() || poster.name || 'My template';
  p.name = clean;
  syncCitations(p);
  syncCaptions(p);
  const now = Date.now();
  return { id: uid(), name: clean, createdAt: now, updatedAt: now, poster: p };
}

/** A fresh poster made from a saved template, with new ids so it never collides with the original. */
export function posterFromTemplate(t: UserTemplate, name: string): Poster {
  const p = structuredClone(t.poster);
  const groups = new Map<string, string>();
  const remap = (g: string | undefined) => {
    if (!g) return g;
    if (!groups.has(g)) groups.set(g, uid());
    return groups.get(g);
  };
  const ids = new Map<string, string>();
  p.elements = p.elements.map((e) => {
    const out = { ...e, id: uid() };
    ids.set(e.id, out.id);
    if (e.group) out.group = remap('s:' + e.group);
    if (e.groupId) out.groupId = remap('g:' + e.groupId);
    return out;
  });
  relinkCopies(p.elements, ids);
  const now = Date.now();
  return { ...p, id: uid(), name: name.trim() || 'Untitled poster', createdAt: now, updatedAt: now };
}

// ---------------------------------------------------------------- files

export function templateToText(t: UserTemplate): string {
  return JSON.stringify({ app: FILE_APP, version: 1, name: t.name, poster: t.poster }, null, 1);
}

export const templateFileName = (t: Pick<UserTemplate, 'name'>) => safeFileName(t.name) + TEMPLATE_EXT;

/** Reads a template file (from anyone), cleaning it like any imported poster. Gives it a new id. */
export function parseTemplateText(text: string): UserTemplate {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not a PosterHub template.');
  }
  const d = data as { app?: unknown; name?: unknown; poster?: Poster };
  const p = d?.poster;
  if (d?.app !== FILE_APP || !p || typeof p !== 'object' || !Array.isArray(p.elements) || !(p.width > 0) || !(p.height > 0)) {
    throw new Error('This file is not a PosterHub template.');
  }
  delete p.notes;
  delete p.thumbnail;
  sanitizePoster(p);
  const name = (typeof d.name === 'string' && d.name.trim()) || (typeof p.name === 'string' && p.name) || 'Imported template';
  const now = Date.now();
  return { id: uid(), name: name.slice(0, 120), createdAt: now, updatedAt: now, poster: { ...p, name } };
}

/** "Name", or "Name (2)", "Name (3)" … if that name is taken. */
export function uniqueName(name: string, taken: string[]): string {
  const set = new Set(taken.map((n) => n.toLowerCase()));
  if (!set.has(name.toLowerCase())) return name;
  const base = name.replace(/ \(\d+\)$/, '');
  for (let i = 2; ; i++) if (!set.has(`${base} (${i})`.toLowerCase())) return `${base} (${i})`;
}

// ---------------------------------------------------------------- storage

export interface TemplateStore {
  list(): Promise<UserTemplate[]>;
  save(t: UserTemplate): Promise<void>;
  delete(id: string): Promise<void>;
}

const DB_NAME = 'posterhub-templates';
const STORE = 'templates';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const idbStore: TemplateStore = {
  async list() {
    return tx<UserTemplate[]>('readonly', (s) => s.getAll());
  },
  async save(t) {
    await tx('readwrite', (s) => s.put(t));
  },
  async delete(id) {
    await tx('readwrite', (s) => s.delete(id));
  },
};

/** An in-memory store, for tests. */
export function memoryTemplateStore(): TemplateStore {
  const m = new Map<string, UserTemplate>();
  return {
    list: async () => [...m.values()].map((t) => structuredClone(t)),
    save: async (t) => void m.set(t.id, structuredClone(t)),
    delete: async (id) => void m.delete(id),
  };
}

let store: TemplateStore = idbStore;
/** For tests: swap where templates are kept. */
export const setTemplateStore = (s: TemplateStore) => void (store = s);

/** Saved templates, newest first. */
export async function listTemplates(): Promise<UserTemplate[]> {
  return (await store.list()).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Saves a poster as a new template, making its name unique among saved templates. */
export async function saveAsTemplate(poster: Poster, name: string, opts: MakeTemplateOptions = {}): Promise<UserTemplate> {
  const t = posterToTemplate(poster, name, opts);
  t.name = uniqueName(t.name, (await store.list()).map((x) => x.name));
  t.poster.name = t.name;
  await store.save(t);
  return t;
}

export async function renameTemplate(id: string, name: string): Promise<UserTemplate | undefined> {
  const t = (await store.list()).find((x) => x.id === id);
  const clean = name.trim();
  if (!t || !clean || clean === t.name) return t;
  const next = { ...t, name: clean, updatedAt: Date.now(), poster: { ...t.poster, name: clean } };
  await store.save(next);
  return next;
}

export const deleteTemplate = (id: string) => store.delete(id);

/** Adds a template read from a file, renaming it if the name is already used. */
export async function importTemplateText(text: string): Promise<UserTemplate> {
  const t = parseTemplateText(text);
  t.name = uniqueName(t.name, (await store.list()).map((x) => x.name));
  t.poster.name = t.name;
  await store.save(t);
  return t;
}

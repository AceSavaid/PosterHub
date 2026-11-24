// Library kept in the browser's IndexedDB so it survives reloads and handles
// large embedded images. Used by the web version on GitHub Pages.
//
// Each poster is kept twice: in full in `posters`, and as a small card record
// (name, size, dates, thumbnail) in `summaries`. My posters reads only the cards,
// so it opens quickly even when the posters hold many large pictures.
import type { Poster } from '../../types';
import { summarize, type PosterStore, type PosterSummary } from './types';

const DB_NAME = 'posterhub';
const POSTERS = 'posters';
const SUMMARIES = 'summaries';
const VERSION = 2;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(POSTERS)) db.createObjectStore(POSTERS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SUMMARIES)) {
        const summaries = db.createObjectStore(SUMMARIES, { keyPath: 'id' });
        // Posters saved before version 2 get their card record now, once.
        req.transaction!.objectStore(POSTERS).openCursor().onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cursor) return;
          summaries.put(summarize(cursor.value as Poster));
          cursor.continue();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Runs `fn` in one transaction over both stores; resolves with `fn`'s request result once it commits. */
async function tx<T>(mode: IDBTransactionMode, fn: (posters: IDBObjectStore, summaries: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction([POSTERS, SUMMARIES], mode);
    const req = fn(t.objectStore(POSTERS), t.objectStore(SUMMARIES));
    t.oncomplete = () => resolve(req ? req.result : (undefined as T));
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const newestFirst = (a: { updatedAt: number }, b: { updatedAt: number }) => b.updatedAt - a.updatedAt;

export const browserStore: PosterStore = {
  kind: 'browser',
  location: 'this browser',
  async list() {
    return (await tx<Poster[]>('readonly', (s) => s.getAll())).sort(newestFirst);
  },
  async summaries() {
    return (await tx<PosterSummary[]>('readonly', (_, s) => s.getAll())).sort(newestFirst);
  },
  load: (id) => tx<Poster | undefined>('readonly', (s) => s.get(id)),
  async save(p) {
    await tx('readwrite', (posters, summaries) => {
      posters.put(p);
      summaries.put(summarize(p));
    });
  },
  async delete(id) {
    await tx('readwrite', (posters, summaries) => {
      posters.delete(id);
      summaries.delete(id);
    });
  },
};

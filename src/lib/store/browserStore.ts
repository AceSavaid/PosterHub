// Library kept in the browser's IndexedDB so it survives reloads and handles
// large embedded images. Used by the web version on GitHub Pages.
import type { Poster } from '../../types';
import type { PosterStore } from './types';

const DB_NAME = 'posterhub';
const STORE = 'posters';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const browserStore: PosterStore = {
  kind: 'browser',
  location: 'this browser',
  async list() {
    const all = await tx<Poster[]>('readonly', (s) => s.getAll());
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  },
  load: (id) => tx<Poster | undefined>('readonly', (s) => s.get(id)),
  async save(p) {
    await tx('readwrite', (s) => s.put(p));
  },
  async delete(id) {
    await tx('readwrite', (s) => s.delete(id));
  },
};

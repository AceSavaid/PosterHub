// Local library of posters, kept in the browser's IndexedDB so it survives
// reloads and handles large embedded images. A desktop build can swap this
// module for one that reads/writes a folder on disk.
import type { Poster } from '../types';

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

export const savePoster = (p: Poster) => tx('readwrite', (s) => s.put(p));
export const loadPoster = (id: string) => tx<Poster | undefined>('readonly', (s) => s.get(id));
export const deletePoster = (id: string) => tx('readwrite', (s) => s.delete(id));
export async function listPosters(): Promise<Poster[]> {
  const all = await tx<Poster[]>('readonly', (s) => s.getAll());
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

const FILE_EXT = '.poster.json';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function safeFileName(name: string) {
  return (name || 'poster').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'poster';
}

export function exportPosterFile(p: Poster) {
  const { thumbnail: _t, ...rest } = p;
  const blob = new Blob([JSON.stringify({ app: 'posterhub', ...rest }, null, 1)], { type: 'application/json' });
  downloadBlob(blob, safeFileName(p.name) + FILE_EXT);
}

export async function readPosterFile(file: File): Promise<Poster> {
  const data = JSON.parse(await readText(file));
  if (!data || typeof data !== 'object' || !Array.isArray(data.elements) || !data.width || !data.height) {
    throw new Error('This file is not a PosterHub project.');
  }
  delete data.app;
  return data as Poster;
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function readText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

// The "My posters" library and file helpers. Where posters are kept depends
// on the platform (see ./store): browser storage on the web, a folder of
// `.poster.json` files in the desktop app.
import type { Poster } from '../types';
import { getStore, isDesktop } from './store';
import { FILE_EXT, parsePosterText, posterToText, safeFileName } from './posterFile';

export { isDesktop } from './store';
export { safeFileName } from './posterFile';

export const savePoster = async (p: Poster) => (await getStore()).save(p);
export const loadPoster = async (id: string) => (await getStore()).load(id);
export const deletePoster = async (id: string) => (await getStore()).delete(id);
export const listPosters = async () => (await getStore()).list();
/** Card details for My posters, without each poster's content (much quicker with many pictures). */
export const listPosterSummaries = async () => (await getStore()).summaries();

/** Where posters are saved, for showing to the user. */
export async function storageInfo(): Promise<{ kind: 'browser' | 'folder'; location: string }> {
  const s = await getStore();
  return { kind: s.kind, location: s.location };
}

/** Desktop only: open the library folder in Finder / Explorer / the file manager. */
export async function openLibraryFolder() {
  const [{ openFolder }, s] = await Promise.all([import('./store/tauri'), getStore()]);
  await openFolder(s.location);
}

/**
 * Save a generated file. On the web this downloads it; in the desktop app it
 * asks where to save. Resolves to false if the user cancelled.
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<boolean> {
  if (isDesktop()) return (await import('./store/tauri')).saveBlobAs(blob, filename);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

export function exportPosterFile(p: Poster) {
  const blob = new Blob([posterToText(p)], { type: 'application/json' });
  return downloadBlob(blob, safeFileName(p.name) + FILE_EXT);
}

export async function readPosterFile(file: File): Promise<Poster> {
  return parsePosterText(await readText(file));
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

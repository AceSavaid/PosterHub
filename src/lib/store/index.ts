// Picks where the "My posters" library lives: a folder on disk in the desktop
// app, the browser's storage on the web.
import type { PosterStore } from './types';
import { browserStore } from './browserStore';
import { FolderStore } from './folderStore';

export type { PosterStore, PosterSummary } from './types';

/** True when running inside the PosterHub desktop app (Tauri). */
export function isDesktop() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

let current: Promise<PosterStore> | null = null;

export function getStore(): Promise<PosterStore> {
  if (!current) {
    current = isDesktop()
      ? import('./tauri').then(async (t) => new FolderStore(await t.tauriFolderFs()))
      : Promise.resolve(browserStore);
    current.catch(() => (current = null));
  }
  return current;
}

/** For tests: forget the chosen store so the next call picks again. */
export function resetStore() {
  current = null;
}

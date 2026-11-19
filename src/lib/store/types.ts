import type { Poster } from '../../types';

/**
 * Where the "My posters" library lives. The web app keeps posters in the
 * browser (IndexedDB); the desktop app keeps each poster as a `.poster.json`
 * file in a folder on disk. The rest of the app only talks to this interface.
 */
export interface PosterStore {
  /** "browser" or "folder"; used to word messages in the UI. */
  readonly kind: 'browser' | 'folder';
  /** Human-readable place the posters are saved, e.g. a folder path. */
  readonly location: string;
  list(): Promise<Poster[]>;
  load(id: string): Promise<Poster | undefined>;
  save(p: Poster): Promise<void>;
  delete(id: string): Promise<void>;
}

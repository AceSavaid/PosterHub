import type { Poster } from '../../types';

/** What a My posters card shows: everything but the poster's content, so the list loads quickly. */
export type PosterSummary = Pick<Poster, 'id' | 'name' | 'width' | 'height' | 'createdAt' | 'updatedAt' | 'thumbnail'> & {
  /** The poster's background colour, for a card that has no thumbnail yet. */
  background?: string;
};

export function summarize(p: Poster): PosterSummary {
  return { id: p.id, name: p.name, width: p.width, height: p.height, createdAt: p.createdAt, updatedAt: p.updatedAt, thumbnail: p.thumbnail, background: p.palette?.background };
}

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
  /** Every poster in full. Slow with many pictures: use `summaries` for listing. */
  list(): Promise<Poster[]>;
  /** Every poster's card details, newest first, without loading their content. */
  summaries(): Promise<PosterSummary[]>;
  load(id: string): Promise<Poster | undefined>;
  save(p: Poster): Promise<void>;
  delete(id: string): Promise<void>;
}

// Library kept as one `.poster.json` file per poster in a folder on disk
// (used by the desktop app). The files are ordinary PosterHub project files,
// so they can be backed up, synced, emailed, or opened in the web version.
import type { Poster } from '../../types';
import { summarize, type PosterStore } from './types';
import { FILE_EXT, parsePosterText, posterToText, safeFileName } from '../posterFile';

/** The few file operations the folder store needs, relative to the library folder. */
export interface FolderFs {
  /** Absolute path of the folder, shown to the user. */
  readonly location: string;
  /** Create the folder if it does not exist yet. */
  ensure(): Promise<void>;
  /** File names (not paths) directly inside the folder. */
  list(): Promise<string[]>;
  read(name: string): Promise<string>;
  write(name: string, text: string): Promise<void>;
  /** Move `from` to `to`, replacing `to` if it exists. */
  rename(from: string, to: string): Promise<void>;
  remove(name: string): Promise<void>;
}

const TMP_SUFFIX = '.saving';

export class FolderStore implements PosterStore {
  readonly kind = 'folder' as const;
  /** poster id -> file name */
  private files = new Map<string, string>();
  private scanned = false;
  /** All writes go through one queue so autosaves never interleave. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Files in the folder that could not be read, for the UI to mention. */
  problems: string[] = [];

  constructor(private fs: FolderFs) {}

  get location() {
    return this.fs.location;
  }

  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async scan(): Promise<Poster[]> {
    await this.fs.ensure();
    const names = (await this.fs.list()).filter((n) => n.toLowerCase().endsWith(FILE_EXT) && !n.startsWith('.')).sort();
    const files = new Map<string, string>();
    const posters: Poster[] = [];
    const problems: string[] = [];
    const parsed: { name: string; p: Poster; canonical: boolean }[] = [];
    for (const name of names) {
      try {
        const p = parsePosterText(await this.fs.read(name));
        parsed.push({ name, p, canonical: name === safeFileName(p.name) + FILE_EXT });
      } catch {
        problems.push(name);
      }
    }
    // A file copied in the file manager keeps its twin's id. The file named
    // after the poster keeps the id; each copy gets its own id (stable for its
    // file name) so both show up and save separately.
    parsed.sort((a, b) => Number(b.canonical) - Number(a.canonical));
    for (const { name, p } of parsed) {
      if (!p.id || files.has(p.id)) p.id = `${p.id || 'poster'}~${safeFileName(name.slice(0, -FILE_EXT.length))}`;
      if (typeof p.updatedAt !== 'number') p.updatedAt = 0;
      files.set(p.id, name);
      posters.push(p);
    }
    this.files = files;
    this.problems = problems;
    this.scanned = true;
    return posters;
  }

  private async ensureScanned() {
    if (!this.scanned) await this.scan();
  }

  /** Pick `<name>.poster.json`, or `<name>-2.poster.json`… if another poster already uses it. */
  private fileNameFor(p: Poster, current?: string) {
    const base = safeFileName(p.name);
    const taken = new Set([...this.files.entries()].filter(([id]) => id !== p.id).map(([, f]) => f.toLowerCase()));
    for (let i = 1; ; i++) {
      const name = base + (i === 1 ? '' : `-${i}`) + FILE_EXT;
      if (name === current || !taken.has(name.toLowerCase())) return name;
    }
  }

  list() {
    return this.run(async () => (await this.scan()).sort((a, b) => b.updatedAt - a.updatedAt));
  }

  /** The folder has to be read in full anyway, so the cards come from the full posters. */
  async summaries() {
    return (await this.list()).map(summarize);
  }

  load(id: string) {
    return this.run(async () => {
      await this.ensureScanned();
      let name = this.files.get(id);
      if (!name) {
        await this.scan();
        name = this.files.get(id);
      }
      if (!name) return undefined;
      const p = parsePosterText(await this.fs.read(name));
      p.id = id;
      return p;
    });
  }

  save(p: Poster) {
    return this.run(async () => {
      await this.ensureScanned();
      const current = this.files.get(p.id);
      const target = this.fileNameFor(p, current);
      // Write to a temporary file first, then move it into place, so a crash
      // mid-save never leaves a half-written poster behind.
      // (Not a dot-file: the desktop app's file permissions skip hidden files.)
      const tmp = target + TMP_SUFFIX;
      await this.fs.write(tmp, posterToText(p, { keepThumbnail: true }));
      await this.fs.rename(tmp, target);
      this.files.set(p.id, target);
      if (current && current !== target) await this.fs.remove(current);
    });
  }

  delete(id: string) {
    return this.run(async () => {
      await this.ensureScanned();
      const name = this.files.get(id);
      if (!name) return;
      await this.fs.remove(name);
      this.files.delete(id);
    });
  }
}

import { describe, expect, it } from 'vitest';
import { FolderStore, type FolderFs } from '../../src/lib/store/folderStore';
import { readPosterFile } from '../../src/lib/storage';
import { createPoster, PALETTES, sizeFor } from '../../src/model';
import type { Poster } from '../../src/types';

/** An in-memory folder that behaves like the desktop file system adapter. */
function memoryFs() {
  const files = new Map<string, string>();
  const log: string[] = [];
  const fs: FolderFs = {
    location: '/Users/test/Documents/PosterHub',
    async ensure() {},
    async list() {
      return [...files.keys()];
    },
    async read(name) {
      const t = files.get(name);
      if (t === undefined) throw new Error('missing ' + name);
      return t;
    },
    async write(name, text) {
      log.push('write ' + name);
      files.set(name, text);
    },
    async rename(from, to) {
      log.push(`rename ${from} -> ${to}`);
      const t = files.get(from);
      if (t === undefined) throw new Error('missing ' + from);
      files.delete(from);
      files.set(to, t);
    },
    async remove(name) {
      log.push('remove ' + name);
      files.delete(name);
    },
  };
  return { fs, files, log };
}

function poster(name: string, extra: Partial<Poster> = {}): Poster {
  return {
    ...createPoster({ name, ...sizeFor('A0', 'portrait'), sizePreset: 'A0', columns: 3, palette: PALETTES[0], headingFont: 'Lora', bodyFont: 'Inter', template: 'classic' }),
    ...extra,
  };
}

describe('desktop folder library', () => {
  it('saves each poster as a readable .poster.json file', async () => {
    const { fs, files } = memoryFs();
    const store = new FolderStore(fs);
    const p = poster('Protein folding at scale', { thumbnail: 'data:image/png;base64,AAA' });
    await store.save(p);
    expect([...files.keys()]).toEqual(['Protein-folding-at-scale.poster.json']);
    // It is a normal project file: the "Open project file" button can read it.
    const back = await readPosterFile(new File([files.get('Protein-folding-at-scale.poster.json')!], 'x.poster.json'));
    expect(back).toEqual(p);
  });

  it('lists posters newest first and loads them by id', async () => {
    const { fs } = memoryFs();
    const store = new FolderStore(fs);
    const a = poster('Older', { updatedAt: 1000 });
    const b = poster('Newer', { updatedAt: 2000 });
    await store.save(a);
    await store.save(b);
    // A fresh store (e.g. after restarting the app) finds them on disk.
    const again = new FolderStore(fs);
    expect((await again.list()).map((p) => p.name)).toEqual(['Newer', 'Older']);
    expect(await again.load(a.id)).toEqual(a);
    expect(await again.load('nope')).toBeUndefined();
  });

  it('renames the file when the poster is renamed', async () => {
    const { fs, files } = memoryFs();
    const store = new FolderStore(fs);
    const p = poster('Draft');
    await store.save(p);
    await store.save({ ...p, name: 'Final version' });
    expect([...files.keys()]).toEqual(['Final-version.poster.json']);
    expect((await store.list()).map((x) => x.name)).toEqual(['Final version']);
  });

  it('keeps posters with the same name in separate files', async () => {
    const { fs, files } = memoryFs();
    const store = new FolderStore(fs);
    const a = poster('Results');
    const b = poster('Results');
    await store.save(a);
    await store.save(b);
    await store.save({ ...a, updatedAt: a.updatedAt + 1 }); // autosave keeps its own file
    expect([...files.keys()].sort()).toEqual(['Results-2.poster.json', 'Results.poster.json']);
    expect((await store.list()).map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('deletes the file', async () => {
    const { fs, files } = memoryFs();
    const store = new FolderStore(fs);
    const p = poster('Gone soon');
    await store.save(p);
    await store.delete(p.id);
    expect(files.size).toBe(0);
    expect(await store.list()).toEqual([]);
    await store.delete('unknown'); // no error
  });

  it('writes to a temporary file first and moves it into place', async () => {
    const { fs, files, log } = memoryFs();
    const store = new FolderStore(fs);
    await store.save(poster('Safe'));
    expect(log.slice(-2)).toEqual(['write Safe.poster.json.saving', 'rename Safe.poster.json.saving -> Safe.poster.json']);
    expect([...files.keys()]).toEqual(['Safe.poster.json']);
  });

  it('runs saves one at a time so rapid autosaves do not clash', async () => {
    const { fs, files } = memoryFs();
    let inFlight = 0;
    let maxInFlight = 0;
    const slowWrite = fs.write;
    fs.write = async (n, t) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      await slowWrite(n, t);
      inFlight--;
    };
    const store = new FolderStore(fs);
    const p = poster('Busy');
    await Promise.all([1, 2, 3, 4].map((i) => store.save({ ...p, name: 'Busy ' + i })));
    expect(maxInFlight).toBe(1);
    expect([...files.keys()]).toEqual(['Busy-4.poster.json']);
  });

  it('shows files the user copied into the folder, including duplicates', async () => {
    const { fs, files } = memoryFs();
    const p = poster('Shared');
    const text = JSON.stringify({ app: 'posterhub', ...p });
    files.set('Shared.poster.json', text);
    files.set('Shared copy.poster.json', text); // copied in Finder / Explorer: same id inside
    files.set('notes.txt', 'hello');
    files.set('broken.poster.json', '{ not json');
    const store = new FolderStore(fs);
    const list = await store.list();
    expect(list).toHaveLength(2);
    expect(new Set(list.map((x) => x.id)).size).toBe(2);
    expect(store.problems).toEqual(['broken.poster.json']);
    // Editing the copy saves to the copy's file, not the original.
    const copy = list.find((x) => x.id !== p.id)!;
    await store.save({ ...copy, name: 'Shared copy', updatedAt: 5 });
    expect(JSON.parse(files.get('Shared.poster.json')!).updatedAt).toBe(p.updatedAt);
    expect(JSON.parse(files.get('Shared-copy.poster.json')!).updatedAt).toBe(5);
    expect(files.has('Shared copy.poster.json')).toBe(false);
  });

  it('ignores leftover temporary files', async () => {
    const { fs, files } = memoryFs();
    files.set('Half.poster.json.saving', '{');
    files.set('.hidden.poster.json', '{');
    expect(await new FolderStore(fs).list()).toEqual([]);
  });

  it('reports where posters are saved', () => {
    const store = new FolderStore(memoryFs().fs);
    expect(store.kind).toBe('folder');
    expect(store.location).toBe('/Users/test/Documents/PosterHub');
  });
});

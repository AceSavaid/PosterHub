import { afterEach, describe, expect, it, vi } from 'vitest';

// Stand-in for the Tauri APIs: an in-memory folder and a Save dialog spy.
const saved: { name: string; size: number }[] = [];
vi.mock('../../src/lib/store/tauri', () => {
  const files = new Map<string, string>();
  return {
    tauriFolderFs: async () => ({
      location: '/home/test/Documents/PosterHub',
      ensure: async () => {},
      list: async () => [...files.keys()],
      read: async (n: string) => files.get(n)!,
      write: async (n: string, t: string) => void files.set(n, t),
      rename: async (a: string, b: string) => {
        files.set(b, files.get(a)!);
        files.delete(a);
      },
      remove: async (n: string) => void files.delete(n),
    }),
    saveBlobAs: async (blob: Blob, name: string) => {
      saved.push({ name, size: blob.size });
      return true;
    },
    openFolder: vi.fn(async () => {}),
  };
});

import { downloadBlob, isDesktop, listPosters, savePoster, storageInfo } from '../../src/lib/storage';
import { resetStore } from '../../src/lib/store';
import { createPoster, PALETTES, sizeFor } from '../../src/model';

const tauriWindow = window as unknown as Record<string, unknown>;

afterEach(() => {
  delete tauriWindow.__TAURI_INTERNALS__;
  resetStore();
  saved.length = 0;
});

describe('platform storage', () => {
  it('uses browser storage on the web', async () => {
    expect(isDesktop()).toBe(false);
    expect(await storageInfo()).toEqual({ kind: 'browser', location: 'this browser' });
  });

  it('uses Documents/PosterHub in the desktop app', async () => {
    tauriWindow.__TAURI_INTERNALS__ = {};
    expect(isDesktop()).toBe(true);
    expect(await storageInfo()).toEqual({ kind: 'folder', location: '/home/test/Documents/PosterHub' });
    const p = createPoster({ name: 'Desk', ...sizeFor('A1', 'landscape'), sizePreset: 'A1', columns: 4, palette: PALETTES[0], headingFont: 'Lora', bodyFont: 'Inter', template: 'blank' });
    await savePoster(p);
    expect((await listPosters()).map((x) => x.name)).toEqual(['Desk']);
  });

  it('exports through a Save dialog in the desktop app', async () => {
    tauriWindow.__TAURI_INTERNALS__ = {};
    expect(await downloadBlob(new Blob(['%PDF']), 'poster.pdf')).toBe(true);
    expect(saved).toEqual([{ name: 'poster.pdf', size: 4 }]);
  });

  it('downloads normally on the web', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    expect(await downloadBlob(new Blob(['x']), 'poster.png')).toBe(true);
    expect(click).toHaveBeenCalled();
    expect(saved).toEqual([]);
    click.mockRestore();
  });
});

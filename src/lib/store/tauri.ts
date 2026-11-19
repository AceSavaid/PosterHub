// Desktop (Tauri) integrations. Only loaded when the app runs inside the
// desktop shell, so the web build never touches these APIs.
import { documentDir, homeDir, join } from '@tauri-apps/api/path';
import { exists, mkdir, readDir, readTextFile, remove, rename, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import type { FolderFs } from './folderStore';

export const LIBRARY_FOLDER_NAME = 'PosterHub';

/**
 * `Documents/PosterHub` on every platform. Some Linux desktops have no
 * "Documents" folder configured, so fall back to `~/Documents/PosterHub`.
 */
export async function libraryDir() {
  let docs: string;
  try {
    docs = await documentDir();
  } catch {
    docs = await join(await homeDir(), 'Documents');
  }
  return join(docs, LIBRARY_FOLDER_NAME);
}

export async function tauriFolderFs(): Promise<FolderFs> {
  const dir = await libraryDir();
  const p = (name: string) => join(dir, name);
  return {
    location: dir,
    async ensure() {
      if (!(await exists(dir))) await mkdir(dir, { recursive: true });
    },
    async list() {
      return (await readDir(dir)).filter((e) => e.isFile).map((e) => e.name);
    },
    read: async (name) => readTextFile(await p(name)),
    write: async (name, text) => writeTextFile(await p(name), text),
    rename: async (from, to) => rename(await p(from), await p(to)),
    remove: async (name) => remove(await p(name)),
  };
}

export async function openFolder(path: string) {
  await openPath(path);
}

const FILTERS: Record<string, { name: string; extensions: string[] }> = {
  pdf: { name: 'PDF document', extensions: ['pdf'] },
  pptx: { name: 'PowerPoint presentation', extensions: ['pptx'] },
  png: { name: 'PNG image', extensions: ['png'] },
  json: { name: 'PosterHub project', extensions: ['json'] },
};

/** Ask where to save, then write the file. Returns false if the user cancelled. */
export async function saveBlobAs(blob: Blob, filename: string): Promise<boolean> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const filter = FILTERS[ext];
  const path = await save({ defaultPath: filename, filters: filter ? [filter] : undefined });
  if (!path) return false;
  await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  return true;
}

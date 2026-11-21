// Turns the web build into an installable, offline-capable app: after Vite has
// written dist/, list every file in it and write dist/sw.js from pwa/sw.js with
// that list and a content hash, so each release precaches exactly its own files.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const SW_FILE = 'sw.js';

/** Every file under `dir`, as forward-slash paths relative to it, sorted. */
export function listFiles(dir: string, sub = ''): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
    const rel = sub ? `${sub}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(dir, rel));
    else out.push(rel);
  }
  return out.sort();
}

/** Which built files the service worker saves for offline use. */
export function precacheList(files: string[]): string[] {
  return files.filter((f) => f !== SW_FILE && !f.endsWith('.map') && !f.startsWith('.'));
}

export function buildServiceWorker(template: string, files: string[], read: (f: string) => Buffer | string): string {
  const hash = createHash('sha256');
  for (const f of files) hash.update(f).update('\0').update(read(f)).update('\0');
  hash.update(template);
  return template
    .replace('__POSTERHUB_VERSION__', hash.digest('hex').slice(0, 12))
    .replace('__POSTERHUB_PRECACHE__', JSON.stringify(files, null, 2));
}

export function pwaPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'posterhub-pwa',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const template = fs.readFileSync(path.join(import.meta.dirname, 'sw.js'), 'utf8');
      const files = precacheList(listFiles(outDir));
      fs.writeFileSync(path.join(outDir, SW_FILE), buildServiceWorker(template, files, (f) => fs.readFileSync(path.join(outDir, f))));
    },
  };
}

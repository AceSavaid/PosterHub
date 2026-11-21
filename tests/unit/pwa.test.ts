import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildServiceWorker, listFiles, precacheList } from '../../pwa/plugin';
import { shouldRegister } from '../../src/lib/pwa';

describe('service worker build', () => {
  it('lists every built file except the worker itself and source maps', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-'));
    for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', 'assets/index-abc.js', 'assets/index-abc.js.map', 'icons/icon-192.png']) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.writeFileSync(path.join(dir, f), f);
    }
    expect(precacheList(listFiles(dir))).toEqual(['assets/index-abc.js', 'icons/icon-192.png', 'index.html', 'manifest.webmanifest']);
  });

  it('fills in the file list and a version that changes when any file changes', () => {
    const template = "const VERSION = '__POSTERHUB_VERSION__';\nconst PRECACHE = __POSTERHUB_PRECACHE__;";
    const a = buildServiceWorker(template, ['index.html', 'assets/a.js'], (f) => `v1 ${f}`);
    const b = buildServiceWorker(template, ['index.html', 'assets/a.js'], (f) => (f === 'assets/a.js' ? 'v2' : `v1 ${f}`));
    expect(a).toContain('"assets/a.js"');
    expect(a).not.toContain('__POSTERHUB');
    const version = (s: string) => s.match(/VERSION = '([0-9a-f]{12})'/)![1];
    expect(version(a)).not.toBe(version(b));
    expect(buildServiceWorker(template, ['index.html', 'assets/a.js'], (f) => `v1 ${f}`)).toBe(a);
  });

  it('the shipped template has both placeholders', () => {
    const sw = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'pwa', 'sw.js'), 'utf8');
    expect(sw).toContain("'__POSTERHUB_VERSION__'");
    expect(sw).toContain('= __POSTERHUB_PRECACHE__;');
  });
});

describe('shouldRegister', () => {
  const web = { prod: true, desktop: false, supported: true, secure: true };
  it('registers on the built website', () => expect(shouldRegister(web)).toBe(true));
  it('never registers in the desktop app', () => expect(shouldRegister({ ...web, desktop: true })).toBe(false));
  it('skips the dev server, old browsers and insecure pages', () => {
    expect(shouldRegister({ ...web, prod: false })).toBe(false);
    expect(shouldRegister({ ...web, supported: false })).toBe(false);
    expect(shouldRegister({ ...web, secure: false })).toBe(false);
  });
});

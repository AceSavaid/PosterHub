// Runs the real UI in "desktop mode" by standing in for the Tauri bridge with
// an in-memory file system (kept in localStorage so it survives reloads).
// This checks the web app wires up the desktop library and Save dialogs; the
// native shell itself is built and smoke-tested by .github/workflows/desktop.yml.
import { test, expect, type Page } from '@playwright/test';

async function fakeDesktop(page: Page) {
  await page.addInitScript(() => {
    const KEY = 'fake-disk';
    const load = (): Record<string, string> => JSON.parse(localStorage.getItem(KEY) || '{}');
    const store = (d: Record<string, string>) => localStorage.setItem(KEY, JSON.stringify(d));
    const calls: { cmd: string; args: unknown }[] = [];
    const text = (b: unknown) => new TextDecoder().decode(b as Uint8Array);
    const pathOf = (opts: { headers?: Record<string, string> } | undefined) => decodeURIComponent(opts?.headers?.path ?? '');
    (window as any).__fakeCalls = calls;
    (window as any).__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
      transformCallback: () => 0,
      unregisterCallback: () => {},
      convertFileSrc: (p: string) => p,
      async invoke(cmd: string, args: any, opts: any) {
        calls.push({ cmd, args });
        const disk = load();
        switch (cmd) {
          case 'plugin:path|resolve_directory':
            return '/home/ada/Documents';
          case 'plugin:path|join':
            return args.paths.join('/');
          case 'plugin:fs|exists':
            return true;
          case 'plugin:fs|mkdir':
            return null;
          case 'plugin:fs|read_dir': {
            const prefix = args.path + '/';
            return Object.keys(disk)
              .filter((k) => k.startsWith(prefix))
              .map((k) => ({ name: k.slice(prefix.length), isFile: true, isDirectory: false, isSymlink: false }));
          }
          case 'plugin:fs|read_text_file':
            if (!(args.path in disk)) throw new Error('not found');
            return Array.from(new TextEncoder().encode(disk[args.path]));
          case 'plugin:fs|write_text_file':
          case 'plugin:fs|write_file':
            disk[pathOf(opts)] = cmd.endsWith('text_file') ? text(args) : `<${(args as Uint8Array).length} bytes>`;
            store(disk);
            return null;
          case 'plugin:fs|rename':
            disk[args.newPath] = disk[args.oldPath];
            delete disk[args.oldPath];
            store(disk);
            return null;
          case 'plugin:fs|remove':
            delete disk[args.path];
            store(disk);
            return null;
          case 'plugin:dialog|save':
            return '/home/ada/Desktop/' + args.options.defaultPath;
          case 'plugin:opener|open_path':
            return null;
          default:
            throw new Error('Unexpected Tauri call ' + cmd);
        }
      },
    };
  });
}

const disk = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('fake-disk') || '{}') as Record<string, string>);

test('desktop app keeps the library as files in Documents/PosterHub', async ({ page }) => {
  await fakeDesktop(page);
  await page.goto('/');
  await expect(page.getByText('Documents/PosterHub folder')).toBeVisible();

  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByLabel('Name').fill('Coral reef survey');
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();

  const file = '/home/ada/Documents/PosterHub/Coral-reef-survey.poster.json';
  await expect.poll(async () => Object.keys(await disk(page))).toContain(file);
  expect(JSON.parse((await disk(page))[file])).toMatchObject({ app: 'posterhub', name: 'Coral reef survey' });

  // Restarting the app finds the poster on disk.
  await page.goto('/');
  await expect(page.getByText('Coral reef survey')).toBeVisible();
  await expect(page.getByText('Saved as files in')).toContainText('/home/ada/Documents/PosterHub');
  await page.getByRole('button', { name: 'Show folder' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__fakeCalls.some((c: any) => c.cmd === 'plugin:opener|open_path'))).toBe(true);

  // Exporting asks where to save instead of downloading.
  await page.getByRole('button', { name: 'More for Coral reef survey' }).click();
  await page.getByRole('menuitem', { name: 'Download project file' }).click();
  await expect.poll(async () => Object.keys(await disk(page))).toContain('/home/ada/Desktop/Coral-reef-survey.poster.json');

  // Deleting removes the file.
  await page.getByRole('button', { name: 'More for Coral reef survey' }).click();
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete poster' }).click();
  await expect(page.getByText('Make your first research poster')).toBeVisible();
  expect(Object.keys(await disk(page))).not.toContain(file);
});

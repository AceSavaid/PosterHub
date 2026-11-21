// The website installs as an app and keeps working with no internet: a service
// worker (pwa/sw.js) saves every built file on the first visit, and saves Google
// Fonts as they are used, so posters keep their typefaces offline.
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.use({ serviceWorkers: 'allow' });
// One at a time: the update test briefly changes the built sw.js that every test here installs.
test.describe.configure({ mode: 'serial' });

const ROOT = path.join(import.meta.dirname, '..', '..');
const SW_PATH = path.join(ROOT, 'dist', 'sw.js');
const fontFile = (pkg: string, weight: number, style = 'normal') =>
  fs.readFileSync(path.join(ROOT, 'node_modules', '@fontsource', pkg, 'files', `${pkg}-latin-${weight}-${style}.woff2`));

/** Stands in for Google Fonts with the Fontsource copies in node_modules, so tests need no internet. */
async function fakeGoogleFonts(context: BrowserContext) {
  await context.route('https://fonts.googleapis.com/css2**', (route) => {
    const family = new URL(route.request().url()).searchParams.get('family')!.split(':')[0];
    const pkg = family.toLowerCase().replace(/ /g, '-');
    const known = ['montserrat', 'open-sans'].includes(pkg);
    if (!known) return route.fulfill({ status: 400, body: '' });
    const css = [400, 700]
      .map((w) => `@font-face{font-family:'${family}';font-style:normal;font-weight:${w};src:url(https://fonts.gstatic.com/s/${pkg}/${w}.woff2) format('woff2');unicode-range:U+0000-00FF;}`)
      .join('\n');
    return route.fulfill({ body: css, headers: { 'content-type': 'text/css', 'access-control-allow-origin': '*' } });
  });
  await context.route('https://fonts.gstatic.com/s/**', (route) => {
    const [, , pkg, file] = new URL(route.request().url()).pathname.split('/');
    return route.fulfill({ body: fontFile(pkg, parseInt(file, 10)), headers: { 'content-type': 'font/woff2', 'access-control-allow-origin': '*' } });
  });
}

/** First visit: wait until the service worker has saved the app and controls the page. */
async function installApp(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: 'now works without internet' })).toBeVisible();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}

async function goOffline(context: BrowserContext) {
  await context.unrouteAll({ behavior: 'ignoreErrors' });
  await context.setOffline(true);
}

async function createPoster(page: Page, name: string) {
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

async function backToLibrary(page: Page) {
  await page.getByRole('button', { name: /My posters/ }).click();
  await expect(page.getByRole('heading', { name: 'My posters' })).toBeVisible();
}

test('can be installed: manifest, icons and theme colour', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('./manifest.webmanifest');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#2557c7');

  const manifestUrl = new URL(href!, page.url()).href;
  const manifest = await (await request.get(manifestUrl)).json();
  expect(manifest).toMatchObject({ name: 'PosterHub', display: 'standalone', start_url: './', scope: './' });
  const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes} ${i.purpose}`);
  expect(sizes).toEqual(expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']));

  for (const icon of manifest.icons.filter((i: { type: string }) => i.type === 'image/png')) {
    const res = await request.get(new URL(icon.src, manifestUrl).href);
    expect(res.ok()).toBe(true);
    const png = await res.body();
    // PNG header: width and height live at bytes 16-23.
    const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    expect(`${w}x${h}`).toBe(icon.sizes);
  }
  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect((await request.get(new URL(touch!, page.url()).href)).ok()).toBe(true);
});

test('opens, edits and creates posters with no internet', async ({ page, context }) => {
  await fakeGoogleFonts(context);
  await installApp(page);
  await createPoster(page, 'Field notes');
  await page.evaluate(() => document.fonts.ready);
  await backToLibrary(page);

  await goOffline(context);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My posters' })).toBeVisible();
  await expect(page.locator('.poster-card', { hasText: 'Field notes' })).toBeVisible();

  // Opening a poster still finds its Google Fonts, saved on the first visit.
  await page.locator('.poster-card', { hasText: 'Field notes' }).getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.locator('.poster')).toBeVisible();
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family.replace(/["']/g, '')} ${f.weight}`);
  });
  expect(fonts).toEqual(expect.arrayContaining(['Montserrat 700', 'Open Sans 400']));

  // Parts of the app that load on demand (equations, spelling dictionaries) work offline too.
  await page.getByRole('button', { name: 'Equation (LaTeX)…' }).click();
  const eq = page.getByRole('dialog', { name: /equation/i });
  await eq.getByLabel('LaTeX').fill('E = mc^2');
  await eq.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(page.locator('.poster > .el-equation img').first()).toHaveAttribute('alt', 'E = mc^2');

  await page.getByRole('button', { name: /^Check/ }).click();
  const check = page.getByRole('dialog', { name: 'Poster check' });
  await check.getByRole('tab', { name: 'Spelling' }).click();
  await expect(check.locator('.misspelt, :text("No spelling mistakes found")').first()).toBeVisible();
  await page.keyboard.press('Escape');

  // A brand-new poster can be started offline, and it is still there after another reload.
  await backToLibrary(page);
  await createPoster(page, 'Made on the train');
  await backToLibrary(page);
  await page.reload();
  await expect(page.locator('.poster-card', { hasText: 'Made on the train' })).toBeVisible();
});

test('a poster opens offline even when its font was never saved', async ({ page, context }) => {
  await installApp(page);
  await goOffline(context);
  await page.reload();
  await createPoster(page, 'Unsaved fonts');
  await expect(page.locator('.poster .el-title')).toBeVisible();
});

test('offers a reload when a new version has downloaded', async ({ page, context }) => {
  await installApp(page);
  // Pretend a new release went live: the next check finds a changed sw.js on the server.
  const original = fs.readFileSync(SW_PATH, 'utf8');
  fs.writeFileSync(SW_PATH, original + '\n// next release\n');
  try {
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
  } finally {
    fs.writeFileSync(SW_PATH, original);
  }
  const banner = page.getByRole('status').filter({ hasText: 'A new version of PosterHub is ready' });
  await expect(banner).toBeVisible();
  const reloaded = page.waitForEvent('framenavigated');
  await banner.getByRole('button', { name: 'Reload' }).click();
  await reloaded;
  await expect(page.getByRole('heading', { name: 'My posters' })).toBeVisible();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(banner).toBeHidden();
});

test('the desktop app does not use the service worker', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__TAURI_INTERNALS__ = { invoke: () => new Promise(() => {}), transformCallback: () => 0, metadata: {} };
  });
  await page.goto('/');
  await page.waitForTimeout(1000);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  await expect(page.getByRole('status').filter({ hasText: 'works without internet' })).toHaveCount(0);
});

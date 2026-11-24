import { test, expect, type Page } from '@playwright/test';

// My posters reads small card records instead of every full poster, so it stays quick
// when posters hold many large pictures. These tests cover the records and the upgrade
// for libraries saved before they existed.

/** Reads one IndexedDB store of the app's database as it is now. */
function readStore(page: Page, store: string) {
  return page.evaluate(
    (name) =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const req = indexedDB.open('posterhub');
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction(name).objectStore(name).getAll();
          get.onsuccess = () => {
            db.close();
            resolve(get.result);
          };
          get.onerror = () => reject(get.error);
        };
        req.onerror = () => reject(req.error);
      }),
    store,
  );
}

test('a library saved before card records existed still lists, opens, renames and deletes', async ({ page }) => {
  // A blank page on the app's origin, so the app doesn't open (and upgrade) the database first.
  await page.route('**/blank-for-db-setup', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>setup</title>' }));
  await page.goto('/blank-for-db-setup');
  // An old (version 1) database with one poster, as earlier releases saved it.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('posterhub', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('posters', { keyPath: 'id' });
        req.onsuccess = () => {
          const db = req.result;
          const t = db.transaction('posters', 'readwrite');
          const now = Date.now();
          t.objectStore('posters').put({
            id: 'old1', name: 'Saved last year', version: 1, width: 841, height: 1189, sizePreset: 'A0', columns: 3, margin: 20, gutter: 15,
            palette: { name: 'Academic Blue', primary: '#1f4e79', secondary: '#2e75b6', accent: '#f4b183', background: '#ffffff', surface: '#eaf1f8', text: '#1b1b1b' },
            headingFont: 'Montserrat', bodyFont: 'Open Sans', customFonts: [], elements: [], createdAt: now - 1000, updatedAt: now - 1000,
          });
          t.oncomplete = () => (db.close(), resolve());
          t.onerror = () => reject(t.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
  await page.goto('/');
  await expect(page.locator('.card-name', { hasText: 'Saved last year' })).toBeVisible();
  const cards = await readStore(page, 'summaries');
  expect(cards).toHaveLength(1);
  expect(cards[0]).toMatchObject({ id: 'old1', name: 'Saved last year', width: 841, height: 1189 });
  expect(cards[0]).not.toHaveProperty('elements');

  // Renaming loads the full poster and keeps both copies in step.
  await page.getByRole('button', { name: 'More for Saved last year' }).click();
  await page.getByRole('menuitem', { name: /Rename/ }).click();
  const field = page.getByRole('textbox', { name: /name/i }).last();
  await field.fill('Renamed poster');
  await field.press('Enter');
  await expect(page.locator('.card-name', { hasText: 'Renamed poster' })).toBeVisible();
  expect((await readStore(page, 'posters'))[0]).toMatchObject({ id: 'old1', name: 'Renamed poster', elements: [] });
  expect((await readStore(page, 'summaries'))[0]).toMatchObject({ id: 'old1', name: 'Renamed poster' });

  // Opening a card loads the whole poster.
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.locator('.poster')).toBeVisible();
  await page.getByRole('button', { name: /My posters/ }).click();
  await expect(page.getByRole('heading', { name: 'My posters' })).toBeVisible();

  // Deleting removes both.
  await page.getByRole('button', { name: 'More for Renamed poster' }).click();
  await page.getByRole('menuitem', { name: /Delete/ }).click();
  await page.getByRole('button', { name: 'Delete poster' }).click();
  await expect(page.locator('.card-name')).toHaveCount(0);
  expect(await readStore(page, 'posters')).toHaveLength(0);
  expect(await readStore(page, 'summaries')).toHaveLength(0);
});

test('saving a poster keeps its card record up to date', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
  await page.getByRole('button', { name: /My posters/ }).click();
  await expect(page.locator('.poster-card')).toHaveCount(1);
  const [full] = await readStore(page, 'posters');
  const [card] = await readStore(page, 'summaries');
  expect(card).toMatchObject({ id: full.id, name: full.name, updatedAt: full.updatedAt });
  expect(card.thumbnail).toBe(full.thumbnail);
  expect(card).not.toHaveProperty('elements');
});

import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';

async function newPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

const MM_TO_PT = 72 / 25.4;

test('warns about colours that print dull and swaps in a printable one', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'Box / panel', exact: true }).click();
  await page.locator('aside.panel.right input[type="color"]').first().fill('#0000ff');

  await page.getByRole('button', { name: 'Export ▾' }).click();
  await expect(page.getByRole('button', { name: /colours? will print duller/ })).toBeVisible();
  await page.getByRole('button', { name: /colours? will print duller/ }).click();

  const panel = page.getByRole('dialog', { name: 'Poster check' });
  await expect(panel).toContainText('#0000FF will print duller than on screen');
  await panel.getByRole('button', { name: /Use #/ }).click();
  await expect(panel).not.toContainText('#0000FF will print duller');
  await expect(page.locator('.toast')).toContainText('everywhere');
});

test('PDF bleed and crop marks for the print shop', async ({ page }) => {
  await newPoster(page);
  const size = await page.evaluate(() => {
    const el = document.querySelector('.poster') as HTMLElement;
    return { w: el.offsetWidth, h: el.offsetHeight };
  });
  await page.getByRole('button', { name: 'Export ▾' }).click();
  await page.getByLabel('Bleed').selectOption({ label: '3 mm' });
  await page.getByLabel('Crop marks').check();
  await expect(page.getByRole('button', { name: /^PDF/ })).toContainText('with bleed and crop marks');

  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /^PDF/ }).click();
  const doc = await PDFDocument.load(await fs.readFile(await (await dl).path()));
  const pg = doc.getPage(0);
  const trim = pg.getTrimBox();
  const margin = 3 + 6 + 1; // bleed + crop mark length + gap
  expect(pg.getWidth() - trim.width).toBeCloseTo(2 * margin * MM_TO_PT, 0);
  expect(pg.getHeight() - trim.height).toBeCloseTo(2 * margin * MM_TO_PT, 0);
  // trim box is the poster itself (CSS px → pt)
  expect(trim.width).toBeCloseTo(size.w * 0.75, 0);
  expect(pg.getBleedBox().width - trim.width).toBeCloseTo(6 * MM_TO_PT, 0);

  // the choice is remembered for next time
  await page.getByRole('button', { name: 'Export ▾' }).click();
  await expect(page.getByLabel('Bleed')).toHaveValue('3');
  await expect(page.getByLabel('Crop marks')).toBeChecked();
});

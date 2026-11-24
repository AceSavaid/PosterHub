import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { localFontsource, pdfText } from '../helpers/pdf';

test.beforeEach(async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/npm/@fontsource/**', async (route) => {
    const body = localFontsource(route.request().url());
    if (!body) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: Buffer.from(body), headers: { 'access-control-allow-origin': '*', 'content-type': 'font/woff' } });
  });
});

async function newPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByLabel('Name').fill('Captions');
  await page.getByLabel('Size').selectOption('A3');
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

async function addImage(page: Page, colour: string) {
  const png = await page.evaluate((c) => {
    const cv = document.createElement('canvas');
    cv.width = 300;
    cv.height = 200;
    const g = cv.getContext('2d')!;
    g.fillStyle = c;
    g.fillRect(0, 0, 300, 200);
    return cv.toDataURL('image/png').split(',')[1];
  }, colour);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Image…', exact: true }).click();
  await (await chooser).setFiles({ name: 'pic.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
}

const captions = (page: Page) => page.locator('.poster .fig-label');

test('adds numbered captions to pictures and keeps the numbers in order', async ({ page }) => {
  await newPoster(page);

  // inserting a picture offers a caption straight away
  await addImage(page, '#c33');
  await expect(page.locator('.poster .el-image img')).toHaveCount(1);
  await page.getByRole('button', { name: 'Add caption', exact: true }).click();
  const text = page.getByLabel('Caption text');
  await expect(text).toBeFocused();
  await text.fill('Red sample under white light');
  await expect(captions(page)).toHaveText(['Figure 1:']);
  await expect(page.locator('.poster')).toContainText('Figure 1: Red sample under white light');
  await expect(page.locator('.caption-section h4')).toHaveText('Caption · Figure 1');

  // a second picture, captioned from the Properties panel, above the picture
  await addImage(page, '#33c');
  await expect(page.locator('.poster .el-image img')).toHaveCount(2);
  await page.getByRole('button', { name: 'Above', exact: true }).click();
  await page.getByLabel('Caption text').fill('Blue sample');
  await expect(captions(page)).toHaveCount(2);
  const labels = await page.evaluate(() => {
    // labels in reading order: left column first, then top to bottom
    const items = Array.from(document.querySelectorAll<HTMLElement>('.poster .fig-label')).map((l) => {
      const r = l.getBoundingClientRect();
      return { t: l.textContent, x: Math.round(r.left), y: Math.round(r.top) };
    });
    return items.sort((a, b) => a.x - b.x || a.y - b.y).map((i) => i.t);
  });
  expect(labels.sort()).toEqual(['Figure 1:', 'Figure 2:']);

  // the caption sits right above its picture
  const img2 = page.locator('.poster .el-image.selected');
  const capBox = await page.locator('.poster .el', { hasText: 'Blue sample' }).boundingBox();
  const imgBox = await img2.boundingBox();
  expect(capBox!.y + capBox!.height).toBeLessThanOrEqual(imgBox!.y + 1);
  expect(Math.abs(capBox!.x - imgBox!.x)).toBeLessThan(2);

  // moving the picture with the arrow keys carries the caption along
  const before = (await page.locator('.poster .el', { hasText: 'Blue sample' }).boundingBox())!;
  await img2.click();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
  const after = (await page.locator('.poster .el', { hasText: 'Blue sample' }).boundingBox())!;
  expect(after.y).toBeGreaterThan(before.y + 1);

  // switch sides
  await page.getByRole('button', { name: 'Below', exact: true }).click();
  const capBelow = (await page.locator('.poster .el', { hasText: 'Blue sample' }).boundingBox())!;
  const imgNow = (await img2.boundingBox())!;
  expect(capBelow.y).toBeGreaterThanOrEqual(imgNow.y + imgNow.height - 1);

  // the PDF has the numbered captions
  await page.getByRole('button', { name: 'Export ▾' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /^PDF/ }).click();
  const file = path.join(os.tmpdir(), `${Date.now()}-captions.pdf`);
  await (await dl).saveAs(file);
  const pdf = await pdfText(await fs.readFile(file));
  expect(pdf).toContain('Red sample under white light');
  expect(pdf).toMatch(/Figure\s*1\s*:/);
  expect(pdf).toMatch(/Figure\s*2\s*:/);
});

test('deleting a figure deletes its caption and renumbers the rest', async ({ page }) => {
  await newPoster(page);
  await addImage(page, '#c33');
  await page.getByRole('button', { name: 'Add caption', exact: true }).click();
  await page.getByLabel('Caption text').fill('First');
  await addImage(page, '#33c');
  await page.getByRole('button', { name: 'Add caption below' }).click();
  await page.getByLabel('Caption text').fill('Second');
  await expect(captions(page)).toHaveCount(2);

  // which picture is Figure 1? delete it
  const first = await page.evaluate(() => {
    const l = Array.from(document.querySelectorAll('.poster .fig-label')).find((x) => x.textContent === 'Figure 1:')!;
    return l.closest('.el')!.textContent!.includes('First') ? 'First' : 'Second';
  });
  const other = first === 'First' ? 'Second' : 'First';
  await page.locator('.poster .el', { hasText: first }).click();
  await page.getByRole('button', { name: 'Select the figure' }).click();
  await expect(page.locator('.caption-section h4')).toHaveText('Caption · Figure 1');
  await page.keyboard.press('Delete');

  await expect(page.locator('.poster .el-image')).toHaveCount(1);
  await expect(page.locator('.poster')).not.toContainText(first);
  await expect(page.locator('.poster')).toContainText(`Figure 1: ${other}`);

  // undo brings both back with their numbers
  await page.keyboard.press('ControlOrMeta+z');
  await expect(captions(page)).toHaveCount(2);
  await expect(page.locator('.poster')).toContainText(`Figure 1: ${first}`);

  // remove a caption from the panel
  await page.locator('.poster .el', { hasText: other }).click();
  await page.getByRole('button', { name: 'Select the figure' }).click();
  await page.getByRole('button', { name: 'Remove caption' }).click();
  await expect(captions(page)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Add caption below' })).toBeVisible();
});

test('graphs can have captions too', async ({ page }) => {
  await newPoster(page);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'Group\tScore\nA\t40\nB\t75');
    document.dispatchEvent(Object.defineProperty(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }), 'clipboardData', { value: dt }));
  });
  // a pasted table gets "Table 1"
  await expect(page.locator('.poster .el-table-wrap')).toBeVisible();
  await page.getByRole('button', { name: 'Add caption below' }).click();
  await page.getByLabel('Caption text').fill('Scores by group');
  await expect(page.locator('.poster')).toContainText('Table 1: Scores by group');

  // a graph made from it is Figure 1, from the right-click menu
  await page.locator('.poster .el-table-wrap').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Make a graph from this table…' }).click();
  await page.getByRole('button', { name: 'Add graph to poster' }).click();
  await expect(page.locator('.poster .el-chart canvas')).toBeVisible();
  await page.locator('.poster .el-chart').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add caption' }).click();
  await page.getByLabel('Caption text').fill('Scores rose');
  await expect(page.locator('.poster')).toContainText('Figure 1: Scores rose');
  await expect(page.locator('.poster')).toContainText('Table 1: Scores by group');
});

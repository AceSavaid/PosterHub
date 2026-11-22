import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures');

/** Script files the page has asked for so far, by file name. */
function scriptLog(page: Page) {
  const files: string[] = [];
  page.on('request', (r) => {
    const m = r.url().match(/\/assets\/([^/?]+\.js)/);
    if (m) files.push(m[1]);
  });
  return files;
}

// Chunks that only rarely used features need. None should download just to show My posters.
const HEAVY = /^(Editor|chart|jszip|pptxImport|pptxgen|jspdf|vectorPdf|mathEngine|artwork|dictionary|html2canvas|ReferencesDialog|AbstractDialog)[-.]/;

test('My posters opens without downloading the editor or heavy import and export code', async ({ page }) => {
  const files = scriptLog(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'My posters' })).toBeVisible();
  // What was needed to show the page. (The editor is fetched in the background a moment later.)
  const firstLoad = [...files];
  expect(firstLoad.length).toBeGreaterThan(0);
  expect(firstLoad.filter((f) => HEAVY.test(f))).toEqual([]);
  // The background fetch warms up the editor but still leaves the heavy feature code alone.
  await expect.poll(() => files.some((f) => f.startsWith('Editor-'))).toBe(true);
  await page.waitForLoadState('networkidle');
  expect(files.filter((f) => HEAVY.test(f) && !f.startsWith('Editor-'))).toEqual([]);
});

test('the editor opens without charts or PowerPoint import, and a graph still draws once added', async ({ page }) => {
  const files = scriptLog(page);
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: /Blank/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(files.some((f) => f.startsWith('Editor-'))).toBe(true);
  expect(files.filter((f) => /^(chart|jszip|pptxImport|pptxgen|jspdf|vectorPdf)[-.]/.test(f))).toEqual([]);

  await page.getByRole('button', { name: /^.*Graph from (Excel or )?CSV…/ }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose an Excel or CSV file…' }).click();
  await (await chooser).setFiles(path.join(FIXTURES, 'results.csv'));
  await page.getByRole('button', { name: 'Add graph to poster' }).click();
  const canvas = page.locator('.poster .el-chart canvas');
  await expect(canvas).toBeVisible();
  expect(files.some((f) => f.startsWith('chart-'))).toBe(true);
  // The graph has actually been drawn, not just an empty canvas.
  await expect
    .poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0)))
    .toBe(true);
});

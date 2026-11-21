import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import JSZip from 'jszip';
import { inspectPdf, localFontsource } from '../helpers/pdf';

test.beforeEach(async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/npm/@fontsource/**', async (route) => {
    const body = localFontsource(route.request().url());
    if (!body) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: Buffer.from(body), headers: { 'access-control-allow-origin': '*', 'content-type': 'font/woff' } });
  });
});

async function blankPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByLabel('Name').fill('Icon poster');
  await page.getByLabel('Size').selectOption('A3');
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

async function download(page: Page, label: RegExp) {
  await page.getByRole('button', { name: 'Export ▾' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: label }).click();
  const d = await dl;
  const file = path.join(os.tmpdir(), `${Date.now()}-${d.suggestedFilename()}`);
  await d.saveAs(file);
  return await fs.readFile(file);
}

const search = (page: Page) => page.getByRole('searchbox', { name: 'Search science icons' });
const icons = (page: Page) => page.locator('.poster > .el-icon');
const fills = (page: Page) => icons(page).first().locator('path').evaluateAll((ps) => [...new Set(ps.map((p) => p.getAttribute('fill')))]);

test('finds an icon by a research word and adds it in the palette colour', async ({ page }) => {
  await blankPoster(page);
  await search(page).fill('mouse');
  await expect(page.getByText(/^\d+ icons?$/)).toBeVisible();
  await page.getByRole('button', { name: 'Insert icon: Rat / mouse' }).click();
  await expect(icons(page)).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Icon: Rat / mouse' })).toBeVisible();
  expect(await fills(page)).toEqual(['#1f4e79']); // Academic Blue primary

  // Nothing matches: a helpful message instead of an empty grid.
  await search(page).fill('zebra crossing');
  await expect(page.getByText(/No icons match/)).toBeVisible();

  // A category on its own lists the whole category.
  await search(page).fill('');
  await page.getByLabel('Icon category').selectOption({ label: 'Lab equipment' });
  await expect(page.getByRole('group', { name: 'Icons' }).getByRole('button', { name: 'Insert icon: Microscope', exact: true })).toBeVisible();
});

test('icons follow palette changes and can be recoloured and swapped', async ({ page }) => {
  await blankPoster(page);
  await search(page).fill('flask');
  await page.getByRole('group', { name: 'Icons' }).getByRole('button', { name: 'Insert icon: Flask', exact: true }).click();
  const inspector = page.locator('.panel.right');
  await expect(inspector.getByRole('heading', { name: 'Icon: Flask' })).toBeVisible();

  // Two-tone icons get a shading colour; by default it is a pale tint.
  expect(await icons(page).locator('path[fill-opacity]').count()).toBeGreaterThan(0);
  await inspector.getByRole('button', { name: 'Accent (follows palette)' }).nth(1).click();
  await expect(icons(page).locator('path[fill-opacity]')).toHaveCount(0);
  expect(await fills(page)).toEqual(expect.arrayContaining(['#1f4e79', '#f4b183']));

  // Main colour.
  await inspector.getByRole('button', { name: 'Secondary (follows palette)' }).first().click();
  expect(await fills(page)).toContain('#2e75b6');

  // A new palette recolours the icon.
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByRole('button', { name: /Forest/ }).first().click();
  expect(await fills(page)).toEqual(expect.arrayContaining(['#4f8a5b', '#e0b44a']));

  // Swap the picture but keep the colours.
  await inspector.getByRole('button', { name: 'Change icon…' }).click();
  await inspector.getByRole('searchbox', { name: 'Search for a different icon' }).fill('atom');
  await inspector.getByRole('button', { name: 'Use icon: Atom', exact: true }).click();
  await expect(inspector.getByRole('heading', { name: 'Icon: Atom' })).toBeVisible();
  expect(await fills(page)).toEqual(expect.arrayContaining(['#4f8a5b', '#e0b44a']));

  // Undo brings the flask back.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('group', { name: 'Icon: Flask' })).toBeVisible();
});

test('the icon grid works with the keyboard and passes accessibility checks', async ({ page }) => {
  await blankPoster(page);
  await search(page).fill('cell');
  const active = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
  await search(page).press('ArrowDown');
  await expect.poll(active).toMatch(/^Insert icon: /);
  const first = await active();
  await page.keyboard.press('ArrowRight');
  await expect.poll(active).not.toBe(first);
  const second = await active();
  await page.keyboard.press('Enter');
  expect(second).toMatch(/^Insert icon: /);
  await expect(page.getByRole('group', { name: `Icon: ${second!.replace('Insert icon: ', '')}` })).toBeVisible();
  // Only one icon button is a Tab stop, so the grid doesn't trap keyboard users.
  expect(await page.locator('.icon-grid button[tabindex="0"]').count()).toBe(1);

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), scheme).toEqual([]);
  }
});

test('exports icons as vector paths in the PDF and as SVG pictures in PowerPoint', async ({ page }) => {
  await blankPoster(page);
  await search(page).fill('dna');
  await page.getByRole('group', { name: 'Icons' }).getByRole('button').first().click();
  await expect(icons(page)).toHaveCount(1);

  const pdf = await download(page, /^PDF/);
  expect((await inspectPdf(new Uint8Array(pdf))).images).toEqual([]);

  const pptx = await JSZip.loadAsync(await download(page, /^PowerPoint/));
  const media = Object.keys(pptx.files).filter((f) => f.startsWith('ppt/media/'));
  expect(media.some((f) => f.endsWith('.svg'))).toBe(true);
});

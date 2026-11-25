import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import fs from 'node:fs/promises';

async function newPoster(page: Page, template = 'Blank', name = '') {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  if (name) await page.getByLabel('Poster title').fill(name);
  await page.getByRole('button', { name: new RegExp('^' + template) }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}
const els = (page: Page) => page.locator('.poster > .el');

test('inserts every simple shape and exports them to PowerPoint', async ({ page }) => {
  await newPoster(page);
  // a new shape is selected straight away, so it can be adjusted in the side panel
  await page.getByRole('button', { name: 'Arrow', exact: true }).click();
  await page.getByLabel('Points').selectOption('down');
  await expect(page.locator('.poster .el-svg polygon').first()).toHaveAttribute('transform', /rotate\(90/);
  for (const name of ['Box / panel', 'Rounded box', 'Circle', 'Line', 'Triangle', 'Diamond', 'Star']) {
    await page.getByRole('button', { name, exact: true }).click();
  }
  await expect(els(page)).toHaveCount(8);
  await expect(page.locator('.poster .el-svg polygon')).toHaveCount(4);
  // turn the star (still selected) into a triangle
  await page.getByRole('button', { name: 'Change to triangle' }).click();
  await expect(page.getByRole('button', { name: 'Change to triangle' })).toHaveClass(/on/);

  await page.getByRole('button', { name: 'Export ▾' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /^PowerPoint/ }).click();
  const zip = await JSZip.loadAsync(await fs.readFile(await (await dl).path()));
  const slide = await zip.file('ppt/slides/slide1.xml')!.async('string');
  for (const g of ['downArrow', 'triangle', 'diamond', 'ellipse', 'roundRect']) expect(slide).toContain(`prst="${g}"`);
});

test('poster check lists problems and selects them', async ({ page }) => {
  await newPoster(page, 'Classic columns');
  // leftover example text is a to-do, not an error: no badge on a fresh poster…
  await expect(page.locator('.check-btn .badge')).toHaveCount(0);
  // …but the Export menu points it out
  await page.getByRole('button', { name: 'Export ▾' }).click();
  await expect(page.locator('.menu-note')).toContainText('still have example text or no picture');
  await page.getByRole('button', { name: 'Export ▾' }).click();
  await page.getByRole('button', { name: /^Check/ }).click();
  const panel = page.getByRole('dialog', { name: 'Poster check' });
  await expect(panel).toContainText('still have example text');
  await panel.getByText('Show which').click();
  await panel.getByRole('button', { name: /^Title “Your Poster Title/ }).click();
  await expect(page.locator('.insp-head h3')).toHaveText('Title');

  // fix the title and the item disappears
  await page.locator('.poster .el-title .el-body').dblclick();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Sleep and memory');
  await page.keyboard.press('Escape');
  await expect(panel.getByRole('button', { name: /^Title “/ })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toHaveCount(0);
});

test('an empty poster passes the check once the content is fine', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'Box / panel', exact: true }).click();
  await page.getByRole('button', { name: /^Check/ }).click();
  await expect(page.getByRole('dialog', { name: 'Poster check' })).not.toContainText('⛔');
});

test('right-click menu duplicates, locks and deletes', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'Box / panel', exact: true }).click();
  await els(page).first().click({ button: 'right', position: { x: 25, y: 25 } });
  await page.getByRole('menuitem', { name: /Duplicate/ }).click();
  await expect(els(page)).toHaveCount(2);
  await page.getByLabel('Y', { exact: true }).fill('900'); // move the copy out of the way
  await els(page).last().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Lock position' }).click();
  await expect(page.locator('.poster .el.locked')).toHaveCount(1);
  await els(page).first().click({ button: 'right', position: { x: 25, y: 25 } });
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await els(page).first().click({ button: 'right', position: { x: 25, y: 25 } });
  await page.getByRole('menuitem', { name: /^Delete/ }).click();
  await expect(els(page)).toHaveCount(1);
});

test('formats only the selected words', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'Text box', exact: true }).click();
  await page.keyboard.type('plain then special');
  await page.keyboard.press('Shift+ControlOrMeta+ArrowLeft');
  await page.getByRole('button', { name: /bigger text/ }).click();
  await page.getByRole('button', { name: 'Text colour accent' }).click();
  await page.keyboard.press('Escape');
  const html = await page.locator('.poster .el-body').innerHTML();
  expect(html).toMatch(/font-size: 3\d(\.5)?pt/);
  expect(html).toContain('color: rgb(244, 177, 131)');
  expect(html).toContain('special</span>');
  expect(html.startsWith('plain then ')).toBe(true);
});

test('copies and deletes the open poster from its options menu', async ({ page }) => {
  await newPoster(page, 'Blank', 'Lab meeting');
  await page.getByRole('button', { name: 'Poster menu' }).click();
  await page.getByRole('menuitem', { name: 'Make a copy…' }).click();
  await page.getByRole('dialog', { name: 'Make a copy' }).getByRole('button', { name: 'Make copy' }).click();
  await expect(page.locator('.toast')).toContainText('Lab meeting (copy)');
  await page.getByRole('button', { name: 'Poster menu' }).click();
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  await page.getByRole('alertdialog', { name: 'Delete “Lab meeting”?' }).getByRole('button', { name: 'Delete poster' }).click();
  await expect(page.getByRole('heading', { name: 'My posters' })).toBeVisible();
  await expect(page.locator('.poster-card', { hasText: 'Lab meeting (copy)' })).toBeVisible();
  await expect(page.locator('.card-name', { hasText: /^Lab meeting$/ })).toHaveCount(0);
});

test('zooms with keyboard shortcuts', async ({ page }) => {
  await newPoster(page);
  const label = page.locator('.zoom-label');
  // start from "fit to screen", so a late first fit can't change the starting value
  await page.keyboard.press('ControlOrMeta+0');
  const before = await label.textContent();
  await page.keyboard.press('ControlOrMeta+=');
  await expect(label).not.toHaveText(before!);
  await page.keyboard.press('ControlOrMeta+0');
  await expect(label).toHaveText(before!);
});

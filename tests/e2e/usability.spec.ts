import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures');

async function newPoster(page: Page, template = 'Classic columns', name = '') {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  if (name) await page.getByLabel('Poster title').fill(name);
  await page.getByRole('button', { name: new RegExp('^' + template) }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

const box = async (page: Page, sel: string) => (await page.locator(sel).boundingBox())!;
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

test('new poster dialog: layouts first, Create always in view, Esc closes it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New poster' });
  // the layout gallery comes before the size settings
  const layouts = await box(page, '.template-grid >> nth=0'); // general layouts; field layouts follow in a second grid
  const size = await page.getByText('Orientation', { exact: true }).boundingBox();
  expect(layouts.y).toBeLessThan(size!.y);
  // Create is on screen without scrolling
  const create = await dialog.getByRole('button', { name: 'Create poster' }).boundingBox();
  expect(create!.y + create!.height).toBeLessThanOrEqual(720);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('Export stays on the top bar on a 1280 px laptop screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await newPoster(page);
  const exp = await box(page, '.topbar .btn.primary');
  const back = (await page.getByRole('button', { name: /My posters/ }).boundingBox())!;
  expect(Math.abs(exp.y - back.y)).toBeLessThan(10);
  // guides and snapping now live in the View menu
  await page.getByRole('button', { name: 'View ▾' }).click();
  await page.getByLabel('Show column guides').uncheck();
  await expect(page.locator('.poster .grid-col')).toHaveCount(0);
});

test('the browser Back button returns to My posters and Forward reopens the poster', async ({ page }) => {
  await page.goto('/');
  await newPoster(page, 'Blank', 'Back button test');
  await expect(page).toHaveURL(/#\/poster\//);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'My posters' }), `after Back the page is ${page.url()}`).toBeVisible();
  await expect(page.locator('.poster-card', { hasText: 'Back button test' })).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel('Poster name')).toHaveValue('Back button test');
  // the My posters button also leaves a clean history
  await page.getByRole('button', { name: /My posters/ }).click();
  await expect(page.getByRole('heading', { name: 'My posters' })).toBeVisible();
  await expect(page).not.toHaveURL(/#\/poster\//);
});

test('a new text box goes into free space, not over the layout’s text', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'Text box', exact: true }).click();
  await page.keyboard.press('Escape');
  const added = (await page.locator('.poster > .el-text').last().boundingBox())!;
  for (const h of await page.locator('.poster > .el-heading').all()) expect(overlaps(added, (await h.boundingBox())!)).toBe(false);
});

test('a graph picks similar columns, warns about mixed scales and fills an empty figure box', async ({ page }) => {
  await newPoster(page);
  const slots = page.locator('.poster .img-placeholder', { hasText: 'Figure' });
  const before = await slots.count();
  await page.getByRole('button', { name: 'Graph from Excel or CSV…' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose an Excel or CSV file…' }).click();
  await (await chooser).setFiles(path.join(FIXTURES, 'results.csv'));
  await expect(page.getByRole('checkbox', { name: 'Accuracy' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Speed' })).not.toBeChecked();
  await expect(page.locator('.chart-dialog .hint.warn')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Speed' }).check();
  await expect(page.locator('.chart-dialog .hint.warn')).toContainText('“Accuracy” is much smaller than “Speed”');
  // Esc closes the graph dialog too, after checking the loaded data can be thrown away
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.locator('.chart-dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Graph from Excel or CSV…' }).click();
  const chooser2 = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose an Excel or CSV file…' }).click();
  await (await chooser2).setFiles(path.join(FIXTURES, 'results.csv'));
  await page.getByRole('button', { name: 'Add graph to poster' }).click();
  await expect(page.locator('.poster .el-chart')).toHaveCount(1);
  await expect(slots).toHaveCount(before - 1);
  await expect(page.locator('.toast')).toContainText('empty figure box');
});

test('library: one ⋯ menu per poster to rename in place and download the project file', async ({ page }) => {
  await newPoster(page, 'Blank', 'Old name');
  await page.getByRole('button', { name: /My posters/ }).click();
  const card = page.locator('.poster-card', { hasText: 'Old name' });
  await card.getByRole('button', { name: 'More for Old name' }).click();
  // the same actions as the editor's Poster options menu, plus Rename
  await expect(page.getByRole('menuitem')).toHaveText(['Rename', 'Make a copy…', 'Download project file', 'Save as my template…', 'Delete…']);
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const input = page.getByRole('textbox', { name: 'Poster name' });
  await input.fill('New name');
  await input.press('Enter');
  await expect(page.locator('.card-name', { hasText: 'New name' })).toBeVisible();
  // Esc cancels a rename
  const renamed = page.locator('.poster-card', { hasText: 'New name' });
  await renamed.getByRole('button', { name: 'More for New name' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await input.fill('Discarded');
  await input.press('Escape');
  await expect(page.locator('.card-name', { hasText: 'New name' })).toBeVisible();

  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'More for New name' }).click();
  await page.getByRole('menuitem', { name: 'Download project file' }).click();
  expect((await dl).suggestedFilename()).toBe('New-name.poster.json');
});

test('Layout tab explains that columns move guides only', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('tab', { name: 'Layout' }).click();
  await expect(page.getByText('moves only the guides, not your content')).toBeVisible();
  await expect(page.getByText('Switch layout…')).toBeVisible();
  // switching applies straight away (no "are you sure?") and the toast's Undo puts everything back
  await page.getByText('Switch layout…').click();
  await page.getByRole('combobox', { name: 'Layout' }).selectOption('boxed');
  const count = await page.locator('.poster > .el').count();
  await page.getByRole('button', { name: /^Apply to/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.poster .img-placeholder', { hasText: 'Logo' })).toHaveCount(2);
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.poster > .el')).toHaveCount(count);
  await expect(page.locator('.poster .img-placeholder', { hasText: 'Logo' })).toHaveCount(0);
});

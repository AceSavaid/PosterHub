import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';

async function newPoster(page: Page, template = 'Classic columns', name?: string) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: new RegExp('^' + template) }).click();
  if (name) await page.getByRole('dialog', { name: 'New poster' }).getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

/** In the editor, Settings sits in the gear's menu with the shortcuts and the tour. */
async function openEditorSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings and help' }).click();
  await page.getByRole('menuitem', { name: 'Settings…' }).click();
}

const attr = (page: Page, name: string) => page.evaluate((n) => document.documentElement.getAttribute(n), name);
const zoomOf = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => getComputedStyle(e).zoom);

test('Settings has every option in one place, and they are remembered', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('radiogroup', { name: 'Contrast' }).getByRole('radio', { name: 'High' }).click();
  expect(await attr(page, 'data-contrast')).toBe('high');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await dialog.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');

  await dialog.getByRole('radio', { name: 'Extra large' }).click();
  expect(await attr(page, 'data-ui-size')).toBe('xlarge');
  expect(await zoomOf(page, '.lib-header')).toBe('1.3');

  await dialog.getByLabel('Your name on notes').fill('Dr Patel');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();

  // remembered after a reload, and used by the editor
  await page.reload();
  expect(await attr(page, 'data-contrast')).toBe('high');
  expect(await attr(page, 'data-ui-size')).toBe('xlarge');
  await newPoster(page);
  // the panels and top bar grow, the poster itself does not
  expect(await zoomOf(page, '.topbar')).toBe('1.3');
  expect(await zoomOf(page, '.panel')).toBe('1.3');
  expect(await zoomOf(page, '.stage')).toBe('1');
  // print-shop options live next to the PDF button, and are remembered too
  await page.getByRole('button', { name: 'Export ▾' }).click();
  await page.getByLabel('Bleed').selectOption('3');
  await page.getByLabel('Crop marks').check();
  await page.keyboard.press('Escape');

  await openEditorSettings(page);
  await expect(page.getByLabel('Your name on notes')).toHaveValue('Dr Patel');
  // Reset brings the defaults back
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  expect(await attr(page, 'data-contrast')).toBeNull();
  expect(await attr(page, 'data-ui-size')).toBeNull();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Export ▾' }).click();
  await expect(page.getByLabel('Bleed')).toHaveValue('0');
});

test('Auto contrast follows the computer’s “increase contrast” setting', async ({ page }) => {
  await page.emulateMedia({ contrast: 'more' });
  await page.goto('/');
  expect(await attr(page, 'data-contrast')).toBe('high');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: 'Standard' }).first().click();
  expect(await attr(page, 'data-contrast')).toBeNull();
});

test('high contrast and the large interface pass the WCAG checks', async ({ page }) => {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('posterhub.ui', JSON.stringify({ contrast: 'high', uiSize: 'large' })));
    await newPoster(page);
    await page.getByRole('group', { name: /^Section header: Results/ }).click();
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`).join('\n'), scheme).toBe('');
  }
});

test('the scan’s best-practice findings are fixed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  const rules = ['aria-allowed-role', 'heading-order', 'region'];
  let { violations } = await new AxeBuilder({ page }).withRules(rules).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
  ({ violations } = await new AxeBuilder({ page }).withRules(rules).analyze());
  expect(violations.map((v) => v.id)).toEqual([]);
});

test('? opens a searchable list of shortcuts, labelled for this computer', async ({ page }) => {
  await newPoster(page);
  await page.locator('.stage').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('?');
  const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(sheet).toBeVisible();
  // Playwright's Chromium runs on Linux here, so labels use Ctrl+
  await expect(sheet.getByRole('heading', { name: 'Editing' })).toBeVisible();
  await expect(sheet).toContainText('Ctrl+Shift+Z');
  await expect(sheet).not.toContainText('Ctrl/⌘');
  await sheet.getByLabel('Search shortcuts').fill('group');
  await expect(sheet.locator('.shortcut-row')).toHaveCount(3);
  await sheet.getByLabel('Search shortcuts').fill('ctrl+=');
  await expect(sheet.locator('.shortcut-row')).toHaveCount(1);
  await expect(sheet).toContainText('Zoom in');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // also reachable from the gear's Settings and help menu
  await page.getByRole('button', { name: 'Settings and help' }).click();
  await page.getByRole('menuitem', { name: /Keyboard shortcuts/ }).click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');

  // titles and toasts follow the same labels
  await expect(page.getByRole('button', { name: '↶' })).toHaveAttribute('title', 'Undo (Ctrl+Z)');
});

test('? typed into a text box is just a question mark', async ({ page }) => {
  await newPoster(page, 'Blank');
  await page.getByLabel('Poster name').fill('Why');
  await page.getByLabel('Poster name').press('?');
  await expect(page.getByLabel('Poster name')).toHaveValue('Why?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);
});

test('Properties shows a tip for the selected element, which can be hidden', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('group', { name: /^Section header: Results/ }).click();
  const tip = page.getByTestId('element-tip');
  await expect(tip).toContainText('Double-click to type');
  await page.locator('.poster .el-title').click();
  await expect(tip).toContainText('two lines');
  await tip.getByRole('button', { name: 'Hide tips' }).click();
  await expect(tip).toHaveCount(0);
  await openEditorSettings(page);
  await expect(page.getByLabel('Show a tip for the selected element')).not.toBeChecked();
});

test('closing a dialog with unsaved typing asks first', async ({ page }) => {
  await newPoster(page, 'Blank');
  await page.getByRole('button', { name: 'Equation (LaTeX)…' }).click();
  const eq = page.getByRole('dialog', { name: 'Insert equation' });
  // nothing typed yet: closes straight away
  await eq.getByRole('button', { name: 'Cancel' }).click();
  await expect(eq).toBeHidden();

  await page.getByRole('button', { name: 'Equation (LaTeX)…' }).click();
  await eq.getByLabel('LaTeX').fill('a^2 + b^2 = c^2');
  await eq.getByLabel('LaTeX').press('Escape');
  const ask = page.getByRole('alertdialog', { name: 'Discard your changes?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toBeHidden();
  await expect(eq.getByLabel('LaTeX')).toHaveValue('a^2 + b^2 = c^2');

  await eq.getByRole('button', { name: 'Cancel' }).click();
  await ask.getByRole('button', { name: 'Discard changes' }).click();
  await expect(eq).toBeHidden();
  await expect(page.locator('.poster .el-equation')).toHaveCount(0);

  // the authors dialog too
  await page.getByRole('button', { name: /Authors and affiliations/ }).click();
  await page.getByLabel('Author 1 name').fill('Ada Lovelace');
  await page.keyboard.press('Escape');
  await expect(ask).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(ask).toBeHidden();
  await expect(page.getByLabel('Author 1 name')).toHaveValue('Ada Lovelace');
});

test('backs up every poster in one file and restores it without losing newer work', async ({ page }) => {
  await newPoster(page, 'Classic columns', 'Kept poster');
  await page.getByRole('button', { name: /My posters/ }).click();
  await newPoster(page, 'Blank', 'Second poster');
  await page.getByRole('button', { name: /My posters/ }).click();
  await expect(page.getByRole('heading', { name: 'My posters' })).toBeVisible();

  // pretend the last backup was 8 days ago: the reminder shows
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('posterhub.ui') ?? '{}');
    localStorage.setItem('posterhub.ui', JSON.stringify({ ...p, lastBackupAt: Date.now() - 8 * 86400000 + 60000 }));
  });
  await page.reload();
  const banner = page.getByRole('region', { name: 'Backup reminder' });
  await expect(banner).toContainText('Last backup 7 days ago');

  // "Remind me later" hides it
  await banner.getByRole('button', { name: 'Remind me later' }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(banner).toHaveCount(0);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download all posters' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^PosterHub-backup-\d{4}-\d\d-\d\d\.posterhub-backup\.json$/);
  const saved = await file.path();
  const data = JSON.parse(fs.readFileSync(saved, 'utf8'));
  expect(data.app).toBe('posterhub-backup');
  expect(data.posters.map((p: { name: string }) => p.name).sort()).toEqual(['Kept poster', 'Second poster']);

  // delete one, then restore from the backup
  const card = page.locator('.poster-card', { hasText: 'Second poster' });
  await card.getByRole('button', { name: 'More for Second poster' }).click();
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  await page.getByRole('button', { name: 'Delete poster' }).click();
  await expect(page.locator('.poster-card')).toHaveCount(1);

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open project file' }).click();
  await (await chooser).setFiles(saved);
  await expect(page.getByRole('status').filter({ hasText: 'Backup restored' })).toContainText('added 1 poster, kept 1 poster you already had');
  await expect(page.locator('.poster-card')).toHaveCount(2);
  await expect(page.locator('.poster-card', { hasText: 'Second poster' })).toBeVisible();

  // the storage meter is in Settings
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByTestId('storage-use')).toContainText('used of');
  await expect(page.getByText(/Last backup:/)).toBeVisible();
});

test('the empty library points to Settings for backups', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.empty')).toContainText('download a backup from Settings');
  await expect(page.getByRole('region', { name: 'Backup reminder' })).toHaveCount(0);
});

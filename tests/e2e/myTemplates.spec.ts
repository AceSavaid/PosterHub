import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR42mP8z8DwnwEIGGEAAB0EAf9q3OwAAAAASUVORK5CYII=', 'base64');
const els = (page: Page) => page.locator('.poster > .el');

/** A Dark Mode poster in Lora, with a real title and a logo. */
async function makeStyledPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByLabel('Poster title').fill('Sleep study');
  await page.getByRole('button', { name: /^Boxed sections/ }).click();
  await page.getByText('More options').click();
  await page.getByRole('button', { name: 'Dark Mode' }).click();
  await page.getByLabel('Heading font').selectOption('Lora');
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();

  const title = page.locator('.poster .el-title .el-body');
  await title.dblclick();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Sleep spindles predict memory');
  await page.keyboard.press('Escape');
  await expect(title).toHaveText('Sleep spindles predict memory');

  // put our logo into the first logo box
  const logo = page.locator('.poster .el-image').first();
  await logo.click();
  const chooser = page.waitForEvent('filechooser');
  await logo.dblclick();
  await (await chooser).setFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('.poster .el-image img').first()).toBeVisible();
}

async function saveAsTemplate(page: Page, name: string) {
  await page.getByRole('button', { name: 'Poster menu' }).click();
  await page.getByRole('menuitem', { name: 'Save as my template…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save as my template' });
  await expect(dialog).toBeVisible();
  // the logo is ticked to keep by default
  await expect(dialog.getByRole('checkbox', { name: /Keep picture 1/ })).toBeChecked();
  await dialog.getByLabel('Template name').fill(name);
  await dialog.getByRole('button', { name: 'Save template' }).click();
  await expect(page.getByText(`Saved “${name}” to My templates`)).toBeVisible();
}

test('saves a poster as my template and makes a new poster from it', async ({ page }) => {
  await makeStyledPoster(page);
  const count = await els(page).count();
  await saveAsTemplate(page, 'Lab style');

  await page.getByRole('button', { name: /My posters/ }).click();
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  const card = page.locator('[data-my-template="Lab style"]');
  await expect(card).toBeVisible();
  await expect(card.locator('svg image')).toHaveCount(1); // the kept logo shows in the preview
  await card.getByRole('button', { name: /^Lab style/ }).click();
  await expect(page.getByText('Using your template “Lab style”')).toBeVisible();
  // size, colour and font choices are hidden: the template brings its own
  await expect(page.getByLabel('Heading font')).toHaveCount(0);
  await page.getByLabel('Poster title').fill('Second study');
  await page.getByRole('button', { name: 'Create poster' }).click();

  await expect(page.locator('.poster')).toBeVisible();
  await expect(page.getByLabel('Poster name')).toHaveValue('Second study');
  await expect(els(page)).toHaveCount(count);
  // the new title instead of the old one, same headings, logo kept, same colours and fonts
  await expect(page.locator('.poster .el-title .el-body')).toHaveText('Second study');
  await expect(page.locator('.poster .el-heading', { hasText: 'Methods' })).toHaveCount(1);
  await expect(page.locator('.poster .el-image img')).toHaveCount(1);
  await expect(page.locator('.poster')).toHaveCSS('background-color', 'rgb(20, 24, 31)');
  expect(await page.locator('.poster .el-title .el-body').evaluate((n) => getComputedStyle(n).fontFamily)).toContain('Lora');

  // the original poster is unchanged
  await page.getByRole('button', { name: /My posters/ }).click();
  await page.getByRole('button', { name: 'Open', exact: true }).nth(1).click();
  await expect(page.locator('.poster .el-title .el-body')).toHaveText('Sleep spindles predict memory');
});

test('renames, exports, deletes and imports my templates', async ({ page }) => {
  await makeStyledPoster(page);
  await saveAsTemplate(page, 'Lab style');
  await page.getByRole('button', { name: /My posters/ }).click();
  await page.getByRole('button', { name: '+ New poster' }).first().click();

  // rename
  await page.getByRole('button', { name: 'Rename Lab style' }).click();
  const input = page.getByLabel('Template name');
  await input.fill('Neuro lab');
  await input.press('Enter');
  await expect(page.locator('[data-my-template="Neuro lab"]')).toBeVisible();
  await expect(page.locator('[data-my-template="Lab style"]')).toHaveCount(0);

  // export
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Neuro lab' }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toBe('Neuro-lab.postertemplate.json');
  const text = await fs.readFile((await file.path())!, 'utf8');
  const data = JSON.parse(text);
  expect(data.app).toBe('posterhub-template');
  expect(data.name).toBe('Neuro lab');
  expect(text).not.toContain('Sleep spindles');

  // delete (asks first)
  await page.getByRole('button', { name: 'Delete Neuro lab' }).click();
  await page.getByRole('button', { name: 'Delete template' }).click();
  await expect(page.locator('[data-my-template]')).toHaveCount(0);

  // import it back
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import template file…' }).click();
  await (await chooser).setFiles({ name: 'Neuro-lab.postertemplate.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.locator('[data-my-template="Neuro lab"]')).toBeVisible();
  // an imported template is picked straight away
  await expect(page.getByText('Using your template “Neuro lab”')).toBeVisible();

  // a file that isn't a template is refused with a clear message
  const chooser2 = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import template file…' }).click();
  await (await chooser2).setFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(page.getByRole('alert')).toHaveText(/not a PosterHub template/);
  await expect(page.locator('[data-my-template]')).toHaveCount(1);
});

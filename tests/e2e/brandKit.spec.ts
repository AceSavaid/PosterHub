import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures');
// 2×1 red/blue PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DAwMDAAAAPAQH/wMg3vQAAAABJRU5ErkJggg==', 'base64');

const kitDialog = (page: Page) => page.getByRole('dialog', { name: 'Brand kit' });

async function choose(page: Page, button: RegExp | string, file: { name: string; mimeType: string; buffer: Buffer } | string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: button }).click();
  await (await chooser).setFiles(file);
}

async function setUpKit(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Brand kit' }).click();
  const d = kitDialog(page);
  await expect(d.getByLabel('University or lab name')).toBeFocused();
  await d.getByLabel('University or lab name').fill('University of Westbrook');
  await d.getByLabel('Primary colour code').fill('#7a0019');
  await d.getByLabel('Primary colour code').press('Enter');
  await expect(d.getByLabel('Primary colour', { exact: true })).toHaveValue('#7a0019');
  await choose(page, /Upload your university font/, path.join(FIXTURES, 'Italiana-Regular.ttf'));
  await d.getByLabel('Heading font').selectOption('Italiana');
  await choose(page, '+ Add logo', { name: 'westbrook.png', mimeType: 'image/png', buffer: PNG });
  await choose(page, '+ Add logo', { name: 'smith-lab.png', mimeType: 'image/png', buffer: PNG });
  await d.getByLabel('Logo 2 name').fill('Smith Lab');
  await d.getByRole('button', { name: 'Move logo 2 up' }).click();
  await expect(d.getByLabel('Logo 1 name')).toHaveValue('Smith Lab');
  await d.getByRole('button', { name: 'Move logo 2 up' }).click();
  await d.getByRole('button', { name: 'Save brand kit' }).click();
  await expect(d).toHaveCount(0);
}

test('a brand kit set up once starts every new poster with its colours, fonts and logos', async ({ page }) => {
  await setUpKit(page);

  // the kit survives a reload
  await page.reload();
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  const np = page.getByRole('dialog', { name: 'New poster' });
  await expect(np.getByLabel(/Start with my brand kit \(University of Westbrook\)/)).toBeChecked();
  await expect(np.getByLabel('Heading font')).toHaveValue('Italiana');
  await expect(np.getByRole('button', { name: 'University of Westbrook', pressed: true })).toBeVisible();
  await np.getByRole('button', { name: /^Boxed sections/ }).click();
  await np.getByRole('button', { name: 'Create poster' }).click();

  // both logo spots by the title are filled, in kit order
  await expect(page.locator('.poster')).toBeVisible();
  const logos = page.locator('.poster .el img[alt$="logo"]');
  await expect(logos).toHaveCount(2);
  await expect(logos.nth(0)).toHaveAttribute('alt', 'University of Westbrook logo');
  await expect(logos.nth(1)).toHaveAttribute('alt', 'Smith Lab logo');
  await page.getByRole('tab', { name: 'Design' }).click();
  await expect(page.getByLabel('Headings')).toHaveValue('Italiana');
  await expect(page.locator('.role-editor code').first()).toHaveText('#7a0019');

  // unticking the kit gives a plain poster
  await page.getByRole('button', { name: /My posters|Back/ }).first().click();
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await np.getByLabel(/Start with my brand kit/).uncheck();
  await expect(np.getByLabel('Heading font')).toHaveValue('Montserrat');
  await np.getByRole('button', { name: /^Boxed sections/ }).click();
  await np.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
  await expect(page.locator('.poster .el img[alt$="logo"]')).toHaveCount(0);
});

test('a brand kit can be saved to a file and opened in another browser', async ({ page, browser }) => {
  await setUpKit(page);
  await page.getByRole('button', { name: 'Brand kit' }).click();
  const download = page.waitForEvent('download');
  await kitDialog(page).getByRole('button', { name: 'Save kit file' }).click();
  const dl = await download;
  expect(dl.suggestedFilename()).toBe('University-of-Westbrook.brandkit.json');
  const file = await dl.path();
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(json).toMatchObject({ kind: 'brand-kit', kit: { name: 'University of Westbrook', headingFont: 'Italiana' } });
  expect(json.kit.logos).toHaveLength(2);

  const other = await browser.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: 'Brand kit' }).click();
  await choose(other, 'Open kit file…', file);
  const d = kitDialog(other);
  await expect(d.getByRole('status')).toContainText('Opened “University of Westbrook”');
  await expect(d.getByLabel('University or lab name')).toHaveValue('University of Westbrook');
  await expect(d.getByRole('list', { name: 'Logos' }).locator('li')).toHaveCount(2);
  await d.getByRole('button', { name: 'Save brand kit' }).click();
  await other.getByRole('button', { name: '+ New poster' }).first().click();
  await expect(other.getByLabel(/Start with my brand kit/)).toBeChecked();

  // a file that is not a kit is refused with a clear message
  await other.getByRole('button', { name: 'Cancel' }).click();
  await other.getByRole('button', { name: 'Brand kit' }).click();
  await choose(other, 'Open kit file…', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"elements":[]}') });
  await expect(kitDialog(other).getByRole('alert')).toHaveText('This file is not a PosterHub brand kit.');
  await other.close();
});

test('the Design tab applies the kit to an existing poster and saves a poster’s look as the kit', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: /^Framed panels/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await page.getByRole('tab', { name: 'Design' }).click();
  await expect(page.getByRole('button', { name: 'Apply my brand kit' })).toHaveCount(0);
  await page.getByRole('button', { name: /^Forest/ }).click();
  await page.getByRole('button', { name: 'Save this look as my brand kit' }).click();
  await expect(page.getByText('Saved as your brand kit.')).toBeVisible();

  // change the look, then apply the kit back
  await page.getByRole('button', { name: /^Crimson/ }).click();
  await page.getByRole('button', { name: 'Apply my brand kit' }).click();
  await expect(page.locator('.role-editor code').first()).toHaveText('#2d5a3d');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.role-editor code').first()).toHaveText('#8b1e2d');
});

test('new poster dialog offers to set up a kit when there is none', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: 'Set up a brand kit' }).click();
  const d = kitDialog(page);
  await d.getByLabel('University or lab name').fill('Lab X');
  await d.getByRole('button', { name: 'Save brand kit' }).click();
  await expect(page.getByLabel('Start with my brand kit (Lab X)')).toBeChecked();
});

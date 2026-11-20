import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import { pdfText } from '../helpers/pdf';

const BIB = `@article{lecun2015, author = {LeCun, Yann and Bengio, Yoshua and Hinton, Geoffrey}, title = {Deep learning}, journal = {Nature}, year = {2015}, volume = {521}, pages = {436--444}, doi = {10.1038/nature14539}}
@book{walker2017, author = {Walker, Matthew}, title = {Why We Sleep}, publisher = {Scribner}, year = {2017}}`;

async function newPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

async function download(page: Page, label: RegExp) {
  await page.getByRole('button', { name: 'Export ▾' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: label }).click();
  return fs.readFile(await (await dl).path());
}

test('adds references from BibTeX, cites them in text and keeps the numbers in order', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'References / citations…' }).click();
  const dialog = page.getByRole('dialog', { name: 'References' });
  await dialog.getByLabel('Paste DOIs or BibTeX').fill(BIB);
  await dialog.getByRole('button', { name: 'Add references' }).click();
  await expect(dialog.getByRole('status')).toContainText('Added 2 references.');
  await expect(dialog.getByRole('list', { name: 'Your references' }).getByRole('listitem')).toHaveCount(2);
  await expect(dialog).toContainText('Not cited in the text yet');

  // pasting the same file again doesn't duplicate anything
  await dialog.getByLabel('Paste DOIs or BibTeX').fill(BIB);
  await dialog.getByRole('button', { name: 'Add references' }).click();
  await expect(dialog.getByRole('status')).toContainText('2 were already in the list.');

  await dialog.getByRole('button', { name: 'Add reference list to poster' }).click();
  await expect(dialog).toHaveCount(0);
  const list = page.locator('.poster .el-text').filter({ hasText: 'References' });
  await expect(list).toContainText('1. LeCun Y, Bengio Y, Hinton G. Deep learning. Nature. 2015;521:436–444.');
  await expect(page.locator('.insp-head h3')).toHaveText('Reference list');

  // a text box in the first column citing the book, then the article
  await page.getByRole('button', { name: 'Text box', exact: true }).click();
  await page.keyboard.type('Sleep helps memory');
  const cite = page.locator('.cite-section');
  await cite.getByRole('button', { name: /^Walker 2017/ }).click();
  await page.keyboard.type(' and learning');
  await cite.getByRole('button', { name: /^LeCun et al\. 2015/ }).click();
  await cite.getByRole('button', { name: /^Walker 2017/ }).click(); // straight after: joins the same marker
  await page.keyboard.press('Escape');

  const box = page.locator('.poster .el-text').filter({ hasText: 'Sleep helps memory' });
  await expect(box).toHaveText('Sleep helps memory [1] and learning [1, 2]');
  // cited first → numbered first
  await expect(list).toContainText('1. Walker M. Why We Sleep.');
  await expect(list).toContainText('2. LeCun Y');

  // switching style rewrites markers and the list
  await page.getByRole('button', { name: 'References / citations…' }).click();
  await dialog.getByLabel('Citation style').selectOption('apa');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(box).toHaveText('Sleep helps memory (Walker, 2017) and learning (LeCun et al., 2015; Walker, 2017)');
  await expect(list).toContainText('LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature, 521, 436–444. https://doi.org/10.1038/nature14539');

  // removing a reference removes its citations too
  await page.getByRole('button', { name: 'References / citations…' }).click();
  await dialog.getByRole('button', { name: 'Remove Walker 2017' }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(box).toHaveText('Sleep helps memory and learning (LeCun et al., 2015)');

  // undo brings it back
  await page.keyboard.press('ControlOrMeta+z');
  await expect(box).toHaveText('Sleep helps memory (Walker, 2017) and learning (LeCun et al., 2015; Walker, 2017)');
});

test('exports citations and the reference list to PDF and PowerPoint', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'References / citations…' }).click();
  const dialog = page.getByRole('dialog', { name: 'References' });
  await dialog.getByLabel('Paste DOIs or BibTeX').fill(BIB);
  await dialog.getByRole('button', { name: 'Add references' }).click();
  await dialog.getByRole('button', { name: 'Add reference list to poster' }).click();
  await page.getByRole('button', { name: 'Text box', exact: true }).click();
  await page.keyboard.type('Deep nets work');
  await page.locator('.cite-section').getByRole('button', { name: /^LeCun/ }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  const pdf = await pdfText(await download(page, /^PDF/));
  expect(pdf).toContain('Deep nets work [1]');
  expect(pdf).toContain('References');
  expect(pdf).toContain('LeCun Y, Bengio Y, Hinton G. Deep learning.');

  const zip = await JSZip.loadAsync(await download(page, /^PowerPoint/));
  const slide = await zip.file('ppt/slides/slide1.xml')!.async('string');
  expect(slide).toContain('[1]');
  expect(slide).toContain('Walker M. Why We Sleep.');
});

test('the reference list opens the references dialog instead of typing, and check spots a missing list', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'References / citations…' }).click();
  const dialog = page.getByRole('dialog', { name: 'References' });
  // typing one in by hand
  await dialog.getByRole('button', { name: 'Type one in…' }).click();
  await dialog.getByLabel('Title').fill('A handmade reference');
  await dialog.getByLabel(/^Authors/).fill('Curie, Marie');
  await dialog.getByLabel('Year').fill('1903');
  await dialog.getByRole('button', { name: 'Save reference' }).click();
  await expect(dialog.getByRole('listitem')).toContainText('Curie M. A handmade reference.');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await page.getByRole('button', { name: 'Text box', exact: true }).click();
  await page.keyboard.type('Radioactivity');
  await page.locator('.cite-section').getByRole('button', { name: /^Curie 1903/ }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Check/ }).click();
  await expect(page.getByRole('dialog', { name: 'Poster check' })).toContainText('Citations but no reference list');
  await page.getByRole('dialog', { name: 'Poster check' }).getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'References / citations…' }).click();
  await dialog.getByRole('button', { name: 'Add reference list to poster' }).click();
  await page.locator('.poster .el-text').filter({ hasText: 'References' }).dblclick();
  await expect(dialog).toBeVisible();
});

test('on a starter template the list replaces the example references and keeps the contact details', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: /^Classic columns/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await page.getByRole('button', { name: 'References / citations…' }).click();
  const dialog = page.getByRole('dialog', { name: 'References' });
  await dialog.getByLabel('Paste DOIs or BibTeX').fill(BIB);
  await dialog.getByRole('button', { name: 'Add references' }).click();
  await dialog.getByRole('button', { name: 'Add reference list to poster' }).click();
  await expect(page.locator('.poster .el-text').filter({ hasText: 'Author, A. (2025)' })).toHaveCount(0);
  await expect(page.locator('.poster .el-text').filter({ hasText: /^References1\. LeCun/ })).toHaveCount(1);
  await expect(page.locator('.poster .el-text').filter({ hasText: /^Contact/ })).toHaveCount(1);
});

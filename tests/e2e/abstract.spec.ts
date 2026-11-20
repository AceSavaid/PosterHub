import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import JSZip from 'jszip';

async function newPoster(page: Page, template = 'Classic columns') {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: new RegExp('^' + template) }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Fill from your abstract' });

const ABSTRACT = `Background: Sleep supports memory, but little is known about naps in older adults.
Methods: We recruited 42 adults aged 65–80 and randomised them to a nap or quiet rest.
Results: Recall improved by 18% after a nap.
Conclusions: Short naps may help older adults remember.
Keywords: sleep; memory`;

test('pastes a structured abstract, checks the mapping, and fills the sections', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'Fill from abstract or Word…' }).click();
  const d = dialog(page);
  await expect(d.getByLabel('Abstract')).toBeFocused();
  await d.getByLabel('Abstract').fill(ABSTRACT);
  await d.getByRole('button', { name: 'Next: check where it goes' }).click();

  await expect(d.getByRole('status')).toContainText('Found 5 parts by their headings');
  await expect(d.getByLabel('Where Background goes')).toHaveValue(/\d/);
  await expect(d.getByLabel('Where Methods goes').locator('option:checked')).toHaveText('Methods');
  await expect(d.getByLabel('Where Results goes').locator('option:checked')).toHaveText('Results');
  await expect(d.getByLabel('Where Keywords goes').locator('option:checked')).toHaveText('Leave out');

  // fix a typo in the preview before filling
  await d.getByRole('textbox', { name: 'Results' }).fill('Recall improved by 18% after a nap (p = 0.01).');

  const { violations } = await new AxeBuilder({ page }).include('.abstract-dialog').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);

  await d.getByRole('button', { name: 'Fill poster' }).click();
  await expect(d).toHaveCount(0);
  await expect(page.locator('.toast').filter({ hasText: 'Filled 4 sections from your abstract' })).toBeVisible();

  const poster = page.locator('.poster');
  await expect(poster.getByText('We recruited 42 adults aged 65–80', { exact: false })).toBeVisible();
  await expect(poster.getByText('Recall improved by 18% after a nap (p = 0.01).')).toBeVisible();
  await expect(poster).not.toContainText('sleep; memory');

  // one undo step takes it all back
  await page.keyboard.press('ControlOrMeta+z');
  await expect(poster).not.toContainText('We recruited 42 adults');
});

test('makes a best guess for an abstract without headings, and lets people move a part', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'Fill from abstract or Word…' }).click();
  const d = dialog(page);
  await d.getByLabel('Abstract').fill(
    'Little is known about daytime naps in older adults. We recruited 42 adults and randomised them to a nap or rest. ' +
      'Recall improved by 18% after a nap (p = 0.01). These findings suggest that short naps may help memory.',
  );
  await d.getByRole('button', { name: 'Next: check where it goes' }).click();
  await expect(d.getByRole('status')).toContainText('best guess');
  await expect(d.getByText('best guess', { exact: true })).toHaveCount(4);
  // send the conclusions to Results instead, and leave the methods out
  await d.getByLabel('Where Conclusions goes').selectOption({ label: 'Results' });
  await d.getByLabel('Where Methods goes').selectOption({ label: 'Leave out' });
  await d.getByRole('button', { name: 'Fill poster' }).click();
  const poster = page.locator('.poster');
  await expect(poster).toContainText('Results. Recall improved by 18%');
  await expect(poster).toContainText('Conclusions. These findings suggest');
  await expect(poster).not.toContainText('We recruited 42 adults');
});

test('opens a Word file, uses its title, and asks before adding to text the person wrote', async ({ page }) => {
  await newPoster(page);
  // the person already wrote something under Results
  const results = page.locator('.poster .el').filter({ hasText: 'Replace this text with your own' }).nth(2);
  await results.dblclick();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('My draft notes.');
  await page.locator('.poster').click({ position: { x: 5, y: 5 } });

  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const p = (t: string, style?: string) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t>${t}</w:t></w:r></w:p>`;
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    `<w:document xmlns:w="${W}"><w:body>${p('Naps and memory', 'Title')}${p('Abstract', 'Heading1')}${p('Background: Naps are common.')}${p('Results: Recall rose &lt;script&gt;.')}${p('Introduction', 'Heading1')}${p('Paper text.')}</w:body></w:document>`,
  );
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });

  await page.getByRole('button', { name: 'Fill from abstract or Word…' }).click();
  const d = dialog(page);
  const chooser = page.waitForEvent('filechooser');
  await d.getByRole('button', { name: 'Open a Word file (.docx)…' }).click();
  await (await chooser).setFiles({ name: 'abstract.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer });

  await expect(d.getByLabel('Use “Naps and memory” as the poster title')).toBeChecked();
  await expect(d.getByRole('group')).toContainText('already has your own text');
  await expect(d.getByLabel('Add the abstract after it')).toBeChecked();
  await d.getByRole('button', { name: 'Fill poster' }).click();

  const poster = page.locator('.poster');
  await expect(poster.locator('.el').filter({ hasText: /^Naps and memory$/ })).toBeVisible();
  await expect(poster).toContainText('Naps are common.');
  await expect(poster).toContainText('My draft notes.');
  await expect(poster).toContainText('Recall rose <script>.');
  await expect(poster).not.toContainText('Paper text.');
  expect(await poster.locator('script').count()).toBe(0);
});

test('explains that a blank poster needs a layout first', async ({ page }) => {
  await newPoster(page, 'Blank');
  await page.getByRole('button', { name: 'Fill from abstract or Word…' }).click();
  const d = dialog(page);
  await expect(d.getByRole('status')).toContainText('no sections yet');
  await d.getByLabel('Abstract').fill('Background: x. Results: y.');
  await expect(d.getByRole('button', { name: 'Next: check where it goes' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);
});

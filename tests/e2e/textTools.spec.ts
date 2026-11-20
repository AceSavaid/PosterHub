import { test, expect, type Page } from '@playwright/test';

async function newPoster(page: Page, template = 'Blank') {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: new RegExp('^' + template) }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

async function setTitle(page: Page, text: string) {
  await page.locator('.poster .el-title .el-body').dblclick();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
}

test('find and replace across the poster, with undo', async ({ page }) => {
  await newPoster(page, 'Classic columns');
  await page.locator('.poster').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+f');
  const panel = page.getByRole('dialog', { name: 'Find and replace' });
  await expect(panel).toBeVisible();
  await expect(panel.getByPlaceholder('Word or phrase')).toBeFocused();

  await page.keyboard.type('poster title');
  await expect(panel.getByRole('status')).toHaveText('1 of 1 · in 1 box');
  // the box with the match is selected so it is easy to spot
  await expect(page.locator('.insp-head h3')).toHaveText('Title');

  await panel.getByPlaceholder('Word or phrase').fill('two metres');
  const status = await panel.getByRole('status').textContent();
  const total = Number(status!.match(/of (\d+)/)![1]);
  expect(total).toBeGreaterThan(1);
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('status')).toContainText(`2 of ${total}`);

  await panel.getByPlaceholder('Leave empty to delete').fill('TWO METRES');
  await panel.getByRole('button', { name: /^Replace all/ }).click();
  await expect(page.locator('.toast')).toContainText(`Replaced ${total} matches`);
  await expect(page.locator('.poster')).toContainText('TWO METRES');
  // matching is not case sensitive by default, so it still finds the new text; with Match case it does not
  await panel.getByLabel('Match case').check();
  await expect(panel.getByRole('status')).toHaveText('No matches');

  await panel.getByRole('button', { name: 'Close' }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.poster')).not.toContainText('TWO METRES');
});

test('replace one match at a time', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: /^Title/ }).first().click();
  await setTitle(page, 'cat and cat and cat');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Find and replace' });
  await panel.getByPlaceholder('Word or phrase').fill('cat');
  await panel.getByLabel('Whole words only').check();
  await panel.getByPlaceholder('Leave empty to delete').fill('cats');
  await panel.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(page.locator('.poster .el-title')).toHaveText('cats and cat and cat');
  // "cats" is not a whole-word match for "cat", so the next one is now first
  await expect(panel.getByRole('status')).toHaveText('1 of 2 · in 1 box');
  await panel.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(page.locator('.poster .el-title')).toHaveText('cats and cats and cat');
});

test('spelling tab suggests fixes and can ignore words', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: /^Title/ }).first().click();
  await setTitle(page, 'Sleep and memmory in Zorblax mice, measured by EEG');
  await page.getByRole('button', { name: /^Check/ }).click();
  const panel = page.getByRole('dialog', { name: 'Poster check' });
  await panel.getByRole('tab', { name: 'Spelling' }).click();
  await expect(panel.locator('.misspelt')).toHaveText(['memmory', 'Zorblax']);

  await panel.getByRole('button', { name: 'memory', exact: true }).click();
  await expect(page.locator('.poster .el-title')).toHaveText('Sleep and memory in Zorblax mice, measured by EEG');
  await expect(panel.locator('.misspelt')).toHaveText(['Zorblax']);

  await panel.getByRole('button', { name: 'Ignore' }).click();
  await expect(panel).toContainText('No spelling mistakes found');
  await expect(panel).toContainText('1 word(s) ignored');
});

test('words tab counts per section and warns over the limit', async ({ page }) => {
  await newPoster(page, 'Classic columns');
  await page.getByRole('button', { name: /^Check/ }).click();
  const panel = page.getByRole('dialog', { name: 'Poster check' });
  await panel.getByRole('tab', { name: 'Words' }).click();
  const total = Number((await panel.getByTestId('word-total').textContent())!.replace(/,/g, ''));
  expect(total).toBeGreaterThan(50);
  const sections = panel.getByRole('list', { name: 'Words per section' }).getByRole('button');
  await expect(sections.first()).toContainText('Title and authors');
  await expect(panel.getByRole('list', { name: 'Words per section' })).toContainText('Introduction');

  // clicking a section selects its boxes
  await sections.filter({ hasText: 'Introduction' }).click();
  expect(await page.locator('.poster > .el.selected').count()).toBeGreaterThanOrEqual(2);

  await panel.getByLabel('Word limit').fill('50');
  await expect(panel).toContainText(`${(total - 50).toLocaleString('en-US')} over the limit`);
  await panel.getByRole('tab', { name: /^Problems/ }).click();
  await expect(panel).toContainText('words over the limit');
});

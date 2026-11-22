import { test, expect } from '@playwright/test';

test('copies a poster at another size from the editor and from My posters', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByLabel('Name').fill('Sleep study');
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();

  const title = page.locator('.poster .el-title .el-body');
  await title.dblclick();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Sleep spindles predict memory');
  await page.keyboard.press('Escape');
  await expect(title).toHaveText('Sleep spindles predict memory');

  // From the editor: A1 landscape, rearranged into more columns.
  await page.getByRole('button', { name: 'Poster options' }).click();
  await page.getByRole('menuitem', { name: 'Copy at another size…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Copy at another size' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Landscape/ })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByLabel('Size').selectOption('A1');
  await expect(dialog.getByRole('radio', { name: /Rearrange into a layout/ })).toBeChecked();
  await expect(dialog.getByLabel('Columns')).toHaveValue('4');
  await expect(dialog.getByLabel('Name of the copy')).toHaveValue('Sleep study (A1 landscape)');
  await dialog.getByRole('button', { name: 'Make copy' }).click();
  await expect(page.getByText(/Made an? A1 landscape copy in 4 columns/)).toBeVisible();
  // still editing the original
  await expect(page.getByLabel('Poster name')).toHaveValue('Sleep study');

  await page.getByRole('button', { name: /My posters/ }).click();
  const card = page.locator('.poster-card', { hasText: 'Sleep study (A1 landscape)' });
  await expect(card).toBeVisible();
  await expect(card.getByText('841 × 594 mm · landscape')).toBeVisible();
  await expect(page.locator('.poster-card', { hasText: '841 × 1189 mm · portrait' })).toBeVisible(); // original unchanged

  // From My posters: an A4 handout of the original, which opens straight away.
  const original = page.locator('.poster-card').filter({ hasText: '841 × 1189 mm · portrait' });
  await original.getByRole('button', { name: 'Copy Sleep study at another size' }).click();
  await dialog.getByRole('button', { name: /Portrait/ }).click();
  await dialog.getByLabel('Size').selectOption('A4');
  await expect(dialog.getByRole('radio')).toHaveCount(0); // same shape: just scaled
  await expect(dialog.getByText(/text is scaled to 25%/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Make copy' }).click();
  await expect(page.getByLabel('Poster name')).toHaveValue('Sleep study (A4 portrait)');
  await expect(title).toHaveText('Sleep spindles predict memory');
  // scaled text still fits its boxes
  await expect(page.locator('.poster [data-overflow="true"]')).toHaveCount(0);
  const box = (await page.locator('.poster').boundingBox())!;
  expect(box.height / box.width).toBeCloseTo(297 / 210, 1);
});

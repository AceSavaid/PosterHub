import { test, expect } from '@playwright/test';

test('View mode previews the poster from a distance and marks small text', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await page.getByRole('button', { name: 'Title', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Text box', exact: true }).click();
  await page.keyboard.type('Small words');
  await page.keyboard.press('Escape');
  await page.getByLabel('Size (pt)').fill('14');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'View ▾' }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const width = () => page.locator('.view-mode .poster').evaluate((n) => n.getBoundingClientRect().width);
  const posterMm = await page.locator('.view-mode .poster').evaluate((n) => (n as HTMLElement).offsetWidth / (96 / 25.4));

  await page.getByLabel('Viewing distance').selectOption('1');
  // from 1 m an A-size poster appears at 60 % of real size (screen ~60 cm away)
  expect(await width()).toBeCloseTo(posterMm * (96 / 25.4) * 0.6, 0);
  await expect(page.getByRole('status')).toContainText('text under 12 pt');
  await expect(page.locator('.view-mode .el.too-small')).toHaveCount(0);

  await page.getByLabel('Viewing distance').selectOption('2');
  expect(await width()).toBeCloseTo(posterMm * (96 / 25.4) * 0.3, 0);
  await expect(page.getByRole('status')).toContainText('1 box is marked');
  await expect(page.locator('.view-mode .el.too-small')).toHaveCount(1);
  await expect(page.locator('.view-mode .el.too-small')).toContainText('Small words');

  await page.getByLabel('Mark small text').uncheck();
  await expect(page.locator('.view-mode .el.too-small')).toHaveCount(0);

  await page.getByLabel('Viewing distance').selectOption('0');
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.view-mode')).toHaveCount(0);
});

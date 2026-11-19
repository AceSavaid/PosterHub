import { test, expect, type Page } from '@playwright/test';

async function blankPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

const bg = (page: Page) => page.locator('.editor').evaluate((e) => getComputedStyle(e).backgroundColor);
const theme = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));

test('follows the system theme by default and can be switched to light or dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await blankPoster(page);
  expect(await theme(page)).toBeNull();
  expect(await bg(page)).toBe('rgb(26, 29, 35)');

  await page.getByRole('button', { name: 'Appearance' }).click();
  await page.getByRole('radio', { name: /Light/ }).click();
  expect(await theme(page)).toBe('light');
  expect(await bg(page)).toBe('rgb(255, 255, 255)');

  // a forced dark theme wins over a light system setting
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('radio', { name: /Dark/ }).click();
  expect(await bg(page)).toBe('rgb(26, 29, 35)');

  // remembered after a reload, including on the My posters page
  await page.goto('/');
  expect(await theme(page)).toBe('dark');
  await page.getByRole('button', { name: 'Appearance' }).click();
  await expect(page.getByRole('radio', { name: /Dark/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: /Auto/ }).click();
  expect(await theme(page)).toBeNull();
});

test('side panels can be swapped and hidden, and stay that way', async ({ page }) => {
  await blankPoster(page);
  const tools = page.locator('.panel.left');
  const props = page.locator('.panel.right');
  const stage = page.locator('.stage');
  expect((await tools.boundingBox())!.x).toBeLessThan((await stage.boundingBox())!.x);

  await page.getByRole('button', { name: 'Appearance' }).click();
  await page.getByLabel('Tools on the right').check();
  expect((await tools.boundingBox())!.x).toBeGreaterThan((await stage.boundingBox())!.x);
  expect((await props.boundingBox())!.x).toBeLessThan((await stage.boundingBox())!.x);

  await page.getByLabel('Show properties panel').uncheck();
  await expect(props).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.appearance-menu')).toHaveCount(0);

  // preferences survive a reload
  await page.reload();
  await expect(page.locator('.poster')).toBeVisible();
  await expect(props).toHaveCount(0);
  expect((await tools.boundingBox())!.x).toBeGreaterThan((await stage.boundingBox())!.x);

  // the edge tab brings a hidden panel back
  await page.getByRole('button', { name: 'Show properties panel' }).click();
  await expect(props).toBeVisible();

  // Ctrl/⌘ \ hides both panels for a focused view, and brings them back
  await page.locator('.stage').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+Backslash');
  await expect(tools).toHaveCount(0);
  await expect(props).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Backslash');
  await expect(tools).toBeVisible();
  await expect(props).toBeVisible();
});

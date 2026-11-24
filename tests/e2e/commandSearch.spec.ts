import { test, expect, type Page } from '@playwright/test';

async function blankPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}
const shape = (page: Page) => page.locator('.poster').evaluate((n) => (n.clientWidth > n.clientHeight ? 'landscape' : 'portrait'));

test('Alt+/ searches the menus: type a few letters and press Enter', async ({ page }) => {
  await blankPoster(page);
  expect(await shape(page)).toBe('portrait');

  await page.keyboard.press('Alt+/');
  const box = page.getByRole('combobox', { name: 'Search the menus' });
  await expect(box).toBeFocused();
  await box.fill('landscape');
  const results = page.getByRole('listbox', { name: 'Commands' }).getByRole('option');
  await expect(results.first()).toContainText('Make the poster landscape');
  await expect(results.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(box).toHaveCount(0);
  await expect.poll(() => shape(page)).toBe('landscape');
  await expect(page.locator('.toast')).toContainText('landscape');

  // arrow keys move through the matches; a match by another word works too
  await page.keyboard.press('Alt+/');
  await box.fill('qr');
  await expect(results.first()).toContainText('Add a QR code');
  await page.keyboard.press('Enter');
  await expect(page.locator('.poster .el')).toHaveCount(1);

  // Esc closes without doing anything
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+/');
  await box.fill('zzzz');
  await expect(page.getByText('Nothing matches “zzzz”')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(box).toHaveCount(0);
});

test('the menu search opens while typing, from the gear menu, and runs a clicked command', async ({ page }) => {
  await blankPoster(page);
  await page.getByRole('button', { name: 'Text box', exact: true }).click();
  await page.keyboard.type('Hello');
  await page.keyboard.press('Alt+/');
  const box = page.getByRole('combobox', { name: 'Search the menus' });
  await expect(box).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(box).toHaveCount(0);

  await page.getByRole('button', { name: 'Settings and help' }).click();
  await page.getByRole('menuitem', { name: /Search the menus/ }).click();
  await expect(box).toBeFocused();
  await box.fill('spelling');
  await page.getByRole('option', { name: /Check spelling/ }).click();
  const panel = page.getByRole('dialog', { name: 'Poster check' });
  await expect(panel.getByRole('tab', { name: 'Spelling' })).toHaveAttribute('aria-selected', 'true');

  // a command that cannot run right now is shown greyed out and does nothing
  await page.keyboard.press('Escape');
  await page.locator('.stage').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Alt+/');
  await box.fill('ungroup');
  await expect(page.getByRole('option', { name: /Ungroup/ })).toHaveAttribute('aria-disabled', 'true');
});

test('Check offers a darker palette colour for faint text and a readable size for small text', async ({ page }) => {
  await blankPoster(page);
  await page.getByRole('button', { name: 'Text box', exact: true }).click();
  await page.keyboard.type('Faint and tiny words');
  await page.keyboard.press('Escape');
  await page.getByLabel('Size (pt)').fill('12');
  await page.getByLabel('Custom colour').first().fill('#d0d0d0');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /^Check/ }).click();
  const panel = page.getByRole('dialog', { name: 'Poster check' });
  const faint = panel.locator('.issue').filter({ hasText: 'too faint on its background' });
  await expect(faint).toContainText('Darker text, such as the palette’s Text colour');
  const small = panel.locator('.issue').filter({ hasText: 'too small to read from 2 m' });
  await expect(small).toContainText('on an A0 poster that needs at least 20 pt');

  await faint.getByRole('button', { name: 'Use the palette’s Text colour' }).click();
  await expect(faint).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('Now using the palette’s Text colour');

  await small.getByRole('button', { name: 'Make it 20 pt' }).click();
  await expect(small).toHaveCount(0);
  // close the floating panel, which can sit over the box on a narrower poster area
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toHaveCount(0);
  const text = page.locator('.poster .el').filter({ hasText: 'Faint and tiny words' });
  await text.click();
  await expect(page.getByLabel('Size (pt)')).toHaveValue('20');
  // the bigger text still fits its box
  await expect(text).not.toHaveAttribute('data-overflow', 'true');

  // one undo puts the size back
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await text.click();
  await expect(page.getByLabel('Size (pt)')).toHaveValue('12');
});

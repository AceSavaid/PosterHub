import { test, expect } from '@playwright/test';

test('Check lists a graph with no description and takes one in place', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();

  // pasted cells become a table; the toast offers a graph instead
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'Group\tScore\nA\t40\nB\t75');
    // Firefox drops clipboardData given to a script-made event, so attach it directly.
    document.dispatchEvent(Object.defineProperty(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }), 'clipboardData', { value: dt }));
  });
  await page.getByRole('button', { name: 'Make a graph instead' }).click();
  await page.getByRole('button', { name: 'Add graph to poster' }).click();
  await expect(page.locator('.poster .el-chart canvas')).toBeVisible();

  await page.getByRole('button', { name: /^Check/ }).click();
  const item = page.locator('.issue').filter({ hasText: 'has no description' });
  await expect(item).toHaveCount(1);
  const box = item.getByRole('textbox', { name: /^Description for:/ });
  await expect(item.getByRole('button', { name: 'Save description' })).toBeDisabled();
  await box.fill('Scores rose from 40 to 75');
  await box.press('Enter');

  await expect(page.locator('.issue').filter({ hasText: 'has no description' })).toHaveCount(0);
  await expect(page.getByText('Description saved.')).toBeVisible();
  // the same description shows in the side panel and is read out for the graph
  // (the graph is still selected; clicking it can land on the Check panel when the panel covers it)
  await expect(page.locator('.poster .el-chart').first()).toHaveClass(/selected/);
  await expect(page.getByLabel('Description (alt text)')).toHaveValue('Scores rose from 40 to 75');
  await expect(page.locator('.poster [aria-label*="Scores rose from 40 to 75"]').first()).toBeAttached();

  // undo brings the item back
  await page.keyboard.press('Control+z');
  await expect(page.locator('.issue').filter({ hasText: 'has no description' })).toHaveCount(1);
});

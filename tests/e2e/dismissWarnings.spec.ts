import { test, expect, type Page } from '@playwright/test';

async function newPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: /^Classic columns/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
  await page.getByRole('button', { name: /^Check/ }).click();
  return page.getByRole('dialog', { name: 'Poster check' });
}

test('a Check item can be dismissed, stays dismissed after a reload and can be brought back', async ({ page }) => {
  const panel = await newPoster(page);
  const items = panel.locator('.issue-list > li');
  await expect(items.first()).toBeVisible();
  const before = await items.count();
  const title = (await items.first().locator('strong').innerText()).trim();

  // screen readers hear which item the button dismisses
  await expect(items.first().getByRole('button', { name: 'Dismiss', exact: true })).toHaveAccessibleDescription(title);
  await items.first().getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(items).toHaveCount(before - 1);
  await expect(panel.locator('.issue-list')).not.toContainText(title);
  await expect(page.locator('.toast')).toContainText('Dismissed');

  // Undo in the message brings it straight back
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
  await expect(items).toHaveCount(before);

  // dismiss it again; it is listed, folded, under the Problems list
  await items.first().getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(items).toHaveCount(before - 1);
  const toggle = panel.getByRole('button', { name: /1 dismissed/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  // saved with the poster
  await expect(page.locator('.save-state')).toHaveText('Saved');
  await page.reload();
  await expect(page.locator('.poster')).toBeVisible();
  await page.getByRole('button', { name: /^Check/ }).click();
  await expect(panel.locator('.issue-list > li')).toHaveCount(before - 1);
  await panel.getByRole('button', { name: /1 dismissed/ }).click();
  const list = panel.getByRole('list', { name: 'Dismissed' });
  await expect(list).toContainText(title);

  await list.getByRole('button', { name: `Bring back: ${title}` }).click();
  await expect(panel.locator('.issue-list > li')).toHaveCount(before);
  await expect(panel.getByRole('button', { name: /dismissed/ })).toHaveCount(0);
});

test('dismissing a problem takes it off the Check badge and the Export menu', async ({ page }) => {
  const panel = await newPoster(page);
  // a conference rule the poster does not meet is a problem (red)
  await panel.getByRole('tab', { name: 'Conference' }).click();
  await panel.getByLabel('Conference name').fill('ISMB');
  await panel.getByLabel('Orientation').selectOption('landscape');
  await panel.getByRole('tab', { name: /^Problems/ }).click();

  const qr = panel.locator('.issue.problem').filter({ hasText: 'ISMB rule: Orientation' });
  await expect(qr).toHaveCount(1);
  await expect(page.locator('.check-btn:not(.notes-btn) .badge')).toBeVisible();
  await page.getByRole('button', { name: 'Export ▾' }).click();
  await expect(page.locator('#export-menu')).toContainText('to fix before printing');
  await page.keyboard.press('Escape');
  await page.mouse.move(5, 300);

  await qr.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(qr).toHaveCount(0);
  await expect(page.locator('.issue.problem')).toHaveCount(0);
  await page.getByRole('button', { name: 'Export ▾' }).click();
  await expect(page.locator('#export-menu')).not.toContainText('to fix before printing');
  await page.keyboard.press('Escape');
  await page.mouse.move(5, 300);

  // "Show all again" brings every dismissed item back at once
  await panel.getByRole('button', { name: 'Show all again' }).click();
  await expect(qr).toHaveCount(1);
});

test('pop-up messages can be closed straight away', async ({ page }) => {
  const panel = await newPoster(page);
  const first = panel.locator('.issue-list > li').first();
  await first.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(page.locator('.toast')).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss message' }).click();
  await expect(page.locator('.toast')).toHaveCount(0);
});

import { test, expect } from '@playwright/test';

test('conference tab checks the poster against the call for posters', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByLabel('Size').selectOption('A1');
  await page.getByRole('button', { name: /^Classic columns/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();

  await page.getByRole('button', { name: /^Check/ }).click();
  const panel = page.getByRole('dialog', { name: 'Poster check' });
  await panel.getByRole('tab', { name: 'Conference' }).click();
  await panel.getByLabel('Conference name').fill('ISMB');
  await panel.getByLabel('Required size').selectOption('A0');
  await panel.getByLabel('Orientation').selectOption('portrait');
  await panel.getByLabel('Poster number').fill('P-142');
  await panel.getByLabel('A QR code is required').check();

  const rules = panel.getByRole('list', { name: 'Conference rules' });
  await expect(panel.getByRole('heading', { name: '1 of 4 rules met' })).toBeVisible();
  await expect(rules.locator('li.fail')).toHaveCount(3);
  await expect(rules.locator('li.ok')).toContainText('Orientation: portrait');
  await expect(rules.locator('li.fail').first()).toContainText('594 × 841 mm');

  // the unmet rules show up as problems too
  await panel.getByRole('tab', { name: /^Problems/ }).click();
  await expect(panel).toContainText('ISMB rule: Size: 841 × 1189 mm');
  await expect(panel).toContainText('ISMB rule: QR code');

  // add the poster number to the title and the rule is met
  await page.locator('.poster .el-title .el-body').dblclick();
  await page.keyboard.press('End');
  await page.keyboard.type(' (P-142)');
  await page.keyboard.press('Escape');
  await panel.getByRole('tab', { name: 'Conference' }).click();
  await expect(panel.getByRole('heading', { name: '2 of 4 rules met' })).toBeVisible();

  // rules are saved with the poster and survive a reload
  await expect(page.locator('.save-state')).toHaveText('Saved');
  await page.reload();
  await page.getByRole('button', { name: /^Check/ }).click();
  await panel.getByRole('tab', { name: 'Conference' }).click();
  await expect(panel.getByLabel('Conference name')).toHaveValue('ISMB');
  await expect(panel.getByRole('heading', { name: '2 of 4 rules met' })).toBeVisible();

  await panel.getByRole('button', { name: 'Clear conference rules' }).click();
  await expect(panel.getByLabel('Conference name')).toHaveValue('');
  await expect(panel.getByRole('list', { name: 'Conference rules' })).toHaveCount(0);
});

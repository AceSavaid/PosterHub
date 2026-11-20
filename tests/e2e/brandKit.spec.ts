import { test, expect } from '@playwright/test';

test('picking the Ontario Tech brand kit once starts new posters with its colours and fonts', async ({ page }) => {
  await page.goto('/');
  // kits are a built-in list: there is no way to make your own
  await expect(page.getByRole('button', { name: 'Brand kit' })).toHaveCount(0);
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  const np = page.getByRole('dialog', { name: 'New poster' });
  await expect(np.getByLabel('Brand kit')).toHaveValue('');
  await np.getByLabel('Brand kit').selectOption({ label: 'Ontario Tech University' });
  await expect(np.getByLabel('Heading font')).toHaveValue('Ubuntu');
  await expect(np.getByLabel('Body font')).toHaveValue('Ubuntu');
  await expect(np.getByRole('button', { name: 'Ontario Tech University', pressed: true })).toBeVisible();
  await np.getByRole('button', { name: /^Boxed sections/ }).click();
  await np.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
  await page.getByRole('tab', { name: 'Design' }).click();
  await expect(page.getByLabel('Headings')).toHaveValue('Ubuntu');
  await expect(page.locator('.role-editor code').first()).toHaveText('#003c71');

  // the choice is remembered for the next poster, even after a reload
  await page.getByRole('button', { name: /My posters/ }).first().click();
  await expect(page.getByRole('heading', { name: 'My posters' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My posters' })).toBeVisible();
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await expect(np.getByLabel('Brand kit')).toHaveValue('ontario-tech');
  await expect(np.getByLabel('Heading font')).toHaveValue('Ubuntu');

  // choosing None goes back to the standard look
  await np.getByLabel('Brand kit').selectOption('');
  await expect(np.getByLabel('Heading font')).toHaveValue('Montserrat');
  await expect(np.getByRole('button', { name: 'Academic Blue', pressed: true })).toBeVisible();
});

test('the Design tab applies a brand kit to an existing poster, with undo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: /^Framed panels/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await page.getByRole('tab', { name: 'Design' }).click();
  await expect(page.locator('.role-editor code').first()).toHaveText('#1f4e79');
  await page.getByLabel('Brand kit').selectOption({ label: 'Ontario Tech University' });
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByText('Applied the Ontario Tech University brand kit')).toBeVisible();
  await expect(page.locator('.role-editor code').first()).toHaveText('#003c71');
  await expect(page.getByLabel('Headings')).toHaveValue('Ubuntu');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.role-editor code').first()).toHaveText('#1f4e79');
});

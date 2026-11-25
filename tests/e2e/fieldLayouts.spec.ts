import { expect, test } from '@playwright/test';

// Layouts written for a research field: clinical case report, lab study, computing/ML and humanities.

test('the New poster dialog keeps research-field layouts in a collapsed section that opens to previews', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  const group = page.getByRole('group', { name: 'By research field' });
  // Collapsed at first, so the gallery stays short.
  await expect(page.locator('[data-template="classic"]')).toBeVisible();
  await expect(group).toHaveCount(0);
  await expect(page.locator('details.field-layouts')).not.toHaveAttribute('open');
  await page.getByText('By research field').click();
  await expect(group).toBeVisible();
  for (const [id, label] of [
    ['clinical', 'Clinical case report'],
    ['lab', 'Lab study, methods first'],
    ['computing', 'Computing and ML results'],
    ['humanities', 'Humanities argument'],
  ]) {
    const card = group.locator(`[data-template="${id}"]`);
    await expect(card).toContainText(label);
    await expect(card.locator('svg rect').first()).toBeAttached();
  }
});

for (const [id, heading, body] of [
  ['clinical', 'Learning Points', 'Age, sex and presenting complaint'],
  ['lab', 'Methods', 'Number the steps'],
  ['computing', 'Results', 'Bold the best score'],
  ['humanities', 'Argument', 'Your claim, stated plainly'],
] as const) {
  test(`creates a ${id} poster with the field’s sections and example text`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '+ New poster' }).first().click();
    await page.getByText('By research field').click();
    await page.locator(`[data-template="${id}"]`).click();
    await page.getByRole('button', { name: 'Create poster' }).click();
    await expect(page.locator('.poster .el', { hasText: heading }).first()).toBeVisible();
    await expect(page.locator('.poster .el', { hasText: body }).first()).toBeVisible();
  });
}

test('Switch layout moves written text from a clinical poster into another field layout', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByText('By research field').click();
  await page.locator('[data-template="clinical"]').click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  const summary = page.locator('.poster .el-text .el-body', { hasText: 'Age, sex and presenting complaint' });
  await summary.dblclick();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('A 54-year-old with a rare rash.');
  await page.keyboard.press('Escape');
  await expect(page.locator('.poster .el-text .el-body', { hasText: 'A 54-year-old with a rare rash.' })).toHaveCount(1);
  await page.locator('.stage').click({ position: { x: 5, y: 5 } }); // nothing selected: Properties shows the poster settings
  await page.getByRole('tab', { name: 'Layout' }).click();
  await page.getByText('Switch layout…').click();
  const select = page.getByRole('combobox', { name: 'Layout' });
  await expect(select.locator('optgroup[label="By research field"] option')).toHaveCount(4);
  await select.selectOption('lab');
  await page.getByRole('button', { name: /^Apply to/ }).click();
  await expect(page.locator('.toast')).toContainText('Moved your 1 section');
  // The lab layout is in place, and the case summary landed in its first free section.
  await expect(page.locator('.poster .el', { hasText: 'The gap in what is known' }).first()).toBeVisible();
  await expect(page.locator('.poster .el-text .el-body', { hasText: 'A 54-year-old with a rare rash.' })).toHaveCount(1);
});

test('the research-field section stays open after picking one of its layouts and can be closed again', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  const summary = page.getByText('By research field');
  await summary.click();
  await page.locator('[data-template="lab"]').click();
  await expect(page.locator('[data-template="lab"]')).toHaveAttribute('aria-pressed', 'true');
  await summary.click();
  await expect(page.locator('[data-template="lab"]')).toHaveCount(0);
});

import { test, expect, type Page } from '@playwright/test';

async function newPoster(page: Page, template = 'Blank') {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: new RegExp('^' + template) }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Authors and affiliations' });

test('builds a numbered author line and edits it later', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'Authors and affiliations…' }).click();
  const d = dialog(page);
  await expect(d).toBeVisible();
  await expect(d.getByLabel('Author 1 name', { exact: true })).toBeFocused();

  await d.getByLabel('Institution 1', { exact: true }).fill('Dept of Biology, University A');
  await d.getByRole('button', { name: '+ Add institution' }).click();
  await d.getByLabel('Institution 2', { exact: true }).fill('Institute B');
  await d.getByLabel('Author 1 name', { exact: true }).fill('Ana Silva');
  await d.getByLabel('Author 1 at institution 2', { exact: true }).check();
  await d.getByRole('button', { name: '+ Add author' }).click();
  await d.getByLabel('Author 2 name', { exact: true }).fill('Ben Okafor');
  await d.getByLabel('Author 2 at institution 2', { exact: true }).check();
  // a problem is reported until each author has an institution
  await d.getByRole('button', { name: '+ Add author' }).click();
  await d.getByLabel('Author 3 name', { exact: true }).fill('Chen Wei');
  await expect(d.getByRole('status')).toContainText('Chen Wei has no affiliation ticked.');
  await d.getByLabel('Author 3 at institution 1', { exact: true }).check();
  await expect(d.getByRole('status')).toHaveCount(0);
  await d.getByLabel('Contact email', { exact: true }).fill('ana@univ-a.edu');

  await expect(d.getByTestId('authors-preview')).toHaveText(
    'Ana Silva1,2,*, Ben Okafor2, Chen Wei11Dept of Biology, University A; 2Institute B*Contact: ana@univ-a.edu',
  );
  await d.getByRole('button', { name: 'Add to poster' }).click();
  await expect(d).toHaveCount(0);

  const box = page.locator('.poster > .el').first();
  await expect(box.locator('sup').first()).toHaveText('1,2,*');
  await expect(box.locator('u')).toHaveText('Ana Silva');
  await expect(box).toContainText('Dept of Biology, University A');

  // reopen from the properties panel, move Ben up and make him presenter
  await page.getByRole('button', { name: 'Edit authors and affiliations…' }).click();
  await expect(d.getByLabel('Author 1 name', { exact: true })).toHaveValue('Ana Silva');
  await d.getByRole('button', { name: 'Move author 2 up' }).click();
  await d.getByLabel('Author 1 is presenting', { exact: true }).check();
  await d.getByRole('button', { name: 'Update authors' }).click();
  await expect(box.locator('u')).toHaveText('Ben Okafor');
  // institutions renumber to follow the new author order
  await expect(box).toContainText('Ben Okafor1, Ana Silva1,2,*');
  await expect(page.locator('.poster > .el')).toHaveCount(1);

  // undo restores the previous line
  await page.keyboard.press('ControlOrMeta+z');
  await expect(box.locator('u')).toHaveText('Ana Silva');
});

test("fills a template's author line instead of adding a new box", async ({ page }) => {
  await newPoster(page, 'Classic');
  const count = await page.locator('.poster > .el').count();
  const placeholder = page.locator('.poster > .el', { hasText: 'Author One, Author Two' });
  await expect(placeholder).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Authors and affiliations…' }).click();
  await dialog(page).getByLabel('Institution 1', { exact: true }).fill('University A');
  await dialog(page).getByLabel('Author 1 name', { exact: true }).fill('Ana Silva');
  await dialog(page).getByRole('button', { name: 'Add to poster' }).click();
  await expect(page.locator('.poster > .el')).toHaveCount(count);
  await expect(placeholder).toHaveCount(0);
  await expect(page.locator('.poster > .el', { hasText: 'Ana Silva*' })).toHaveCount(1);
});

test('Escape closes the dialog without changes', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'Authors and affiliations…' }).click();
  await dialog(page).getByLabel('Author 1 name', { exact: true }).fill('Ana');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator('.poster > .el')).toHaveCount(0);
});

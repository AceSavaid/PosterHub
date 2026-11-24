import { test, expect, type Page } from '@playwright/test';

// these start like a first visit: Properties' extra settings folded (the tour is still skipped)
test.use({ storageState: { cookies: [], origins: [{ origin: 'http://localhost:4173', localStorage: [{ name: 'posterhub.tour', value: 'done' }] }] } });

const els = (page: Page) => page.locator('.poster .el');
const box = (page: Page, text: string) => els(page).filter({ hasText: new RegExp('^' + text) }).first();
const top = (page: Page, text: string) => box(page, text).evaluate((n) => parseFloat((n as HTMLElement).style.top));

async function newPoster(page: Page, title = '', authors = '') {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  if (title) await page.getByLabel('Poster title').fill(title);
  if (authors) await page.getByLabel(/Authors/).fill(authors);
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

test('the title and authors typed first go on the poster and name it', async ({ page }) => {
  await newPoster(page, 'Sleep spindles and memory', 'A. Lee, B. Chen — Psychology');
  await expect(page.locator('.poster .el-title')).toHaveText('Sleep spindles and memory');
  await expect(page.locator('.poster')).toContainText('A. Lee, B. Chen — Psychology');
  await expect(page.locator('.topbar')).toContainText('Sleep spindles and memory');
});

test('editing the title names a poster that had none', async ({ page }) => {
  await newPoster(page);
  await page.locator('.poster .el-title').dblclick();
  await page.keyboard.insertText('Coral reef survey');
  await page.keyboard.press('Escape');
  await expect(page.locator('.topbar')).toContainText('Coral reef survey');
});

test('the New poster dialog is short and remembers the last size and look', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  const np = page.getByRole('dialog', { name: 'New poster' });
  // colours, columns and fonts wait under More options
  await expect(np.getByLabel('Heading font')).toBeHidden();
  await np.getByRole('button', { name: 'Landscape' }).click();
  await np.getByText('More options').click();
  await np.getByRole('button', { name: 'Forest' }).click();
  await np.getByLabel('Columns').selectOption('4');
  await np.getByRole('button', { name: /^Boxed sections/ }).click();
  await np.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
  await page.getByRole('button', { name: /My posters/ }).first().click();
  await expect(page.getByRole('heading', { name: 'My posters' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My posters' })).toBeVisible();
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await expect(np.getByRole('button', { name: 'Landscape' })).toHaveAttribute('aria-pressed', 'true');
  await expect(np.locator('[data-template="boxed"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(np.getByText('More options')).toContainText('Forest, 4 columns');
});

test('a growing paragraph moves the rest of its column down, and undo puts it back', async ({ page }) => {
  await newPoster(page);
  const before = await top(page, 'Methods');
  const results = await top(page, 'Results');
  await page.getByText('Replace this text with your own.').first().dblclick();
  await page.keyboard.insertText('Sleep spindles during non-REM sleep are thought to support memory consolidation. '.repeat(30));
  await expect.poll(() => top(page, 'Methods')).toBeGreaterThan(before + 20);
  expect(await top(page, 'Results')).toBe(results); // the next column stays put
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => top(page, 'Methods')).toBe(before);
});

test('Next jumps to the next box with example text, ready to type over', async ({ page }) => {
  await newPoster(page, 'Sleep spindles and memory');
  const next = page.locator('.fill-next');
  await expect(next).toContainText(/1 of \d+ filled/);
  await next.click();
  // the author line is next after the title: typing replaces the example text
  await expect(page.locator('.el.editing')).toHaveCount(1);
  await page.keyboard.insertText('A. Lee');
  await page.keyboard.press('Escape');
  await expect(next).toContainText(/2 of \d+ filled/);
  await next.click();
  await expect(page.locator('.el.editing')).toContainText('Replace this text');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // the Check panel shows the same to-do as one item
  await page.locator('.check-btn').click();
  await expect(page.getByText(/\d+ boxes still have example text or no picture/)).toBeVisible();
  await page.getByRole('button', { name: 'Go to an empty box', exact: true }).click();
  await expect(page.locator('.el.editing')).toHaveCount(1);
});

test('a formatting bar floats above the text being typed', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'Text box', exact: true }).click();
  await page.keyboard.type('plain then special');
  const bar = page.getByRole('toolbar', { name: 'Text formatting' });
  await expect(bar).toBeVisible();
  const editing = (await page.locator('.el.editing').boundingBox())!;
  const b = (await bar.boundingBox())!;
  expect(b.y + b.height).toBeLessThanOrEqual(editing.y + 1);
  await page.keyboard.press('Shift+ControlOrMeta+ArrowLeft');
  await bar.getByRole('button', { name: 'Bold' }).click();
  await page.keyboard.press('Escape');
  await expect(bar).toHaveCount(0);
  await expect(page.locator('.poster .el-body').last()).toContainText('special');
  expect(await page.locator('.poster .el-body').last().innerHTML()).toMatch(/<b>special<\/b>/);
});

test('Properties starts with the common settings; the rest folds away and stays open once opened', async ({ page }) => {
  await newPoster(page);
  await page.getByText('Introduction').first().click();
  const more = page.getByText('Background, border, position and size');
  await expect(more).toBeVisible();
  await expect(page.getByLabel('Inner padding (mm)')).toHaveCount(0);
  await more.click();
  await expect(page.getByLabel('Inner padding (mm)')).toBeVisible();
  await page.getByText('Methods').first().click();
  await expect(page.getByLabel('Inner padding (mm)')).toBeVisible();
});

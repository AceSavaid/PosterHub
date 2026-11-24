import { test, expect, type Page } from '@playwright/test';

async function newPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

/** A plain PNG of the given size, as a file for the file chooser. */
async function png(page: Page, w: number, h: number, name: string) {
  const data = await page.evaluate(([w, h]) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2a9d8f';
    g.fillRect(0, 0, w, h);
    return c.toDataURL('image/png').split(',')[1];
  }, [w, h]);
  return { name, mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
}

const img = (page: Page) => page.locator('.poster .el-image').first();
const size = async (page: Page) => {
  const b = (await img(page).boundingBox())!;
  return { w: b.width, h: b.height, ratio: b.width / b.height };
};
const fitSelect = (page: Page) => page.locator('label', { hasText: /^Fit/ }).locator('select');

/** Adds a 2:1 picture, then picks "Replace image…" with a square one. */
async function replaceWithSquare(page: Page) {
  let chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Image…' }).click();
  await (await chooser).setFiles(await png(page, 400, 200, 'wide.png'));
  await expect(page.locator('.poster .el-image img')).toBeVisible();
  await img(page).click();
  const before = await size(page);
  expect(before.ratio).toBeCloseTo(2, 1);
  chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Replace image…' }).click();
  await (await chooser).setFiles(await png(page, 300, 300, 'square.png'));
  return before;
}

test('replacing a picture with another shape asks how it should fit: same space', async ({ page }) => {
  await newPoster(page);
  const before = await replaceWithSquare(page);
  const dialog = page.getByRole('dialog', { name: 'How should the new image fit?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.replace-option')).toHaveCount(3);
  await dialog.getByRole('button', { name: /Fit in the same space/ }).click();
  await expect(dialog).toHaveCount(0);
  const after = await size(page);
  expect(after.w).toBeCloseTo(before.w, 0);
  expect(after.h).toBeCloseTo(before.h, 0);
  await expect(fitSelect(page)).toHaveValue('contain');
  // One undo step brings the old picture back
  const src = await page.locator('.poster .el-image img').getAttribute('src');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.poster .el-image img')).not.toHaveAttribute('src', src!);
});

test('“Fill the same space” keeps the size and crops to fill', async ({ page }) => {
  await newPoster(page);
  const before = await replaceWithSquare(page);
  await page.getByRole('button', { name: /Fill the same space/ }).click();
  const after = await size(page);
  expect(after.h).toBeCloseTo(before.h, 0);
  await expect(fitSelect(page)).toHaveValue('cover');
});

test('“Use the new picture’s shape” resizes the box to the new picture', async ({ page }) => {
  await newPoster(page);
  const before = await replaceWithSquare(page);
  await page.getByRole('button', { name: /Use the new picture’s shape/ }).click();
  const after = await size(page);
  expect(after.w).toBeCloseTo(before.w, 0);
  expect(after.ratio).toBeCloseTo(1, 1);
});

test('Cancel (or Esc) keeps the old picture', async ({ page }) => {
  await newPoster(page);
  await replaceWithSquare(page);
  const oldSrc = (await page.locator('.poster .el-image img').getAttribute('src'))!;
  const dialog = page.getByRole('dialog', { name: 'How should the new image fit?' });
  // the picture is read before the question opens; Esc pressed earlier goes nowhere
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect((await size(page)).ratio).toBeCloseTo(2, 1);
  await expect(page.locator('.poster .el-image img')).toHaveAttribute('src', oldSrc);
});

test('a picture of the same shape is swapped without asking', async ({ page }) => {
  await newPoster(page);
  let chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Image…' }).click();
  await (await chooser).setFiles(await png(page, 400, 200, 'wide.png'));
  await img(page).click();
  const before = await size(page);
  const oldSrc = (await page.locator('.poster .el-image img').getAttribute('src'))!;
  chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Replace image…' }).click();
  await (await chooser).setFiles(await png(page, 800, 400, 'wide2.png'));
  await expect(page.locator('.poster .el-image img')).not.toHaveAttribute('src', oldSrc);
  await expect(page.getByRole('dialog', { name: 'How should the new image fit?' })).toHaveCount(0);
  expect((await size(page)).h).toBeCloseTo(before.h, 0);
});

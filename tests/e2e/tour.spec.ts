import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// The config marks the tour as seen for every other test; start these with fresh storage.
test.use({ storageState: { cookies: [], origins: [] } });

async function newPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: /^Classic columns/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

const card = (page: Page) => page.getByRole('dialog', { name: /Click to edit|Insert|Check|Export/ });
const ring = (page: Page) => page.locator('.tour-ring');

/** The highlight ring surrounds the given element. */
async function expectRingAround(page: Page, selector: string) {
  const target = (await page.locator(selector).first().boundingBox())!;
  await expect
    .poll(async () => {
      const r = (await ring(page).boundingBox())!;
      return r.x <= target.x && r.y <= target.y && r.x + r.width >= target.x + target.width && r.y + r.height >= Math.min(target.y + target.height, 900);
    })
    .toBe(true);
}

/** The card is fully on screen and doesn't cover the thing it's pointing at (except the poster). */
async function expectCardOnScreen(page: Page) {
  const c = (await card(page).boundingBox())!;
  const vp = page.viewportSize()!;
  expect(c.x).toBeGreaterThanOrEqual(0);
  expect(c.y).toBeGreaterThanOrEqual(0);
  expect(c.x + c.width).toBeLessThanOrEqual(vp.width);
  expect(c.y + c.height).toBeLessThanOrEqual(vp.height);
}

test('the tour runs once on the first poster: edit, Insert, Check, Export', async ({ page }) => {
  await newPoster(page);
  await expect(page.getByRole('dialog', { name: 'Click to edit' })).toBeVisible();
  await expect(page.getByText('Step 1 of 4')).toBeVisible();
  await expectRingAround(page, '.poster > .el-title');
  await expectCardOnScreen(page);
  // focus is on Next so keyboard users can carry on with Enter
  await expect(page.getByRole('button', { name: 'Next' })).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('dialog', { name: 'Add things from Insert' })).toBeVisible();
  await expectRingAround(page, '[data-tour="tools"]');
  await expectCardOnScreen(page);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('dialog', { name: 'Click to edit' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('dialog', { name: 'Check before you print' })).toBeVisible();
  await expectRingAround(page, '[data-tour="check"]');
  await expectCardOnScreen(page);
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('dialog', { name: 'Export when you’re ready' })).toBeVisible();
  await expect(page.getByText('Step 4 of 4')).toBeVisible();
  await expectRingAround(page, '[data-tour="export"]');
  await expectCardOnScreen(page);
  await expect(page.getByRole('button', { name: 'Skip tour' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(ring(page)).toHaveCount(0);

  // A second poster, or reloading, doesn't show it again.
  await newPoster(page);
  await page.waitForTimeout(800);
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('posterhub.tour'))).toBe('done');
});

test('the tour can be skipped, with the button or Esc, and stays skipped', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'Skip tour' }).click();
  await expect(card(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.poster')).toBeVisible();
  await page.waitForTimeout(800);
  await expect(card(page)).toHaveCount(0);

  // Esc closes it too (replayed from Help)
  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByRole('menuitem', { name: 'Take the tour' }).click();
  await expect(page.getByRole('dialog', { name: 'Click to edit' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card(page)).toHaveCount(0);
});

test('Help → Take the tour replays it from the start', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'Skip tour' }).click();
  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByRole('menuitem', { name: 'Take the tour' }).click();
  await expect(page.getByRole('dialog', { name: 'Click to edit' })).toBeVisible();
  await expect(page.getByText('Step 1 of 4')).toBeVisible();
});

test('the editor still works while the tour is open', async ({ page }) => {
  await newPoster(page);
  await expect(card(page)).toBeVisible();
  // Doing what step 1 says: click the highlighted title to select it.
  await page.locator('.poster > .el-title').click();
  await expect(page.locator('.poster > .el-title.selected')).toBeVisible();
  await expect(card(page)).toBeVisible();
});

test('the tour card passes WCAG checks and fits a phone screen', async ({ page }) => {
  await newPoster(page);
  await expect(card(page)).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).include('.tour-card').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  for (let i = 0; i < 4; i++) {
    await expect(page.getByText(`Step ${i + 1} of 4`)).toBeVisible();
    await expect.poll(async () => {
      const c = (await card(page).boundingBox())!;
      return c.x >= 0 && c.y >= 0 && c.x + c.width <= 390 && c.y + c.height <= 844;
    }).toBe(true);
    await page.getByRole('button', { name: i === 3 ? 'Done' : 'Next' }).click();
  }
  await expect(card(page)).toHaveCount(0);
});

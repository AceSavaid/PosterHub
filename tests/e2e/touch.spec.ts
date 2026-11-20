import { test, expect, devices, type Page } from '@playwright/test';

const { defaultBrowserType: _ignored, ...ipad } = devices['iPad (gen 7)'];
test.use({ ...ipad });

async function newPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().tap();
  await page.getByRole('button', { name: /^Classic columns/ }).tap();
  await page.getByRole('button', { name: 'Create poster' }).tap();
  await expect(page.locator('.poster')).toBeVisible();
}

test('tablet: double-tap edits text, a finger drags and resizes, handles are finger-sized', async ({ page, context }) => {
  await newPoster(page);
  const el = page.locator('.poster .el-text').nth(2);

  // double-tap to type with a hardware keyboard
  const a = (await el.boundingBox())!;
  await page.touchscreen.tap(a.x + 20, a.y + 15);
  await page.waitForTimeout(80);
  await page.touchscreen.tap(a.x + 20, a.y + 15);
  await expect(el).toHaveClass(/editing/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  const cdp = await context.newCDPSession(page);
  const touchDrag = async (x: number, y: number, dx: number, dy: number) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let i = 1; i <= 10; i++) {
      await page.waitForTimeout(16);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10, id: 1 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };

  // move: the browser must not take the gesture over for scrolling
  const b = (await el.boundingBox())!;
  await touchDrag(b.x + b.width / 2, b.y + b.height / 2, 40, 30);
  await expect.poll(async () => Math.round((await el.boundingBox())!.x - b.x)).toBeGreaterThan(30);

  // resize from the corner handle, which is bigger on a touch screen
  const handle = page.locator('.sel-box .handle.h-se');
  const h = (await handle.boundingBox())!;
  expect(h.width).toBeGreaterThanOrEqual(16);
  const before = (await el.boundingBox())!;
  await touchDrag(h.x + h.width / 2, h.y + h.height / 2, 30, 20);
  await expect.poll(async () => Math.round((await el.boundingBox())!.width - before.width)).toBeGreaterThan(20);
});

test('tablet portrait: the poster gets the full width above the panels', async ({ page }) => {
  await newPoster(page);
  const stage = (await page.locator('.stage').boundingBox())!;
  const tools = (await page.getByRole('complementary', { name: 'Tools' }).boundingBox())!;
  expect(stage.width).toBeGreaterThan(780);
  expect(tools.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});

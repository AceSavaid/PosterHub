import { test, expect, devices, type Page, type CDPSession } from '@playwright/test';

// Preview on a phone: show the poster at a conference or check it on the go.
const { defaultBrowserType: _ignored, ...phone } = devices['Pixel 7'];

async function newPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().tap();
  await page.getByRole('button', { name: /^Classic columns/ }).tap();
  await page.getByRole('button', { name: 'Create poster' }).tap();
  await expect(page.locator('.poster')).toBeVisible();
}

async function openPreview(page: Page) {
  const button = page.getByRole('button', { name: 'Preview', exact: true });
  if (await button.isVisible()) {
    await button.tap();
  } else {
    // a phone top bar tucks Preview into the "More" menu
    await page.getByRole('button', { name: /^More/ }).first().tap();
    await page.getByRole('menuitem', { name: 'Preview', exact: true }).tap();
  }
  await expect(page.locator('.view-mode')).toBeVisible();
}

const posterBox = async (page: Page) => (await page.locator('.view-mode .poster').boundingBox())!;

/** fingers: one array of points per step; every step moves all fingers at once */
async function touch(cdp: CDPSession, page: Page, from: [number, number][], to: [number, number][], steps = 10) {
  const at = (t: number) => from.map(([x, y], i) => ({ x: x + (to[i][0] - x) * t, y: y + (to[i][1] - y) * t, id: i + 1 }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let i = 1; i <= steps; i++) {
    await page.waitForTimeout(16);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i / steps) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.describe('phone', () => {
  test.use({ ...phone });

  test('Preview shows the whole poster with no editing tools and fits the phone', async ({ page }) => {
    await newPoster(page);
    await openPreview(page);
    await expect(page.locator('.view-mode .sel-box, .view-mode .handle, .view-mode .grid-col, .view-mode [contenteditable="true"]')).toHaveCount(0);
    await expect(page.locator('.view-mode .el-title')).toContainText('Your Poster Title');
    // nothing tucked off the side of the phone
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    const stage = (await page.locator('.view-stage').boundingBox())!;
    const p = await posterBox(page);
    expect(p.x).toBeGreaterThanOrEqual(stage.x);
    expect(p.x + p.width).toBeLessThanOrEqual(stage.x + stage.width + 0.5);
    expect(p.y + p.height).toBeLessThanOrEqual(stage.y + stage.height + 0.5);
    // finger-sized buttons, and the hint speaks touch
    const back = (await page.getByRole('button', { name: 'Back to editing' }).boundingBox())!;
    expect(back.height).toBeGreaterThanOrEqual(40);
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
    // the browser must leave pinches to the poster rather than zooming the page
    expect(await page.locator('.view-stage').evaluate((n) => getComputedStyle(n).touchAction)).toBe('none');
    // tapping the poster does not start editing anything
    await page.touchscreen.tap(p.x + p.width / 2, p.y + p.height / 3);
    await expect(page.locator('.view-mode .editing')).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to editing' }).tap();
    await expect(page.locator('.view-mode')).toHaveCount(0);
    await expect(page.locator('.poster')).toBeVisible();
  });

  test('pinch zooms around the fingers, one finger pans, double-tap zooms in and back out', async ({ page, context }) => {
    await newPoster(page);
    await openPreview(page);
    const cdp = await context.newCDPSession(page);
    const fit = await posterBox(page);
    const cx = fit.x + fit.width / 2;
    const cy = fit.y + fit.height / 2;

    // spread two fingers from 60 px to 240 px apart: about 4× bigger
    await touch(cdp, page, [[cx - 30, cy], [cx + 30, cy]], [[cx - 120, cy], [cx + 120, cy]]);
    await expect.poll(async () => (await posterBox(page)).width / fit.width).toBeGreaterThan(3.5);
    const zoomed = await posterBox(page);
    // the spot between the fingers stays put
    const fx = (cx - fit.x) / fit.width;
    expect(zoomed.x + fx * zoomed.width).toBeCloseTo(cx, -1);
    await expect(page.getByRole('button', { name: 'Fit' })).toBeEnabled();

    // drag with one finger: the poster follows
    await touch(cdp, page, [[cx, cy]], [[cx - 80, cy - 100]]);
    await expect.poll(async () => Math.round((await posterBox(page)).x - zoomed.x)).toBeLessThan(-60);
    const moved = await posterBox(page);
    expect(moved.y - zoomed.y).toBeLessThan(-80);
    expect(moved.width).toBeCloseTo(zoomed.width, 0);

    // pinch in: never smaller than fitting the screen
    await touch(cdp, page, [[cx - 150, cy], [cx + 150, cy]], [[cx - 5, cy], [cx + 5, cy]]);
    await expect.poll(async () => Math.round((await posterBox(page)).width)).toBe(Math.round(fit.width));

    // double-tap zooms in on the tapped spot, a second double-tap goes back to fit
    const doubleTap = async (x: number, y: number) => {
      await page.touchscreen.tap(x, y);
      await page.waitForTimeout(60);
      await page.touchscreen.tap(x, y);
    };
    const tx = fit.x + fit.width * 0.25;
    const ty = fit.y + fit.height * 0.3;
    await doubleTap(tx, ty);
    await expect.poll(async () => (await posterBox(page)).width / fit.width).toBeCloseTo(3, 1);
    const tapped = await posterBox(page);
    expect(tapped.x + 0.25 * tapped.width).toBeCloseTo(tx, -1);
    await doubleTap(cx, cy);
    await expect.poll(async () => Math.round((await posterBox(page)).width)).toBe(Math.round(fit.width));

    // two slow single taps are not a double-tap
    await page.touchscreen.tap(cx, cy);
    await page.waitForTimeout(500);
    await page.touchscreen.tap(cx, cy);
    await page.waitForTimeout(100);
    expect(Math.round((await posterBox(page)).width)).toBe(Math.round(fit.width));
  });

  test('turning the phone sideways keeps the poster on screen', async ({ page, context }) => {
    await newPoster(page);
    await openPreview(page);
    const cdp = await context.newCDPSession(page);
    const fit = await posterBox(page);
    await touch(cdp, page, [[fit.x + fit.width / 2 - 30, fit.y + 200], [fit.x + fit.width / 2 + 30, fit.y + 200]], [[fit.x + fit.width / 2 - 90, fit.y + 200], [fit.x + fit.width / 2 + 90, fit.y + 200]]);
    await expect.poll(async () => (await posterBox(page)).width / fit.width).toBeGreaterThan(2.5);
    await page.setViewportSize({ width: 915, height: 412 });
    const stage = (await page.locator('.view-stage').boundingBox())!;
    await expect.poll(async () => {
      const p = await posterBox(page);
      // poster still covers the middle of the screen
      return p.x < stage.x + stage.width / 2 && p.x + p.width > stage.x + stage.width / 2 && p.y < stage.y + stage.height / 2 && p.y + p.height > stage.y + stage.height / 2;
    }).toBe(true);
    await page.getByRole('button', { name: 'Fit' }).tap();
    const p = await posterBox(page);
    expect(p.y).toBeGreaterThanOrEqual(stage.y);
    expect(p.y + p.height).toBeLessThanOrEqual(stage.y + stage.height + 0.5);
  });
});

test('desktop: click zooms in on that spot, drag pans, Ctrl + scroll and the buttons zoom, keys work too', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: /^Classic columns/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const fit = await posterBox(page);
  await expect(page.getByRole('button', { name: 'Zoom out' })).toBeDisabled();

  await page.mouse.click(fit.x + fit.width * 0.5, fit.y + fit.height * 0.2);
  await expect.poll(async () => (await posterBox(page)).width / fit.width).toBeCloseTo(3, 1);

  const a = await posterBox(page);
  await page.mouse.move(700, 500);
  await page.mouse.down();
  await page.mouse.move(600, 400, { steps: 5 });
  await page.mouse.up();
  const b = await posterBox(page);
  expect(b.x - a.x).toBeCloseTo(-100, -1);
  expect(b.y - a.y).toBeCloseTo(-100, -1);
  // a drag is not a click: still zoomed in
  expect(b.width).toBeCloseTo(a.width, 0);

  await page.getByRole('button', { name: 'Fit' }).click();
  await expect.poll(async () => Math.round((await posterBox(page)).width)).toBe(Math.round(fit.width));

  await page.mouse.move(700, 450);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await posterBox(page)).width / fit.width).toBeGreaterThan(1.5);

  await page.getByRole('button', { name: 'Zoom in' }).click();
  const c = await posterBox(page);
  await page.getByRole('button', { name: 'Zoom out' }).click();
  expect((await posterBox(page)).width).toBeLessThan(c.width);

  await page.getByRole('region', { name: 'Poster preview' }).focus();
  await page.keyboard.press('0');
  await expect.poll(async () => Math.round((await posterBox(page)).width)).toBe(Math.round(fit.width));
  await page.keyboard.press('+');
  expect((await posterBox(page)).width).toBeGreaterThan(fit.width * 1.2);
});

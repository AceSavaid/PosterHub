import { test, expect, type Page } from '@playwright/test';

async function newPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

async function pasteTable(page: Page, text: string, alsoPlot: string[] = []) {
  await page.evaluate((t) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, text);
  // pasted cells become a table; the toast offers a graph instead
  await page.getByRole('button', { name: 'Make a graph instead' }).click();
  for (const c of alsoPlot) await page.getByRole('checkbox', { name: c, exact: true }).check();
  await page.getByRole('button', { name: 'Add graph to poster' }).click();
  await expect(page.locator('.poster .el-chart canvas')).toBeVisible();
}

async function centrePixel(page: Page, loc: ReturnType<Page['locator']>): Promise<number[]> {
  const b = (await loc.boundingBox())!;
  const png = await page.screenshot({ clip: { x: b.x + b.width / 2 - 2, y: b.y + b.height / 2 - 2, width: 4, height: 4 } });
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return [...ctx.getImageData(1, 1, 1, 1).data].slice(0, 3);
  }, 'data:image/png;base64,' + png.toString('base64'));
}

const stageFilter = (page: Page) => page.locator('.stage-inner').evaluate((n) => getComputedStyle(n).filter);

test('previews the poster as colour-blind readers and greyscale print see it', async ({ page }) => {
  await newPoster(page);
  expect(await stageFilter(page)).toBe('none');

  await page.getByRole('button', { name: 'Colour vision' }).click();
  const menu = page.getByRole('dialog', { name: 'Colour vision' });
  await expect(menu.getByRole('radio')).toHaveCount(5);
  await expect(menu.getByRole('radio', { name: /Normal vision/ })).toHaveAttribute('aria-checked', 'true');
  await menu.getByRole('radio', { name: /Deuteranopia/ }).click();
  await expect(menu).toBeHidden();

  await expect(page.getByRole('status').filter({ hasText: 'Previewing deuteranopia' })).toBeVisible();
  expect(await stageFilter(page)).toContain('#vision-deuteranopia');
  await expect(page.locator('filter#vision-deuteranopia feColorMatrix')).toHaveCount(1);

  // the filter really changes what is drawn: a red box looks olive under deuteranopia
  await page.getByRole('tab', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Sunset' }).first().click(); // primary #c0392b
  await page.getByRole('tab', { name: 'Insert', exact: true }).click();
  await page.getByRole('button', { name: 'Box / panel', exact: true }).click();
  await page.getByRole('button', { name: 'Primary (follows palette)' }).click();
  await page.locator('.stage').click({ position: { x: 5, y: 5 } }); // deselect so handles don't cover it
  const box = page.locator('.poster > .el').last();
  const simulated = await centrePixel(page, box);
  await page.getByRole('button', { name: 'Back to normal colours' }).click();
  const normal = await centrePixel(page, box);
  expect(normal[0]).toBeGreaterThan(normal[1] + 80); // clearly red
  expect(Math.abs(simulated[0] - simulated[1])).toBeLessThan(40); // red and green channels level out
  await page.getByRole('button', { name: 'Colour vision' }).click();
  await page.getByRole('radio', { name: /Deuteranopia/ }).click();

  // view mode keeps the same preview and can change it
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByLabel('See the poster as')).toHaveValue('deuteranopia');
  await page.getByLabel('See the poster as').selectOption('greyscale');
  expect(await page.locator('.view-stage').evaluate((n) => getComputedStyle(n).filter)).toContain('#vision-greyscale');
  await page.getByRole('button', { name: 'Back to editing' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Previewing greyscale' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to normal colours' }).click();
  await expect(page.locator('.vision-banner')).toHaveCount(0);
  expect(await stageFilter(page)).toBe('none');
});

test('poster check warns when graph colours look alike and offers a preview', async ({ page }) => {
  await newPoster(page);
  // Academic Blue: series 3 and 4 differ in hue but turn the same grey
  await pasteTable(page, 'Group\tA\tB\tC\tD\nx\t1\t2\t3\t4\ny\t2\t3\t4\t5', ['D']);
  await page.getByRole('button', { name: /^Check/ }).click();
  const panel = page.getByRole('dialog', { name: 'Poster check' });
  await expect(panel.getByText('Graph colours look alike in black and white')).toBeVisible();
  await expect(panel.getByText(/“C” and “D” turn the same grey/)).toBeVisible();
  await panel.getByRole('button', { name: 'Preview as greyscale' }).click();
  expect(await stageFilter(page)).toContain('#vision-greyscale');
});

test('a graph with red and green series is flagged for red-green colour blindness', async ({ page }) => {
  await newPoster(page);
  // Sunset palette: primary is red; the fourth series colour is olive green
  await page.getByRole('tab', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Sunset' }).first().click();
  await pasteTable(page, 'Group\tControl\tB\tC\tTreatment\nx\t1\t2\t3\t4\ny\t2\t3\t4\t5', ['Treatment']);
  await page.getByRole('button', { name: /^Check/ }).click();
  const panel = page.getByRole('dialog', { name: 'Poster check' });
  await expect(panel.getByText('Graph colours may be hard to tell apart')).toBeVisible();
  await expect(panel.getByText(/red-green colour blindness \(deuteranopia/)).toBeVisible();
  await panel.getByRole('button', { name: 'Preview as deuteranopia' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Previewing deuteranopia' })).toBeVisible();
});

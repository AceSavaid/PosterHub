import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import JSZip from 'jszip';
import { inspectPdf, localFontsource, pdfText } from '../helpers/pdf';

test.beforeEach(async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/npm/@fontsource/**', async (route) => {
    const body = localFontsource(route.request().url());
    if (!body) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: Buffer.from(body), headers: { 'access-control-allow-origin': '*', 'content-type': 'font/woff' } });
  });
});

async function newPoster(page: Page, name = 'Turns') {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByLabel('Poster title').fill(name);
  await page.getByLabel('Size').selectOption('A3');
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

async function download(page: Page, label: RegExp) {
  await page.getByRole('button', { name: 'Export ▾' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: label }).click();
  const d = await dl;
  const file = path.join(os.tmpdir(), `${Date.now()}-${d.suggestedFilename()}`);
  await d.saveAs(file);
  return fs.readFile(file);
}

/** A 400 × 200 picture: red left half, blue right half. */
async function addTwoColourImage(page: Page) {
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 200;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ff0000';
    g.fillRect(0, 0, 200, 200);
    g.fillStyle = '#0000ff';
    g.fillRect(200, 0, 200, 200);
    return c.toDataURL('image/png').split(',')[1];
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Image…' }).click();
  await (await chooser).setFiles({ name: 'halves.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.locator('.poster .el-image img')).toBeVisible();
}

const field = (page: Page, name: string) => page.locator('.row4 label', { hasText: new RegExp('^' + name + '$') }).locator('input');

test('rotates with the side panel buttons, the angle box and Straighten', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'Box / panel', exact: true }).click();
  const el = page.locator('.poster > .el').first();
  await page.getByRole('button', { name: 'Rotate 90° right' }).click();
  await expect(el).toHaveCSS('transform', /matrix\(0, 1, -1, 0/); // 90° clockwise
  await expect(page.getByLabel('Rotation (°)')).toHaveValue('90');
  await page.getByRole('button', { name: 'Rotate 90° left' }).click();
  await page.getByRole('button', { name: 'Rotate 90° left' }).click();
  await expect(page.getByLabel('Rotation (°)')).toHaveValue('-90');
  await page.getByLabel('Rotation (°)').fill('30');
  await expect(el).toHaveAttribute('style', /rotate\(30deg\)/);
  // the selection outline turns with the element
  await expect(page.locator('.sel-box')).toHaveAttribute('style', /rotate\(30deg\)/);
  await page.getByRole('button', { name: 'Straighten' }).click();
  await expect(el).not.toHaveAttribute('style', /rotate/);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(el).toHaveAttribute('style', /rotate\(30deg\)/);
});

test('rotates by dragging the handle, snapping to a right angle', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'Box / panel', exact: true }).click();
  const box = (await page.locator('.sel-box').boundingBox())!;
  const handle = (await page.locator('.rotate-handle').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  // swing round to the right of the centre (a quarter turn), slightly off so snapping is needed
  await page.mouse.move(cx + 60, cy - 30, { steps: 5 });
  await page.mouse.move(cx + 200, cy + 8, { steps: 5 });
  await expect(page.locator('.angle-tip')).toHaveText(/90°/);
  await page.mouse.up();
  await expect(page.getByLabel('Rotation (°)')).toHaveValue('90');
  await expect(page.locator('.angle-tip')).toHaveCount(0);
});

test('a resized rotated box keeps its opposite corner in place', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'Box / panel', exact: true }).click();
  await page.getByLabel('Rotation (°)').fill('45');
  const corner = async () => {
    // the north-west corner on screen, which must not move while dragging the south-east handle
    const r = await page.locator('.sel-box .h-nw').boundingBox();
    return { x: r!.x + r!.width / 2, y: r!.y + r!.height / 2 };
  };
  const before = await corner();
  const se = (await page.locator('.sel-box .h-se').boundingBox())!;
  const w0 = Number(await field(page, 'W').inputValue());
  await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
  await page.mouse.down();
  await page.mouse.move(se.x + 40, se.y + 40, { steps: 4 });
  await page.mouse.up();
  const after = await corner();
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  expect(Math.abs(after.y - before.y)).toBeLessThan(2);
  expect(Number(await field(page, 'W').inputValue())).toBeGreaterThan(w0);
});

test('rotated elements export to PowerPoint and PDF', async ({ page }) => {
  await newPoster(page, 'Rotated export');
  await page.getByRole('button', { name: 'Title', exact: true }).click();
  await field(page, 'Y').fill('200'); // keep the turned title on the page
  await page.getByRole('button', { name: 'Rotate 90° right' }).click();
  await page.getByRole('button', { name: 'Triangle', exact: true }).click();
  await page.getByLabel('Rotation (°)').fill('-30');

  const zip = await JSZip.loadAsync(await download(page, /^PowerPoint/));
  const slide = await zip.file('ppt/slides/slide1.xml')!.async('string');
  expect(slide).toContain('rot="5400000"'); // 90°
  expect(slide).toContain('rot="19800000"'); // −30° = 330°

  const pdf = await download(page, /^PDF/);
  const title = await page.locator('.poster .el-title .el-body').innerText();
  expect((await pdfText(pdf)).replace(/\s+/g, ' ')).toContain(title.replace(/\s+/g, ' ').trim());
  const info = await inspectPdf(pdf);
  expect(info.images).toHaveLength(0); // still all vectors
});

test('crops an image, resizes its box to match, exports the crop and can undo it', async ({ page }) => {
  await newPoster(page, 'Cropped');
  await addTwoColourImage(page);
  const w = Number(await field(page, 'W').inputValue());
  await page.getByRole('button', { name: 'Crop…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Crop image' });
  await expect(dialog).toContainText('Keeping 400 × 200 pixels');

  // drag the left edge to the middle: keep the blue right half
  const frame = (await dialog.getByTestId('crop-frame').boundingBox())!;
  const west = (await dialog.locator('[data-handle="w"]').boundingBox())!;
  await page.mouse.move(west.x + west.width / 2, west.y + west.height / 2);
  await page.mouse.down();
  await page.mouse.move(west.x + west.width / 2 + frame.width / 2, west.y + west.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(dialog).toContainText(/Keeping 20[01] × 200 pixels/);
  await expect(dialog.getByLabel(/Change the box's height/)).toBeChecked();
  await dialog.getByRole('button', { name: 'Apply crop' }).click();
  await expect(dialog).toHaveCount(0);

  // now a square picture in a square box, showing only blue
  await expect(page.locator('.poster .crop-box img')).toBeVisible();
  expect(Math.abs(Number(await field(page, 'H').inputValue()) - w)).toBeLessThan(1.5);
  const colour = await page.locator('.poster .el-image').evaluate(async (node) => {
    const img = node.querySelector('img')!;
    const box = node.querySelector<HTMLElement>('.crop-box')!.getBoundingClientRect();
    const r = img.getBoundingClientRect();
    // the visible region starts half way across the picture
    return Math.round(((box.left - r.left) / r.width) * 100);
  });
  expect(colour).toBeGreaterThanOrEqual(49);
  expect(colour).toBeLessThanOrEqual(51);

  // PowerPoint gets the cropped pixels only
  const zip = await JSZip.loadAsync(await download(page, /^PowerPoint/));
  const media = Object.keys(zip.files).filter((f) => f.startsWith('ppt/media/') && !zip.files[f].dir);
  const sizes = await Promise.all(
    media.map(async (f) => {
      const b = await zip.file(f)!.async('uint8array');
      const dv = new DataView(b.buffer, b.byteOffset);
      return [dv.getUint32(16), dv.getUint32(20)];
    }),
  );
  expect(sizes.some(([mw, mh]) => Math.abs(mw - 200) <= 1 && mh === 200)).toBe(true);

  // PDF keeps the whole original at full resolution, clipped to the crop
  const info = await inspectPdf(await download(page, /^PDF/));
  expect(info.images).toContainEqual({ width: 400, height: 200 });

  await page.locator('.poster > .el-image').click(); // exporting clears the selection
  await page.getByRole('button', { name: 'Undo crop' }).click();
  await expect(page.locator('.poster .crop-box')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo crop' })).toHaveCount(0);
});

test('crop shapes, cancel and the right-click menu', async ({ page }) => {
  await newPoster(page);
  await addTwoColourImage(page);
  await page.locator('.poster > .el').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Crop image…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Crop image' });
  await dialog.getByRole('button', { name: 'Square' }).click();
  await expect(dialog).toContainText('Keeping 200 × 200 pixels');
  await dialog.getByRole('button', { name: '16:9' }).click();
  await expect(dialog).toContainText(/Keeping 356 × 200 pixels|Keeping 355 × 200 pixels/);
  await dialog.getByRole('button', { name: 'Reset' }).click();
  await expect(dialog).toContainText('Keeping 400 × 200 pixels');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.poster .crop-box')).toHaveCount(0);
});

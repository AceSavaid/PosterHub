import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import JSZip from 'jszip';
import { PDFDocument, PDFName, PDFArray, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { inspectPdf, localFontsource } from '../helpers/pdf';

test.beforeEach(async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/npm/@fontsource/**', async (route) => {
    const body = localFontsource(route.request().url());
    if (!body) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: Buffer.from(body), headers: { 'access-control-allow-origin': '*', 'content-type': 'font/woff' } });
  });
});

async function blankPoster(page: Page, name = 'Maths poster') {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByLabel('Name').fill(name);
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
  return { name: d.suggestedFilename(), data: await fs.readFile(file) };
}

const dialog = (page: Page) => page.getByRole('dialog', { name: /equation/i });
const equation = (page: Page) => page.locator('.poster > .el-equation');

async function insertEquation(page: Page, latex: string) {
  await page.getByRole('button', { name: 'Equation (LaTeX)…' }).click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByLabel('LaTeX').fill(latex);
  await dialog(page).getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(dialog(page)).toBeHidden();
}

test('writes an equation with a live preview, symbol buttons and mistakes explained', async ({ page }) => {
  await blankPoster(page);
  await page.getByRole('button', { name: 'Equation (LaTeX)…' }).click();
  const d = dialog(page);
  const box = d.getByLabel('LaTeX');
  await expect(box).toBeFocused();
  await expect(d.getByTestId('equation-preview').locator('img')).toBeVisible(); // the starting example

  // A mistake is explained and cannot be inserted.
  await box.fill('\\frac{a');
  await expect(d.getByRole('alert')).toContainText(/brace/i);
  await expect(d.getByRole('button', { name: 'Insert', exact: true })).toBeDisabled();

  // The fraction button wraps what is selected.
  await box.fill('x + y');
  await box.selectText();
  await d.getByRole('button', { name: 'Insert Fraction' }).click();
  await expect(box).toHaveValue('\\frac{x + y}{}');
  await page.keyboard.type('2');
  await expect(box).toHaveValue('\\frac{x + y}{2}');
  await expect(d.getByRole('alert')).toHaveCount(0);
  await expect(d.getByTestId('equation-preview').locator('img')).toHaveAttribute('alt', '\\frac{x + y}{2}');

  // Ctrl+Enter inserts.
  await page.keyboard.press('Control+Enter');
  await expect(d).toBeHidden();
  await expect(equation(page)).toHaveCount(1);
  const img = equation(page).locator('img');
  await expect(img).toHaveAttribute('alt', '\\frac{x + y}{2}');
  expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  // The box was sized to fit the maths at its full size.
  await expect(equation(page).locator('.el-math')).toHaveAttribute('data-scale', '1.000');
});

test('edits an equation by double-click and from the side panel, and it survives a reload', async ({ page }) => {
  await blankPoster(page);
  await insertEquation(page, 'E = mc^2');
  const el = equation(page);
  const size = (await el.boundingBox())!;
  await el.dblclick({ position: { x: size.width * 0.3, y: size.height * 0.3 } }); // clear of the resize handles
  await expect(dialog(page).getByLabel('LaTeX')).toHaveValue('E = mc^2');
  await dialog(page).getByLabel('LaTeX').fill('$a^2 + b^2 = c^2$'); // pasted with $ signs
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expect(el.locator('img')).toHaveAttribute('alt', '$a^2 + b^2 = c^2$');

  // Side panel: change the size, alignment and colour.
  const panel = page.locator('.panel.right');
  await expect(panel.getByRole('heading', { name: 'Equation' }).first()).toBeVisible();
  const before = await el.locator('img').boundingBox();
  await panel.getByLabel('Size (pt)').fill('7');
  await expect.poll(async () => (await el.locator('img').boundingBox())!.width).toBeLessThan(before!.width);
  await panel.getByRole('button', { name: 'Align equation left' }).click();
  const imgBox = (await el.locator('img').boundingBox())!;
  const elBox = (await el.boundingBox())!;
  expect(Math.abs(imgBox.x - elBox.x)).toBeLessThan(2);

  // Typing a mistake in the side panel shows it on the poster too.
  await panel.getByLabel('LaTeX').fill('\\sqrt{x');
  await expect(panel.getByRole('alert')).toBeVisible();
  await expect(el.locator('.el-math-error')).toBeVisible();
  await panel.getByLabel('LaTeX').fill('\\sqrt{x}');
  await expect(el.locator('img')).toBeVisible();

  await page.getByRole('button', { name: /My posters/ }).click(); // saves
  await expect(page.getByRole('heading', { name: 'My posters' })).toBeVisible();
  await page.reload();
  await page.locator('.poster-card', { hasText: 'Maths poster' }).getByRole('button', { name: 'Open', exact: true }).click();
  await expect(equation(page).locator('img')).toHaveAttribute('alt', '\\sqrt{x}');
});

test('exports equations as vector paths in the PDF and as an SVG picture in PowerPoint', async ({ page }) => {
  await blankPoster(page, 'Equation export');
  await insertEquation(page, 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}');

  const pdf = await download(page, /^PDF/);
  const info = await inspectPdf(pdf.data);
  expect(info.images).toHaveLength(0); // maths is not a picture
  const doc = await PDFDocument.load(pdf.data);
  const contents = doc.getPage(0).node.get(PDFName.of('Contents'));
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  let ops = '';
  for (const ref of refs) {
    const stream = doc.context.lookup(ref as never) as PDFRawStream;
    ops += new TextDecoder().decode(decodePDFRawStream(stream).decode());
  }
  // Glyph outlines arrive as many filled bezier paths.
  expect((ops.match(/ c\n/g) ?? []).length).toBeGreaterThan(100);
  expect((ops.match(/\nf\n/g) ?? []).length).toBeGreaterThan(10);

  const pptx = await download(page, /^PowerPoint/);
  const zip = await JSZip.loadAsync(pptx.data);
  const media = Object.keys(zip.files).filter((f) => f.startsWith('ppt/media/'));
  expect(media.some((f) => f.endsWith('.svg'))).toBe(true);
  expect(media.some((f) => f.endsWith('.png'))).toBe(true); // fallback for older PowerPoint
  const slide = await zip.file('ppt/slides/slide1.xml')!.async('string');
  expect(slide).toContain('svgBlip');
  expect(slide).toContain('descr="x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}"');
  const svg = await zip.file(media.find((f) => f.endsWith('.svg'))!)!.async('string');
  expect(svg).toContain('<path');
});

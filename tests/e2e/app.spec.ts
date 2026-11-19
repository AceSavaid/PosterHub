import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';

const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures');

async function newPoster(page: Page, opts: { name?: string; landscape?: boolean; size?: string; columns?: number; template?: string } = {}) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  if (opts.name) await page.getByLabel('Name').fill(opts.name);
  if (opts.landscape) await page.getByRole('button', { name: 'Landscape' }).click();
  if (opts.size) await page.getByLabel('Size').selectOption(opts.size);
  if (opts.columns) await page.getByLabel('Columns').selectOption(String(opts.columns));
  if (opts.template) await page.getByRole('button', { name: new RegExp(opts.template) }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

const elements = (page: Page) => page.locator('.poster > .el');

async function paste(page: Page, data: Record<string, string>) {
  await page.evaluate((d) => {
    const dt = new DataTransfer();
    for (const [k, v] of Object.entries(d)) dt.setData(k, v);
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, data);
}

async function backToLibrary(page: Page) {
  await page.getByRole('button', { name: /My posters/ }).click();
  await expect(page.getByRole('heading', { name: 'My posters' })).toBeVisible();
}

test.describe('library', () => {
  test('creates a poster, lists it in My posters and keeps it after reload', async ({ page }) => {
    await newPoster(page, { name: 'Sleep study', landscape: true, size: 'A1', columns: 4 });
    await expect(page.getByLabel('Poster name')).toHaveValue('Sleep study');
    const box = await page.locator('.poster').evaluate((el: HTMLElement) => ({ w: el.offsetWidth, h: el.offsetHeight }));
    expect(box.w).toBeGreaterThan(box.h); // landscape
    await expect(page.locator('.grid-col')).toHaveCount(4);
    await backToLibrary(page);
    await expect(page.locator('.poster-card', { hasText: 'Sleep study' })).toBeVisible();
    await expect(page.locator('.poster-card', { hasText: 'Sleep study' }).locator('img')).toBeVisible(); // thumbnail
    await page.reload();
    const card = page.locator('.poster-card', { hasText: 'Sleep study' });
    await expect(card).toContainText('landscape');
    await card.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.getByLabel('Poster name')).toHaveValue('Sleep study');
  });

  test('supports custom sizes in inches', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '+ New poster' }).first().click();
    await page.getByLabel('Units').selectOption('in');
    await page.getByLabel('Width').fill('40');
    await page.getByLabel('Height').fill('30');
    await page.getByRole('button', { name: 'Create poster' }).click();
    await backToLibrary(page);
    await expect(page.locator('.poster-card').first()).toContainText('1016 × 762 mm · landscape');
  });

  test('duplicates and deletes posters', async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await newPoster(page, { name: 'Original' });
    await backToLibrary(page);
    await page.locator('.poster-card', { hasText: 'Original' }).getByRole('button', { name: 'Duplicate' }).click();
    await expect(page.locator('.poster-card', { hasText: 'Original (copy)' })).toBeVisible();
    await page.locator('.poster-card', { hasText: 'Original (copy)' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.poster-card', { hasText: 'Original (copy)' })).toHaveCount(0);
  });
});

test.describe('editing', () => {
  test('types into text, with undo and redo', async ({ page }) => {
    await newPoster(page);
    const title = page.locator('.poster .el-title .el-body');
    await title.dblclick();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Memory consolidation in sleep');
    await page.keyboard.press('Escape');
    await expect(title).toHaveText('Memory consolidation in sleep');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(title).toHaveText('Your Poster Title Goes Here');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(title).toHaveText('Memory consolidation in sleep');
  });

  test('pastes plain text inside a text box without foreign formatting', async ({ page }) => {
    await newPoster(page, { template: 'Blank' });
    await page.getByRole('button', { name: 'Text box' }).click();
    const box = page.locator('.poster .el-body').first();
    await expect(box).toBeFocused();
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'Pasted words');
      dt.setData('text/html', '<span style="font-size:80px;color:red">Pasted words</span>');
      document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect(box).toHaveText('Pasted words');
    expect(await box.innerHTML()).not.toContain('font-size');
  });

  test('pastes text and copies elements on the canvas', async ({ page }) => {
    await newPoster(page, { template: 'Blank' });
    await expect(elements(page)).toHaveCount(0);
    await paste(page, { 'text/plain': 'Abstract: a pasted paragraph' });
    await expect(elements(page)).toHaveCount(1);
    await expect(page.locator('.poster .el-body')).toHaveText('Abstract: a pasted paragraph');
    await page.keyboard.press('ControlOrMeta+d');
    await expect(elements(page)).toHaveCount(2);
    await page.keyboard.press('Delete');
    await expect(elements(page)).toHaveCount(1);
  });

  test('inserts every element type from the Insert panel', async ({ page }) => {
    await newPoster(page, { template: 'Blank' });
    for (const name of ['Title', 'Subtitle / authors', 'Section header', 'Text box', 'Box / panel', 'Circle', 'Line']) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.keyboard.press('Escape');
    }
    await expect(elements(page)).toHaveCount(7);
    await expect(page.locator('.poster .el-heading')).toHaveText('Section Heading');
  });

  test('adds an image from a file', async ({ page }) => {
    await newPoster(page, { template: 'Blank' });
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Image…' }).click();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR42mP8z8DwnwEIGGEAAB0EAf9q3OwAAAAASUVORK5CYII=', 'base64');
    await (await chooser).setFiles({ name: 'figure.png', mimeType: 'image/png', buffer: png });
    await expect(page.locator('.poster .el-image img')).toBeVisible();
  });

  test('moves elements by dragging and with the arrow keys', async ({ page }) => {
    await newPoster(page, { template: 'Blank' });
    await page.getByRole('button', { name: 'Box / panel' }).click();
    const xInput = page.getByLabel('X', { exact: true });
    const x0 = Number(await xInput.inputValue());
    await page.keyboard.press('Shift+ArrowRight');
    await expect(xInput).toHaveValue(String(x0 + 10));
    const el = elements(page).first();
    const b = (await el.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2 + 40, { steps: 5 });
    await page.mouse.up();
    expect(Number(await xInput.inputValue())).toBeGreaterThan(x0 + 10);
  });

  test('changes the colour palette and columns', async ({ page }) => {
    await newPoster(page);
    const band = elements(page).first();
    const before = await band.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.getByRole('button', { name: 'Design' }).click();
    await page.getByRole('button', { name: 'Crimson' }).click();
    await expect.poll(() => band.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(before);
    expect(await band.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(139, 30, 45)');
    await page.getByRole('button', { name: 'Layout' }).click();
    await page.locator('.seg button', { hasText: /^5$/ }).click();
    await expect(page.locator('.grid-col')).toHaveCount(5);
  });

  test('switches orientation and scales content', async ({ page }) => {
    await newPoster(page);
    await page.getByRole('button', { name: 'Layout' }).click();
    await page.getByRole('button', { name: 'Landscape' }).click();
    const box = await page.locator('.poster').evaluate((el: HTMLElement) => ({ w: el.offsetWidth, h: el.offsetHeight }));
    expect(box.w).toBeGreaterThan(box.h);
    // every element is still on the page
    const out = await page.locator('.poster').evaluate((p) =>
      Array.from(p.querySelectorAll(':scope > .el')).filter((e) => {
        const el = e as HTMLElement;
        return el.offsetLeft + el.offsetWidth > (p as HTMLElement).offsetWidth + 1 || el.offsetTop + el.offsetHeight > (p as HTMLElement).offsetHeight + 1;
      }).length,
    );
    expect(out).toBe(0);
  });
});

test.describe('fonts', () => {
  test('uploads a custom font and uses it', async ({ page }) => {
    await newPoster(page);
    await page.getByRole('button', { name: 'Design' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Upload your own font/ }).click();
    await (await chooser).setFiles(path.join(FIXTURES, 'Italiana-Regular.ttf'));
    await expect(page.locator('.font-list')).toContainText('Italiana');
    await page.getByLabel('Headings').selectOption('Italiana');
    await expect(page.locator('.poster .el-heading .el-body').first()).toHaveCSS('font-family', /Italiana/);
    expect(await page.evaluate(() => document.fonts.check('16px "Italiana"'))).toBe(true);
  });

  test('picks a Google font for a text box', async ({ page }) => {
    await newPoster(page);
    await page.locator('.poster .el-title').click();
    await page.getByLabel('Font').selectOption('Lora');
    await expect(page.locator('.poster .el-title .el-body')).toHaveCSS('font-family', /Lora/);
    await expect(page.locator('link[data-google-font="Lora"]')).toHaveCount(1);
  });
});

test.describe('graphs', () => {
  test('builds a graph from a CSV file', async ({ page }) => {
    await newPoster(page, { template: 'Blank' });
    await page.getByRole('button', { name: 'Graph from CSV…' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Choose a CSV file…' }).click();
    await (await chooser).setFiles(path.join(FIXTURES, 'results.csv'));
    await expect(page.locator('.table-wrap tbody tr')).toHaveCount(4);
    // numeric columns are picked automatically
    await expect(page.getByRole('checkbox', { name: 'Accuracy' })).toBeChecked();
    await page.getByRole('checkbox', { name: 'Speed' }).uncheck();
    await page.getByLabel('Graph type').selectOption('line');
    await page.getByLabel('From row').fill('2');
    await page.getByRole('button', { name: 'Add graph to poster' }).click();
    await expect(page.locator('.poster .el-chart canvas')).toBeVisible();
    // reopen and edit
    await page.getByRole('button', { name: 'Edit data and graph…' }).click();
    await expect(page.getByLabel('Graph type')).toHaveValue('line');
    await expect(page.getByLabel('From row')).toHaveValue('2');
  });

  test('fills a selected empty figure placeholder with the graph', async ({ page }) => {
    await newPoster(page, { template: 'Central figure' });
    const count = await elements(page).count();
    const ph = page.locator('.poster .el-image').first();
    await ph.click();
    const before = await ph.boundingBox();
    await paste(page, { 'text/plain': 'Group\tScore\nA\t1\nB\t3\nC\t2' });
    await page.getByRole('button', { name: 'Add graph to poster' }).click();
    await expect(elements(page)).toHaveCount(count);
    const chart = page.locator('.poster .el-chart');
    await expect(chart).toBeVisible();
    expect(await chart.boundingBox()).toEqual(before);
  });

  test('builds a graph from pasted spreadsheet data', async ({ page }) => {
    await newPoster(page, { template: 'Blank' });
    await paste(page, { 'text/plain': 'Group\tScore\nA\t1\nB\t3\nC\t2' });
    await expect(page.getByRole('heading', { name: 'Graph from CSV' })).toBeVisible();
    await page.getByRole('button', { name: 'Add graph to poster' }).click();
    await expect(page.locator('.poster .el-chart canvas')).toBeVisible();
  });
});

test.describe('export, import and sharing', () => {
  async function download(page: Page, label: RegExp) {
    await page.getByRole('button', { name: 'Export ▾' }).click();
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: label }).click();
    const d = await dl;
    const file = path.join(os.tmpdir(), `${Date.now()}-${d.suggestedFilename()}`);
    await d.saveAs(file);
    return { name: d.suggestedFilename(), data: await fs.readFile(file), file };
  }

  test('exports PDF, PNG, PowerPoint and a project file', async ({ page }) => {
    await newPoster(page, { name: 'Export test', size: 'A3' });
    // add a chart so the PowerPoint has one
    await paste(page, { 'text/plain': 'Group\tScore\nA\t1\nB\t3\nC\t2' });
    await page.getByRole('button', { name: 'Add graph to poster' }).click();

    const pdf = await download(page, /^PDF/);
    expect(pdf.name).toBe('Export-test.pdf');
    expect(pdf.data.subarray(0, 4).toString()).toBe('%PDF');

    const png = await download(page, /^PNG image/);
    expect(png.name).toBe('Export-test.png');
    expect(png.data.subarray(1, 4).toString()).toBe('PNG');

    const pptx = await download(page, /^PowerPoint/);
    expect(pptx.name).toBe('Export-test.pptx');
    const zip = await JSZip.loadAsync(pptx.data);
    const slide = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(slide).toContain('Your Poster Title Goes Here');
    expect(Object.keys(zip.files).some((f) => f.startsWith('ppt/charts/chart'))).toBe(true);
    const pres = await zip.file('ppt/presentation.xml')!.async('string');
    expect(pres).toMatch(/sldSz cx="10692\d{3}" cy="15120\d{3}"/); // A3 in EMU

    const proj = await download(page, /^Project file/);
    expect(proj.name).toBe('Export-test.poster.json');
    const json = JSON.parse(proj.data.toString());
    expect(json.name).toBe('Export test');
    expect(json.elements.some((e: { type: string }) => e.type === 'chart')).toBe(true);

    // re-import the project file as a new poster
    await backToLibrary(page);
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Open project file' }).click();
    await (await chooser).setFiles(proj.file);
    await expect(page.getByLabel('Poster name')).toHaveValue('Export test');
    await expect(page.locator('.poster .el-chart canvas')).toBeVisible();
  });

  test('imports a PowerPoint template', async ({ page }) => {
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: 'P', width: 36, height: 48 });
    pptx.layout = 'P';
    const s = pptx.addSlide();
    s.background = { color: 'FFFDF5' };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 36, h: 6, fill: { color: '5B2A86' } });
    s.addText('Lab template title', { x: 1, y: 1, w: 34, h: 4, fontSize: 100, color: 'FFFFFF', bold: true });
    const file = path.join(os.tmpdir(), `template-${Date.now()}.pptx`);
    await fs.writeFile(file, (await pptx.write({ outputType: 'nodebuffer' })) as Buffer);

    await page.goto('/');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import PowerPoint template' }).first().click();
    await (await chooser).setFiles(file);
    await expect(page.locator('.poster')).toBeVisible();
    await expect(page.locator('.poster .el-body', { hasText: 'Lab template title' })).toBeVisible();
    const box = await page.locator('.poster').evaluate((el: HTMLElement) => ({ w: el.offsetWidth, h: el.offsetHeight }));
    expect(box.w / box.h).toBeCloseTo(36 / 48, 2);
    await expect(elements(page).first()).toHaveCSS('background-color', 'rgb(91, 42, 134)');
  });

  test('copies the poster as an image', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await newPoster(page, { size: 'A4' });
    await page.getByRole('button', { name: 'Copy image' }).click();
    await expect(page.locator('.toast')).toContainText('copied');
    const types = await page.evaluate(async () => (await navigator.clipboard.read())[0].types);
    expect(types).toContain('image/png');
  });

  test('view mode shows the poster read-only', async ({ page }) => {
    await newPoster(page);
    await page.getByRole('button', { name: 'View' }).click();
    await expect(page.locator('.view-mode')).toBeVisible();
    await expect(page.locator('.view-mode .el-title')).toContainText('Your Poster Title');
    await expect(page.locator('.view-mode .sel-box, .view-mode .grid-col')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('.view-mode')).toHaveCount(0);
  });
});

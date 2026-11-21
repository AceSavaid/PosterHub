import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import JSZip from 'jszip';
import { inspectPdf, localFontsource, pdfText } from '../helpers/pdf';

async function newPoster(page: Page, template = 'Blank', size = 'A3') {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByLabel('Size').selectOption(size);
  await page.getByRole('button', { name: new RegExp(template) }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/npm/@fontsource/**', async (route) => {
    const body = localFontsource(route.request().url());
    if (!body) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: Buffer.from(body), headers: { 'access-control-allow-origin': '*', 'content-type': 'font/woff' } });
  });
});

async function paste(page: Page, data: Record<string, string>) {
  await page.evaluate((d) => {
    const dt = new DataTransfer();
    for (const [k, v] of Object.entries(d)) dt.setData(k, v);
    // Firefox drops clipboardData given to a script-made event, so attach it directly.
    document.dispatchEvent(Object.defineProperty(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }), 'clipboardData', { value: dt }));
  }, data);
}

/** Pastes into whatever has focus (a table cell while editing). */
async function pasteInFocus(page: Page, data: Record<string, string>) {
  await page.evaluate((d) => {
    const dt = new DataTransfer();
    for (const [k, v] of Object.entries(d)) dt.setData(k, v);
    // Firefox drops clipboardData given to a script-made event, so attach it directly.
    document.activeElement!.dispatchEvent(Object.defineProperty(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }), 'clipboardData', { value: dt }));
  }, data);
}

const cells = (page: Page) =>
  page.locator('.poster .poster-table').first().evaluate((t: HTMLTableElement) => Array.from(t.rows).map((r) => Array.from(r.cells).map((c) => c.textContent)));

async function download(page: Page, label: RegExp) {
  await page.getByRole('button', { name: 'Export ▾' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: label }).click();
  const d = await dl;
  const file = path.join(os.tmpdir(), `${Date.now()}-${d.suggestedFilename()}`);
  await d.saveAs(file);
  return fs.readFile(file);
}

// What Excel puts on the clipboard (trimmed), with a few nasty extras that must not survive.
const EXCEL_HTML = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>td{mso-number-format:General}</style></head><body>
<table border=0><tr><td>Condition</td><td>Mean RT (ms)</td><td>SD</td></tr>
<tr><td>Control</td><td style="color:red">512</td><td>48</td></tr>
<tr><td>Caffeine<img src=x onerror="window.__pwned=1"></td><td>468</td><td>41<script>window.__pwned=2</script></td></tr></table></body></html>`;

test.describe('tables', () => {
  test('inserts a table and types straight into it, with Tab moving between cells', async ({ page }) => {
    await newPoster(page);
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    const table = page.locator('.poster .poster-table');
    await expect(table).toBeVisible();
    // the first cell is ready to type in
    await page.keyboard.type('Group');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Mean');
    await page.keyboard.press('Enter'); // moves down
    await page.keyboard.type('4.2');
    const before = (await cells(page)).length;
    // Tab on the very last cell adds a row
    const last = table.locator('tr').last().locator('td').last();
    await last.click();
    await page.keyboard.press('Tab');
    await page.keyboard.type('New row');
    await page.keyboard.press('Escape');
    const rows = await cells(page);
    expect(rows.length).toBe(before + 1);
    expect(rows[0].slice(0, 2)).toEqual(['Group', 'Mean']);
    expect(rows[1][1]).toBe('4.2');
    expect(rows[rows.length - 1][0]).toBe('New row');
    // undo removes the last edit, not the whole table
    await page.keyboard.press('Control+z');
    await expect(table).toBeVisible();
    // numbers are right-aligned automatically
    await page.keyboard.press('Control+y');
    expect(await table.locator('td[data-r="1"][data-c="1"]').evaluate((td) => getComputedStyle(td).textAlign)).toBe('right');
  });

  test('pastes cells from Excel as a table, keeping only the text', async ({ page }) => {
    await newPoster(page);
    await paste(page, { 'text/html': EXCEL_HTML, 'text/plain': 'Condition\tMean RT (ms)\tSD\nControl\t512\t48\nCaffeine\t468\t41' });
    await expect(page.locator('.toast')).toContainText('Pasted 3 × 3 cells as a table');
    expect(await cells(page)).toEqual([
      ['Condition', 'Mean RT (ms)', 'SD'],
      ['Control', '512', '48'],
      ['Caffeine', '468', '41'],
    ]);
    const table = page.locator('.poster .poster-table');
    expect(await table.locator('img, script, style').count()).toBe(0);
    expect(await table.locator('td[data-r="1"][data-c="1"]').evaluate((td) => getComputedStyle(td).color)).not.toBe('rgb(255, 0, 0)');
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    // the box is tall enough for every row
    await expect(page.locator('.poster > .el-table')).toHaveAttribute('data-overflow', 'false');
  });

  test('pastes Google Sheets cells and a block of cells into an existing table', async ({ page }) => {
    await newPoster(page);
    await paste(page, {
      'text/html': '<google-sheets-html-origin><table><tbody><tr><td>A</td><td colspan="2">Merged</td></tr><tr><td>1</td><td>2</td><td>3</td></tr></tbody></table>',
      'text/plain': 'A\tMerged\n1\t2\t3',
    });
    expect(await cells(page)).toEqual([
      ['A', 'Merged', ''],
      ['1', '2', '3'],
    ]);
    await page.locator('.poster .poster-table td[data-r="1"][data-c="2"]').dblclick();
    await pasteInFocus(page, { 'text/plain': 'x\ty\nz\tw' });
    await page.keyboard.press('Escape');
    expect(await cells(page)).toEqual([
      ['A', 'Merged', '', ''],
      ['1', '2', 'x', 'y'],
      ['', '', 'z', 'w'],
    ]);
  });

  test('changes style, header row, size and rows from the side panel', async ({ page }) => {
    await newPoster(page);
    await paste(page, { 'text/plain': 'Group\tScore\nA\t1\nB\t3\nC\t2' });
    const table = page.locator('.poster .poster-table');
    const head = table.locator('[data-r="0"][data-c="0"]');
    // Academic: no fill, rule above the header
    expect(await head.evaluate((n) => getComputedStyle(n).borderTopWidth)).not.toBe('0px');
    await page.getByRole('radio', { name: /Striped/ }).click();
    await expect(page.getByRole('radio', { name: /Striped/ })).toHaveAttribute('aria-checked', 'true');
    expect(await head.evaluate((n) => getComputedStyle(n).backgroundColor)).toBe('rgb(31, 78, 121)'); // Academic Blue primary
    expect(await table.locator('[data-r="2"][data-c="0"]').evaluate((n) => getComputedStyle(n).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    await page.getByLabel('First row is a header').uncheck();
    await expect(table.locator('th')).toHaveCount(0);
    await page.getByLabel('Text size (pt)').fill('30');
    expect(await head.evaluate((n) => getComputedStyle(n).fontSize)).toBe('40px');
    await page.getByRole('button', { name: '+ Row below' }).click();
    await page.getByRole('button', { name: '+ Column right' }).click();
    expect((await cells(page)).length).toBe(5);
    expect((await cells(page))[0].length).toBe(3);
    // keeps working after a reload
    await page.waitForTimeout(800);
    await page.goto('/'); // My posters, not the poster's own link (which reopens it by itself)
    await page.locator('.poster-card').first().getByRole('button', { name: 'Open', exact: true }).click();
    expect((await cells(page)).length).toBe(5);
  });

  test('turns a table into a graph from the side panel', async ({ page }) => {
    await newPoster(page);
    await paste(page, { 'text/plain': 'Group\tScore\nA\t1\nB\t3\nC\t2' });
    await page.getByRole('button', { name: 'Make a graph from this table…' }).click();
    await page.getByRole('button', { name: 'Add graph to poster' }).click();
    await expect(page.locator('.poster .el-chart canvas')).toBeVisible();
    await expect(page.locator('.poster .poster-table')).toBeVisible();
  });

  test('copies a table so it pastes back into a spreadsheet as cells', async ({ page }) => {
    await newPoster(page);
    await paste(page, { 'text/plain': 'Group\tScore\nA\t1' });
    const text = await page.evaluate(() => {
      const dt = new DataTransfer();
      // Firefox drops clipboardData given to a script-made event, so attach it directly.
      document.dispatchEvent(Object.defineProperty(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true }), 'clipboardData', { value: dt }));
      return dt.getData('text/plain');
    });
    expect(text).toBe('Group\tScore\nA\t1');
  });

  test('exports an editable PowerPoint table and a vector PDF table', async ({ page }) => {
    await newPoster(page);
    await paste(page, { 'text/plain': 'Condition\tMean\tSD\nControl\t512\t48\nCaffeine\t468\t41' });
    await page.getByRole('radio', { name: /Striped/ }).click();

    const pptx = await JSZip.loadAsync(await download(page, /^PowerPoint/));
    const slide = await pptx.file('ppt/slides/slide1.xml')!.async('string');
    expect(slide).toContain('<a:tbl>');
    for (const s of ['Condition', 'Control', 'Caffeine', '512', '41']) expect(slide).toContain(`<a:t>${s}</a:t>`);
    expect(slide).toContain('1F4E79'); // header fill in the poster's primary colour

    const pdf = await download(page, /^PDF/);
    const text = await pdfText(pdf);
    for (const s of ['Condition', 'Mean', 'Control', 'Caffeine', '512', '468']) expect(text).toContain(s);
    const info = await inspectPdf(pdf);
    expect(info.images).toHaveLength(0);
    expect(info.fonts.every((f) => f.embedded)).toBe(true);
  });

  test('converts a table imported from PowerPoint into an editable table', async ({ page }) => {
    await newPoster(page);
    await page.getByRole('button', { name: 'Text box' }).click(); // starts in editing mode
    // put a PowerPoint-style formatted table in it, as the PowerPoint import does
    await page.locator('.poster .el-text .el-body').evaluate((el) => {
      el.innerHTML = '<table><colgroup><col style="width:30%"><col style="width:70%"></colgroup><tbody><tr><td style="background:#123456">Site</td><td>Count</td></tr><tr><td>North</td><td>12</td></tr></tbody></table>';
    });
    await page.keyboard.press('Escape');
    await page.locator('.poster .el-text').click({ button: 'right' });
    await page.getByRole('button', { name: 'Convert to editable table' }).click();
    expect(await cells(page)).toEqual([
      ['Site', 'Count'],
      ['North', '12'],
    ]);
    const widths = await page.locator('.poster .poster-table col').evaluateAll((cols) => cols.map((c) => (c as HTMLElement).style.width));
    expect(widths).toEqual(['30%', '70%']);
  });

  test('flags tiny table text in the poster check', async ({ page }) => {
    await newPoster(page, 'Blank', 'A0');
    await paste(page, { 'text/plain': 'Group\tScore\nA\t1' });
    await page.getByLabel('Text size (pt)').fill('8');
    await page.getByRole('button', { name: /^Check/ }).click();
    await expect(page.locator('.check-panel, [role="dialog"]').filter({ hasText: 'Table text may be too small' }).first()).toBeVisible();
  });
});

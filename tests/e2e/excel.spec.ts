import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

// results.xlsx has a "Results" sheet (data starting at B2, number formats, a date column and
// a formula), a "Notes" sheet, and a hidden "Scratch" sheet that must never be offered.
const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures');
const XLSX = path.join(FIXTURES, 'results.xlsx');

async function newPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: /Blank/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

async function choose(page: Page, button: string, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: button }).click();
  await (await chooser).setFiles(file);
}

const tableCells = (page: Page) =>
  page.locator('.poster .poster-table').first().evaluate((t: HTMLTableElement) => Array.from(t.rows).map((r) => Array.from(r.cells).map((c) => c.textContent)));

/** Fails the test on any page error or blocked script (the app runs under script-src 'self'). */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

test('makes a graph from an Excel workbook, asking which sheet to use', async ({ page }) => {
  const errors = watchErrors(page);
  const scripts: string[] = [];
  page.on('request', (r) => r.resourceType() === 'script' && scripts.push(r.url()));
  await newPoster(page);
  // The Excel reader is only downloaded once an Excel file is chosen.
  expect(scripts.some((u) => /\/xlsx-[^/]*\.js$/.test(u))).toBe(false);

  await page.getByRole('button', { name: 'Graph from Excel or CSV…' }).click();
  await choose(page, 'Choose an Excel or CSV file…', XLSX);
  const picker = page.getByRole('group', { name: /This workbook has 2 sheets/ });
  await expect(picker.getByRole('button')).toHaveText([/Results\s*5 rows × 5 columns · Condition, Mean RT \(ms\), SD, Accuracy…/, /Notes/, 'Cancel']);
  await expect(picker).not.toContainText('Scratch');
  expect(scripts.some((u) => /\/xlsx-[^/]*\.js$/.test(u))).toBe(true);

  await picker.getByRole('button', { name: /Results/ }).click();
  await expect(page.locator('.chart-dialog .table-wrap tbody tr')).toHaveCount(4); // Control, Caffeine, Placebo, Mean
  await expect(page.locator('.chart-dialog .table-wrap tbody tr').first()).toContainText('93.1%');
  await expect(page.getByRole('checkbox', { name: 'Mean RT (ms)' })).toBeChecked();
  await page.getByRole('button', { name: 'Add graph to poster' }).click();
  await expect(page.locator('.poster .el-chart canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('fills a table from an Excel sheet, and from a CSV without asking', async ({ page }) => {
  const errors = watchErrors(page);
  await newPoster(page);
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.keyboard.press('Escape'); // stop typing in the first cell; the table stays selected
  await choose(page, 'Fill from an Excel or CSV file…', XLSX);
  await page.getByRole('group', { name: /Which one has your data/ }).getByRole('button', { name: /Results/ }).click();
  expect(await tableCells(page)).toEqual([
    ['Condition', 'Mean RT (ms)', 'SD', 'Accuracy', 'Session'],
    ['Control', '512.0', '48.25', '93.1%', '2024-03-01'],
    ['Caffeine', '468.0', '41.50', '95.2%', '2024-03-08'],
    ['Placebo', '505.0', '45.00', '94.0%', '2024-03-15'],
    ['Mean', '495.0', '', '', ''],
  ]);
  await expect(page.getByText('Filled the table with 5 × 5 cells.')).toBeVisible();
  // The fill is one undo step.
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => tableCells(page).then((c) => c[0][0])).toBe('Group');
  await page.keyboard.press('ControlOrMeta+y');
  await expect.poll(() => tableCells(page).then((c) => c[0][0])).toBe('Condition');

  await choose(page, 'Fill from an Excel or CSV file…', path.join(FIXTURES, 'results.csv'));
  await expect(page.getByRole('group', { name: /Which one has your data/ })).toHaveCount(0);
  // the CSV is read in the background, so wait for the table to change rather than reading it straight away
  const csvHeader = fs.readFileSync(path.join(FIXTURES, 'results.csv'), 'utf8').split(/\r?\n/)[0].split(',');
  await expect.poll(() => tableCells(page).then((c) => c[0])).toEqual(csvHeader);
  expect(errors).toEqual([]);
});

test('explains what to do with an old .xls file', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'Graph from Excel or CSV…' }).click();
  const xls = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...Array(504).fill(0)]);
  // Renamed to .xlsx, so the Excel reader sees it and recognises the old format inside.
  await choose(page, 'Choose an Excel or CSV file…', { name: 'old.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xls });
  await expect(page.locator('.chart-dialog .banner.error')).toContainText('older Excel file (.xls) or a password-protected workbook');
  await choose(page, 'Choose an Excel or CSV file…', { name: 'old.xls', mimeType: 'application/vnd.ms-excel', buffer: xls });
  await expect(page.locator('.chart-dialog .banner.error')).toContainText('save it as “Excel Workbook (.xlsx)” or CSV');
});

test('dropping an Excel file on the poster opens the graph dialog at the sheet list', async ({ page }) => {
  await newPoster(page);
  const bytes = [...fs.readFileSync(XLSX)];
  await page.locator('.poster').evaluate((poster, b) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], 'results.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const r = poster.getBoundingClientRect();
    poster.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.left + 50, clientY: r.top + 50 }));
  }, bytes);
  const dialog = page.getByRole('dialog', { name: 'Graph from Excel or CSV' });
  await dialog.getByRole('button', { name: /Notes/ }).click();
  await expect(dialog.locator('.table-wrap tbody tr')).toHaveCount(1);
  await expect(dialog.locator('.table-wrap')).toContainText('Reaction times from the pilot study');
});

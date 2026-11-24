import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import JSZip from 'jszip';
import { localFontsource, pdfText } from '../helpers/pdf';
import { allowClipboard, copiedPng, recordClipboard } from '../helpers/clipboard';

// Review notes: sticky notes for co-authors that are saved in the poster file
// but must never appear in anything that gets printed or shared as an image.

test.beforeEach(async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/npm/@fontsource/**', async (route) => {
    const body = localFontsource(route.request().url());
    if (!body) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: Buffer.from(body), headers: { 'access-control-allow-origin': '*', 'content-type': 'font/woff' } });
  });
});

async function newPoster(page: Page, name = 'Notes test', template = 'Classic columns') {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByLabel('Poster title').fill(name);
  await page.getByLabel('Size').selectOption('A4');
  await page.getByRole('button', { name: new RegExp('^' + template) }).click();
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
  return { name: d.suggestedFilename(), data: await fs.readFile(file), file };
}

const notesPanel = (page: Page) => page.getByRole('dialog', { name: 'Review notes' });
const pins = (page: Page) => page.locator('.note-pin');

/** Notes share the review panel with Check and Find: open it from Check, then switch to Notes. */
async function openNotes(page: Page) {
  if (await notesPanel(page).isVisible()) return;
  if (!(await page.locator('.review-switch').isVisible())) await page.getByRole('button', { name: /^Check/ }).click();
  await page.locator('.review-switch').getByRole('button', { name: /^Notes/ }).click();
  await expect(notesPanel(page)).toBeVisible();
}

/** Opens the Notes panel, signs in a name and adds a note with this text. */
async function addNote(page: Page, text: string, name = 'Dr. Lee') {
  await openNotes(page);
  await notesPanel(page).getByLabel(/Your name/).fill(name);
  await notesPanel(page).getByRole('button', { name: '+ Add note' }).click();
  const box = page.getByLabel('Note text');
  await expect(box).toBeFocused();
  await box.fill(text);
}

/** Number of bright yellow (note-pin coloured) pixels in a PNG. */
async function yellowPixels(page: Page, png: Buffer) {
  return page.evaluate(async (b64) => {
    const blob = await (await fetch('data:image/png;base64,' + b64)).blob();
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 220 && d[i + 1] > 160 && d[i + 1] < 215 && d[i + 2] < 60) n++;
    return n;
  }, png.toString('base64'));
}

test('adds, edits, resolves, reopens and deletes notes; all of it can be undone', async ({ page }) => {
  await newPoster(page);
  // a new note goes on the selected element
  await page.locator('.poster .el-title').click();
  await addNote(page, 'Shorter title?\nMaybe drop "novel".');
  await expect(pins(page)).toHaveCount(1);
  await expect(pins(page).first()).toHaveText('1');
  const title = await page.locator('.poster .el-title').boundingBox();
  const pin = await pins(page).first().boundingBox();
  expect(pin!.x).toBeGreaterThan(title!.x + title!.width / 2);
  await expect(page.locator('.check-btn .note-badge')).toHaveText('1');
  await expect(notesPanel(page)).toContainText('Dr. Lee');
  await expect(notesPanel(page).locator('.note-text')).toHaveText('Shorter title?\nMaybe drop "novel".');

  // typing in the note did not touch the poster's text
  await expect(page.locator('.poster .el-title')).toContainText('Your Poster Title');

  // Esc closes the card; clicking the pin opens it again
  await page.getByLabel('Note text').press('Escape');
  await expect(page.getByLabel('Note text')).toHaveCount(0);
  await pins(page).first().click();
  await expect(page.getByLabel('Note text')).toHaveValue(/Shorter title/);

  // resolve hides the pin (unless resolved notes are shown) and clears the badge
  await page.getByRole('button', { name: '✓ Resolve' }).click();
  await expect(pins(page)).toHaveCount(0);
  await expect(page.locator('.check-btn .note-badge')).toHaveCount(0);
  await expect(notesPanel(page)).toContainText('All 1 note(s) are resolved');
  await notesPanel(page).getByLabel(/Show resolved/).check();
  await expect(pins(page)).toHaveCount(1);
  await expect(pins(page).first()).toHaveClass(/resolved/);
  await notesPanel(page).getByRole('button', { name: 'Reopen' }).click();
  await expect(page.locator('.check-btn .note-badge')).toHaveText('1');

  // a second note from the right-click menu
  // (left part of the box: the selected title's rotate handle sits over the middle)
  await page.locator('.poster .el-subtitle').click({ button: 'right', position: { x: 20, y: 10 } });
  await page.getByRole('menuitem', { name: 'Add note' }).click();
  await page.getByLabel('Note text').fill('Add ORCID iDs');
  await expect(pins(page)).toHaveCount(2);
  await expect(page.locator('.check-btn .note-badge')).toHaveText('2');

  // delete, then undo brings it back
  await notesPanel(page).getByRole('button', { name: 'Delete note 2' }).click();
  await expect(pins(page)).toHaveCount(1);
  await page.locator('.stage').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(pins(page)).toHaveCount(2);
});

test('notes can be dragged, and hidden or shown on the poster', async ({ page }) => {
  await newPoster(page);
  await addNote(page, 'Move me');
  await page.getByLabel('Note text').press('Escape');
  const pin = pins(page).first();
  const a = (await pin.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 80, a.y + 60, { steps: 5 });
  await page.mouse.up();
  const b = (await pin.boundingBox())!;
  expect(b.x - a.x).toBeGreaterThan(50);
  expect(b.y - a.y).toBeGreaterThan(30);
  // dragging a pin does not open it or select poster elements
  await expect(page.getByLabel('Note text')).toHaveCount(0);

  await notesPanel(page).getByLabel('Show notes on poster').uncheck();
  await expect(pins(page)).toHaveCount(0);
  // the choice is remembered after a reload
  await page.waitForTimeout(800); // let autosave run
  await page.goto('/'); // My posters, not the poster's own link (which reopens it by itself)
  await page.getByRole('button', { name: 'Open Notes test preview' }).click();
  await expect(page.locator('.poster')).toBeVisible();
  await expect(page.locator('.check-btn .note-badge')).toHaveText('1');
  await expect(pins(page)).toHaveCount(0);
  // picking the note from the list shows notes again
  await openNotes(page);
  await notesPanel(page).getByRole('button', { name: 'Open note 1' }).click();
  await expect(pins(page)).toHaveCount(1);
  await expect(page.getByLabel('Note text')).toHaveValue('Move me');
  await expect(notesPanel(page).getByLabel('Show notes on poster')).toBeChecked();
});

test('Check lists open notes and clicking one opens it', async ({ page }) => {
  await newPoster(page);
  await addNote(page, 'Is n=12 enough?');
  await page.getByLabel('Note text').press('Escape');
  // Notes and Check share the review panel: switch over to Poster check
  await page.locator('.review-switch').getByRole('button', { name: 'Poster check' }).click();
  const check = page.getByRole('dialog', { name: 'Poster check' });
  const item = check.getByRole('button', { name: /Open note from Dr\. Lee: “Is n=12 enough\?”/ });
  await expect(item).toBeVisible();
  await item.click();
  await expect(page.getByLabel('Note text')).toHaveValue('Is n=12 enough?');
  await page.getByRole('button', { name: '✓ Resolve' }).click();
  await expect(check.getByRole('button', { name: /Open note from/ })).toHaveCount(0);
});

test('notes never appear in PDF, PowerPoint, PNG or copied images, but travel in the project file', async ({ page, context, browserName }) => {
  await allowClipboard(context, browserName);
  await recordClipboard(page);
  await newPoster(page, 'Shared draft');
  const secret = 'SUPERVISOR-ONLY-COMMENT';
  // put the note in an empty part of the poster and leave its card open while exporting
  await openNotes(page);
  await notesPanel(page).getByLabel(/Your name/).fill('Prof. Ada');
  await notesPanel(page).getByRole('button', { name: '+ Add note' }).click();
  await page.getByLabel('Note text').fill(secret);
  await expect(pins(page)).toHaveCount(1);

  const pdf = await download(page, /^PDF/);
  const text = await pdfText(pdf.data);
  expect(text).toContain('Your Poster Title Goes Here');
  expect(text).not.toContain(secret);
  expect(text).not.toContain('Prof. Ada');

  const pptx = await download(page, /^PowerPoint/);
  const zip = await JSZip.loadAsync(pptx.data);
  for (const f of Object.keys(zip.files).filter((f) => f.endsWith('.xml'))) {
    const xml = await zip.file(f)!.async('string');
    expect(xml, f).not.toContain(secret);
  }

  // the pin is bright yellow on screen; there must be none of it in the image
  await page.locator('.note-pin').first().click(); // open the card again so both pin and card are on screen
  // sanity check: the detector does see the pin on screen
  expect(await yellowPixels(page, await page.locator('.stage').screenshot())).toBeGreaterThan(20);
  const png = await download(page, /^PNG image/);
  expect(png.data.subarray(1, 4).toString()).toBe('PNG');
  expect(await yellowPixels(page, png.data)).toBe(0);

  await page.getByRole('button', { name: 'Export ▾' }).click();
  await page.getByRole('button', { name: /^Copy as image/ }).click();
  await expect(page.locator('.toast')).toContainText('copied');
  expect(await yellowPixels(page, await copiedPng(page))).toBe(0);

  // the project file keeps the note, so feedback travels with the poster
  const proj = await download(page, /^Project file/);
  const json = JSON.parse(proj.data.toString());
  expect(json.notes).toHaveLength(1);
  expect(json.notes[0]).toMatchObject({ text: secret, author: 'Prof. Ada', resolved: false });
  expect(json.elements.some((e: { html?: string }) => e.html?.includes(secret))).toBe(false);
});

test('notes in a shared file are shown as plain text, never run as code', async ({ page }) => {
  await newPoster(page, 'Base');
  const proj = await download(page, /^Project file/);
  const json = JSON.parse(proj.data.toString());
  const evil = '<img src=x onerror="window.__pwned=1"><b>bold?</b>';
  json.name = 'From a co-author';
  json.notes = [{ id: 'n1', x: 50, y: 50, text: evil, author: '<script>window.__pwned=2</script>', createdAt: Date.now(), resolved: false, onmouseover: 'x' }];
  const file = path.join(os.tmpdir(), `${Date.now()}-shared.poster.json`);
  await fs.writeFile(file, JSON.stringify(json));

  await page.getByRole('button', { name: /My posters/ }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open project file' }).click();
  await (await chooser).setFiles(file);
  await expect(page.getByLabel('Poster name')).toHaveValue('From a co-author');
  await expect(page.locator('.check-btn .note-badge')).toHaveText('1');

  await openNotes(page);
  await expect(notesPanel(page).locator('.note-text')).toHaveText(evil);
  await pins(page).first().click();
  await expect(page.getByLabel('Note text')).toHaveValue(evil);
  await expect(page.locator('.note-card')).toContainText('<script>window.__pwned=2</script>');
  await expect(page.locator('.note-card img, .notes-panel img, .note-card b, .notes-panel b')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
});

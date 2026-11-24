import { test, expect, type Page } from '@playwright/test';

async function newPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

/** Adds a text box and leaves it open for typing. */
async function newTextBox(page: Page) {
  await page.getByRole('button', { name: 'Text box', exact: true }).click();
  await expect(page.locator('.el.editing')).toHaveCount(1);
  await page.keyboard.press('Delete');
  return page.locator('.el.editing .el-body');
}

const bar = (page: Page) => page.getByRole('toolbar', { name: 'Text formatting' });

/** Pastes as if copied from another app, with the given HTML and plain text on the clipboard. */
async function paste(page: Page, html: string, text: string, plain = false) {
  await page.locator('.el.editing .el-body').evaluate(
    (node, { html, text, plain }) => {
      if (plain) node.dispatchEvent(new KeyboardEvent('keydown', { key: 'V', code: 'KeyV', ctrlKey: true, shiftKey: true, bubbles: true }));
      const dt = new DataTransfer();
      dt.setData('text/html', html);
      dt.setData('text/plain', text);
      node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    { html, text, plain },
  );
}

test('Ctrl/⌘ Alt 1 and 0 switch typed text between a heading and normal text, like Google Docs', async ({ page }) => {
  await newPoster(page);
  const body = await newTextBox(page);
  await page.keyboard.type('Results');
  const styleBtn = bar(page).getByRole('button', { name: /^Text style/ });
  await expect(styleBtn).toHaveAccessibleName('Text style: Normal text');

  await page.keyboard.press('ControlOrMeta+Alt+Digit1');
  await expect(styleBtn).toHaveAccessibleName('Text style: Heading');
  await expect(page.locator('.el.editing')).toHaveCount(1); // still typing
  // it takes the look of the template's own headings
  const headingSize = await page.locator('.poster .el').filter({ hasText: /^Introduction$/ }).locator('.el-body').evaluate((n) => getComputedStyle(n).fontSize);
  await expect(body).toHaveCSS('font-size', headingSize);
  await page.keyboard.type(' and discussion');
  await expect(body).toHaveText('Results and discussion');

  await page.keyboard.press('ControlOrMeta+Alt+Digit0');
  await expect(styleBtn).toHaveAccessibleName('Text style: Normal text');

  // the same list, with the keys, from the bar
  await styleBtn.click();
  const menu = bar(page).getByRole('group', { name: 'Text styles' });
  await expect(menu.getByRole('button')).toHaveCount(5);
  await expect(menu.getByRole('button', { name: /Subheading/ })).toContainText(/Alt\+2|⌥2/);
  await menu.getByRole('button', { name: /Caption/ }).click();
  await expect(styleBtn).toHaveAccessibleName('Text style: Caption');
  await expect(body).toHaveCSS('font-style', 'italic');

  // and it works on a selected box without typing, as one undo step
  await page.keyboard.press('Escape');
  await expect(page.locator('.el.selected')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+Alt+Digit1');
  await expect(page.locator('.toast')).toContainText('Now heading');
  await expect(page.getByLabel('Text style')).toHaveValue('heading');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByLabel('Text style')).toHaveValue('caption');
});

test('“Update all to match” restyles every heading at once', async ({ page }) => {
  await newPoster(page);
  const headings = page.locator('.poster .el').filter({ hasText: /^(Introduction|Methods|Results)$/ });
  await expect(headings).toHaveCount(3);
  await headings.first().click();
  await expect(page.getByLabel('Text style')).toHaveValue('heading');
  await page.getByLabel('Size (pt)').fill('77');
  await page.getByRole('button', { name: 'Update all to match' }).click();
  await expect(page.locator('.toast')).toContainText(/Updated \d+ other heading boxes to match/);
  for (const h of await headings.all()) expect(await h.locator('.el-body').evaluate((n) => parseFloat(getComputedStyle(n).fontSize))).toBeCloseTo((77 * 96) / 72, 1);
});

test('typing "- ", "1. ", quotes and number ranges formats as you go, and undo takes it back', async ({ page }) => {
  await newPoster(page);
  const body = await newTextBox(page);
  await page.keyboard.type('- first point');
  await expect(body.locator('ul li')).toHaveText('first point');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // an empty item ends the list
  await page.keyboard.type('1. step one');
  await expect(body.locator('ol li')).toHaveText('step one');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('She said "it\'s 10-20 mm"');
  await expect(body).toContainText('She said “it’s 10–20 mm”');

  // one undo puts back the plain hyphen
  await page.keyboard.press('Escape');
  await page.locator('.el.selected').press('Enter');
  await page.keyboard.press('End');
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' 3-4');
  await expect(body).toContainText('3–4');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(body).toContainText(/ 3-$/);
});

test('formatting while typing can be turned off in Settings', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'Settings and help' }).click();
  await page.getByRole('menuitem', { name: 'Settings…' }).click();
  await page.getByLabel(/Format as I type/).uncheck();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const body = await newTextBox(page);
  await page.keyboard.type('- "a" 1-2');
  await expect(body).toHaveText('- "a" 1-2');
  await expect(body.locator('ul')).toHaveCount(0);
});

test('Ctrl/⌘ V keeps bold, italic and lists from Word or Docs; Ctrl/⌘ Shift V pastes the words only', async ({ page }) => {
  await newPoster(page);
  const body = await newTextBox(page);
  const html = '<p style="font-family:Times New Roman;color:red;font-size:40px"><b>Bold</b> and <i>italic</i> H<sub>2</sub>O</p><ul><li>one</li></ul>';
  await paste(page, html, 'Bold and italic H2O\none');
  await expect(body.locator('b')).toHaveText('Bold');
  await expect(body.locator('i')).toHaveText('italic');
  await expect(body.locator('sub')).toHaveText('2');
  await expect(body.locator('li')).toHaveText('one');
  expect(await body.innerHTML()).not.toMatch(/Times|red|40px/);

  await page.keyboard.press('Escape');
  await newTextBox(page);
  await paste(page, html, 'Bold and italic H2O', true);
  await expect(body).toHaveText('Bold and italic H2O');
  await expect(body.locator('b, i, sub, li')).toHaveCount(0);
});

test('the Ω button finds and adds special characters without leaving the text', async ({ page }) => {
  await newPoster(page);
  const body = await newTextBox(page);
  await page.keyboard.type('p < 0.05, ');
  await bar(page).getByRole('button', { name: /special characters/ }).click();
  const pop = bar(page).getByRole('group', { name: 'Special characters' });
  await expect(pop.getByRole('searchbox')).toBeFocused();
  await pop.getByRole('searchbox').fill('alpha');
  await expect(pop.getByRole('button')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(pop).toHaveCount(0);
  await expect(page.locator('.el.editing')).toHaveCount(1);
  await page.keyboard.type(' = 0.8 ');
  await bar(page).getByRole('button', { name: /special characters/ }).click();
  await pop.getByRole('button', { name: '± plus minus' }).click();
  await expect(body).toHaveText('p < 0.05, α = 0.8 ±');
  // recently used come first next time
  await pop.getByRole('searchbox').fill('');
  await expect(pop.locator('.tt-chars-group').first()).toContainText('Recently used');
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  await expect(page.locator('.el.editing')).toHaveCount(1);
});

test('buttons with a shortcut name it in their tooltip, and the typing shortcuts work', async ({ page }) => {
  await newPoster(page);
  await expect(page.getByRole('button', { name: 'Zoom in' }).or(page.locator('button[title^="Zoom in"]')).first()).toHaveAttribute('title', /Zoom in \((Ctrl\+=|⌘=)\)/);
  const body = await newTextBox(page);
  for (const [name, key] of [['Bold', /Ctrl\+B|⌘B/], ['A+ bigger text', /Ctrl\+Shift\+\.|⌘⇧\./], ['Bullet list', /Ctrl\+Shift\+8|⌘⇧8/], ['x² superscript', /Ctrl\+\.|⌘\./]] as const)
    await expect(bar(page).getByRole('button', { name, exact: true })).toHaveAttribute('title', key);

  await page.keyboard.type('CO');
  await page.keyboard.press('ControlOrMeta+Comma');
  await page.keyboard.type('2');
  await expect(body.locator('sub')).toHaveText('2');
  await page.keyboard.press('ControlOrMeta+Comma');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ControlOrMeta+Shift+Digit8');
  await page.keyboard.type('a point');
  await expect(body.locator('ul li')).toHaveText('a point');
  const before = await body.evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+Shift+Period');
  await expect.poll(() => body.evaluate((n) => parseFloat(getComputedStyle(n.querySelector('span') ?? n).fontSize))).toBeGreaterThan(before);
});

import { test, expect, type Page } from '@playwright/test';

// Fewer, clearer menus: one row of review tabs, zoom in one button, Preview in View,
// submenus in the right-click menu, and the text controls shown once while typing.

async function newPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}
const heading = (page: Page, text: string) => page.locator('.poster .el').filter({ hasText: new RegExp('^' + text + '$') }).first();

test('the top bar has one zoom button, and Preview is in the View menu', async ({ page }) => {
  await newPoster(page);
  const bar = page.locator('.topbar');
  await expect(bar.getByRole('button', { name: 'Preview', exact: true })).toHaveCount(0);
  for (const sign of ['−', '+']) await expect(bar.getByRole('button', { name: sign, exact: true })).toHaveCount(0);

  const zoom = page.locator('.zoom-label');
  const before = await zoom.textContent();
  await zoom.click();
  await page.getByRole('menuitem', { name: /^Zoom in/ }).click();
  await expect(zoom).not.toHaveText(before!);
  await zoom.click();
  await page.getByRole('menuitem', { name: /^Fit to screen/ }).click();
  await expect(zoom).toHaveText(before!);

  await page.getByRole('button', { name: 'View ▾' }).click();
  await expect(page.getByRole('dialog', { name: 'View options' })).not.toContainText('Side panels');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.view-mode')).toBeVisible();
});

test('Check, Spelling, Words, Find and Notes are one row of tabs', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: /^Check/ }).click();
  const tabs = page.locator('.review-switch').getByRole('tab');
  await expect(tabs).toHaveText([/^Problems/, 'Spelling', 'Words', 'Find', 'Notes']);
  await expect(page.locator('.check-panel [role="tablist"]')).toHaveCount(1);
  // the stage's "Go to an empty box" pill steps aside while the panel offers the same button
  await expect(page.locator('.fill-next')).toHaveCount(0);

  await tabs.filter({ hasText: 'Words' }).click();
  const panel = page.getByRole('dialog', { name: 'Poster check' });
  await expect(panel.getByRole('heading', { name: 'Conference rules' })).toBeVisible();
  await tabs.filter({ hasText: 'Find' }).click();
  await expect(page.getByRole('tab', { name: 'Find' })).toHaveAttribute('aria-selected', 'true');
});

test('right-click groups ordering and lining up into submenus', async ({ page }) => {
  await newPoster(page);
  const intro = heading(page, 'Introduction');
  await intro.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Actions' });
  await expect(menu.getByRole('menuitem', { name: 'Bring to front' })).toHaveCount(0);
  // keyboard: → opens the submenu, ← goes back
  await menu.getByRole('menuitem', { name: 'Order' }).focus();
  await page.keyboard.press('ArrowRight');
  const order = page.getByRole('menu', { name: 'Order' });
  await expect(order.getByRole('menuitem', { name: 'Bring to front' })).toBeFocused();
  await expect(order.getByRole('menuitem')).toHaveText(['Bring to front', 'Bring forward', 'Send backward', 'Send to back']);
  await page.keyboard.press('ArrowLeft');
  await expect(order).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: 'Order' })).toBeFocused();
  await page.keyboard.press('Escape');

  // two selected: every way to line up is under Align
  await intro.click();
  await heading(page, 'Methods').click({ modifiers: ['Shift'] });
  await heading(page, 'Methods').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Align' }).hover();
  const align = page.getByRole('menu', { name: 'Align' });
  await expect(align.getByRole('menuitem')).toHaveText(['Align left edges', 'Align centres (horizontally)', 'Align right edges', 'Align top edges', 'Align middles (vertically)', 'Align bottom edges', 'Tidy up']);
  // pointing at an item inside the submenu keeps it open
  await align.getByRole('menuitem', { name: 'Align top edges' }).hover();
  await expect(align).toBeVisible();
  const x = () => page.locator('.poster .el.selected').evaluateAll((ns) => ns.map((n) => Math.round(parseFloat((n as HTMLElement).style.left))));
  await align.getByRole('menuitem', { name: 'Align right edges' }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  expect((await x()).length).toBe(2);
});

test('the Properties header has one ⋯ menu, and typing shows text controls only in the floating bar', async ({ page }) => {
  await newPoster(page);
  const props = page.locator('.panel.right');
  const intro = heading(page, 'Introduction');
  await intro.click();
  await expect(props.getByRole('button', { name: 'Lock position' })).toHaveCount(0);
  await props.getByRole('button', { name: 'Element actions' }).click();
  await page.getByRole('menuitem', { name: 'Lock position' }).click();
  // a locked element shows the lock so it can be undone in one click
  await props.getByRole('button', { name: 'Unlock' }).click();
  await expect(props.getByRole('button', { name: 'Unlock' })).toHaveCount(0);

  await expect(props.getByLabel('Text style')).toBeVisible();
  await expect(props.getByLabel('Text style').locator('option').first()).toHaveText('Heading');
  await intro.dblclick();
  await expect(page.getByRole('toolbar', { name: 'Text formatting' })).toBeVisible();
  await expect(props.getByLabel('Text style')).toHaveCount(0);
  await expect(props.getByTitle(/^Bold/)).toHaveCount(0);
  await expect(props.getByLabel('Size (pt)')).toBeVisible();
});

test('Export lists formats with options folded; the project file is in the poster menu', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'Export ▾' }).click();
  const menu = page.locator('#export-menu');
  await expect(menu).not.toContainText('Project file');
  await expect(page.getByLabel('Bleed')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Poster menu' }).click();
  await expect(page.getByRole('menuitem', { name: 'Download project file' })).toBeVisible();
});

test('My posters opens files from one Open menu', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'My posters' }).click();
  await expect(page.getByRole('button', { name: 'Open project file' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open ▾' }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Open project file…', 'Import PowerPoint template…']);
});

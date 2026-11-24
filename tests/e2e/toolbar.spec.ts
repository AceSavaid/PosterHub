import { test, expect, type Page } from '@playwright/test';

async function newPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

/** Inputs and dropdowns in the side panels and the Export menu whose box runs past their container. */
async function clippedFields(page: Page, scope: string) {
  return page.locator(scope).evaluate((root) => {
    const out: string[] = [];
    for (const f of Array.from(root.querySelectorAll<HTMLElement>('select, input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=range]):not([type=file])'))) {
      const r = f.getBoundingClientRect();
      if (!r.width) continue; // hidden
      // the nearest box that hides overflow (a panel or the menu)
      let c = f.parentElement;
      while (c && c !== root && getComputedStyle(c).overflowX === 'visible') c = c.parentElement;
      const box = (c ?? root).getBoundingClientRect();
      if (r.left < box.left - 1 || r.right > box.right + 1 || r.width < 40) out.push(f.getAttribute('aria-label') || f.closest('label')?.textContent?.trim() || f.outerHTML.slice(0, 60));
    }
    return out;
  });
}

test('no field in the Layout panel or the Export menu is cut off', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await newPoster(page);
  await page.getByRole('tab', { name: 'Layout' }).click();
  await expect(page.locator('.panel.left').getByRole('combobox', { name: 'Size', exact: true })).toBeVisible();
  expect(await clippedFields(page, '.panel.left')).toEqual([]);

  await page.getByRole('button', { name: 'Export ▾' }).click();
  const bleed = page.getByLabel('Bleed');
  await expect(bleed).toBeVisible();
  expect(await clippedFields(page, '#export-menu')).toEqual([]);
  // the label sits beside its dropdown on one line, not centred above it
  const [label, select] = await Promise.all([page.locator('.menu-print label:not(.check)').boundingBox(), bleed.boundingBox()]);
  expect(select!.x).toBeGreaterThan(label!.x + 20);
  expect(Math.abs(select!.y + select!.height / 2 - (label!.y + label!.height / 2))).toBeLessThan(4);
});

test('the poster name has room in the desktop top bar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await newPoster(page);
  await expect(page.getByRole('button', { name: 'Colour vision' })).toHaveCount(0);
  const name = (await page.getByLabel('Poster name').boundingBox())!;
  // With the eye button there it was squeezed to its 90px minimum. Button widths depend on the
  // computer's fonts, so check it is clearly above that minimum rather than an exact size.
  expect(name.width).toBeGreaterThan(100);
  expect(await page.locator('.topbar').evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
  // still one row
  const bar = (await page.locator('.topbar').boundingBox())!;
  expect(bar.height).toBeLessThan(60);
});

test('settings open only from the gear, not from Help or View', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await newPoster(page);
  const skip = page.getByRole('button', { name: 'Skip tour' });
  if (await skip.isVisible()) await skip.click();

  // Help holds help only: shortcuts and the tour.
  await page.getByRole('button', { name: 'Help' }).click();
  await expect(page.getByRole('menuitem', { name: /Keyboard shortcuts/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Take the tour' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Settings/ })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // The View menu no longer links to settings either.
  await page.getByRole('button', { name: /^View/ }).click();
  await expect(page.getByRole('button', { name: 'All settings…' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // The gear is the one way in.
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: /Settings/ })).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the top bar is one row with Undo, Check and Export, and More holds the rest', async ({ page }) => {
    await newPoster(page);
    const bar = page.locator('.topbar');
    const box = (await bar.boundingBox())!;
    expect(box.height).toBeLessThan(60);
    expect(await bar.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);

    await expect(page.getByRole('button', { name: 'My posters', exact: true })).toBeVisible();
    await expect(page.getByLabel('Poster name')).toBeVisible();
    await expect(page.getByTitle(/^Undo/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Check/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export ▾' })).toBeVisible();
    for (const hidden of ['Notes', 'Find', 'Preview', 'Copy image']) await expect(page.getByRole('button', { name: hidden, exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: 'View ▾' })).toBeHidden();

    // every button sits inside the screen
    for (const b of await bar.locator('button:visible').all()) {
      const r = (await b.boundingBox())!;
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(391);
    }

    await page.getByRole('button', { name: 'More' }).click();
    const menu = page.getByRole('menu');
    for (const item of ['Notes', 'Find and replace', 'Preview', 'Copy image', 'Redo', 'Zoom in', 'Zoom out', 'Fit to screen', 'Poster options…', 'Settings…', 'Keyboard shortcuts', 'Take the tour']) {
      await expect(menu.getByRole('menuitem', { name: item })).toBeVisible();
    }
    await expect(menu.getByRole('menuitem', { name: 'Redo' })).toBeDisabled();
    await menu.getByRole('menuitem', { name: 'Notes' }).click();
    await expect(menu).toBeHidden();
    await expect(page.locator('.notes-panel, [aria-label="Notes"]').first()).toBeVisible();

    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Poster options…' }).click();
    await expect(page.getByRole('menuitem', { name: 'Duplicate this poster' })).toBeVisible();
  });

  test('the Export menu still opens from the phone toolbar', async ({ page }) => {
    await newPoster(page);
    await page.getByRole('button', { name: 'Export ▾' }).click();
    await expect(page.locator('#export-menu')).toBeVisible();
  });
});

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
  await expect(page.locator('.panel.right').getByRole('combobox', { name: 'Size', exact: true })).toBeVisible();
  expect(await clippedFields(page, '.panel.right')).toEqual([]);

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
    for (const item of ['Notes', 'Find and replace', 'Preview', 'Redo', 'Zoom in', 'Zoom out', 'Fit to screen', 'Poster options…', 'Settings…', 'Keyboard shortcuts', 'Take the tour']) {
      await expect(menu.getByRole('menuitem', { name: item })).toBeVisible();
    }
    await expect(menu.getByRole('menuitem', { name: 'Redo' })).toBeDisabled();
    await menu.getByRole('menuitem', { name: 'Notes' }).click();
    await expect(menu).toBeHidden();
    await expect(page.locator('.notes-panel, [aria-label="Notes"]').first()).toBeVisible();

    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Poster options…' }).click();
    await expect(page.getByRole('menuitem', { name: 'Make a copy…' })).toBeVisible();
  });

  test('the Export menu still opens from the phone toolbar', async ({ page }) => {
    await newPoster(page);
    await page.getByRole('button', { name: 'Export ▾' }).click();
    await expect(page.locator('#export-menu')).toBeVisible();
  });
});

test('the Export menu stays open when the pointer drifts off it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await newPoster(page);
  await page.getByRole('button', { name: 'Export ▾' }).click();
  const menu = page.locator('#export-menu');
  const box = (await menu.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 40);
  await page.mouse.move(box.x - 30, box.y + 40);
  await expect(menu).toBeVisible();
  // a click elsewhere still closes it
  await page.locator('.stage').click({ position: { x: 10, y: 10 } });
  await expect(menu).toBeHidden();
});

test('Check sits beside the poster area wherever the side panels are', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await newPoster(page);
  const gapToStage = async () => {
    const [panel, stage] = await Promise.all([page.locator('.check-panel').boundingBox(), page.locator('.stage').boundingBox()]);
    return Math.round(stage!.x + stage!.width - (panel!.x + panel!.width));
  };
  await page.getByRole('button', { name: /^Check/ }).click();
  expect(await gapToStage()).toBe(16);
  // hide both panels: the Check panel follows the poster area's edge instead of floating mid-poster
  await page.keyboard.press('Control+\\');
  await expect(page.locator('.panel.right')).toHaveCount(0);
  await expect.poll(gapToStage).toBe(16);
});

test('one Check button opens the review panel, which switches between Check, Find and Notes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await newPoster(page);
  // the top bar no longer has separate Notes, Find, Copy image or ? buttons
  for (const gone of ['Notes', 'Find', 'Copy image', 'Help']) await expect(page.getByRole('button', { name: gone, exact: true })).toHaveCount(0);
  await expect(page.locator('.topbar')).toHaveJSProperty('scrollWidth', await page.locator('.topbar').evaluate((n) => n.clientWidth));

  await page.getByRole('button', { name: 'Text box', exact: true }).click(); // leaves example text, so Export has a warning
  await page.getByRole('button', { name: /^Check/ }).click();
  const sw = page.locator('.review-switch');
  await expect(page.getByRole('dialog', { name: 'Poster check' })).toBeVisible();
  await sw.getByRole('button', { name: 'Notes' }).click();
  await expect(page.getByRole('dialog', { name: 'Review notes' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Poster check' })).toHaveCount(0);
  // the Check button closes whichever is showing
  await page.getByRole('button', { name: /^Check/ }).click();
  await expect(sw).toHaveCount(0);

  await page.getByRole('button', { name: /^Check/ }).click();
  await sw.getByRole('button', { name: 'Notes' }).click();
  await page.getByRole('button', { name: 'Export ▾' }).click();
  await page.locator('#export-menu .menu-note').click();
  await expect(page.getByRole('dialog', { name: 'Poster check' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Review notes' })).toHaveCount(0);
  await page.keyboard.press('Control+f');
  await expect(page.locator('.find-panel')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Poster check' })).toHaveCount(0);
});

test('Properties shows the whole poster’s settings when nothing is selected', async ({ page }) => {
  await newPoster(page);
  const props = page.getByRole('complementary', { name: 'Properties' });
  await expect(props.getByRole('heading', { name: 'Poster' })).toBeVisible();
  await expect(props.getByRole('tab', { name: 'Layout' })).toHaveAttribute('aria-selected', 'true');
  // the left panel is just for adding things now
  await expect(page.locator('.panel.left').getByRole('tab')).toHaveCount(0);
  await page.getByRole('button', { name: 'Text box', exact: true }).click();
  await expect(props.getByRole('heading', { name: 'Text box' })).toBeVisible();
  await props.getByRole('button', { name: 'Poster settings' }).click();
  await expect(props.getByRole('heading', { name: 'Poster' })).toBeVisible();
});

test('Export keeps each format’s options under it and remembers the PNG quality', async ({ page }) => {
  await newPoster(page);
  await page.getByRole('button', { name: 'Export ▾' }).click();
  const menu = page.locator('#export-menu');
  const names = await menu.locator(':scope > button strong').allTextContents();
  expect(names).toEqual(['PDF', 'PNG image', 'Copy as image', 'PowerPoint (.pptx)', 'Project file (.poster.json)']);
  await menu.getByRole('combobox').last().selectOption('300');
  await page.reload();
  await expect(page.locator('.poster')).toBeVisible();
  await page.getByRole('button', { name: 'Export ▾' }).click();
  await expect(menu.getByRole('combobox').last()).toHaveValue('300');
});

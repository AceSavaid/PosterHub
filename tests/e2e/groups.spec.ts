import { test, expect, type Page } from '@playwright/test';

async function blankPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

const els = (page: Page) => page.locator('.poster > .el');

async function addBoxes(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    await page.getByRole('button', { name: 'Box / panel', exact: true }).click();
    await page.getByLabel('X', { exact: true }).fill(String(50 + i * 220));
    await page.getByLabel('Y', { exact: true }).fill(String(100 + i * 150));
  }
  await expect(els(page)).toHaveCount(n);
}

const rects = (page: Page) =>
  els(page).evaluateAll((list) => list.map((e) => { const h = e as HTMLElement; return { x: h.offsetLeft, y: h.offsetTop, w: h.offsetWidth, h: h.offsetHeight }; }));

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number, modifiers: string[] = []) {
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 });
  await page.mouse.up();
  for (const m of modifiers) await page.keyboard.up(m);
}

test('grouped elements select, move and resize together, and can be ungrouped', async ({ page }) => {
  await blankPoster(page);
  await addBoxes(page, 3);

  // select two and group them with the shortcut
  await els(page).nth(0).click();
  await els(page).nth(1).click({ modifiers: ['Shift'] });
  await page.keyboard.press('ControlOrMeta+g');
  await expect(page.getByRole('heading', { name: 'Group of 2' })).toBeVisible();

  // clicking one member later selects the whole group
  await page.keyboard.press('Escape');
  await els(page).nth(1).click();
  await expect(page.getByRole('heading', { name: 'Group of 2' })).toBeVisible();

  // dragging one member moves both; the third box stays put
  const before = await rects(page);
  const b0 = (await els(page).nth(0).boundingBox())!;
  await page.keyboard.press('Escape');
  await drag(page, { x: b0.x + b0.width / 2, y: b0.y + b0.height / 2 }, 0, 60);
  const moved = await rects(page);
  expect(moved[0].y).toBeGreaterThan(before[0].y);
  expect(moved[1].y - before[1].y).toBeCloseTo(moved[0].y - before[0].y, 0);
  expect(moved[2]).toEqual(before[2]);

  // dragging the group's corner scales both members
  const corner = (await page.getByTestId('group-box').locator('.handle.h-se').boundingBox())!;
  const at = { x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 };
  const hit = await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return `${e?.tagName}.${e?.className}`; }, at);
  await drag(page, at, 60, 40);
  const scaled = await rects(page);
  expect(scaled[0].w, `pressed on ${hit} at ${JSON.stringify(at)}`).toBeGreaterThan(moved[0].w);
  expect(scaled[1].w).toBeGreaterThan(moved[1].w);
  expect(scaled[2]).toEqual(before[2]);

  // Ctrl/⌘-click picks out one member on its own
  await page.keyboard.press('Escape');
  await els(page).nth(1).click({ modifiers: ['ControlOrMeta'] });
  await expect(page.getByRole('heading', { level: 3, name: 'Shape', exact: true })).toBeVisible();

  // duplicating the group makes a separate group
  await els(page).nth(0).click();
  await page.keyboard.press('ControlOrMeta+d');
  await expect(els(page)).toHaveCount(5);
  await expect(page.getByRole('heading', { name: 'Group of 2' })).toBeVisible();

  // ungroup from the right-click menu
  await page.keyboard.press('Escape');
  // (the copy overlaps the original, so click the original's uncovered corner)
  await els(page).nth(0).click({ button: 'right', position: { x: 4, y: 4 } });
  await page.getByRole('menuitem', { name: /^Ungroup/ }).click();
  await page.keyboard.press('Escape');
  await els(page).nth(0).click({ position: { x: 4, y: 4 } });
  await expect(page.getByRole('heading', { level: 3, name: 'Shape', exact: true })).toBeVisible();
});

test('groups survive a reload', async ({ page }) => {
  await blankPoster(page);
  await addBoxes(page, 2);
  await els(page).nth(0).click();
  await els(page).nth(1).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Group', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Group of 2' })).toBeVisible();
  await expect(page.locator('.save-state')).toHaveText('Saved');
  await page.getByRole('button', { name: /My posters/ }).click();
  await expect(page.getByRole('heading', { name: 'My posters' })).toBeVisible();
  await page.goto('/'); // My posters, not the poster's own link (which reopens it by itself)
  await page.locator('.poster-card').first().getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.locator('.poster')).toBeVisible();
  await els(page).nth(0).click();
  await expect(page.getByRole('heading', { name: 'Group of 2' })).toBeVisible();
});

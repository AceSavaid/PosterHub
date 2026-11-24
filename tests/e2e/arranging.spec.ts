import { test, expect, type Page } from '@playwright/test';

// Canva-style arranging: hover outline, spacing guides, centre lines, Tidy up,
// the "+" between sections and double-click into a group.

async function newPoster(page: Page, template = 'Blank') {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: new RegExp('^' + template) }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

const els = (page: Page) => page.locator('.poster > .el');
const field = (page: Page, k: 'X' | 'Y' | 'W' | 'H') => page.getByLabel(k, { exact: true });

/** Adds boxes at the given positions (mm), each 200 × 100 mm. */
async function addBoxes(page: Page, at: [number, number][]) {
  for (const [x, y] of at) {
    await page.getByRole('button', { name: 'Box / panel', exact: true }).click();
    await field(page, 'W').fill('200');
    await field(page, 'H').fill('100');
    await field(page, 'X').fill(String(x));
    await field(page, 'Y').fill(String(y));
  }
  await expect(els(page)).toHaveCount(at.length);
}

/** Screen px per poster mm, from a box we know is 200 mm wide. */
async function pxPerMm(page: Page, i = 0) {
  return (await els(page).nth(i).boundingBox())!.width / 200;
}

async function grab(page: Page, i: number) {
  const b = (await els(page).nth(i).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test('a thin outline shows which box the mouse is over', async ({ page }) => {
  await newPoster(page);
  await addBoxes(page, [[50, 100], [300, 100]]);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('hover-box')).toHaveCount(0);
  const b = (await els(page).nth(0).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.getByTestId('hover-box')).toBeVisible();
  // not on the selected box itself, and gone once the mouse leaves
  await els(page).nth(0).click();
  await expect(page.getByTestId('hover-box')).toHaveCount(0);
  await page.mouse.move(5, 5);
  await expect(page.getByTestId('hover-box')).toHaveCount(0);
});

test('dragging shows the gaps in mm and snaps to match the gap above', async ({ page }) => {
  await newPoster(page);
  // A and B are 40 mm apart; C starts 80 mm under B.
  await addBoxes(page, [[50, 100], [50, 240], [50, 420]]);
  const k = await pxPerMm(page);
  const from = await grab(page, 2);
  // Move C up 38 mm, leaving a 42 mm gap: close enough to snap to 40.
  await page.mouse.move(from.x, from.y - 38 * k, { steps: 8 });
  const marks = page.getByTestId('gap-mark');
  await expect(marks.first()).toBeVisible();
  await expect(page.locator('.gap-mark.match .gap-label').first()).toHaveText('40 mm');
  await page.mouse.up();
  await expect(marks).toHaveCount(0);
  await expect(field(page, 'Y')).toHaveValue('380');

  // Holding Alt turns snapping off, as before
  const again = await grab(page, 2);
  await page.keyboard.down('Alt');
  await page.mouse.move(again.x, again.y + 15 * k, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  expect(Number(await field(page, 'Y').inputValue())).not.toBe(380);
});

test('a labelled line shows when a box is centred on the poster', async ({ page }) => {
  await newPoster(page);
  await addBoxes(page, [[50, 400]]);
  const k = await pxPerMm(page);
  const from = await grab(page, 0);
  // The poster is A0 (841 mm wide), so x = 320.5 centres a 200 mm box; stop 3 mm short.
  await page.mouse.move(from.x + (320.5 - 50 - 3) * k, from.y, { steps: 8 });
  await expect(page.getByTestId('centre-guide').first()).toContainText('Middle of the poster');
  await page.mouse.up();
  await expect(page.getByTestId('centre-guide')).toHaveCount(0);
  await expect(field(page, 'X')).toHaveValue('320.5');
});

test('Tidy up evens out the gaps between the selected boxes', async ({ page }) => {
  await newPoster(page);
  await addBoxes(page, [[50, 100], [50, 240], [50, 420]]);
  await els(page).nth(0).click();
  await els(page).nth(1).click({ modifiers: ['Shift'] });
  await els(page).nth(2).click({ modifiers: ['Shift'] });
  await page.getByTestId('tidy-up').click();
  await expect(page.locator('.toast')).toContainText('40 mm');
  await page.keyboard.press('Escape');
  await els(page).nth(2).click();
  await expect(field(page, 'Y')).toHaveValue('380');
  // and it's one undo step
  await page.keyboard.press('ControlOrMeta+z');
  await expect(field(page, 'Y')).toHaveValue('420');
});

test('double-clicking a group steps inside it to pick one box', async ({ page }) => {
  await newPoster(page);
  await addBoxes(page, [[50, 100], [300, 100]]);
  await els(page).nth(0).click();
  await els(page).nth(1).click({ modifiers: ['Shift'] });
  await page.keyboard.press('ControlOrMeta+g');
  await expect(page.getByRole('heading', { name: 'Group of 2' })).toBeVisible();
  await page.keyboard.press('Escape');

  // one click picks the group, a double-click picks the box under the mouse
  await els(page).nth(1).dblclick();
  await expect(page.getByRole('heading', { level: 3, name: 'Shape', exact: true })).toBeVisible();
  await expect(field(page, 'X')).toHaveValue('300');
  // while inside, clicking the other member picks just that one
  await els(page).nth(0).click();
  await expect(field(page, 'X')).toHaveValue('50');
  // clicking away and back picks the whole group again
  await page.keyboard.press('Escape');
  await els(page).nth(0).click();
  await expect(page.getByRole('heading', { name: 'Group of 2' })).toBeVisible();
});

test('the "+" under a section adds a heading, text and figure slot there', async ({ page }) => {
  await newPoster(page, 'Classic columns');
  const headings = page.locator('.poster > .el-heading');
  const before = await headings.count();
  const plus = page.getByTestId('add-section');
  // the "+" shows next to the section under the mouse, not all over the poster
  await headings.first().hover();
  expect(await plus.count()).toBeLessThan(before);
  await expect(plus.first()).toBeVisible();
  await plus.first().click();
  await expect(page.locator('.toast')).toContainText('Added a section');
  await expect(headings).toHaveCount(before + 1);
  // the new heading is ready to type into
  await expect(page.locator('.poster .el.editing')).toBeVisible();
  await page.keyboard.type('Limitations');
  await page.keyboard.press('Escape');
  await expect(page.locator('.poster > .el-heading', { hasText: 'Limitations' })).toBeVisible();

  // nothing in that column runs off the bottom of the poster
  const bottom = await page.locator('.poster').evaluate((p) => (p as HTMLElement).offsetHeight);
  const lowest = await els(page).evaluateAll((list) => Math.max(...list.map((e) => (e as HTMLElement).offsetTop + (e as HTMLElement).offsetHeight)));
  expect(lowest).toBeLessThanOrEqual(bottom + 1);

  // one undo takes the whole section away again
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(headings).toHaveCount(before);
});

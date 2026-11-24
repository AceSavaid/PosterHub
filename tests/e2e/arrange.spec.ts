import { test, expect, type Page } from '@playwright/test';

async function blankPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

const els = (page: Page) => page.locator('.poster > .el');

/** Adds boxes and spreads them out so they don't overlap. */
async function addBoxes(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    await page.getByRole('button', { name: 'Box / panel', exact: true }).click();
    await page.getByLabel('X', { exact: true }).fill(String(50 + i * 220));
    await page.getByLabel('Y', { exact: true }).fill(String(100 + i * 150));
  }
  await expect(els(page)).toHaveCount(n);
}

async function xs(page: Page) {
  return els(page).evaluateAll((list) => list.map((e) => (e as HTMLElement).offsetLeft));
}

test('shift-click selects several elements, which move and align together', async ({ page }) => {
  await blankPoster(page);
  await addBoxes(page, 3);
  await els(page).nth(0).click();
  await els(page).nth(1).click({ modifiers: ['Shift'] });
  await els(page).nth(2).click({ modifiers: ['Shift'] });
  await expect(page.getByRole('heading', { name: '3 elements selected' })).toBeVisible();

  // move them together with the keyboard
  const before = await xs(page);
  await page.keyboard.press('Shift+ArrowRight');
  const after = await xs(page);
  after.forEach((x, i) => expect(x).toBeGreaterThan(before[i]));

  // and by dragging one of them
  const b = (await els(page).nth(1).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 50, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('heading', { name: '3 elements selected' })).toBeVisible();

  await page.getByRole('button', { name: 'Align left edges' }).click();
  const lefts = await xs(page);
  expect(new Set(lefts).size).toBe(1);

  await page.getByRole('button', { name: 'Space evenly down' }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('Delete');
  await expect(els(page)).toHaveCount(0);
});

test('dragging a box on empty space selects what it touches', async ({ page }) => {
  await blankPoster(page);
  await addBoxes(page, 3);
  const first = (await els(page).nth(0).boundingBox())!;
  const second = (await els(page).nth(1).boundingBox())!;
  await page.mouse.move(first.x - 10, first.y - 10);
  await page.mouse.down();
  await page.mouse.move(second.x + 5, second.y + 5, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole('heading', { name: '2 elements selected' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.getByRole('heading', { name: '3 elements selected' })).toBeVisible();
  // clicking empty space clears the selection
  await page.mouse.click(first.x - 5, first.y - 40);
  await expect(page.getByRole('complementary', { name: 'Properties' }).getByRole('heading', { name: 'Poster' })).toBeVisible();
});

test('centres a single element on the page', async ({ page }) => {
  await blankPoster(page);
  await page.getByRole('button', { name: 'Box / panel', exact: true }).click();
  await page.getByRole('button', { name: 'Align centres (horizontally)' }).click();
  const { left, w, pw } = await page.locator('.poster').evaluate((p: HTMLElement) => {
    const e = p.querySelector(':scope > .el') as HTMLElement;
    return { left: e.offsetLeft, w: e.offsetWidth, pw: p.offsetWidth };
  });
  expect(Math.abs(left + w / 2 - pw / 2)).toBeLessThan(2);
});

test('warns when text does not fit and fixes it', async ({ page }) => {
  await blankPoster(page);
  await page.getByRole('button', { name: 'Text box', exact: true }).click();
  const long = 'This sentence is far too long for the little box. '.repeat(20);
  await page.keyboard.type(long.slice(0, 400));
  await page.keyboard.press('Escape');
  await page.getByLabel('H', { exact: true }).fill('20');
  await expect(page.getByText('Some text is hidden')).toBeVisible();
  await expect(els(page).first()).toHaveAttribute('data-overflow', 'true');

  await page.getByRole('button', { name: 'Shrink text to fit' }).click();
  await expect(page.getByText('Some text is hidden')).toHaveCount(0);
  const size = Number(await page.getByLabel('Size (pt)').inputValue());
  expect(size).toBeLessThan(28);

  await page.getByLabel('Size (pt)').fill('40');
  await expect(page.getByText('Some text is hidden')).toBeVisible();
  await page.getByRole('button', { name: 'Make box taller' }).click();
  await expect(page.getByText('Some text is hidden')).toHaveCount(0);
  expect(Number(await page.getByLabel('H', { exact: true }).inputValue())).toBeGreaterThan(20);
});

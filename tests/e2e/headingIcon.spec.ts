import { test, expect, type Page } from '@playwright/test';

async function classicPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: /^Classic columns/ }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

const methods = (page: Page) => page.locator('.poster > .el-heading', { hasText: /^Methods/ });
const endIcon = (page: Page) => methods(page).locator('.el-heading-icon');

test('adds an icon to the end of a heading, sized and lined up with the text', async ({ page }) => {
  await classicPoster(page);
  await methods(page).click();
  const inspector = page.locator('.panel.right');
  await inspector.getByRole('button', { name: 'Add icon to heading…' }).click();
  await inspector.getByRole('searchbox', { name: 'Search icons for this heading' }).fill('microscope');
  await inspector.getByRole('button', { name: 'Add to heading: Microscope', exact: true }).click();

  await expect(endIcon(page)).toHaveCount(1);
  await expect(inspector.getByRole('heading', { name: 'Icon at the end: Microscope' })).toBeVisible();
  // The picker closes once an icon is chosen.
  await expect(inspector.getByRole('searchbox', { name: 'Search icons for this heading' })).toHaveCount(0);

  const geo = () =>
    methods(page).evaluate((node) => {
      const box = node as HTMLElement;
      const body = box.querySelector<HTMLElement>('.el-body')!;
      const icon = box.querySelector<HTMLElement>('.el-heading-icon')!;
      const cs = getComputedStyle(body);
      const range = document.createRange();
      range.selectNodeContents(body);
      const text = range.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const i = icon.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(box).paddingRight) * (b.width / box.offsetWidth);
      return {
        boxRight: b.right - pad,
        iconRight: i.right,
        iconH: i.height,
        iconMid: i.top + i.height / 2,
        lineMid: text.top + parseFloat(cs.lineHeight) * (b.width / box.offsetWidth) / 2,
        fontPx: parseFloat(cs.fontSize) * (b.width / box.offsetWidth),
        textRight: text.right,
        iconLeft: i.left,
        fill: icon.querySelector('path')!.getAttribute('fill'),
        colour: cs.color,
      };
    });
  const g = await geo();
  expect(Math.abs(g.iconRight - g.boxRight)).toBeLessThan(1); // right-justified
  expect(g.iconH / g.fontPx).toBeGreaterThan(1); // about as tall as the letters
  expect(g.iconH / g.fontPx).toBeLessThan(1.3);
  expect(Math.abs(g.iconMid - g.lineMid)).toBeLessThan(2); // centred on the line
  expect(g.textRight).toBeLessThanOrEqual(g.iconLeft); // the words never run under it
  // It takes the heading's text colour by default.
  const rgb = await page.evaluate((hex) => {
    const d = document.createElement('div');
    d.style.color = hex!;
    document.body.append(d);
    const c = getComputedStyle(d).color;
    d.remove();
    return c;
  }, g.fill);
  expect(rgb).toBe(g.colour);

  // A bigger heading gets a bigger icon.
  await inspector.getByLabel('Size (pt)').first().fill('100');
  await expect.poll(async () => (await geo()).iconH).toBeGreaterThan(g.iconH * 1.3);
  const big = await geo();
  expect(big.iconH / big.fontPx).toBeLessThan(1.3);

  // Its own colour, then back to matching the text.
  await inspector.getByRole('checkbox', { name: 'Same colour as the heading text' }).uncheck();
  await inspector.locator('.heading-icon-section').getByRole('button', { name: 'Accent (follows palette)' }).first().click();
  expect((await geo()).fill).not.toBe(g.fill);
  await inspector.getByRole('checkbox', { name: 'Same colour as the heading text' }).check();
  expect((await geo()).fill).toBe(g.fill);

  // Swap it, then remove it; undo brings it back.
  await inspector.getByRole('button', { name: 'Change icon…' }).click();
  await inspector.getByRole('searchbox', { name: 'Search icons for this heading' }).fill('dna');
  await inspector.getByRole('button', { name: /^Use icon: DNA/ }).first().click();
  await expect(endIcon(page)).toHaveAttribute('data-icon', /dna/);
  await inspector.getByRole('button', { name: 'Remove icon' }).click();
  await expect(endIcon(page)).toHaveCount(0);
  await expect(inspector.getByRole('button', { name: 'Add icon to heading…' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(endIcon(page)).toHaveCount(1);
});

test('a centred heading stays centred with an icon at its end', async ({ page }) => {
  await classicPoster(page);
  await methods(page).click();
  const inspector = page.locator('.panel.right');
  await inspector.getByRole('button', { name: 'Align center' }).click();
  await inspector.getByRole('button', { name: 'Add icon to heading…' }).click();
  await inspector.getByRole('searchbox', { name: 'Search icons for this heading' }).fill('flask');
  await inspector.getByRole('button', { name: 'Add to heading: Flask', exact: true }).click();
  await expect(endIcon(page)).toHaveCount(1);
  const pads = await methods(page).locator('.el-body').evaluate((b) => [getComputedStyle(b).paddingLeft, getComputedStyle(b).paddingRight]);
  expect(parseFloat(pads[0])).toBeGreaterThan(0);
  expect(pads[0]).toBe(pads[1]);
});

test('can place the icon right after the words instead, and it follows the text', async ({ page }) => {
  await classicPoster(page);
  await methods(page).click();
  const inspector = page.locator('.panel.right');
  await inspector.getByRole('button', { name: 'Add icon to heading…' }).click();
  await inspector.getByRole('searchbox', { name: 'Search icons for this heading' }).fill('microscope');
  await inspector.getByRole('button', { name: 'Add to heading: Microscope', exact: true }).click();
  const edge = inspector.getByRole('button', { name: 'At the right edge' });
  const afterWords = inspector.getByRole('button', { name: 'Right after the words' });
  await expect(edge).toHaveAttribute('aria-pressed', 'true');
  await afterWords.click();
  await expect(afterWords).toHaveAttribute('aria-pressed', 'true');
  await expect(endIcon(page)).toHaveAttribute('data-place', 'after');

  const geo = () =>
    methods(page).evaluate((node) => {
      const box = node as HTMLElement;
      const body = box.querySelector<HTMLElement>('.el-body')!;
      const range = document.createRange();
      range.selectNodeContents(body);
      const rects = Array.from(range.getClientRects());
      const last = rects[rects.length - 1];
      const i = box.querySelector<HTMLElement>('.el-heading-icon')!.getBoundingClientRect();
      const font = parseFloat(getComputedStyle(body).fontSize) * (box.getBoundingClientRect().width / box.offsetWidth);
      return { gap: i.left - last.right, mid: i.top + i.height / 2, lineMid: (last.top + last.bottom) / 2, font, lines: new Set(rects.map((r) => Math.round(r.top))).size };
    });
  let g = await geo();
  expect(g.gap).toBeGreaterThan(0);
  expect(g.gap).toBeLessThan(g.font * 0.6); // a small space after the last letter
  expect(Math.abs(g.mid - g.lineMid)).toBeLessThan(2);

  // Retyping the heading moves the icon along with the last word.
  const before = await endIcon(page).boundingBox();
  await methods(page).dblclick();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Methods and materials used here');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await endIcon(page).boundingBox())!.y).toBeGreaterThan(before!.y + 1); // wrapped onto line two
  g = await geo();
  expect(g.lines).toBeGreaterThan(1);
  expect(Math.abs(g.mid - g.lineMid)).toBeLessThan(2); // still on the last line
  expect(g.gap).toBeGreaterThan(0);

  // Back to the right edge.
  await edge.click();
  await expect(endIcon(page)).toHaveAttribute('data-place', 'end');
});

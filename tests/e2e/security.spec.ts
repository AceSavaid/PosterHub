import { test, expect } from '@playwright/test';
import { createPoster, PALETTES, sizeFor, TEMPLATES } from '../../src/model';

declare global {
  interface Window {
    __pwned?: boolean;
  }
}

/** A project file someone could email you, with hidden code in it. */
function boobyTrappedPoster() {
  const p = createPoster({ name: 'Trap', ...sizeFor('A1', 'portrait'), sizePreset: 'A1', columns: 3, palette: PALETTES[0], headingFont: 'Lora', bodyFont: 'Inter', template: TEMPLATES[0].id });
  const text = p.elements.find((e) => e.html)!;
  text.html = 'Innocent title<img src=x onerror="window.__pwned=true"><svg onload="window.__pwned=true"></svg>';
  p.elements.push({ id: 'pic', type: 'image', x: 10, y: 10, w: 20, h: 20, src: 'https://tracker.invalid/pixel.png' } as never);
  p.customFonts = [{ family: 'X', dataUrl: 'x); } * { background: url(https://tracker.invalid/css' }];
  return JSON.stringify({ app: 'posterhub', ...p });
}

test('opening a booby-trapped project file does not run its code or contact other sites', async ({ page }) => {
  const outside: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('tracker.invalid')) outside.push(r.url());
  });
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open ▾' }).click();
  await page.getByRole('menuitem', { name: 'Open project file…' }).click();
  await (await chooser).setFiles({ name: 'trap.poster.json', mimeType: 'application/json', buffer: Buffer.from(boobyTrappedPoster()) });
  await expect(page.getByLabel('Poster name')).toHaveValue('Trap');
  await expect(page.locator('.poster').getByText('Innocent title')).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__pwned ?? false)).toBe(false);
  expect(await page.locator('.poster .el-text img, .poster .el-text svg').count()).toBe(0);
  expect(outside).toEqual([]);

  // Reloading reopens it from the library: still harmless.
  await page.reload();
  await expect(page.locator('.poster').getByText('Innocent title')).toBeVisible();
  expect(await page.evaluate(() => window.__pwned ?? false)).toBe(false);
});

test('the content security policy blocks injected scripts as a second line of defence', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  await page.goto('/');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("object-src 'none'");
  // Normal use causes no policy errors.
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
  await page.waitForTimeout(500);
  expect(violations).toEqual([]);

  // Bypass the HTML cleaning on purpose: the browser still refuses to run the handler.
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.innerHTML = '<img src="data:image/gif;base64,AAAA" onerror="window.__pwned=true">';
    document.body.appendChild(d);
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__pwned ?? false)).toBe(false);
});

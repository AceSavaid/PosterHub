import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// WCAG 2.1 A + AA rules. Every screen the app shows should pass them in both themes.
async function expectNoViolations(page: Page, where: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const report = violations.map((v) => `${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n');
  expect(report, `${where} has accessibility problems`).toBe('');
}

async function openNewPoster(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await expect(page.getByRole('dialog', { name: 'New poster' })).toBeVisible();
}

async function createPoster(page: Page, template = 'Classic columns') {
  await openNewPoster(page);
  await page.getByRole('button', { name: new RegExp('^' + template) }).click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
}

const focused = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim() ?? '');

for (const scheme of ['light', 'dark'] as const) {
  test(`every main screen passes WCAG 2.1 AA checks (${scheme} theme)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await expectNoViolations(page, 'My posters');

    await openNewPoster(page);
    await page.getByRole('button', { name: /^Classic columns/ }).click();
    await expectNoViolations(page, 'New poster dialog');
    await page.getByRole('button', { name: 'Create poster' }).click();
    await expect(page.locator('.poster')).toBeVisible();
    await expectNoViolations(page, 'Editor');

    await page.getByRole('group', { name: /^Section header: Results/ }).click();
    await expectNoViolations(page, 'Editor with a text box selected');
    await page.keyboard.press('Enter');
    await expectNoViolations(page, 'Editor while typing');
    await page.keyboard.press('Escape');

    await page.getByRole('group', { name: /placeholder/ }).first().click();
    await expectNoViolations(page, 'Editor with an image placeholder selected');

    await page.getByRole('button', { name: 'Export ▾' }).click();
    await expectNoViolations(page, 'Export menu');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'View ▾' }).click();
    await expectNoViolations(page, 'View menu');
    await page.keyboard.press('Escape');

    await page.locator('.check-btn:not(.notes-btn)').click();
    await expectNoViolations(page, 'Poster check');
    await page.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: /Graph from CSV/ }).click();
    await expectNoViolations(page, 'Graph dialog');
    await page.getByRole('dialog').locator('textarea').fill('Group,Score\nA,1\nB,2\nC,3');
    await page.getByRole('button', { name: 'Use pasted data' }).click();
    await expectNoViolations(page, 'Graph dialog, second step');
    await page.getByRole('button', { name: 'Cancel' }).click();
    // data was loaded, so closing asks first
    await expectNoViolations(page, 'Discard changes question');
    await page.getByRole('button', { name: 'Discard changes' }).click();

    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expectNoViolations(page, 'View mode');
  });
}

test('dialogs take focus, keep Tab inside, close on Escape and hand focus back', async ({ page }) => {
  await page.goto('/');
  const opener = page.getByRole('button', { name: '+ New poster' }).first();
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'New poster' });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByLabel('Name')).toBeFocused();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  await createPoster(page, 'Blank');
  const graph = page.getByRole('button', { name: /Graph from CSV/ });
  await graph.click();
  const chart = page.getByRole('dialog', { name: 'Graph from CSV' });
  await expect(chart).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(chart).toBeHidden();
  await expect(graph).toBeFocused();
});

test('the Export menu reports its state and closes with Escape', async ({ page }) => {
  await createPoster(page, 'Blank');
  const btn = page.getByRole('button', { name: 'Export ▾' });
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('group', { name: 'Export' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'Export' })).toBeHidden();
  await expect(btn).toBeFocused();
});

test('a poster can be edited with the keyboard alone', async ({ page }) => {
  await createPoster(page);
  const elements = page.locator('.poster > .el');

  // Tab from the last Insert button reaches the poster's elements, each with a spoken name.
  await page.getByRole('button', { name: 'Star', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(elements.first()).toBeFocused();
  let label = '';
  for (let i = 0; i < 20 && !label.startsWith('Section header: Results'); i++) {
    await page.keyboard.press('Tab');
    label = await focused(page);
  }
  expect(label).toMatch(/^Section header: Results/);
  const results = page.getByRole('group', { name: /^Section header: Results/ });
  // focus selects it, so the Properties panel follows
  await expect(results).toHaveAttribute('aria-label', /, selected$/);
  await expect(page.getByRole('complementary', { name: 'Properties' }).getByRole('heading', { name: 'Section header' })).toBeVisible();

  // arrows nudge it by 1 mm
  const x0 = await page.getByLabel('X', { exact: true }).inputValue();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('X', { exact: true })).toHaveValue(String(Math.round((+x0 + 1) * 10) / 10));

  // Enter edits the text, Escape finishes and returns focus to the element
  await page.keyboard.press('Enter');
  const box = page.getByRole('textbox', { name: /Editing section header/ });
  await expect(box).toBeFocused();
  await page.keyboard.type('Findings');
  await page.keyboard.press('Escape');
  const renamed = page.getByRole('group', { name: /^Section header: Findings/ });
  await expect(renamed).toBeFocused();

  // Shift+F10 opens the actions menu; arrows move through it; Escape closes it and returns focus
  await page.keyboard.press('Shift+F10');
  const menu = page.getByRole('menu', { name: 'Actions' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Edit text/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: /^Copy/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(renamed).toBeFocused();
  await expect(renamed).toHaveAttribute('aria-label', /, selected$/); // Escape only closed the menu

  // Delete removes the focused element
  const before = await elements.count();
  await page.keyboard.press('Delete');
  await expect(elements).toHaveCount(before - 1);
});

test('Enter on an empty graph placeholder opens the graph dialog', async ({ page }) => {
  await createPoster(page, 'Blank');
  await page.getByRole('button', { name: /Graph from CSV/ }).click();
  await page.getByRole('dialog').locator('textarea').fill('Group,Score\nA,1\nB,2\nC,3');
  await page.getByRole('button', { name: 'Use pasted data' }).click();
  await page.getByRole('button', { name: 'Add graph to poster' }).click();
  const g = page.getByRole('group', { name: /^Graph/ });
  await g.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Edit graph' })).toBeVisible();
});

test('images and graphs take a description that screen readers read out', async ({ page }) => {
  await createPoster(page);
  await page.getByRole('group', { name: /placeholder/ }).first().click();
  await page.getByLabel('Description (alt text)').fill('Map of the study sites');
  await expect(page.getByLabel('Description (alt text)')).toHaveValue('Map of the study sites');
});

test('selected options are announced, not just coloured', async ({ page }) => {
  await createPoster(page);
  await page.getByRole('group', { name: /^Section header: Results/ }).click();
  const props = page.getByRole('complementary', { name: 'Properties' });
  expect(await props.locator('.swatch[aria-pressed="true"]').count()).toBeGreaterThan(0);

  const tabs = page.getByRole('tablist', { name: 'Tools' });
  await expect(tabs.getByRole('tab', { name: 'Insert' })).toHaveAttribute('aria-selected', 'true');
  await tabs.getByRole('tab', { name: 'Insert' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Layout' })).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.getByRole('tab', { name: 'Layout' })).toBeFocused();
  await expect(page.getByRole('group', { name: 'Number of columns' }).getByRole('button', { name: '3' })).toHaveAttribute('aria-pressed', 'true');
});

test('messages are announced to screen readers', async ({ page }) => {
  await createPoster(page, 'Blank');
  await page.keyboard.press('Control+s');
  await expect(page.getByRole('status').filter({ hasText: 'Saved to My posters.' })).toHaveCount(1);
});

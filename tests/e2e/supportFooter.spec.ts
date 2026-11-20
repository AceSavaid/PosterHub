import { test, expect } from '@playwright/test';

test('My posters has a subtle footer with a Buy me a coffee link', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  await expect(footer).toContainText('Made by a procrastinating uni student');

  const link = footer.getByRole('link', { name: /Buy me a coffee/ });
  await expect(link).toHaveAttribute('href', 'https://buymeacoffee.com/acesavaid');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  await expect(link).toHaveAccessibleName(/opens in a new tab/);

  // Clicking opens the page in a new tab and leaves PosterHub where it was.
  await page.context().route('https://buymeacoffee.com/**', (r) => r.fulfill({ body: 'ok' }));
  const [popup] = await Promise.all([page.waitForEvent('popup'), link.click()]);
  expect(popup.url()).toBe('https://buymeacoffee.com/acesavaid');
  await expect(page.getByRole('heading', { name: 'My posters' })).toBeVisible();

  // No Buy Me a Coffee script or widget is loaded on the page itself.
  expect(requests.filter((u) => u.includes('buymeacoffee') && !u.startsWith('https://buymeacoffee.com/acesavaid'))).toEqual([]);
});

test('the footer stays out of the way in the editor', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New poster' }).first().click();
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.locator('.poster')).toBeVisible();
  await expect(page.getByText('Made by a procrastinating uni student')).toHaveCount(0);
});

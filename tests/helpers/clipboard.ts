import type { BrowserContext } from '@playwright/test';

/**
 * Lets the page read what it copied. Each browser names this differently:
 * Chromium needs both permissions, WebKit only knows `clipboard-read`, and
 * Firefox has no clipboard permissions (the config turns on its test switch instead).
 */
export async function allowClipboard(context: BrowserContext, browserName: string) {
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  else if (browserName === 'webkit') await context.grantPermissions(['clipboard-read']);
}

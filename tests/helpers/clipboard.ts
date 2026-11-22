import { expect, type BrowserContext, type Page } from '@playwright/test';

/**
 * Lets the page copy to the clipboard. Each browser names this differently:
 * Chromium needs `clipboard-write`, while WebKit and Firefox allow a copy after a click anyway.
 */
export async function allowClipboard(context: BrowserContext, browserName: string) {
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
}

/**
 * Records what the page writes with navigator.clipboard.write, then lets the real write go ahead.
 * Headless WebKit and Firefox can't read the system clipboard back, so tests check what was written.
 * Call before the page loads (it applies from the next navigation).
 */
export async function recordClipboard(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __copied: { type: string; base64: string }[] };
    w.__copied = [];
    const clip = navigator.clipboard;
    if (!clip?.write) return;
    const original = clip.write.bind(clip);
    clip.write = (items: ClipboardItem[]) => {
      const done = original(items);
      for (const item of items)
        for (const type of item.types)
          void item.getType(type).then(async (blob) => {
            let s = '';
            new Uint8Array(await blob.arrayBuffer()).forEach((b) => (s += String.fromCharCode(b)));
            w.__copied.push({ type, base64: btoa(s) });
          });
      return done;
    };
  });
}

/** The last PNG the page copied (needs recordClipboard). */
export async function copiedPng(page: Page): Promise<Buffer> {
  const read = () => page.evaluate(() => (window as unknown as { __copied: { type: string; base64: string }[] }).__copied.filter((c) => c.type === 'image/png').pop()?.base64 ?? '');
  await expect.poll(read).not.toBe('');
  return Buffer.from(await read(), 'base64');
}

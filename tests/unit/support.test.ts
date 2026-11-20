import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BMC_URL, BMC_USERNAME } from '../../src/lib/support';

describe('Buy me a coffee link', () => {
  it('builds the page URL from the username', () => {
    expect(BMC_URL).toBe(`https://buymeacoffee.com/${BMC_USERNAME}`);
    expect(() => new URL(BMC_URL)).not.toThrow();
  });

  it('is the only web page the desktop app may open, so the two stay in sync', () => {
    const file = path.join(import.meta.dirname, '..', '..', 'src-tauri', 'capabilities', 'default.json');
    const caps = JSON.parse(fs.readFileSync(file, 'utf8'));
    const rule = caps.permissions.find((p: unknown) => typeof p === 'object' && (p as { identifier: string }).identifier === 'opener:allow-open-url');
    expect(rule.allow).toEqual([{ url: BMC_URL }]);
  });
});

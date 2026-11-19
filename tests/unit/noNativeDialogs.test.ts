import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The desktop app's macOS web view silently ignores alert / confirm / prompt,
// so the app must use its own dialogs (src/lib/dialogs.tsx) everywhere.
describe('no browser pop-ups', () => {
  it('does not call alert, confirm or prompt anywhere in src', () => {
    const root = path.join(import.meta.dirname, '..', '..', 'src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) {
          fs.readFileSync(p, 'utf8')
            .split('\n')
            .forEach((line, i) => {
              if (/(^|[^\w.])(window\.)?(alert|confirm|prompt)\s*\(/.test(line)) offenders.push(`${path.relative(root, p)}:${i + 1}: ${line.trim()}`);
            });
        }
      }
    };
    walk(root);
    expect(offenders, 'Use askConfirm / askText / tell from src/lib/dialogs.tsx instead').toEqual([]);
  });
});

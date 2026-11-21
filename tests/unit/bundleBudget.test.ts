import { describe, expect, it } from 'vitest';
import { BUDGETS, measure, staticClosure, type ChunkInfo } from '../../budget/plugin';

const chunk = (fileName: string, kb: number, imports: string[] = [], extra: Partial<ChunkInfo> = {}): ChunkInfo => ({
  fileName,
  code: 'x'.repeat(kb * 1000),
  isEntry: false,
  imports,
  ...extra,
});

describe('bundle budget', () => {
  it('follows static imports but not dynamic ones', () => {
    const chunks = new Map([chunk('a', 1, ['b']), chunk('b', 1, ['c']), chunk('c', 1), chunk('lazy', 1)].map((c) => [c.fileName, c]));
    expect([...staticClosure(chunks, ['a'])].sort()).toEqual(['a', 'b', 'c']);
  });

  it('counts first load and what opening the editor adds, without double counting shared chunks', () => {
    const r = measure([
      chunk('index.js', 200, ['react.js'], { isEntry: true }),
      chunk('react.js', 50),
      chunk('Editor.js', 100, ['react.js', 'surface.js'], { facadeModuleId: '/repo/src/components/Editor.tsx' }),
      chunk('surface.js', 30),
      chunk('chart.js', 200),
    ]);
    expect(r.initialKb).toBe(250);
    expect(r.editorKb).toBe(130);
    expect(r.editorFiles).toEqual(['Editor.js', 'surface.js']);
    expect(r.problems).toEqual([]);
  });

  it('names the largest files when a budget is broken', () => {
    const r = measure(
      [chunk('index.js', 10, ['big.js'], { isEntry: true }), chunk('big.js', 500), chunk('Editor.js', 5, [], { facadeModuleId: 'C:\\repo\\src\\components\\Editor.tsx' })],
      { initialKb: 100, editorKb: 100 },
    );
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/First load needs 510 kB.*budget 100 kB.*big\.js 500 kB/);
  });

  it('complains if the editor stops being lazy loaded', () => {
    const r = measure([chunk('index.js', 10, [], { isEntry: true })]);
    expect(r.problems[0]).toMatch(/editor is no longer a separate chunk/);
  });

  it('keeps first load well under the 1 MB it used to be', () => {
    expect(BUDGETS.initialKb).toBeLessThan(500);
  });
});

// Keeps first load fast: fails the build when the JavaScript needed to show My posters,
// or the extra JavaScript needed to open the editor, grows past a budget. Heavy, rarely
// used features (PowerPoint and Word import, charts, references, PDF and PowerPoint
// export, equations, icons) belong behind dynamic import() so they stay out of both.
import type { Plugin } from 'vite';

/** Raw (minified, not gzipped) kilobytes, measured at build time. Raise only with a good reason. */
export const BUDGETS = {
  /** Everything the browser downloads before My posters appears. Was 1,024 kB before lazy loading (340 kB after). */
  initialKb: 360,
  /** What opening a poster adds on top of that, without charts, equations or dialogs (276 kB when added). */
  editorKb: 300,
};

/** Just the parts of a Rollup/Rolldown output chunk this check reads. */
export interface ChunkInfo {
  fileName: string;
  code: string;
  isEntry: boolean;
  imports: string[];
  facadeModuleId?: string | null;
}

/** `start` plus every chunk it statically imports, directly or indirectly. */
export function staticClosure(chunks: Map<string, ChunkInfo>, start: string[]): Set<string> {
  const seen = new Set<string>();
  const todo = [...start];
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f) || !chunks.has(f)) continue;
    seen.add(f);
    todo.push(...chunks.get(f)!.imports);
  }
  return seen;
}

const kb = (chunks: Map<string, ChunkInfo>, files: Iterable<string>) => {
  let bytes = 0;
  for (const f of files) bytes += Buffer.byteLength(chunks.get(f)!.code);
  return bytes / 1000;
};

export interface BudgetReport {
  initialKb: number;
  editorKb: number;
  initialFiles: string[];
  editorFiles: string[];
  problems: string[];
}

/** Measures the first-load and open-the-editor downloads and lists any budget they break. */
export function measure(list: ChunkInfo[], budgets = BUDGETS): BudgetReport {
  const chunks = new Map(list.map((c) => [c.fileName, c]));
  const entries = list.filter((c) => c.isEntry).map((c) => c.fileName);
  const initial = staticClosure(chunks, entries);
  const editorChunk = list.find((c) => c.facadeModuleId?.replace(/\\/g, '/').endsWith('/src/components/Editor.tsx'));
  const problems: string[] = [];
  if (!editorChunk) problems.push('The editor is no longer a separate chunk: load it with lazy(() => import(...)) in App.tsx.');
  const editor = new Set([...staticClosure(chunks, editorChunk ? [editorChunk.fileName] : [])].filter((f) => !initial.has(f)));
  const report = { initialKb: kb(chunks, initial), editorKb: kb(chunks, editor), initialFiles: [...initial].sort(), editorFiles: [...editor].sort(), problems };
  const top = (files: Set<string>) =>
    [...files]
      .map((f) => [f, kb(chunks, [f])] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([f, k]) => `${f} ${Math.round(k)} kB`)
      .join(', ');
  if (report.initialKb > budgets.initialKb)
    problems.push(`First load needs ${Math.round(report.initialKb)} kB of JavaScript (budget ${budgets.initialKb} kB). Largest: ${top(initial)}.`);
  if (report.editorKb > budgets.editorKb)
    problems.push(`Opening the editor adds ${Math.round(report.editorKb)} kB of JavaScript (budget ${budgets.editorKb} kB). Largest: ${top(editor)}.`);
  return report;
}

export function bundleBudgetPlugin(): Plugin {
  return {
    name: 'posterhub-bundle-budget',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks: ChunkInfo[] = [];
      for (const out of Object.values(bundle)) if (out.type === 'chunk') chunks.push(out);
      const r = measure(chunks);
      this.info(`first load ${Math.round(r.initialKb)} kB, opening the editor adds ${Math.round(r.editorKb)} kB`);
      if (r.problems.length) this.error(`Bundle budget exceeded.\n${r.problems.join('\n')}\nMove rarely used code behind import() (see budget/plugin.ts).`);
    },
  };
}

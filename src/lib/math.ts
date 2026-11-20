// LaTeX equations: loading the typesetter, caching results and laying an
// equation out inside its box. Shared by the editor view and every exporter
// so the poster, PDF, PNG and PowerPoint all place maths the same way.

export interface MathRender {
  /** SVG markup inside the <svg> element (paths in 1/1000 em units). */
  inner: string;
  /** [minX, minY, width, height] of the SVG viewBox. */
  viewBox: [number, number, number, number];
  /** Size in em (multiply by the font size). */
  width: number;
  height: number;
  /** How far the maths reaches below the baseline, in em. */
  depth: number;
  /** True if some characters are drawn as font text rather than outlines. */
  hasText: boolean;
}

export type MathResult = { ok: true; render: MathRender } | { ok: false; error: string };

type Engine = typeof import('./mathEngine');

let engine: Engine | null = null;
let loading: Promise<Engine> | null = null;
const cache = new Map<string, MathResult>();
const CACHE_MAX = 300;

/** Loads the typesetter (once). Resolves when `typesetLatex` can be used. */
export function loadMath(): Promise<void> {
  if (engine) return Promise.resolve();
  loading ??= import('./mathEngine').then((m) => (engine = m));
  return loading.then(() => undefined);
}

export const mathReady = () => engine != null;

/** Typesets LaTeX (display style). `loadMath()` must have finished first. */
export function typesetLatex(latex: string): MathResult {
  const src = cleanLatex(latex);
  const hit = cache.get(src);
  if (hit) return hit;
  if (!engine) throw new Error('The equation typesetter has not loaded yet.');
  let res: MathResult;
  if (!src) res = { ok: false, error: 'Type an equation, for example E = mc^2' };
  else {
    try {
      res = { ok: true, render: engine.typeset(src) };
    } catch (err) {
      res = { ok: false, error: friendlyError(String((err as { message?: unknown })?.message ?? err)) };
    }
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(src, res);
  return res;
}

/** Strips surrounding $…$, $$…$$, \[…\] or \(…\) that people often paste in. */
export function cleanLatex(latex: string): string {
  let s = latex.trim();
  const pairs: [string, string][] = [
    ['$$', '$$'],
    ['\\[', '\\]'],
    ['\\(', '\\)'],
    ['$', '$'],
  ];
  for (const [a, b] of pairs) {
    if (s.length >= a.length + b.length && s.startsWith(a) && s.endsWith(b)) {
      const inner = s.slice(a.length, s.length - b.length);
      // "$a$ + $b$" is two pieces, not one wrapped equation.
      if (a.startsWith('$') && /(^|[^\\])\$/.test(inner)) break;
      s = inner.trim();
      break;
    }
  }
  return s;
}

function friendlyError(msg: string): string {
  if (/Undefined control sequence (\\\w+)/.test(msg)) return msg.replace(/Undefined control sequence/, 'Unknown command');
  return msg;
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** A standalone SVG document for a rendered equation, coloured and sized in px. */
export function mathSvg(r: MathRender, color: string, widthPx: number, heightPx: number): string {
  const inner = r.inner.replace(/currentColor/g, escapeAttr(color));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r.viewBox.join(' ')}" width="${round(widthPx)}" height="${round(heightPx)}" ` +
    `fill="${escapeAttr(color)}" stroke="${escapeAttr(color)}">${inner}</svg>`
  );
}

export const svgDataUrl = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

const round = (n: number) => Math.round(n * 1000) / 1000;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where an equation sits inside its content box (all in px): at its font
 * size, aligned horizontally and centred vertically, and shrunk only if it
 * would not otherwise fit.
 */
export function layoutEquation(r: Pick<MathRender, 'width' | 'height'>, fontPx: number, box: Box, align: 'left' | 'center' | 'right') {
  const nw = r.width * fontPx;
  const nh = r.height * fontPx;
  const scale = nw > 0 && nh > 0 ? Math.min(1, box.w / nw, box.h / nh) : 1;
  const w = nw * Math.max(0, scale);
  const h = nh * Math.max(0, scale);
  const x = align === 'left' ? box.x : align === 'right' ? box.x + box.w - w : box.x + (box.w - w) / 2;
  const y = box.y + (box.h - h) / 2;
  return { x, y, w, h, scale };
}

/** The box size (mm) that fits an equation at its font size, plus padding and border (mm / pt). */
export function equationBoxSize(r: Pick<MathRender, 'width' | 'height'>, fontSizePt: number, padding: number, borderPt: number) {
  const mmPerEm = (fontSizePt / 72) * 25.4;
  const inset = 2 * padding + 2 * (borderPt / 72) * 25.4;
  return { w: r.width * mmPerEm + inset, h: r.height * mmPerEm + inset };
}

/** px per pt */
export const PT_TO_PX = 96 / 72;

/** Starting LaTeX snippets for the equation editor's quick-insert buttons. `|` marks where the cursor goes. */
export const SNIPPETS: { label: string; title: string; tex: string }[] = [
  { label: 'a/b', title: 'Fraction', tex: '\\frac{|}{}' },
  { label: 'x²', title: 'Superscript (power)', tex: '^{|}' },
  { label: 'x₂', title: 'Subscript', tex: '_{|}' },
  { label: '√', title: 'Square root', tex: '\\sqrt{|}' },
  { label: 'Σ', title: 'Sum', tex: '\\sum_{i=1}^{n} |' },
  { label: '∫', title: 'Integral', tex: '\\int_{a}^{b} | \\, dx' },
  { label: 'x̄', title: 'Mean (bar)', tex: '\\bar{|}' },
  { label: 'x̂', title: 'Estimate (hat)', tex: '\\hat{|}' },
  { label: '±', title: 'Plus or minus', tex: '\\pm |' },
  { label: '×', title: 'Times', tex: '\\times |' },
  { label: '≤', title: 'Less than or equal', tex: '\\leq |' },
  { label: '≥', title: 'Greater than or equal', tex: '\\geq |' },
  { label: '≈', title: 'Approximately', tex: '\\approx |' },
  { label: '→', title: 'Arrow', tex: '\\rightarrow |' },
  { label: '∞', title: 'Infinity', tex: '\\infty|' },
  { label: 'α', title: 'alpha', tex: '\\alpha|' },
  { label: 'β', title: 'beta', tex: '\\beta|' },
  { label: 'μ', title: 'mu', tex: '\\mu|' },
  { label: 'σ', title: 'sigma', tex: '\\sigma|' },
  { label: 'Δ', title: 'Delta', tex: '\\Delta|' },
  { label: '( )', title: 'Brackets that grow', tex: '\\left( | \\right)' },
  { label: '[⋮]', title: 'Matrix', tex: '\\begin{pmatrix} | & b \\\\ c & d \\end{pmatrix}' },
  { label: 'abc', title: 'Ordinary words', tex: '\\text{|}' },
];

/**
 * Inserts a snippet into `text` at the selection, returning the new text and
 * caret position. Selected text goes where `|` is; the caret then moves to
 * the next empty {} (e.g. a fraction's denominator), or after the selection.
 */
export function insertSnippet(text: string, start: number, end: number, snippet: string): { text: string; caret: number } {
  const at = snippet.indexOf('|');
  const selected = text.slice(start, end);
  const clean = snippet.replace('|', selected);
  let caret = start + (at >= 0 ? at + selected.length : clean.length);
  if (selected && at >= 0) {
    const next = clean.indexOf('{}', at + selected.length);
    if (next >= 0) caret = start + next + 1;
  }
  return { text: text.slice(0, start) + clean + text.slice(end), caret };
}

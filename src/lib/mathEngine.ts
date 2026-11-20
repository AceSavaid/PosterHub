// The LaTeX typesetter: MathJax's TeX input and SVG output, bundled with the
// app so equations work offline. This module is large, so it is only loaded
// (via `loadMath` in ./math) once a poster actually needs maths.
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
import type { MathRender } from './math';

// Packages that load code at runtime, or add HTML attributes, links or
// classes, are left out: they are not needed for poster maths. So are the
// ones that hide mistakes, so the editor can point them out.
const EXCLUDED = new Set(['html', 'require', 'autoload', 'setoptions', 'bussproofs', 'unicode', 'noerrors', 'noundefined']);

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const doc = mathjax.document('', {
  InputJax: new TeX({
    packages: AllPackages.filter((p: string) => !EXCLUDED.has(p)),
    // Report mistakes to the editor instead of drawing a red error box.
    formatError: (_jax: unknown, err: Error) => {
      throw err;
    },
  }),
  // Inline every glyph path (no <use> references) so each SVG stands alone.
  OutputJax: new SVG({ fontCache: 'none' }),
});

/** Typesets display-style LaTeX. Throws an Error with a readable message on a mistake. */
export function typeset(latex: string): MathRender {
  const node = doc.convert(latex, { display: true });
  const svg = adaptor.firstChild(node) as never;
  const vb = String(adaptor.getAttribute(svg, 'viewBox') ?? '0 0 0 0')
    .split(/[\s,]+/)
    .map(Number);
  const [minX, minY, w, h] = vb;
  const inner = adaptor.innerHTML(svg);
  // The SVG output works in units of 1/1000 em; the baseline is y = 0.
  return {
    inner,
    viewBox: [minX, minY, w, h],
    width: w / 1000,
    height: h / 1000,
    depth: Math.max(0, (minY + h) / 1000),
    hasText: /<text[\s>]/.test(inner),
  };
}

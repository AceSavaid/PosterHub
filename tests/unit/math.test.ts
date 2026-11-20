import { beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { cleanLatex, equationBoxSize, insertSnippet, layoutEquation, loadMath, mathSvg, typesetLatex, SNIPPETS } from '../../src/lib/math';
import { drawSvgMarkup, parsePathData, parseTransform, tracePath } from '../../src/lib/pdf/svgDraw';
import { Painter } from '../../src/lib/pdf/painter';
import { equationImage } from '../../src/lib/exporters';
import { checkPoster } from '../../src/lib/checks';
import { createPoster, makeElement, PALETTES } from '../../src/model';

beforeAll(async () => {
  await loadMath();
}, 30_000);

function poster() {
  return createPoster({ name: 'Maths', width: 841, height: 1189, sizePreset: 'A0', columns: 3, palette: PALETTES[0], headingFont: 'Montserrat', bodyFont: 'Open Sans', template: 'blank' as never });
}

describe('LaTeX clean-up', () => {
  it('removes $…$, $$…$$, \\[…\\] and \\(…\\) wrappers people paste in', () => {
    expect(cleanLatex('  E = mc^2 ')).toBe('E = mc^2');
    expect(cleanLatex('$E = mc^2$')).toBe('E = mc^2');
    expect(cleanLatex('$$\\frac{a}{b}$$')).toBe('\\frac{a}{b}');
    expect(cleanLatex('\\[ x^2 \\]')).toBe('x^2');
    expect(cleanLatex('\\(y\\)')).toBe('y');
  });
  it('leaves two separate $ pieces alone', () => {
    expect(cleanLatex('$a$ + $b$')).toBe('$a$ + $b$');
  });
});

describe('typesetting', () => {
  it('turns LaTeX into vector paths with a size in em', () => {
    const res = typesetLatex('E = mc^2');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.render.inner).toContain('<path');
    expect(res.render.inner).not.toContain('<use'); // every glyph inline, no shared defs
    expect(res.render.hasText).toBe(false);
    expect(res.render.width).toBeGreaterThan(3);
    expect(res.render.width).toBeLessThan(6);
    expect(res.render.height).toBeGreaterThan(0.7);
  });

  it('handles fractions, roots, sums, matrices and Greek letters', () => {
    for (const tex of ['\\frac{a}{b}', 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', '\\sum_{i=1}^n x_i', '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}', '\\alpha + \\beta = \\gamma', '\\text{rate} \\approx 5\\%']) {
      const res = typesetLatex(tex);
      expect(res.ok, tex).toBe(true);
    }
    const frac = typesetLatex('\\frac{a}{b}');
    const flat = typesetLatex('a');
    if (frac.ok && flat.ok) expect(frac.render.height).toBeGreaterThan(flat.render.height * 1.5);
  });

  it('reports mistakes in plain words instead of drawing an error box', () => {
    const missing = typesetLatex('\\frac{a');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toMatch(/brace/i);
    const unknown = typesetLatex('\\notacommand x');
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error).toContain('Unknown command \\notacommand');
    const empty = typesetLatex('   ');
    expect(empty.ok).toBe(false);
  });

  it('does not allow HTML extensions such as \\href or \\class', () => {
    const res = typesetLatex('\\class{x}{y}');
    expect(res.ok).toBe(false);
  });

  it('builds a coloured, sized standalone SVG', () => {
    const res = typesetLatex('x^2');
    if (!res.ok) throw new Error(res.error);
    const svg = mathSvg(res.render, '#123456', 100, 50);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(svg).toContain('width="100"');
    expect(svg).toContain('#123456');
    expect(svg).not.toContain('currentColor');
    expect(svg).not.toContain('style=');
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(parsed.getElementsByTagName('parsererror').length).toBe(0);
  });

  it('keeps colours from \\color', () => {
    const res = typesetLatex('\\color{red}{x}');
    if (!res.ok) throw new Error(res.error);
    expect(res.render.inner).toContain('red');
  });
});

describe('layout', () => {
  const r = { width: 4, height: 1 };
  it('sits at its font size, centred, when it fits', () => {
    const at = layoutEquation(r, 20, { x: 10, y: 10, w: 200, h: 100 }, 'center');
    expect(at).toMatchObject({ w: 80, h: 20, scale: 1, x: 70, y: 50 });
  });
  it('aligns left and right', () => {
    expect(layoutEquation(r, 20, { x: 10, y: 0, w: 200, h: 100 }, 'left').x).toBe(10);
    expect(layoutEquation(r, 20, { x: 10, y: 0, w: 200, h: 100 }, 'right').x).toBe(130);
  });
  it('shrinks to fit a box that is too small, keeping its shape', () => {
    const at = layoutEquation(r, 20, { x: 0, y: 0, w: 40, h: 100 }, 'center');
    expect(at.scale).toBe(0.5);
    expect(at.w).toBe(40);
    expect(at.h).toBe(10);
  });
  it('works out the box size that fits an equation', () => {
    // 1 em at 72 pt is one inch.
    const need = equationBoxSize({ width: 2, height: 1 }, 72, 5, 0);
    expect(need.w).toBeCloseTo(2 * 25.4 + 10);
    expect(need.h).toBeCloseTo(25.4 + 10);
  });
});

describe('quick-insert snippets', () => {
  it('wraps the selection and moves the caret to the next empty braces', () => {
    const r = insertSnippet('x + ab', 4, 6, '\\frac{|}{}');
    expect(r.text).toBe('x + \\frac{ab}{}');
    expect(r.caret).toBe('x + \\frac{ab}{'.length);
    const sq = insertSnippet('ab', 0, 2, '\\sqrt{|}');
    expect(sq.caret).toBe('\\sqrt{ab'.length);
  });
  it('inserts at the caret with nothing selected', () => {
    const r = insertSnippet('a', 1, 1, '^{|}');
    expect(r.text).toBe('a^{}');
    expect(r.caret).toBe(3);
  });
  it('every snippet is valid LaTeX', () => {
    for (const s of SNIPPETS) {
      const tex = insertSnippet('', 0, 0, s.tex).text.replace(/\{\}/g, '{x}');
      expect(typesetLatex('a ' + tex + ' b').ok, s.title).toBe(true);
    }
  });
});

describe('SVG to PDF paths', () => {
  it('parses transforms', () => {
    expect(parseTransform('translate(10,20)')).toEqual([1, 0, 0, 1, 10, 20]);
    expect(parseTransform('scale(2)')).toEqual([2, 0, 0, 2, 0, 0]);
    expect(parseTransform('translate(10 20) scale(1,-1)')).toEqual([1, 0, 0, -1, 10, 20]);
    expect(parseTransform('matrix(1 2 3 4 5 6)')).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('parses path data including packed numbers', () => {
    expect(parsePathData('M10-5L.5.5Z')).toEqual([
      { cmd: 'M', args: [10, -5] },
      { cmd: 'L', args: [0.5, 0.5] },
      { cmd: 'Z', args: [] },
    ]);
  });

  async function painter() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    return new Painter(doc, page);
  }
  const names = (p: Painter) => p.ops.map((o) => o.toString().trim().split(/\s+/).pop());

  it('turns quadratic and relative commands into absolute PDF curves', async () => {
    const p = await painter();
    expect(tracePath(p, 'M0 0Q10 10 20 0T40 0l5 5h5v5H0V0z', [1, 0, 0, 1, 0, 0])).toBe(true);
    expect(names(p)).toEqual(['m', 'c', 'c', 'l', 'l', 'l', 'l', 'l', 'h']);
    // Q (10,10) from (0,0) to (20,0): cubic control points at 2/3 of the way to the quad control.
    expect(p.ops[1].toString()).toContain('6.6667 6.6667 13.3333 6.6667 20 0');
    // T reflects the control point: (30,-10).
    expect(p.ops[2].toString()).toContain('26.6667 -6.6667 33.3333 -6.6667 40 0');
  });

  it('draws a typeset equation as filled vector paths, with no text or images', async () => {
    const res = typesetLatex('\\frac{a}{b} = c');
    if (!res.ok) throw new Error(res.error);
    const p = await painter();
    const out = drawSvgMarkup(p, res.render.inner, [0.01, 0, 0, 0.01, 0, 0], { r: 0, g: 0, b: 0, a: 1 });
    expect(out.complete).toBe(true);
    const ops = names(p);
    expect(ops.filter((o) => o === 'f').length).toBeGreaterThanOrEqual(4); // a, b, =, c and the fraction bar
    expect(ops).not.toContain('Tj');
    expect(ops).not.toContain('Do');
  });

  it('reports artwork it cannot draw', async () => {
    const p = await painter();
    expect(drawSvgMarkup(p, '<text>hi</text>', [1, 0, 0, 1, 0, 0], { r: 0, g: 0, b: 0, a: 1 }).complete).toBe(false);
  });
});

describe('equation elements', () => {
  it('are created with sensible defaults', () => {
    const el = makeElement('equation', poster());
    expect(el.equation).toMatchObject({ latex: 'E = mc^2', color: '@text', align: 'center' });
    expect(el.equation!.fontSize).toBeGreaterThan(20);
  });

  it('export to PowerPoint as an SVG placed where the maths sits', () => {
    const p = poster();
    const el = makeElement('equation', p, { x: 100, y: 200, w: 200, h: 60 });
    const img = equationImage(el, p)!;
    expect(img.data).toMatch(/^data:image\/svg\+xml;base64,/);
    const svg = atob(img.data.split(',')[1]);
    expect(svg).toContain('<path');
    // Inside the element's box, centred.
    expect(img.x).toBeGreaterThan(100 / 25.4);
    expect(img.x + img.w).toBeLessThan(300 / 25.4);
    expect(img.x + img.w / 2).toBeCloseTo(200 / 25.4, 2);
    expect(img.y + img.h / 2).toBeCloseTo(230 / 25.4, 2);
  });

  it('are flagged by the poster check when too small to read', () => {
    const p = poster();
    p.elements = [makeElement('equation', p, { equation: { latex: 'x', fontSize: 8, color: '@text', align: 'center' } })];
    expect(checkPoster(p, new Map()).some((i) => i.id.startsWith('eqfont-'))).toBe(true);
  });
});

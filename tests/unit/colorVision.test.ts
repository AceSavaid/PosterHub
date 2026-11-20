import { describe, expect, it } from 'vitest';
import { VISION_MODES, confusablePairs, deltaE2000, feColorMatrixValues, simulate, toLab } from '../../src/lib/colorVision';
import { chartColorIssue, chartSeriesColors, checkPoster } from '../../src/lib/checks';
import { PALETTES, createPoster, makeElement, sizeFor } from '../../src/model';
import type { ChartSpec, Palette, Poster } from '../../src/types';

describe('colour maths', () => {
  it('converts to L*a*b*', () => {
    expect(toLab('#ffffff')!.map((v) => Math.round(v) + 0)).toEqual([100, 0, 0]);
    expect(toLab('#000000')!.map((v) => Math.round(v) + 0)).toEqual([0, 0, 0]);
    const red = toLab('#ff0000')!;
    expect(red[0]).toBeCloseTo(53.24, 1);
    expect(red[1]).toBeCloseTo(80.09, 0);
    expect(red[2]).toBeCloseTo(67.2, 0);
    expect(toLab('nope')).toBeNull();
  });

  it('computes CIEDE2000 differences', () => {
    expect(deltaE2000('#123456', '#123456')).toBe(0);
    expect(deltaE2000('#000000', '#ffffff')).toBeCloseTo(100, 0);
    // symmetric, and blues that look alike are close while blue/orange are far apart
    expect(deltaE2000('#1f4e79', '#f4b183')).toBeCloseTo(deltaE2000('#f4b183', '#1f4e79')!, 6);
    expect(deltaE2000('#1f4e79', '#1f4e7b')!).toBeLessThan(1);
    expect(deltaE2000('#1f4e79', '#f4b183')!).toBeGreaterThan(40);
    expect(deltaE2000('#fff', 'red')).toBeNull();
  });

  it('accepts rgb() colours too', () => {
    expect(simulate('rgb(255, 0, 0)', 'normal')).toBe('#ff0000');
  });
});

describe('vision simulation', () => {
  it('leaves greys alone in every mode', () => {
    for (const m of VISION_MODES) {
      expect(simulate('#ffffff', m.id)).toBe('#ffffff');
      expect(simulate('#000000', m.id)).toBe('#000000');
      expect(simulate('#808080', m.id)).toBe('#808080');
    }
  });

  it('makes red and green look alike for red-green colour blindness, but not for tritanopia', () => {
    const red = '#d62728';
    const green = '#2ca02c';
    expect(deltaE2000(red, green)!).toBeGreaterThan(40);
    expect(deltaE2000(simulate(red, 'deuteranopia'), simulate(green, 'deuteranopia'))!).toBeLessThan(10);
    // protanopes see reds darker, so lightness still separates them a little
    expect(deltaE2000(simulate(red, 'protanopia'), simulate(green, 'protanopia'))!).toBeLessThan(30);
    expect(deltaE2000(simulate(red, 'tritanopia'), simulate(green, 'tritanopia'))!).toBeGreaterThan(30);
  });

  it('makes blue and yellow-green confusable for tritanopia', () => {
    const r = confusablePairs(['#0000ff', '#ff0000', '#00b050'], ['tritanopia']);
    expect(r.every((p) => p.mode === 'tritanopia')).toBe(true);
  });

  it('turns colours into greys of equal luminance for greyscale', () => {
    const g = simulate('#ff8800', 'greyscale');
    expect(g.slice(1, 3)).toBe(g.slice(3, 5));
    expect(g.slice(3, 5)).toBe(g.slice(5, 7));
    // pure red and a mid grey of the same luminance become indistinguishable
    expect(deltaE2000(simulate('#ff0000', 'greyscale'), simulate('#7f7f7f', 'greyscale'))!).toBeLessThan(3);
  });

  it('builds a 4×5 SVG colour matrix that keeps alpha', () => {
    const v = feColorMatrixValues('greyscale').split(' ').map(Number);
    expect(v).toHaveLength(20);
    expect(v.slice(15)).toEqual([0, 0, 0, 1, 0]);
    expect(v.slice(0, 3)).toEqual([0.2126, 0.7152, 0.0722]);
  });
});

describe('confusable pairs', () => {
  it('reports colours that are already too close once, as normal vision', () => {
    const r = confusablePairs(['#1f4e79', '#204f7a']);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ i: 0, j: 1, mode: 'normal' });
  });

  it('finds nothing for a colour-blind-safe pair', () => {
    // dark blue + light orange differ in lightness and on the blue-yellow axis
    expect(confusablePairs(['#1f4e79', '#f4b183'])).toEqual([]);
  });

  it('skips colours it cannot read', () => {
    expect(confusablePairs(['transparent', '#000'])).toEqual([]);
  });
});

// ---- poster check
function poster(palette: Palette = PALETTES[0]): Poster {
  return createPoster({ name: 't', ...sizeFor('A0', 'portrait'), sizePreset: 'A0', columns: 3, palette, headingFont: 'Inter', bodyFont: 'Inter', template: 'blank' });
}
function spec(columns: string[], kind: ChartSpec['kind'] = 'bar', rows = [['x', ...columns.slice(1).map((_, i) => String(i + 1))]]): ChartSpec {
  return { kind, title: '', columns, rows, xColumn: 0, yColumns: columns.slice(1).map((_, i) => i + 1), rowStart: 0, rowEnd: rows.length - 1, xLabel: '', yLabel: '', showLegend: true, fontSize: 40 };
}
function withChart(p: Poster, s: ChartSpec) {
  const el = makeElement('chart', p, { x: 50, y: 50, w: 300, h: 200, chart: s });
  p.elements = [el];
  return el;
}

describe('graph colour check', () => {
  it('has nothing to say about a single-series graph', () => {
    const p = poster();
    const el = withChart(p, spec(['Group', 'Score']));
    expect(chartColorIssue(el, p)).toBeNull();
  });

  it('accepts two series in a safe palette', () => {
    const p = poster(PALETTES[0]); // dark blue + light orange
    const el = withChart(p, spec(['Group', 'A', 'B']));
    expect(chartColorIssue(el, p)).toBeNull();
  });

  it('warns about red and green series for red-green colour blindness and suggests a preview', () => {
    const p = poster({ ...PALETTES[0], primary: '#d62728', accent: '#2ca02c' });
    const el = withChart(p, spec(['Group', 'Control', 'Treatment']));
    const issue = chartColorIssue(el, p)!;
    expect(issue.severity).toBe('warning');
    expect(issue.elementId).toBe(el.id);
    expect(issue.title).toBe('Graph colours may be hard to tell apart');
    expect(issue.detail).toContain('“Control” and “Treatment” look alike');
    expect(issue.detail).toMatch(/red-green colour blindness \(deuteranopia\)/);
    expect(issue.preview).toBe('deuteranopia');
    expect(checkPoster(p).some((i) => i.id === 'cvd-' + el.id)).toBe(true);
  });

  it('only gives a tip when colours merely turn the same grey', () => {
    const p = poster(PALETTES[0]); // series 3 and 4 (#2e75b6, #6b8e23) have similar lightness
    const el = withChart(p, spec(['Group', 'A', 'B', 'C', 'D']));
    const issue = chartColorIssue(el, p)!;
    expect(issue.severity).toBe('tip');
    expect(issue.preview).toBe('greyscale');
    expect(issue.detail).toContain('“C” and “D” turn the same grey');
  });

  it('warns when two series are nearly the same colour for everyone', () => {
    const p = poster({ ...PALETTES[0], primary: '#1f4e79', accent: '#21507b' });
    const el = withChart(p, spec(['Group', 'A', 'B']));
    const issue = chartColorIssue(el, p)!;
    expect(issue.severity).toBe('warning');
    expect(issue.detail).toContain('almost the same colour for everyone');
  });

  it('compares pie slices rather than series', () => {
    const p = poster({ ...PALETTES[0], primary: '#d62728', accent: '#2ca02c' });
    const s = spec(['Group', 'Share'], 'pie', [['Men', '40'], ['Women', '60']]);
    const el = withChart(p, s);
    expect(chartSeriesColors(el, p).names).toEqual(['Men', 'Women']);
    const issue = chartColorIssue(el, p)!;
    expect(issue.detail).toContain('“Men” and “Women”');
    expect(issue.detail).toContain('label the slices directly');
  });

  it('none of the built-in palettes trouble colour-blind readers with two series', () => {
    for (const pal of PALETTES) {
      const p = poster(pal);
      const el = withChart(p, spec(['Group', 'A', 'B']));
      expect(chartColorIssue(el, p)?.severity ?? 'none', pal.name).not.toBe('warning');
    }
  });
});

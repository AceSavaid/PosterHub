import { describe, expect, it } from 'vitest';
import { boxStats, equation, fmt, histogram, linearFit, niceStep, quantile } from '../../src/lib/stats';

describe('quantiles and box stats', () => {
  it('interpolates quantiles like Excel QUARTILE.INC', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(quantile(v, 0.25)).toBeCloseTo(2.75);
    expect(quantile(v, 0.5)).toBeCloseTo(4.5);
    expect(quantile(v, 0.75)).toBeCloseTo(6.25);
  });
  it('summarises with Tukey whiskers and outliers, ignoring blanks', () => {
    const s = boxStats([1, 2, 3, 4, 5, 6, 7, 8, 100, null, undefined])!;
    expect(s.n).toBe(9);
    expect(s.median).toBe(5);
    expect(s.q1).toBe(3);
    expect(s.q3).toBe(7);
    expect(s.min).toBe(1);
    expect(s.max).toBe(8); // 100 is beyond 7 + 1.5 × 4
    expect(s.outliers).toEqual([100]);
  });
  it('returns null with no numbers', () => {
    expect(boxStats([null, undefined])).toBeNull();
  });
  it('handles a single value', () => {
    expect(boxStats([4])).toMatchObject({ min: 4, q1: 4, median: 4, q3: 4, max: 4, outliers: [] });
  });
});

describe('histogram', () => {
  it('rounds steps to nice numbers', () => {
    expect(niceStep(0.13)).toBeCloseTo(0.2);
    expect(niceStep(2.2)).toBe(2.5);
    expect(niceStep(7)).toBe(10);
  });
  it('puts every value in exactly one bin, including the maximum', () => {
    const vals = [1, 2, 2, 3, 3, 3, 4, 4, 5, 9.99, 10];
    const h = histogram([vals]);
    expect(h.counts[0].reduce((a, b) => a + b, 0)).toBe(vals.length);
    expect(h.edges[0]).toBeLessThanOrEqual(1);
    expect(h.edges[h.edges.length - 1]).toBeGreaterThanOrEqual(10);
    const steps = h.edges.slice(1).map((e, i) => +(e - h.edges[i]).toFixed(9));
    expect(new Set(steps).size).toBe(1);
  });
  it('uses the requested bar count and shared edges across series', () => {
    const h = histogram([[0, 1, 2], [8, 10]], 5);
    expect(h.edges).toHaveLength(6);
    expect(h.edges[0]).toBe(0);
    expect(h.edges[5]).toBe(10);
    expect(h.counts[0]).toEqual([2, 1, 0, 0, 0]);
    expect(h.counts[1]).toEqual([0, 0, 0, 0, 2]);
  });
  it('copes with identical values and empty input', () => {
    expect(histogram([[3, 3, 3]]).counts[0].reduce((a, b) => a + b, 0)).toBe(3);
    expect(histogram([[3, 3]], 4).counts[0].reduce((a, b) => a + b, 0)).toBe(2);
    expect(histogram([[]]).edges).toEqual([]);
  });
});

describe('linear fit', () => {
  it('recovers an exact line with R² = 1', () => {
    const f = linearFit([1, 2, 3, 4].map((x) => ({ x, y: 2 * x + 1 })))!;
    expect(f.slope).toBeCloseTo(2);
    expect(f.intercept).toBeCloseTo(1);
    expect(f.r2).toBeCloseTo(1);
  });
  it('matches a known regression', () => {
    // x: 1..5, y: 2,4,5,4,5 → slope 0.6, intercept 2.2, R² 0.6
    const f = linearFit([2, 4, 5, 4, 5].map((y, i) => ({ x: i + 1, y })))!;
    expect(f.slope).toBeCloseTo(0.6);
    expect(f.intercept).toBeCloseTo(2.2);
    expect(f.r2).toBeCloseTo(0.6);
  });
  it('skips missing points and refuses a vertical line', () => {
    expect(linearFit([{ x: 1, y: 1 }, { x: null, y: 3 }])).toBeNull();
    expect(linearFit([{ x: 2, y: 1 }, { x: 2, y: 3 }])).toBeNull();
  });
  it('writes a readable equation', () => {
    expect(equation({ slope: 1.23456, intercept: -4.5, r2: 0.9, n: 3 })).toBe('y = 1.23x − 4.5');
    expect(equation({ slope: 2, intercept: 0, r2: 1, n: 3 })).toBe('y = 2x');
    expect(fmt(0.000012)).toBe('1.20e−5');
  });
});

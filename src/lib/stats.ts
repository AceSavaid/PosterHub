// Small, dependency-free statistics helpers for the graph types that summarise
// raw measurements (box plots, histograms) and for scatter trend lines.

/** Quantile with linear interpolation between closest ranks (the same method as Excel's QUARTILE.INC and R's default). */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface BoxStats {
  n: number;
  /** lower whisker end: the smallest value within 1.5 × IQR of the box */
  min: number;
  q1: number;
  median: number;
  q3: number;
  /** upper whisker end: the largest value within 1.5 × IQR of the box */
  max: number;
  mean: number;
  outliers: number[];
}

/** Tukey box plot summary. Returns null when there are no numbers. */
export function boxStats(values: (number | null | undefined)[]): BoxStats | null {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const q1 = quantile(v, 0.25);
  const q3 = quantile(v, 0.75);
  const fence = 1.5 * (q3 - q1);
  const inside = v.filter((x) => x >= q1 - fence && x <= q3 + fence);
  return {
    n: v.length,
    min: inside[0],
    q1,
    median: quantile(v, 0.5),
    q3,
    max: inside[inside.length - 1],
    mean: v.reduce((a, b) => a + b, 0) / v.length,
    outliers: v.filter((x) => x < q1 - fence || x > q3 + fence),
  };
}

/** Rounds a raw step up to a "nice" 1, 2, 2.5 or 5 × 10ⁿ. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / mag;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * mag;
}

export interface Histogram {
  /** bin edges, length = bins + 1; bin i covers [edges[i], edges[i+1]) and the last bin also includes its upper edge */
  edges: number[];
  /** counts[series][bin] */
  counts: number[][];
}

/**
 * Bins one or more series on shared, evenly spaced edges so they can be compared.
 * With no bin count, Sturges' rule picks one and the edges are rounded to nice numbers.
 */
export function histogram(series: (number | null | undefined)[][], bins?: number): Histogram {
  const clean = series.map((s) => s.filter((x): x is number => x != null && Number.isFinite(x)));
  const all = clean.flat();
  if (!all.length) return { edges: [], counts: clean.map(() => []) };
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  let edges: number[];
  if (bins && bins > 0) {
    const n = Math.min(200, Math.round(bins));
    if (hi === lo) {
      lo -= 0.5;
      hi += 0.5;
    }
    const step = (hi - lo) / n;
    edges = Array.from({ length: n + 1 }, (_, i) => lo + step * i);
  } else {
    const target = Math.min(30, Math.max(3, Math.ceil(Math.log2(all.length)) + 1));
    const step = hi === lo ? 1 : niceStep((hi - lo) / target);
    const start = Math.floor(lo / step) * step;
    let end = Math.ceil(hi / step) * step;
    if (end <= start) end = start + step;
    const n = Math.max(1, Math.round((end - start) / step));
    // Rebuild from integers to avoid accumulating floating point error.
    edges = Array.from({ length: n + 1 }, (_, i) => +(start + step * i).toPrecision(12));
  }
  const nb = edges.length - 1;
  const counts = clean.map((s) => {
    const c = new Array(nb).fill(0);
    for (const x of s) {
      let i = Math.floor(((x - edges[0]) / (edges[nb] - edges[0])) * nb);
      if (i >= nb) i = nb - 1;
      if (i < 0) i = 0;
      // Correct for edges that floating point puts on the wrong side.
      while (i > 0 && x < edges[i]) i--;
      while (i < nb - 1 && x >= edges[i + 1]) i++;
      c[i]++;
    }
    return c;
  });
  return { edges, counts };
}

export interface LinearFit {
  slope: number;
  intercept: number;
  /** coefficient of determination */
  r2: number;
  n: number;
}

/** Ordinary least squares fit y = slope·x + intercept. Null with fewer than two distinct x values. */
export function linearFit(points: { x: number | null; y: number | null }[]): LinearFit | null {
  const pts = points.filter((p): p is { x: number; y: number } => p.x != null && p.y != null && Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = pts.length;
  if (n < 2) return null;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept, r2, n };
}

/** Compact number for labels: up to `digits` significant figures, no trailing zeros. */
export function fmt(x: number, digits = 3): string {
  if (!Number.isFinite(x)) return '';
  if (x === 0) return '0';
  const abs = Math.abs(x);
  const s = abs >= 1e6 || abs < 1e-4 ? x.toExponential(digits - 1) : String(+x.toPrecision(digits));
  return s.replace('-', '−');
}

/** "y = 1.23x + 4.5" with a proper minus sign. */
export function equation(fit: LinearFit): string {
  const b = fit.intercept;
  const sign = b < 0 ? '−' : '+';
  const tail = Math.abs(b) < 1e-12 ? '' : ` ${sign} ${fmt(Math.abs(b))}`;
  return `y = ${fmt(fit.slope)}x${tail}`;
}

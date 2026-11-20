import type { ChartConfiguration } from 'chart.js';
import type { ChartSpec, Palette } from '../types';

export function seriesColors(p: Palette, n: number): string[] {
  const base = [p.primary, p.accent, p.secondary, '#6b8e23', '#8e44ad', '#16a085', '#d35400', '#7f8c8d', '#c0392b', '#2c3e50'];
  return Array.from({ length: n }, (_, i) => base[i % base.length]);
}

export function toNumber(v: string | undefined): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[,\s%$€£]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function chartRows(spec: ChartSpec) {
  const end = Math.min(spec.rowEnd, spec.rows.length - 1);
  return spec.rows.slice(Math.max(0, spec.rowStart), end + 1);
}

export interface SeriesData {
  labels: string[];
  series: { name: string; values: (number | null)[] }[];
  xNumbers: (number | null)[];
}

export function seriesData(spec: ChartSpec): SeriesData {
  const rows = chartRows(spec);
  return {
    labels: rows.map((r) => r[spec.xColumn] ?? ''),
    xNumbers: rows.map((r) => toNumber(r[spec.xColumn])),
    series: spec.yColumns.map((c) => ({ name: spec.columns[c] ?? `Series ${c + 1}`, values: rows.map((r) => toNumber(r[c])) })),
  };
}

export function buildChartConfig(spec: ChartSpec, palette: Palette, fontFamily: string, textColor: string): ChartConfiguration {
  const d = seriesData(spec);
  const colors = seriesColors(palette, Math.max(d.series.length, d.labels.length));
  const px = (spec.fontSize * 96) / 72;
  const font = { family: fontFamily, size: px };
  const isPie = spec.kind === 'pie' || spec.kind === 'doughnut';
  const gridColor = 'rgba(128,128,128,0.25)';

  const datasets = d.series.map((s, i) => {
    if (spec.kind === 'scatter') {
      return {
        label: s.name,
        data: d.xNumbers.map((x, j) => ({ x, y: s.values[j] })).filter((pt) => pt.x != null && pt.y != null),
        backgroundColor: colors[i],
        borderColor: colors[i],
        pointRadius: px * 0.35,
      };
    }
    if (isPie) return { label: s.name, data: s.values, backgroundColor: colors.slice(0, d.labels.length), borderColor: '#ffffff', borderWidth: 2 };
    return {
      label: s.name,
      data: s.values,
      backgroundColor: colors[i],
      borderColor: colors[i],
      borderWidth: spec.kind === 'line' ? px * 0.18 : 0,
      pointRadius: spec.kind === 'line' ? px * 0.25 : 0,
      tension: 0.2,
    };
  });

  const axisTitle = (text: string) => ({ display: !!text, text, color: textColor, font });
  const scales = isPie
    ? {}
    : {
        x: {
          ...(spec.kind === 'scatter' ? { type: 'linear' as const } : {}),
          title: axisTitle(spec.kind === 'horizontalBar' ? spec.yLabel : spec.xLabel),
          ticks: { color: textColor, font },
          grid: { color: gridColor },
        },
        y: {
          title: axisTitle(spec.kind === 'horizontalBar' ? spec.xLabel : spec.yLabel),
          ticks: { color: textColor, font },
          grid: { color: gridColor },
        },
      };

  return {
    type: spec.kind === 'horizontalBar' ? 'bar' : spec.kind,
    data: { labels: spec.kind === 'scatter' ? undefined : d.labels, datasets: datasets as never },
    options: {
      animation: false,
      responsive: false,
      maintainAspectRatio: false,
      devicePixelRatio: 3,
      indexAxis: spec.kind === 'horizontalBar' ? 'y' : 'x',
      layout: { padding: px * 0.5 },
      plugins: {
        legend: { display: spec.showLegend, labels: { color: textColor, font } },
        title: { display: !!spec.title, text: spec.title, color: textColor, font: { ...font, size: px * 1.25, weight: 'bold' } },
        tooltip: { enabled: false },
      },
      scales: scales as never,
    },
  };
}

/** The largest absolute value in a column, over the rows the graph uses. */
function columnPeak(spec: Pick<ChartSpec, 'rows' | 'rowStart' | 'rowEnd'>, col: number): number {
  let peak = 0;
  for (const r of chartRows(spec as ChartSpec)) {
    const n = toNumber(r[col]);
    if (n != null) peak = Math.max(peak, Math.abs(n));
  }
  return peak;
}

/** How far apart columns must be (largest ÷ smallest) before the small one looks flat on a shared axis. */
export const SCALE_GAP = 10;

/**
 * Columns plotted together whose sizes differ so much that the smaller ones
 * would barely show on a shared axis (e.g. accuracy 0–1 next to times of 400 ms).
 * Returns the names of the smallest and largest column, or null when they fit together.
 */
export function scaleMismatch(spec: Pick<ChartSpec, 'kind' | 'columns' | 'rows' | 'rowStart' | 'rowEnd' | 'yColumns'>): { small: string; large: string } | null {
  if (spec.kind === 'pie' || spec.kind === 'doughnut' || spec.yColumns.length < 2) return null;
  const peaks = spec.yColumns.map((c) => ({ c, peak: columnPeak(spec, c) })).filter((p) => p.peak > 0);
  if (peaks.length < 2) return null;
  peaks.sort((a, b) => a.peak - b.peak);
  const lo = peaks[0];
  const hi = peaks[peaks.length - 1];
  return hi.peak / lo.peak >= SCALE_GAP ? { small: spec.columns[lo.c], large: spec.columns[hi.c] } : null;
}

/**
 * Of the numeric columns, the ones to tick by default: the first, plus any
 * others of a similar size, so a new graph never hides a column by squashing it flat.
 */
export function defaultYColumns(spec: Pick<ChartSpec, 'rows' | 'rowStart' | 'rowEnd'>, numeric: number[], max = 3): number[] {
  if (!numeric.length) return [];
  const first = columnPeak(spec, numeric[0]);
  const fits = (c: number) => {
    const p = columnPeak(spec, c);
    if (!first || !p) return true;
    return Math.max(p, first) / Math.min(p, first) < SCALE_GAP;
  };
  return [numeric[0], ...numeric.slice(1).filter(fits)].slice(0, max);
}

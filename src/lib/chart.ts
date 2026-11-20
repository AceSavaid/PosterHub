import type { Chart, ChartConfiguration, Plugin } from 'chart.js';
import type { ChartSpec, Palette } from '../types';
import { boxStats, equation, fmt, histogram, linearFit, type BoxStats, type LinearFit } from './stats';

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

/** Kinds that use a category/X column (histograms only look at the ticked columns). */
export function usesXColumn(spec: ChartSpec): boolean {
  if (spec.kind === 'histogram') return false;
  if (spec.kind === 'box') return spec.boxGroups === 'category';
  return true;
}

export interface HistogramData {
  labels: string[];
  edges: number[];
  series: { name: string; counts: number[] }[];
}

/** Bins each ticked column on shared edges. */
export function histogramData(spec: ChartSpec): HistogramData {
  const d = seriesData(spec);
  const h = histogram(d.series.map((s) => s.values), spec.bins);
  const labels = h.edges.slice(0, -1).map((a, i) => `${fmt(a)}–${fmt(h.edges[i + 1])}`);
  return { labels, edges: h.edges, series: d.series.map((s, i) => ({ name: s.name, counts: h.counts[i] })) };
}

export interface BoxData {
  labels: string[];
  series: { name: string; stats: (BoxStats | null)[] }[];
}

/**
 * Box plot summaries. "columns": each ticked column is one box (wide data, as typed in a lab sheet).
 * "category": rows are grouped by the X column's values, one box per group and series (tidy data).
 */
export function boxData(spec: ChartSpec): BoxData {
  const d = seriesData(spec);
  if (spec.boxGroups !== 'category') {
    return { labels: d.series.map((s) => s.name), series: [{ name: spec.yLabel || 'Values', stats: d.series.map((s) => boxStats(s.values)) }] };
  }
  const groups: string[] = [];
  for (const l of d.labels) if (!groups.includes(l)) groups.push(l);
  return {
    labels: groups,
    series: d.series.map((s) => ({ name: s.name, stats: groups.map((g) => boxStats(s.values.filter((_, i) => d.labels[i] === g))) })),
  };
}

/** True when the X column repeats values, which suggests grouping rows by it for a box plot. */
export function xColumnRepeats(spec: ChartSpec): boolean {
  const labels = chartRows(spec).map((r) => (r[spec.xColumn] ?? '').trim()).filter(Boolean);
  return labels.length > 1 && new Set(labels).size < labels.length;
}

export interface TrendLine {
  name: string;
  fit: LinearFit;
  x0: number;
  x1: number;
}

/** Least-squares line for each scatter series that has at least two distinct x values. */
export function trendLines(spec: ChartSpec): TrendLine[] {
  const d = seriesData(spec);
  const out: TrendLine[] = [];
  for (const s of d.series) {
    const pts = d.xNumbers.map((x, j) => ({ x, y: s.values[j] })).filter((p) => p.x != null && p.y != null) as { x: number; y: number }[];
    const fit = linearFit(pts);
    if (!fit) continue;
    const xs = pts.map((p) => p.x);
    out.push({ name: s.name, fit, x0: Math.min(...xs), x1: Math.max(...xs) });
  }
  return out;
}

/** "y = 1.2x + 3 · R² = 0.98", prefixed with the series name when there are several. */
export function trendCaption(t: TrendLine, withName: boolean): string {
  return `${withName ? t.name + ': ' : ''}${equation(t.fit)}   R² = ${t.fit.r2.toFixed(t.fit.r2 >= 0.995 && t.fit.r2 < 1 ? 3 : 2)}`;
}

function withAlpha(color: string, alpha: number): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color + Math.round(alpha * 255).toString(16).padStart(2, '0');
  if (/^#[0-9a-f]{3}$/i.test(color)) return '#' + [...color.slice(1)].map((c) => c + c).join('') + Math.round(alpha * 255).toString(16).padStart(2, '0');
  return color;
}

/** Draws whiskers, medians and outliers on top of the floating bars that form the boxes. */
function boxPlugin(series: BoxData['series'], strokeColors: (string | string[])[], medianColor: string, lineWidth: number): Plugin {
  return {
    id: 'posterBoxPlot',
    afterDatasetsDraw(chart: Chart) {
      const ctx = chart.ctx;
      const y = chart.scales.y;
      series.forEach((s, di) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        s.stats.forEach((st, i) => {
          const el = meta.data[i] as unknown as { x: number; width: number } | undefined;
          if (!st || !el) return;
          const c = strokeColors[di];
          const color = Array.isArray(c) ? c[i % c.length] : c;
          const half = el.width / 2;
          const cap = el.width / 4;
          const py = (v: number) => y.getPixelForValue(v);
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth;
          ctx.setLineDash([]);
          ctx.beginPath();
          // whiskers and caps
          ctx.moveTo(el.x, py(st.q3));
          ctx.lineTo(el.x, py(st.max));
          ctx.moveTo(el.x - cap, py(st.max));
          ctx.lineTo(el.x + cap, py(st.max));
          ctx.moveTo(el.x, py(st.q1));
          ctx.lineTo(el.x, py(st.min));
          ctx.moveTo(el.x - cap, py(st.min));
          ctx.lineTo(el.x + cap, py(st.min));
          ctx.stroke();
          // median
          ctx.strokeStyle = medianColor;
          ctx.lineWidth = lineWidth * 2;
          ctx.beginPath();
          ctx.moveTo(el.x - half, py(st.median));
          ctx.lineTo(el.x + half, py(st.median));
          ctx.stroke();
          // outliers as hollow circles
          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth;
          const r = Math.max(2, Math.min(cap, lineWidth * 2.5));
          for (const o of st.outliers) {
            ctx.beginPath();
            ctx.arc(el.x, py(o), r, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        });
      });
    },
  };
}

/** Extra characters chart labels may use beyond the data itself (for PDF font subsetting). */
export const CHART_EXTRA_GLYPHS = '0123456789.,-−+eE%kMB y=x²R–:·Values ';

/** All text a chart may draw besides its source table, so exporters can embed the glyphs. */
export function chartExtraText(spec: ChartSpec): string {
  let t = CHART_EXTRA_GLYPHS;
  if (spec.kind === 'histogram') t += histogramData(spec).labels.join(' ');
  if (spec.kind === 'scatter' && spec.trendline) t += trendLines(spec).map((l) => trendCaption(l, true) + ' trend').join(' ');
  return t;
}

export function buildChartConfig(spec: ChartSpec, palette: Palette, fontFamily: string, textColor: string): ChartConfiguration {
  const d = seriesData(spec);
  const px = (spec.fontSize * 96) / 72;
  const font = { family: fontFamily, size: px };
  const isPie = spec.kind === 'pie' || spec.kind === 'doughnut';
  const gridColor = 'rgba(128,128,128,0.25)';
  const plugins: Plugin[] = [];
  let labels: string[] | undefined = d.labels;
  let showLegend = spec.showLegend;
  let subtitle: string[] = [];
  let yRange: { suggestedMin?: number; suggestedMax?: number; beginAtZero?: boolean } = {};
  let datasets: Record<string, unknown>[];

  if (spec.kind === 'histogram') {
    const h = histogramData(spec);
    const colors = seriesColors(palette, h.series.length);
    labels = h.labels;
    datasets = h.series.map((s, i) => ({
      label: s.name,
      data: s.counts,
      backgroundColor: h.series.length > 1 ? withAlpha(colors[i], 0.75) : colors[i],
      borderColor: '#ffffff',
      borderWidth: Math.max(0.5, px * 0.06),
      barPercentage: 1,
      categoryPercentage: h.series.length > 1 ? 0.9 : 1,
    }));
    yRange = { beginAtZero: true };
  } else if (spec.kind === 'box') {
    const b = boxData(spec);
    labels = b.labels;
    const perBox = spec.boxGroups !== 'category';
    const colors = seriesColors(palette, Math.max(b.series.length, b.labels.length));
    const strokes: (string | string[])[] = b.series.map((_, i) => (perBox ? colors.slice(0, b.labels.length) : colors[i]));
    datasets = b.series.map((s, i) => {
      const c = strokes[i];
      return {
        label: s.name,
        data: s.stats.map((st) => (st ? [st.q1, st.q3] : null)),
        backgroundColor: Array.isArray(c) ? c.map((x) => withAlpha(x, 0.35)) : withAlpha(c, 0.35),
        borderColor: c,
        borderWidth: Math.max(1, px * 0.12),
        borderSkipped: false,
        barPercentage: 0.7,
      };
    });
    const vals = b.series.flatMap((s) => s.stats.flatMap((st) => (st ? [st.min, st.max, ...st.outliers] : [])));
    if (vals.length) {
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      const pad = (hi - lo || Math.abs(hi) || 1) * 0.05;
      yRange = { suggestedMin: lo - pad, suggestedMax: hi + pad, beginAtZero: false };
    }
    if (perBox) showLegend = false;
    plugins.push(boxPlugin(b.series, strokes, textColor, Math.max(1, px * 0.12)));
  } else {
    const colors = seriesColors(palette, Math.max(d.series.length, d.labels.length));
    datasets = d.series.map((s, i) => {
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
    if (spec.kind === 'scatter') {
      labels = undefined;
      if (spec.trendline) {
        const lines = trendLines(spec);
        for (const t of lines) {
          const i = d.series.findIndex((s) => s.name === t.name);
          datasets.push({
            type: 'line',
            label: `${t.name} trend`,
            isTrend: true,
            data: [t.x0, t.x1].map((x) => ({ x, y: t.fit.slope * x + t.fit.intercept })),
            borderColor: colors[Math.max(0, i)],
            backgroundColor: colors[Math.max(0, i)],
            borderWidth: Math.max(1, px * 0.15),
            borderDash: [px * 0.6, px * 0.35],
            pointRadius: 0,
            fill: false,
            tension: 0,
          });
        }
        subtitle = lines.map((t) => trendCaption(t, lines.length > 1));
      }
    }
  }

  const horizontal = spec.kind === 'horizontalBar';
  const stacked = spec.kind === 'stackedBar';
  const axisTitle = (text: string) => ({ display: !!text, text, color: textColor, font });
  const scales = isPie
    ? {}
    : {
        x: {
          ...(spec.kind === 'scatter' ? { type: 'linear' as const } : {}),
          ...(stacked ? { stacked: true } : {}),
          title: axisTitle(horizontal ? spec.yLabel : spec.xLabel),
          ticks: { color: textColor, font },
          grid: { color: gridColor, ...(spec.kind === 'histogram' ? { display: false } : {}) },
        },
        y: {
          ...(stacked ? { stacked: true } : {}),
          ...yRange,
          title: axisTitle(horizontal ? spec.xLabel : spec.yLabel),
          ticks: { color: textColor, font, ...(spec.kind === 'histogram' ? { precision: 0 } : {}) },
          grid: { color: gridColor },
        },
      };

  const type = spec.kind === 'horizontalBar' || spec.kind === 'stackedBar' || spec.kind === 'histogram' || spec.kind === 'box' ? 'bar' : spec.kind;
  return {
    type,
    data: { labels, datasets: datasets as never },
    plugins,
    options: {
      animation: false,
      responsive: false,
      maintainAspectRatio: false,
      devicePixelRatio: 3,
      indexAxis: horizontal ? 'y' : 'x',
      layout: { padding: px * 0.5 },
      plugins: {
        legend: {
          display: showLegend,
          labels: { color: textColor, font, filter: (item: { datasetIndex?: number }) => !(datasets[item.datasetIndex ?? -1] as { isTrend?: boolean } | undefined)?.isTrend },
        },
        title: { display: !!spec.title, text: spec.title, color: textColor, font: { ...font, size: px * 1.25, weight: 'bold' } },
        subtitle: { display: subtitle.length > 0, text: subtitle, color: textColor, font, padding: { bottom: px * 0.4 } },
        tooltip: { enabled: false },
      },
      scales: scales as never,
    },
  } as ChartConfiguration;
}

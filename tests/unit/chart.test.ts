import { describe, expect, it } from 'vitest';
import { boxData, buildChartConfig, histogramData, seriesData, toNumber, trendCaption, trendLines, usesXColumn, xColumnRepeats } from '../../src/lib/chart';
import { parseCsv } from '../../src/components/ChartDialog';
import { PALETTES } from '../../src/model';
import type { ChartSpec } from '../../src/types';

const csv = `Group,"Score, mean",Score SD,Note
Control,12.5,1.1,a
"Treatment A",18,2.0,b
Treatment B,21.25,1.6,c
Placebo,13,1.2,d
`;

function spec(over: Partial<ChartSpec> = {}): ChartSpec {
  const { columns, rows } = parseCsv(csv);
  return { kind: 'bar', title: 'T', columns, rows, xColumn: 0, yColumns: [1], rowStart: 0, rowEnd: rows.length - 1, xLabel: '', yLabel: '', showLegend: true, fontSize: 12, ...over };
}

describe('CSV parsing', () => {
  it('reads headers and quoted fields', () => {
    const { columns, rows } = parseCsv(csv);
    expect(columns).toEqual(['Group', 'Score, mean', 'Score SD', 'Note']);
    expect(rows).toHaveLength(4);
    expect(rows[1][0]).toBe('Treatment A');
  });
  it('names blank headers', () => {
    expect(parseCsv(',b\n1,2').columns).toEqual(['Column 1', 'b']);
  });
  it('rejects empty input', () => {
    expect(() => parseCsv('')).toThrow();
  });
});

describe('numbers', () => {
  it('parses common formats', () => {
    expect(toNumber('1,234.5')).toBe(1234.5);
    expect(toNumber('45%')).toBe(45);
    expect(toNumber(' -3 ')).toBe(-3);
    expect(toNumber('n/a')).toBeNull();
    expect(toNumber(undefined)).toBeNull();
  });
});

describe('series selection', () => {
  it('uses only the chosen columns and row range', () => {
    const d = seriesData(spec({ yColumns: [1, 2], rowStart: 1, rowEnd: 2 }));
    expect(d.labels).toEqual(['Treatment A', 'Treatment B']);
    expect(d.series.map((s) => s.name)).toEqual(['Score, mean', 'Score SD']);
    expect(d.series[0].values).toEqual([18, 21.25]);
  });
  it('clamps an out-of-range end row', () => {
    expect(seriesData(spec({ rowEnd: 99 })).labels).toHaveLength(4);
  });
});

describe('chart config', () => {
  const pal = PALETTES[0];
  it('builds a horizontal bar chart', () => {
    const c = buildChartConfig(spec({ kind: 'horizontalBar' }), pal, 'Inter', '#000');
    expect(c.type).toBe('bar');
    expect(c.options?.indexAxis).toBe('y');
  });
  it('colours pie slices individually', () => {
    const c = buildChartConfig(spec({ kind: 'pie' }), pal, 'Inter', '#000');
    expect(c.type).toBe('pie');
    expect((c.data.datasets[0].backgroundColor as string[]).length).toBe(4);
  });
  it('builds scatter points from numeric columns', () => {
    const c = buildChartConfig(spec({ kind: 'scatter', xColumn: 1, yColumns: [2] }), pal, 'Inter', '#000');
    expect(c.data.datasets[0].data[0]).toEqual({ x: 12.5, y: 1.1 });
  });
  it('keeps category labels on bar charts (no numeric x scale)', () => {
    const c = buildChartConfig(spec(), pal, 'Inter', '#000');
    expect(c.data.labels).toEqual(['Control', 'Treatment A', 'Treatment B', 'Placebo']);
    expect('type' in (c.options!.scales as Record<string, object>).x).toBe(false);
  });
  it('turns off animation so exports capture the finished chart', () => {
    expect(buildChartConfig(spec(), pal, 'Inter', '#000').options?.animation).toBe(false);
  });
});

describe('new graph types', () => {
  const pal = PALETTES[0];
  const raw = parseCsv(`Condition,Score,Time
Control,10,1
Control,12,2
Control,11,3
Control,30,4
Drug,20,5
Drug,22,6
Drug,21,7
Drug,23,8
`);
  const rawSpec = (over: Partial<ChartSpec>): ChartSpec => ({
    kind: 'box', title: '', columns: raw.columns, rows: raw.rows, xColumn: 0, yColumns: [1], rowStart: 0, rowEnd: raw.rows.length - 1, xLabel: '', yLabel: '', showLegend: true, fontSize: 12, ...over,
  });

  it('stacks bars on both axes', () => {
    const c = buildChartConfig(spec({ kind: 'stackedBar', yColumns: [1, 2] }), pal, 'Inter', '#000');
    expect(c.type).toBe('bar');
    const scales = c.options!.scales as Record<string, { stacked?: boolean }>;
    expect(scales.x.stacked).toBe(true);
    expect(scales.y.stacked).toBe(true);
  });

  it('bins a histogram from the ticked column, ignoring the X column', () => {
    const s = rawSpec({ kind: 'histogram', yColumns: [1] });
    expect(usesXColumn(s)).toBe(false);
    const h = histogramData(s);
    expect(h.series[0].counts.reduce((a, b) => a + b, 0)).toBe(8);
    expect(h.labels[0]).toMatch(/^\d+–\d+$/);
    const c = buildChartConfig(s, pal, 'Inter', '#000');
    expect(c.type).toBe('bar');
    expect(c.data.labels).toEqual(h.labels);
    expect((c.data.datasets[0] as { barPercentage?: number }).barPercentage).toBe(1);
  });

  it('groups box plot rows by category', () => {
    const s = rawSpec({ boxGroups: 'category' });
    expect(xColumnRepeats(s)).toBe(true);
    const b = boxData(s);
    expect(b.labels).toEqual(['Control', 'Drug']);
    expect(b.series[0].stats[0]!.outliers).toEqual([30]);
    const c = buildChartConfig(s, pal, 'Inter', '#000');
    expect(c.type).toBe('bar');
    // floating bars span the quartiles
    const q = b.series[0].stats[1]!;
    expect(c.data.datasets[0].data[1]).toEqual([q.q1, q.q3]);
    expect(c.plugins?.some((p) => p.id === 'posterBoxPlot')).toBe(true);
    // axis reaches the outlier even though bars stop at the quartiles
    expect((c.options!.scales as Record<string, { suggestedMax?: number }>).y.suggestedMax).toBeGreaterThan(30);
  });

  it('makes one box per ticked column for wide data', () => {
    const s = rawSpec({ boxGroups: 'columns', yColumns: [1, 2] });
    const b = boxData(s);
    expect(b.labels).toEqual(['Score', 'Time']);
    expect(b.series).toHaveLength(1);
    expect(buildChartConfig(s, pal, 'Inter', '#000').options?.plugins?.legend?.display).toBe(false);
  });

  it('adds a trend line and shows the equation with R²', () => {
    const s = rawSpec({ kind: 'scatter', xColumn: 2, yColumns: [1], trendline: true, rows: raw.rows.filter((r) => r[1] !== '30') });
    const [t] = trendLines(s);
    expect(t.fit.r2).toBeGreaterThan(0.8);
    const c = buildChartConfig(s, pal, 'Inter', '#000');
    expect(c.data.datasets).toHaveLength(2);
    expect((c.data.datasets[1] as { type?: string }).type).toBe('line');
    const sub = c.options?.plugins?.subtitle as { display: boolean; text: string[] };
    expect(sub.display).toBe(true);
    expect(sub.text[0]).toMatch(/^y = [\d.]+x [+−] [\d.]+ {3}R² = 0\.\d+$/);
    expect(trendCaption(t, true)).toMatch(/^Score: /);
  });

  it('leaves scatter plots without a trend line unchanged', () => {
    const c = buildChartConfig(rawSpec({ kind: 'scatter', xColumn: 2 }), pal, 'Inter', '#000');
    expect(c.data.datasets).toHaveLength(1);
    expect((c.options?.plugins?.subtitle as { display: boolean }).display).toBe(false);
  });
});

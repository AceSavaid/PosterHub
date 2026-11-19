import { describe, expect, it } from 'vitest';
import { buildChartConfig, seriesData, toNumber } from '../../src/lib/chart';
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

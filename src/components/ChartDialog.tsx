import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import type { ChartKind, ChartSpec, Poster } from '../types';
import { resolveColor, resolveFont, typeScale } from '../model';
import { toNumber, usesXColumn, xColumnRepeats, defaultYColumns, scaleMismatch } from '../lib/chart';
import { useEscape } from '../lib/useEscape';
import { pickFile } from '../lib/storage';
import ChartView from './ChartView';
import { useDialog } from '../lib/useDialog';

interface Props {
  poster: Poster;
  initial?: ChartSpec;
  initialText?: string;
  onSave: (spec: ChartSpec) => void;
  onCancel: () => void;
}

const KINDS: { id: ChartKind; label: string; hint: string }[] = [
  { id: 'bar', label: 'Bar (vertical)', hint: 'Compare values across categories.' },
  { id: 'horizontalBar', label: 'Bar (horizontal)', hint: 'Like a bar graph, with room for long category names.' },
  { id: 'stackedBar', label: 'Bar (stacked)', hint: 'Stacks the ticked columns to show parts of a total.' },
  { id: 'line', label: 'Line', hint: 'Show change over time or along an ordered axis.' },
  { id: 'scatter', label: 'Scatter', hint: 'Plot one number against another. Add a trend line to show the fit and R².' },
  { id: 'histogram', label: 'Histogram', hint: 'Counts how many measurements fall in each range. Tick the columns of raw values.' },
  { id: 'box', label: 'Box plot', hint: 'Shows the median, quartiles, range and outliers of raw measurements.' },
  { id: 'pie', label: 'Pie', hint: 'Show shares of a whole (best with a few slices).' },
  { id: 'doughnut', label: 'Doughnut', hint: 'A pie with a hole in the middle.' },
];

export function parseCsv(text: string): { columns: string[]; rows: string[][] } {
  const res = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  const [header, ...rows] = res.data;
  if (!header) throw new Error('The file is empty.');
  return { columns: header.map((h, i) => h.trim() || `Column ${i + 1}`), rows };
}

export function defaultSpec(columns: string[], rows: string[][], fontSize: number): ChartSpec {
  const numeric = columns.map((_, c) => rows.slice(0, 20).filter((r) => toNumber(r[c]) != null).length >= Math.min(rows.length, 20) * 0.7);
  const xColumn = numeric.findIndex((n) => !n) >= 0 ? numeric.findIndex((n) => !n) : 0;
  const numericCols = numeric.map((n, i) => (n && i !== xColumn ? i : -1)).filter((i) => i >= 0);
  const rowEnd = Math.min(rows.length - 1, 49);
  const ys = defaultYColumns({ rows, rowStart: 0, rowEnd }, numericCols);
  return {
    kind: 'bar',
    title: '',
    columns,
    rows,
    xColumn,
    yColumns: ys.length ? ys : [Math.min(1, columns.length - 1)],
    rowStart: 0,
    rowEnd,
    xLabel: columns[xColumn] ?? '',
    yLabel: ys.length === 1 ? columns[ys[0]] : '',
    showLegend: ys.length > 1,
    fontSize,
  };
}

export default function ChartDialog({ poster, initial, initialText, onSave, onCancel }: Props) {
  const baseFont = Math.max(8, Math.round(24 * typeScale(poster)));
  const [spec, setSpec] = useState<ChartSpec | null>(() => {
    if (initial) return initial;
    if (!initialText) return null;
    try {
      const { columns, rows } = parseCsv(initialText);
      return rows.length ? defaultSpec(columns, rows, baseFont) : null;
    } catch {
      return null;
    }
  });
  const [paste, setPaste] = useState('');
  const [error, setError] = useState('');
  const set = (p: Partial<ChartSpec>) => setSpec((s) => (s ? { ...s, ...p } : s));

  /** Switches graph type and fills in sensible labels for the new type. */
  function changeKind(kind: ChartKind) {
    setSpec((s) => {
      if (!s) return s;
      const next: ChartSpec = { ...s, kind };
      if (kind === 'histogram') {
        if (!s.yLabel) next.yLabel = 'Count';
        if (s.kind !== 'histogram' && s.yColumns.length) next.xLabel = s.columns[s.yColumns[0]] ?? s.xLabel;
      } else if (s.kind === 'histogram') {
        if (s.yLabel === 'Count') next.yLabel = '';
        next.xLabel = s.columns[s.xColumn] ?? '';
      }
      if (kind === 'box' && !s.boxGroups) next.boxGroups = xColumnRepeats(s) ? 'category' : 'columns';
      // The X column can be ticked while hidden (histograms); untick it once it is the X axis again.
      if (usesXColumn(next) && next.yColumns.length > 1) next.yColumns = next.yColumns.filter((c) => c !== next.xColumn);
      return next;
    });
  }

  function load(text: string) {
    try {
      const { columns, rows } = parseCsv(text);
      if (rows.length === 0) throw new Error('No data rows found under the header row.');
      setSpec(defaultSpec(columns, rows, baseFont));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function upload() {
    const f = await pickFile('.csv,.tsv,.txt,text/csv');
    if (f) load(await f.text());
  }

  const dialog = useDialog(onCancel, 'chart-dialog-title');
  const preview = useMemo(() => spec && { ...spec, fontSize: 11 }, [spec]);
  const mismatch = useMemo(() => spec && scaleMismatch(spec), [spec]);
  useEscape(onCancel);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div {...dialog} className="modal xwide chart-dialog">
        <h2 id="chart-dialog-title">{initial ? 'Edit graph' : 'Graph from CSV'}</h2>
        {!spec ? (
          <div className="csv-load">
            <button className="btn primary big" onClick={upload}>Choose a CSV file…</button>
            <p className="muted">or paste data (from Excel, Sheets or a CSV) below, with column names in the first row:</p>
            <textarea rows={8} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Condition,Trial 1,Trial 2\nControl,12,14\nTreatment,18,21'} />
            <div className="modal-actions">
              <button className="btn" onClick={onCancel}>Cancel</button>
              <button className="btn primary" disabled={!paste.trim()} onClick={() => load(paste)}>Use pasted data</button>
            </div>
            {error && <div className="banner error">{error}</div>}
          </div>
        ) : (
          <div className="chart-grid">
            <div className="chart-controls">
              <label>
                Graph type
                <select value={spec.kind} onChange={(e) => changeKind(e.target.value as ChartKind)}>
                  {KINDS.map((k) => (
                    <option key={k.id} value={k.id}>{k.label}</option>
                  ))}
                </select>
              </label>
              <p className="hint">{KINDS.find((k) => k.id === spec.kind)?.hint}</p>
              {spec.kind === 'box' && (
                <div role="radiogroup" aria-label="Boxes">
                  <div className="field-label">Boxes</div>
                  <label className="check">
                    <input type="radio" name="box-groups" checked={spec.boxGroups !== 'category'} onChange={() => set({ boxGroups: 'columns' })} /> One box per ticked column
                  </label>
                  <label className="check">
                    <input type="radio" name="box-groups" checked={spec.boxGroups === 'category'} onChange={() => set({ boxGroups: 'category', yColumns: spec.yColumns.length > 1 ? spec.yColumns.filter((c) => c !== spec.xColumn) : spec.yColumns })} /> Group rows by a column (e.g. condition)
                  </label>
                </div>
              )}
              {usesXColumn(spec) && (
              <label>
                {spec.kind === 'pie' || spec.kind === 'doughnut' ? 'Slice labels from' : spec.kind === 'scatter' ? 'X values (numbers) from' : spec.kind === 'box' ? 'Group rows by' : 'Categories / X axis from'}
                <select value={spec.xColumn} onChange={(e) => set({ xColumn: +e.target.value, xLabel: spec.columns[+e.target.value] })}>
                  {spec.columns.map((c, i) => (
                    <option key={i} value={i}>{c}</option>
                  ))}
                </select>
              </label>
              )}
              <div>
                <div className="field-label">
                  {spec.kind === 'pie' || spec.kind === 'doughnut' ? 'Values from (first ticked column)' : spec.kind === 'histogram' || spec.kind === 'box' ? 'Measurements from these columns' : 'Plot these columns'}
                </div>
                <div className="col-checks">
                  {spec.columns.map((c, i) =>
                    i === spec.xColumn && usesXColumn(spec) ? null : (
                      <label key={i} className="check">
                        <input
                          type="checkbox"
                          checked={spec.yColumns.includes(i)}
                          onChange={(e) => set({ yColumns: e.target.checked ? [...spec.yColumns, i].sort((a, b) => a - b) : spec.yColumns.filter((x) => x !== i) })}
                        />
                        {c}
                      </label>
                    ),
                  )}
                </div>
              </div>
              {mismatch && (
                <p className="hint warn" role="status">
                  “{mismatch.small}” is much smaller than “{mismatch.large}”, so it will look almost flat on the same axis. Untick one, or make a separate graph for each.
                </p>
              )}
              <div className="row2">
                <label>
                  From row
                  <input type="number" min={1} max={spec.rows.length} value={spec.rowStart + 1} onChange={(e) => set({ rowStart: Math.max(0, +e.target.value - 1) })} />
                </label>
                <label>
                  To row
                  <input type="number" min={1} max={spec.rows.length} value={spec.rowEnd + 1} onChange={(e) => set({ rowEnd: Math.max(0, +e.target.value - 1) })} />
                </label>
              </div>
              <p className="hint">{spec.rows.length} data rows in the file.</p>
              {spec.kind === 'scatter' && (
                <label className="check">
                  <input type="checkbox" checked={!!spec.trendline} onChange={(e) => set({ trendline: e.target.checked })} /> Trend line with equation and R²
                </label>
              )}
              {spec.kind === 'histogram' && (
                <label>
                  Number of bars
                  <input
                    type="number"
                    min={1}
                    max={200}
                    placeholder="Auto"
                    value={spec.bins ?? ''}
                    onChange={(e) => set({ bins: e.target.value === '' ? undefined : Math.min(200, Math.max(1, Math.round(+e.target.value) || 1)) })}
                  />
                </label>
              )}
              <label>
                Graph title
                <input value={spec.title} onChange={(e) => set({ title: e.target.value })} />
              </label>
              {spec.kind !== 'pie' && spec.kind !== 'doughnut' && (
                <div className="row2">
                  <label>
                    X axis label
                    <input value={spec.xLabel} onChange={(e) => set({ xLabel: e.target.value })} />
                  </label>
                  <label>
                    Y axis label
                    <input value={spec.yLabel} onChange={(e) => set({ yLabel: e.target.value })} />
                  </label>
                </div>
              )}
              <div className="row2">
                <label className="check">
                  <input type="checkbox" checked={spec.showLegend} onChange={(e) => set({ showLegend: e.target.checked })} /> Show legend
                </label>
                <label>
                  Label size (pt)
                  <input type="number" min={4} value={spec.fontSize} onChange={(e) => set({ fontSize: Math.max(4, +e.target.value || 4) })} />
                </label>
              </div>
              <button className="link" onClick={() => setSpec(null)}>Load different data…</button>
            </div>
            <div className="chart-right">
              <div className="chart-preview">
                {preview && spec.yColumns.length > 0 ? (
                  <ChartView spec={preview} palette={poster.palette} font={resolveFont('@body', poster)} textColor={resolveColor('@text', poster.palette)} widthPx={520} heightPx={340} />
                ) : (
                  <p className="muted">Tick at least one column to plot.</p>
                )}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      {spec.columns.map((c, i) => (
                        <th key={i} className={i === spec.xColumn && usesXColumn(spec) ? 'x' : spec.yColumns.includes(i) ? 'y' : ''}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {spec.rows.slice(0, 200).map((r, ri) => (
                      <tr key={ri} className={ri < spec.rowStart || ri > spec.rowEnd ? 'out' : ''}>
                        <td className="muted">{ri + 1}</td>
                        {spec.columns.map((_, ci) => (
                          <td key={ci}>{r[ci]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-actions span-all">
              <button className="btn" onClick={onCancel}>Cancel</button>
              <button className="btn primary" disabled={!spec.yColumns.length} onClick={() => onSave(spec)}>
                {initial ? 'Update graph' : 'Add graph to poster'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

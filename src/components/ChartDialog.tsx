import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import type { ChartKind, ChartSpec, Poster } from '../types';
import { resolveColor, resolveFont, typeScale } from '../model';
import { toNumber } from '../lib/chart';
import { pickFile } from '../lib/storage';
import ChartView from './ChartView';

interface Props {
  poster: Poster;
  initial?: ChartSpec;
  initialText?: string;
  onSave: (spec: ChartSpec) => void;
  onCancel: () => void;
}

const KINDS: { id: ChartKind; label: string }[] = [
  { id: 'bar', label: 'Bar (vertical)' },
  { id: 'horizontalBar', label: 'Bar (horizontal)' },
  { id: 'line', label: 'Line' },
  { id: 'scatter', label: 'Scatter' },
  { id: 'pie', label: 'Pie' },
  { id: 'doughnut', label: 'Doughnut' },
];

export function parseCsv(text: string): { columns: string[]; rows: string[][] } {
  const res = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  const [header, ...rows] = res.data;
  if (!header) throw new Error('The file is empty.');
  return { columns: header.map((h, i) => h.trim() || `Column ${i + 1}`), rows };
}

function defaultSpec(columns: string[], rows: string[][], fontSize: number): ChartSpec {
  const numeric = columns.map((_, c) => rows.slice(0, 20).filter((r) => toNumber(r[c]) != null).length >= Math.min(rows.length, 20) * 0.7);
  const xColumn = numeric.findIndex((n) => !n) >= 0 ? numeric.findIndex((n) => !n) : 0;
  const ys = numeric.map((n, i) => (n && i !== xColumn ? i : -1)).filter((i) => i >= 0);
  return {
    kind: 'bar',
    title: '',
    columns,
    rows,
    xColumn,
    yColumns: ys.length ? ys.slice(0, 3) : [Math.min(1, columns.length - 1)],
    rowStart: 0,
    rowEnd: Math.min(rows.length - 1, 49),
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

  const preview = useMemo(() => spec && { ...spec, fontSize: 11 }, [spec]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal xwide chart-dialog">
        <h2>{initial ? 'Edit graph' : 'Graph from CSV'}</h2>
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
                <select value={spec.kind} onChange={(e) => set({ kind: e.target.value as ChartKind })}>
                  {KINDS.map((k) => (
                    <option key={k.id} value={k.id}>{k.label}</option>
                  ))}
                </select>
              </label>
              <label>
                {spec.kind === 'pie' || spec.kind === 'doughnut' ? 'Slice labels from' : spec.kind === 'scatter' ? 'X values (numbers) from' : 'Categories / X axis from'}
                <select value={spec.xColumn} onChange={(e) => set({ xColumn: +e.target.value, xLabel: spec.columns[+e.target.value] })}>
                  {spec.columns.map((c, i) => (
                    <option key={i} value={i}>{c}</option>
                  ))}
                </select>
              </label>
              <div>
                <div className="field-label">{spec.kind === 'pie' || spec.kind === 'doughnut' ? 'Values from (first ticked column)' : 'Plot these columns'}</div>
                <div className="col-checks">
                  {spec.columns.map((c, i) =>
                    i === spec.xColumn ? null : (
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
                        <th key={i} className={i === spec.xColumn ? 'x' : spec.yColumns.includes(i) ? 'y' : ''}>{c}</th>
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

// Choosing a data file for a graph or a table: CSV/TSV text or an Excel
// workbook. A workbook with several sheets shows a short list to pick from,
// inline (so it works inside other dialogs without stacking a second one).
// The Excel reader is loaded only when an Excel file is chosen.
import { useState } from 'react';
import Papa from 'papaparse';
import { pickFile, readText } from '../lib/storage';
import type { Sheet } from '../lib/xlsx';
import './DataFilePicker.css';

export const DATA_FILE_ACCEPT = '.csv,.tsv,.txt,.xlsx,.xlsm,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** True when the file name or type looks like an Excel workbook we can read. */
export function isXlsxFile(f: { name: string; type?: string }): boolean {
  return /\.(xlsx|xlsm)$/i.test(f.name) || /spreadsheetml|ms-excel\.sheet\.macroEnabled/i.test(f.type ?? '');
}

/** Cells from CSV or TSV text (the delimiter is detected). */
export function cellsFromCsvText(text: string): string[][] {
  const res = Papa.parse<string[]>(text.replace(/^\uFEFF/, '').trim(), { skipEmptyLines: true });
  return res.data.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Reads a chosen file into cells, or into a list of sheets when a workbook has more than one with data. */
export async function readDataFile(file: File): Promise<{ cells: string[][] } | { sheets: Sheet[] }> {
  if (!isXlsxFile(file)) {
    if (/\.(xls|ods|numbers)$/i.test(file.name)) {
      throw new Error('PosterHub reads Excel workbooks (.xlsx) and CSV files. Open this file in your spreadsheet app and save it as “Excel Workbook (.xlsx)” or CSV.');
    }
    const cells = cellsFromCsvText(await readText(file));
    if (!cells.length) throw new Error('The file is empty.');
    return { cells };
  }
  const { readWorkbook } = await import('../lib/xlsx');
  const sheets = (await readWorkbook(file)).filter((s) => s.rows.length);
  if (!sheets.length) throw new Error('Every sheet in this workbook is empty.');
  return sheets.length === 1 ? { cells: sheets[0].rows } : { sheets };
}

/**
 * Gives a "choose a file" action and the sheet list to show while a workbook's sheet is being picked.
 * `onCells` gets the chosen cells; `onError` a message to show.
 */
export function useDataFile(onCells: (cells: string[][]) => void, onError: (message: string) => void) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose() {
    const f = await pickFile(DATA_FILE_ACCEPT);
    if (f) await open(f);
  }

  /** Reads a file the person already gave (chosen or dropped). */
  async function open(f: File) {
    setBusy(true);
    try {
      const got = await readDataFile(f);
      if ('cells' in got) {
        setSheets(null);
        onCells(got.cells);
      } else setSheets(got.sheets);
    } catch (e) {
      setSheets(null);
      onError((e as Error).message || 'That file couldn’t be read.');
    } finally {
      setBusy(false);
    }
  }

  const picker = sheets && (
    <SheetPicker
      sheets={sheets}
      onPick={(s) => {
        setSheets(null);
        onCells(s.rows);
      }}
      onCancel={() => setSheets(null)}
    />
  );
  return { choose, open, busy, picker };
}

function SheetPicker({ sheets, onPick, onCancel }: { sheets: Sheet[]; onPick: (s: Sheet) => void; onCancel: () => void }) {
  return (
    <div className="sheet-picker" role="group" aria-labelledby="sheet-picker-title">
      <p id="sheet-picker-title" className="field-label">This workbook has {sheets.length} sheets. Which one has your data?</p>
      <ul>
        {sheets.map((s, i) => (
          <li key={i}>
            <button className="btn sheet-choice" autoFocus={i === 0} onClick={() => onPick(s)}>
              <b>{s.name}</b>
              <span className="muted">
                {s.rows.length} {s.rows.length === 1 ? 'row' : 'rows'} × {s.rows[0].length} {s.rows[0].length === 1 ? 'column' : 'columns'}
                {' · '}
                {s.rows[0].filter(Boolean).slice(0, 4).join(', ')}
                {s.rows[0].filter(Boolean).length > 4 ? '…' : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button className="btn" onClick={onCancel}>Cancel</button>
    </div>
  );
}

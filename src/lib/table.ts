// Tables: the data model helpers, the look of each table style, and reading
// cells pasted from Excel, Google Sheets, Word or a web page. Pure functions
// (apart from DOMParser) so they can be unit tested and shared by the editor,
// the PowerPoint export and the PDF export.
import Papa from 'papaparse';
import type { Palette, TableSpec, TableStyleId } from '../types';
import { resolveColor } from '../model';
import { parseColor } from './color';

/** Keeps pasted tables to a size the editor stays fast with. */
export const MAX_ROWS = 200;
export const MAX_COLS = 30;

export const TABLE_STYLES: { id: TableStyleId; label: string; hint: string }[] = [
  { id: 'academic', label: 'Academic', hint: 'Three horizontal rules, no vertical lines (journal style)' },
  { id: 'striped', label: 'Striped', hint: 'Coloured header and shaded alternate rows' },
  { id: 'minimal', label: 'Minimal', hint: 'Just a line under the header and faint row lines' },
  { id: 'grid', label: 'Grid', hint: 'Lines around every cell' },
];

export function defaultTable(fontSize: number, rows = 4, cols = 3): TableSpec {
  const header = ['Group', 'Mean', 'SD', 'n', 'p'].slice(0, cols);
  while (header.length < cols) header.push(`Column ${header.length + 1}`);
  const body = Array.from({ length: rows - 1 }, () => Array.from({ length: cols }, () => ''));
  return { rows: [header, ...body], headerRow: true, style: 'academic', fontSize, align: 'auto' };
}

/** Makes any (possibly hand-edited or old) table safe to render: rectangular, strings only, sane sizes. */
export function normalizeTable(t: Partial<TableSpec> | undefined | null, fallbackFont = 24): TableSpec {
  const raw = Array.isArray(t?.rows) ? t!.rows : [];
  let rows = raw
    .filter(Array.isArray)
    .slice(0, MAX_ROWS)
    .map((r) => r.slice(0, MAX_COLS).map((c) => (c == null ? '' : String(c))));
  if (!rows.length) rows = [['']];
  const cols = Math.max(1, ...rows.map((r) => r.length));
  rows = rows.map((r) => (r.length < cols ? [...r, ...Array(cols - r.length).fill('')] : r));
  const style = TABLE_STYLES.some((s) => s.id === t?.style) ? t!.style! : 'academic';
  const fontSize = typeof t?.fontSize === 'number' && t.fontSize > 0 ? t.fontSize : fallbackFont;
  const align = t?.align === 'left' || t?.align === 'center' ? t.align : 'auto';
  const out: TableSpec = { rows, headerRow: t?.headerRow !== false, style, fontSize, align };
  if (Array.isArray(t?.colWidths) && t!.colWidths.length === cols && t!.colWidths.every((w) => typeof w === 'number' && w > 0)) out.colWidths = [...t!.colWidths];
  return out;
}

// ---------------------------------------------------------------- editing

const blankRow = (n: number) => Array.from({ length: n }, () => '');
const cols = (t: TableSpec) => t.rows[0]?.length ?? 0;

export function insertRow(t: TableSpec, at: number): TableSpec {
  if (t.rows.length >= MAX_ROWS) return t;
  const rows = [...t.rows];
  rows.splice(Math.max(0, Math.min(rows.length, at)), 0, blankRow(cols(t)));
  return { ...t, rows };
}

export function deleteRow(t: TableSpec, at: number): TableSpec {
  if (t.rows.length <= 1) return t;
  return { ...t, rows: t.rows.filter((_, i) => i !== at) };
}

export function insertColumn(t: TableSpec, at: number): TableSpec {
  if (cols(t) >= MAX_COLS) return t;
  const i = Math.max(0, Math.min(cols(t), at));
  const rows = t.rows.map((r) => [...r.slice(0, i), '', ...r.slice(i)]);
  const colWidths = t.colWidths ? [...t.colWidths.slice(0, i), avg(t.colWidths), ...t.colWidths.slice(i)] : undefined;
  return { ...t, rows, colWidths };
}

export function deleteColumn(t: TableSpec, at: number): TableSpec {
  if (cols(t) <= 1) return t;
  return { ...t, rows: t.rows.map((r) => r.filter((_, i) => i !== at)), colWidths: t.colWidths?.filter((_, i) => i !== at) };
}

const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);

/** Writes a block of cells starting at (row, col), growing the table if needed (like pasting in a spreadsheet). */
export function pasteCells(t: TableSpec, row: number, col: number, cells: string[][]): TableSpec {
  let out = { ...t, rows: t.rows.map((r) => [...r]) };
  const needCols = Math.min(MAX_COLS, col + Math.max(0, ...cells.map((r) => r.length)));
  while (cols(out) < needCols) out = insertColumn(out, cols(out));
  const needRows = Math.min(MAX_ROWS, row + cells.length);
  while (out.rows.length < needRows) out.rows.push(blankRow(cols(out)));
  cells.forEach((r, i) =>
    r.forEach((v, j) => {
      if (row + i < out.rows.length && col + j < cols(out)) out.rows[row + i][col + j] = v;
    }),
  );
  return out;
}

export function setCell(t: TableSpec, row: number, col: number, text: string): TableSpec {
  if (t.rows[row]?.[col] === text) return t;
  return pasteCells(t, row, col, [[text]]);
}

// ---------------------------------------------------------------- clipboard

const clean = (s: string) => s.replace(/ /g, ' ').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();

/**
 * Reads cells from an HTML clipboard payload (Excel, Google Sheets, Word, web pages).
 * The HTML is parsed into an inert document and only the cell *text* is kept,
 * so nothing in it can run, load or carry styling into the poster.
 */
export function cellsFromHtml(html: string): string[][] | null {
  if (!html || !/<table[\s>]/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return null;
  const grid: string[][] = [];
  // Merged cells are spread out so every row has the same columns.
  const taken: boolean[][] = [];
  Array.from(table.rows).forEach((tr, r) => {
    if (r >= MAX_ROWS) return;
    grid[r] ??= [];
    taken[r] ??= [];
    let c = 0;
    for (const cell of Array.from(tr.cells)) {
      while (taken[r][c]) c++;
      cell.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
      cell.querySelectorAll('style,script').forEach((n) => n.remove());
      const text = clean(cell.textContent ?? '');
      const cs = Math.max(1, Math.min(MAX_COLS, cell.colSpan || 1));
      const rs = Math.max(1, Math.min(MAX_ROWS, cell.rowSpan || 1));
      for (let i = 0; i < rs; i++)
        for (let j = 0; j < cs; j++) {
          grid[r + i] ??= [];
          taken[r + i] ??= [];
          grid[r + i][c + j] = i === 0 && j === 0 ? text : '';
          taken[r + i][c + j] = true;
        }
      c += cs;
    }
  });
  const rows = grid.slice(0, MAX_ROWS).map((r) => Array.from(r ?? [], (v) => v ?? ''));
  return trimEmpty(rows);
}

/** Reads tab-separated cells (what spreadsheets put on the clipboard as plain text). Quoted cells may contain tabs or newlines. */
export function cellsFromTsv(text: string): string[][] | null {
  if (!text || !text.includes('\t')) return null;
  const res = Papa.parse<string[]>(text.replace(/\r\n?/g, '\n').replace(/\n+$/, ''), { delimiter: '\t', skipEmptyLines: false });
  const rows = (res.data as string[][]).map((r) => r.map((c) => clean(String(c ?? ''))));
  return trimEmpty(rows);
}

/** Cells from a clipboard payload, preferring the HTML table, else tab-separated text. Null when it is not tabular. */
export function cellsFromClipboard(html: string | undefined, text: string | undefined): string[][] | null {
  const fromHtml = html ? cellsFromHtml(html) : null;
  if (fromHtml && (fromHtml.length > 1 || (fromHtml[0]?.length ?? 0) > 1)) return fromHtml;
  const fromText = text ? cellsFromTsv(text) : null;
  if (fromText && (fromText.length > 1 || (fromText[0]?.length ?? 0) > 1)) return fromText;
  return null;
}

function trimEmpty(rows: string[][]): string[][] | null {
  const width = Math.min(MAX_COLS, Math.max(0, ...rows.map((r) => r.length)));
  let grid = rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
  while (grid.length && grid[grid.length - 1].every((c) => !c)) grid.pop();
  while (grid.length && grid[0].every((c) => !c)) grid.shift();
  // drop empty trailing columns
  let w = width;
  while (w > 1 && grid.every((r) => !r[w - 1])) w--;
  grid = grid.map((r) => r.slice(0, w));
  return grid.length && w ? grid.slice(0, MAX_ROWS) : null;
}

/** Tab-separated text, the format spreadsheets accept when pasting. */
export function tableToTsv(t: TableSpec): string {
  return t.rows.map((r) => r.map((c) => (/[\t\n"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join('\t')).join('\n');
}

/** CSV for the graph dialog. */
export function tableToCsv(t: TableSpec): string {
  return Papa.unparse(t.rows);
}

/** Rows and relative column widths from an HTML table (e.g. a table imported from PowerPoint). */
export function tableFromHtml(html: string): Pick<TableSpec, 'rows' | 'colWidths'> | null {
  const rows = cellsFromHtml(html);
  if (!rows) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const widths = Array.from(doc.querySelectorAll('col')).map((c) => parseFloat((c as HTMLElement).style.width) || 0);
  return { rows, colWidths: widths.length === rows[0].length && widths.every((w) => w > 0) ? widths : undefined };
}

// ---------------------------------------------------------------- looks

const NUMERIC = /^[\s(]*[-+−±<>≤≥~]?\s*[$€£]?\s*\d[\d,.\s]*(e[-+]?\d+)?\s*[%‰*†‡]*\)?\s*(±\s*\d[\d.,]*\s*)?[*†‡]*$/i;
export const isNumeric = (s: string) => NUMERIC.test(s.trim());

/** Columns whose body cells are (mostly) numbers. */
export function numericColumns(t: TableSpec): boolean[] {
  const start = t.headerRow ? 1 : 0;
  return (t.rows[0] ?? []).map((_, c) => {
    const vals = t.rows.slice(start).map((r) => r[c]).filter((v) => v && v.trim());
    return vals.length > 0 && vals.filter(isNumeric).length / vals.length >= 0.75;
  });
}

export function columnAlign(t: TableSpec): ('left' | 'center' | 'right')[] {
  if (t.align !== 'auto') return (t.rows[0] ?? []).map(() => t.align as 'left' | 'center');
  return numericColumns(t).map((n) => (n ? 'right' : 'left'));
}

/** Relative column widths: the stored ones, else estimated from the longest text in each column. */
export function columnWeights(t: TableSpec): number[] {
  if (t.colWidths?.length === cols(t)) return t.colWidths;
  return (t.rows[0] ?? []).map((_, c) => {
    const longest = Math.max(...t.rows.map((r) => Math.max(...(r[c] ?? '').split('\n').map((l) => l.length))));
    return Math.min(40, Math.max(4, longest + 2));
  });
}

export interface Border {
  pt: number;
  color: string;
}

export interface CellLook {
  fill: string | null;
  color: string;
  bold: boolean;
  top: Border | null;
  right: Border | null;
  bottom: Border | null;
  left: Border | null;
}

/** Mixes two hex colours; t = 0 gives a, 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  if (!x || !y) return a;
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/** Readable text on a filled header: white or the text colour, whichever contrasts more. */
function onFill(fill: string, text: string): string {
  const lum = (c: string) => {
    const rgb = parseColor(c);
    if (!rgb) return 1;
    const [r, g, b] = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (hi + 0.05) / (lo + 0.05);
  };
  return contrast(fill, '#ffffff') >= contrast(fill, text) ? '#ffffff' : text;
}

/**
 * How one cell looks in a given table style. The editor, the PDF and the
 * PowerPoint export all use this so the table looks the same everywhere.
 */
export function cellLook(t: TableSpec, palette: Palette, r: number, _c: number): CellLook {
  const text = resolveColor('@text', palette);
  const bg = resolveColor('@background', palette);
  const primary = resolveColor('@primary', palette);
  const nRows = t.rows.length;
  const header = t.headerRow && r === 0;
  const bodyIndex = t.headerRow ? r - 1 : r;
  const last = r === nRows - 1;
  const look: CellLook = { fill: null, color: text, bold: header, top: null, right: null, bottom: null, left: null };
  const rule = (pt: number, color = text): Border => ({ pt, color });
  switch (t.style) {
    case 'academic': {
      if (r === 0) look.top = rule(1.5);
      if (header) look.bottom = rule(0.75);
      if (last) look.bottom = rule(1.5);
      break;
    }
    case 'striped': {
      if (header) {
        look.fill = primary;
        look.color = onFill(primary, text);
      } else if (bodyIndex % 2 === 1) look.fill = resolveColor('@surface', palette);
      break;
    }
    case 'minimal': {
      if (header) {
        look.color = primary;
        look.bottom = rule(1.5, primary);
      } else if (!last) look.bottom = rule(0.5, mix(text, bg, 0.75));
      break;
    }
    case 'grid': {
      const line = rule(0.75, mix(text, bg, 0.45));
      look.top = look.bottom = look.left = look.right = line;
      if (header) look.fill = resolveColor('@surface', palette);
      break;
    }
  }
  return look;
}

/** Cell padding as a fraction of the font size (top/bottom, left/right). */
export const CELL_PAD = { v: 0.3, h: 0.55 };

// Reads the cells of an Excel workbook (.xlsx / .xlsm) so a graph or table can
// be made from it. An .xlsx file is a zip of XML files, so this needs only
// JSZip (already used for PowerPoint and Word import) and the browser's
// DOMParser: no extra library, nothing fetched, no scripts run. Callers load
// this module with import() so it stays out of the main bundle.
//
// What it keeps: each cell's value as Excel shows it, roughly. Numbers keep
// the decimals and % of their number format, dates become 2024-03-01, and
// formulas give the value Excel last calculated. Hidden sheets are skipped.
import JSZip from 'jszip';

export interface Sheet {
  name: string;
  /** Rows of cell text, rectangular, with empty rows and empty edge columns removed. */
  rows: string[][];
}

/** Stops a huge sheet from freezing the page; graphs and tables never need this many. */
export const MAX_SHEET_ROWS = 20000;
export const MAX_SHEET_COLS = 200;

export class SpreadsheetError extends Error {}

/** Reads every visible sheet of a workbook. Throws SpreadsheetError with a message a person can act on. */
export async function readWorkbook(data: ArrayBuffer | Uint8Array | Blob): Promise<Sheet[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new SpreadsheetError(notXlsxMessage(await head(data)));
  }
  const text = async (path: string) => {
    const f = zip.file(path.replace(/^\//, ''));
    return f ? f.async('string') : null;
  };
  const workbookXml = await text('xl/workbook.xml');
  if (!workbookXml) throw new SpreadsheetError('This file isn’t an Excel workbook. Save it from Excel as “Excel Workbook (.xlsx)” and try again.');
  const wb = xml(workbookXml);
  const date1904 = /^(1|true)$/i.test(all(wb, 'workbookPr')[0]?.getAttribute('date1904') ?? '');
  const rels = relationships(await text('xl/_rels/workbook.xml.rels'));
  const shared = sharedStrings(await text('xl/sharedStrings.xml'));
  const formats = cellFormats(await text('xl/styles.xml'));

  const sheets: Sheet[] = [];
  for (const s of all(wb, 'sheet')) {
    const state = s.getAttribute('state');
    if (state === 'hidden' || state === 'veryHidden') continue;
    const rid = attrLocal(s, 'id');
    const target = rid ? rels.get(rid) : undefined;
    if (!target) continue;
    const sheetXml = await text(target.startsWith('/') ? target : `xl/${target}`);
    if (sheetXml == null) continue; // chart sheets and the like have no cells
    sheets.push({ name: s.getAttribute('name') || `Sheet ${sheets.length + 1}`, rows: readSheet(sheetXml, shared, formats, date1904) });
  }
  if (!sheets.length) throw new SpreadsheetError('This workbook has no sheets with cells in it.');
  return sheets;
}

// ---------------------------------------------------------------- XML helpers

function xml(s: string): Document {
  const doc = new DOMParser().parseFromString(s, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new SpreadsheetError('This workbook looks damaged. Open it in Excel, save a copy, and try that.');
  return doc;
}

/** Elements by local name, whatever namespace prefix the file uses. */
function all(root: Document | Element, local: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', local));
}

function child(el: Element, local: string): Element | undefined {
  return Array.from(el.children).find((c) => c.localName === local);
}

/** Reads an attribute such as r:id by its local name. */
function attrLocal(el: Element, local: string): string | null {
  for (const a of Array.from(el.attributes)) if (a.localName === local && a.prefix) return a.value;
  return el.getAttribute(local);
}

function relationships(s: string | null): Map<string, string> {
  const m = new Map<string, string>();
  if (!s) return m;
  for (const r of all(xml(s), 'Relationship')) {
    const id = r.getAttribute('Id');
    const target = r.getAttribute('Target');
    if (id && target && r.getAttribute('TargetMode') !== 'External') m.set(id, target);
  }
  return m;
}

/** The text of a shared or inline string, joining rich-text runs and leaving out phonetic hints. */
function stringText(si: Element): string {
  let out = '';
  const walk = (el: Element) => {
    for (const c of Array.from(el.children)) {
      if (c.localName === 'rPh' || c.localName === 'phoneticPr') continue;
      if (c.localName === 't') out += c.textContent ?? '';
      else walk(c);
    }
  };
  walk(si);
  return out;
}

function sharedStrings(s: string | null): string[] {
  return s ? all(xml(s), 'si').map(stringText) : [];
}

// ---------------------------------------------------------------- number formats

interface Format { kind: 'general' | 'date' | 'time' | 'datetime' | 'fixed' | 'percent' | 'text'; decimals: number }

const GENERAL: Format = { kind: 'general', decimals: 0 };

// Excel's built-in formats that aren't "General", by id.
const BUILTIN: Record<number, string> = {
  1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00',
  14: 'yyyy-mm-dd', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM',
  20: 'h:mm', 21: 'h:mm:ss', 22: 'yyyy-mm-dd h:mm', 37: '#,##0', 38: '#,##0', 39: '#,##0.00', 40: '#,##0.00',
  45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 49: '@',
};

/** Sorts a number format code into the few kinds we display differently. */
export function classifyFormat(code: string): Format {
  // Only the first section (positive numbers) matters; drop quoted text, escapes, colours and locales.
  const first = code.split(';')[0];
  const bare = first.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/_./g, '').replace(/\*./g, '').replace(/\[(?!h\]|m\]|s\])[^\]]*\]/gi, '');
  if (!bare.trim() || /^general$/i.test(bare.trim())) return GENERAL;
  if (bare.trim() === '@') return { kind: 'text', decimals: 0 };
  const hasDate = /[dy]/i.test(bare) || /m{3,}/i.test(bare) || (/m/i.test(bare) && !/[hs]/i.test(bare) && !/[0#?]/.test(bare));
  const hasTime = /[hs]/i.test(bare) || /\[m\]/i.test(bare);
  if (hasDate || hasTime) {
    return { kind: hasDate && hasTime ? 'datetime' : hasDate ? 'date' : 'time', decimals: 0 };
  }
  if (/E[+-]/i.test(bare)) return GENERAL;
  const dec = /\.([0#?]+)/.exec(bare)?.[1].length ?? 0;
  if (bare.includes('%')) return { kind: 'percent', decimals: dec };
  if (/[0#?]/.test(bare)) return { kind: 'fixed', decimals: dec };
  return GENERAL;
}

/** The display format of each cell style (the s="…" index on a cell). */
function cellFormats(s: string | null): Format[] {
  if (!s) return [];
  const doc = xml(s);
  const custom = new Map<number, string>();
  for (const f of all(doc, 'numFmt')) custom.set(Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') ?? '');
  const xfs = all(doc, 'cellXfs')[0];
  if (!xfs) return [];
  return Array.from(xfs.children)
    .filter((x) => x.localName === 'xf')
    .map((x) => {
      const id = Number(x.getAttribute('numFmtId') ?? 0);
      const code = custom.get(id) ?? BUILTIN[id];
      if (code) return classifyFormat(code);
      // Locale-specific built-in date formats (East Asian versions of Excel).
      if ((id >= 27 && id <= 36) || (id >= 50 && id <= 58)) return { kind: 'date', decimals: 0 } as Format;
      return GENERAL;
    });
}

/** Writes a number without floating-point noise (0.30000000000000004 → 0.3). */
export function plainNumber(n: number): string {
  if (!Number.isFinite(n)) return '';
  return String(parseFloat(n.toPrecision(15)));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Turns an Excel date serial number into yyyy-mm-dd, hh:mm, or both. */
export function excelDate(serial: number, kind: 'date' | 'time' | 'datetime', date1904 = false): string {
  // Day 0 is 1899-12-31, and Excel counts a 29 Feb 1900 that never was; 25569 is 1970-01-01.
  const days = date1904 ? serial + 1462 : serial;
  const ms = Math.round((days - 25569) * 86400) * 1000;
  const d = new Date(ms);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const secs = d.getUTCSeconds();
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${secs ? `:${pad(secs)}` : ''}`;
  if (kind === 'time') return time;
  if (kind === 'datetime') return `${date} ${time}`;
  return date;
}

function formatNumber(raw: string, f: Format, date1904: boolean): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  switch (f.kind) {
    case 'date':
    case 'time':
    case 'datetime':
      return excelDate(n, f.kind, date1904);
    case 'percent':
      return `${(n * 100).toFixed(f.decimals)}%`;
    case 'fixed':
      return n.toFixed(f.decimals);
    default:
      return plainNumber(n);
  }
}

// ---------------------------------------------------------------- sheets

/** Column letters to a 0-based index: A → 0, Z → 25, AA → 26. */
export function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readSheet(s: string, shared: string[], formats: Format[], date1904: boolean): string[][] {
  const doc = xml(s);
  const grid: string[][] = [];
  let nextRow = 0;
  for (const row of all(doc, 'row')) {
    const r = row.getAttribute('r') ? Number(row.getAttribute('r')) - 1 : nextRow;
    nextRow = r + 1;
    if (r >= MAX_SHEET_ROWS) break;
    const out: string[] = [];
    let nextCol = 0;
    for (const c of Array.from(row.children)) {
      if (c.localName !== 'c') continue;
      const ref = c.getAttribute('r');
      const col = ref ? columnIndex(ref) : nextCol;
      nextCol = col + 1;
      if (col < 0 || col >= MAX_SHEET_COLS) continue;
      const v = child(c, 'v')?.textContent ?? '';
      const t = c.getAttribute('t');
      let value: string;
      if (t === 's') value = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') value = (child(c, 'is') && stringText(child(c, 'is')!)) || '';
      else if (t === 'str') value = v;
      else if (t === 'b') value = v === '1' ? 'TRUE' : v === '0' ? 'FALSE' : v;
      else if (t === 'e') value = v; // #DIV/0! and friends, as Excel shows them
      else if (t === 'd') value = v.replace(/T00:00:00(\.0+)?Z?$/, '');
      else value = v === '' ? '' : formatNumber(v, formats[Number(c.getAttribute('s') ?? 0)] ?? GENERAL, date1904);
      out[col] = value.replace(/\r\n?/g, '\n');
    }
    grid[r] = out;
  }
  return tidy(grid);
}

/** Fills gaps, drops empty rows, and trims empty columns on the left and right. */
export function tidy(grid: (string[] | undefined)[]): string[][] {
  const rows = grid.filter((r): r is string[] => !!r && r.some((c) => c != null && c.trim() !== ''));
  if (!rows.length) return [];
  const width = Math.max(...rows.map((r) => r.length));
  const full = rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
  const used = (c: number) => full.some((r) => r[c].trim() !== '');
  let lo = 0;
  let hi = width - 1;
  while (lo < hi && !used(lo)) lo++;
  while (hi > lo && !used(hi)) hi--;
  return full.map((r) => r.slice(lo, hi + 1));
}

// ---------------------------------------------------------------- friendly errors

async function head(data: ArrayBuffer | Uint8Array | Blob): Promise<Uint8Array> {
  // Checked by shape, not instanceof: tests and other windows can hand over typed arrays from another realm.
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, Math.min(8, data.byteLength));
  if (typeof (data as Blob).slice === 'function' && 'size' in data) return new Uint8Array(await (data as Blob).slice(0, 8).arrayBuffer());
  return new Uint8Array(data as ArrayBuffer, 0, Math.min(8, (data as ArrayBuffer).byteLength));
}

/** Old .xls files and password-protected workbooks are both "compound files", not zips. */
function notXlsxMessage(start: Uint8Array): string {
  const cfb = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((b, i) => start[i] === b);
  return cfb
    ? 'This is an older Excel file (.xls) or a password-protected workbook. In Excel, remove the password if there is one, then use File → Save As → “Excel Workbook (.xlsx)”.'
    : 'This file isn’t an Excel workbook. Save it from Excel as “Excel Workbook (.xlsx)” and try again.';
}

import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  cellLook, cellsFromClipboard, cellsFromHtml, cellsFromTsv, columnAlign, deleteColumn, deleteRow, insertColumn, insertRow,
  isNumeric, normalizeTable, pasteCells, setCell, tableFromHtml, tableToCsv, tableToTsv, MAX_COLS, MAX_ROWS,
} from '../../src/lib/table';
import { PALETTES, createPoster, makeElement } from '../../src/model';
import { buildPptx } from '../../src/lib/exporters';
import { checkPoster } from '../../src/lib/checks';
import type { TableSpec } from '../../src/types';

const t = (rows: string[][], extra: Partial<TableSpec> = {}): TableSpec => normalizeTable({ rows, ...extra });

describe('reading pasted cells', () => {
  it('reads tab-separated spreadsheet text, including quoted cells with tabs and newlines', () => {
    expect(cellsFromTsv('A\tB\n1\t2\n')).toEqual([['A', 'B'], ['1', '2']]);
    expect(cellsFromTsv('Name\tNote\r\nX\t"two\nlines"')).toEqual([['Name', 'Note'], ['X', 'two\nlines']]);
    expect(cellsFromTsv('just words')).toBeNull();
  });

  it('keeps only the text of HTML tables, spreading merged cells', () => {
    const html = '<table><tr><td colspan=2>Wide<script>x()</script></td><td rowspan=2>Tall</td></tr><tr><td>a<br>b</td><td><img src=x onerror=alert(1)>c</td></tr></table>';
    expect(cellsFromHtml(html)).toEqual([['Wide', '', 'Tall'], ['a\nb', 'c', '']]);
  });

  it('prefers the HTML table, falls back to tabs, and ignores single values', () => {
    expect(cellsFromClipboard('<table><tr><td>x</td><td>y</td></tr></table>', 'nope')).toEqual([['x', 'y']]);
    expect(cellsFromClipboard('<b>hi</b>', 'a\tb')).toEqual([['a', 'b']]);
    expect(cellsFromClipboard('', 'one value')).toBeNull();
    expect(cellsFromClipboard('<table><tr><td>only</td></tr></table>', 'only')).toBeNull();
  });

  it('trims empty edges and caps huge pastes', () => {
    expect(cellsFromTsv('\t\t\nA\tB\t\n\t\t\n')).toEqual([['A', 'B']]);
    const big = Array.from({ length: MAX_ROWS + 50 }, () => Array(MAX_COLS + 5).fill('1').join('\t')).join('\n');
    const rows = cellsFromTsv(big)!;
    expect(rows.length).toBe(MAX_ROWS);
    expect(rows[0].length).toBe(MAX_COLS);
  });

  it('reads PowerPoint table HTML with its column widths', () => {
    const r = tableFromHtml('<table><colgroup><col style="width:25%"><col style="width:75%"></colgroup><tr><td>a</td><td>b</td></tr></table>');
    expect(r).toEqual({ rows: [['a', 'b']], colWidths: [25, 75] });
  });
});

describe('editing tables', () => {
  it('normalises bad data into a safe rectangular table', () => {
    const n = normalizeTable({ rows: [['a'], ['b', 2 as unknown as string, null as unknown as string]], style: 'bogus' as never, fontSize: -1 });
    expect(n.rows).toEqual([['a', '', ''], ['b', '2', '']]);
    expect(n.style).toBe('academic');
    expect(n.fontSize).toBe(24);
    expect(normalizeTable(undefined).rows).toEqual([['']]);
  });

  it('adds and removes rows and columns but never the last one', () => {
    let x = t([['a', 'b'], ['c', 'd']]);
    x = insertRow(x, 1);
    expect(x.rows).toEqual([['a', 'b'], ['', ''], ['c', 'd']]);
    x = insertColumn(x, 0);
    expect(x.rows[0]).toEqual(['', 'a', 'b']);
    x = deleteColumn(deleteRow(x, 1), 0);
    expect(x.rows).toEqual([['a', 'b'], ['c', 'd']]);
    expect(deleteRow(t([['a']]), 0).rows).toEqual([['a']]);
    expect(deleteColumn(t([['a']]), 0).rows).toEqual([['a']]);
  });

  it('pastes a block of cells, growing the table like a spreadsheet', () => {
    const x = pasteCells(t([['a', 'b']]), 0, 1, [['1', '2'], ['3', '4']]);
    expect(x.rows).toEqual([['a', '1', '2'], ['', '3', '4']]);
    expect(setCell(x, 1, 0, 'z').rows[1][0]).toBe('z');
  });

  it('copies out as tab-separated text and CSV', () => {
    const x = t([['Name', 'Note'], ['A', 'has, comma'], ['B', 'two\nlines']]);
    expect(tableToTsv(x)).toBe('Name\tNote\nA\thas, comma\nB\t"two\nlines"');
    expect(cellsFromTsv(tableToTsv(x))).toEqual(x.rows);
    expect(tableToCsv(x)).toContain('"has, comma"');
  });
});

describe('table looks', () => {
  const pal = PALETTES[0];
  it('right-aligns number columns automatically', () => {
    for (const s of ['12', '0.05', '-3.2', '<0.001', '45%', '12.3 ± 0.4', '1,234', '0.01**', '(12)']) expect(isNumeric(s)).toBe(true);
    for (const s of ['Control', 'n/a', 'Group A']) expect(isNumeric(s)).toBe(false);
    expect(columnAlign(t([['Group', 'Mean'], ['A', '1.2'], ['B', '3.4']]))).toEqual(['left', 'right']);
    expect(columnAlign(t([['Group', 'Mean'], ['A', '1.2']], { align: 'center' }))).toEqual(['center', 'center']);
  });

  it('draws three rules for the academic style', () => {
    const x = t([['h', 'h'], ['a', 'b'], ['c', 'd']]);
    expect(cellLook(x, pal, 0, 0).top?.pt).toBe(1.5);
    expect(cellLook(x, pal, 0, 0).bottom?.pt).toBe(0.75);
    expect(cellLook(x, pal, 1, 0).bottom).toBeNull();
    expect(cellLook(x, pal, 2, 0).bottom?.pt).toBe(1.5);
    expect(cellLook(x, pal, 0, 0).bold).toBe(true);
    expect(cellLook({ ...x, headerRow: false }, pal, 0, 0).bold).toBe(false);
  });

  it('shades the header and alternate rows in the striped style with readable header text', () => {
    const x = t([['h'], ['a'], ['b'], ['c']], { style: 'striped' });
    expect(cellLook(x, pal, 0, 0).fill).toBe(pal.primary);
    expect(cellLook(x, pal, 0, 0).color).toBe('#ffffff');
    expect(cellLook(x, pal, 1, 0).fill).toBeNull();
    expect(cellLook(x, pal, 2, 0).fill).toBe(pal.surface);
  });

  it('outlines every cell in the grid style', () => {
    const l = cellLook(t([['a']], { style: 'grid' }), pal, 0, 0);
    expect([l.top, l.right, l.bottom, l.left].every(Boolean)).toBe(true);
  });
});

describe('tables in the poster', () => {
  const poster = () =>
    createPoster({ name: 'T', width: 841, height: 1189, sizePreset: 'A0', columns: 3, palette: PALETTES[0], headingFont: 'Montserrat', bodyFont: 'Open Sans', template: 'blank' as never });

  it('makes a new table with a header row sized for the poster', () => {
    const p = poster();
    const el = makeElement('table', p);
    expect(el.table!.headerRow).toBe(true);
    expect(el.table!.rows.length).toBe(4);
    expect(el.table!.fontSize).toBe(28); // same as body text
    expect(el.h).toBeGreaterThan(30);
  });

  it('flags empty tables and tiny table text in the poster check', () => {
    const p = poster();
    const el = makeElement('table', p, { x: 100, y: 100 });
    el.table = t([['', ''], ['', '']]);
    p.elements = [el];
    expect(checkPoster(p).some((i) => i.title === 'An empty table')).toBe(true);
    el.table = t([['a', 'b']], { fontSize: 8 });
    expect(checkPoster(p).some((i) => i.title.includes('Table text may be too small') && i.severity === 'problem')).toBe(true);
    expect(checkPoster(p, new Map(), new Set([el.id])).some((i) => i.title.includes('rows are hidden'))).toBe(true);
  });

  it('exports a real PowerPoint table in the chosen style', async () => {
    const p = poster();
    p.elements = [makeElement('table', p, { table: t([['Group', 'Mean'], ['A', '1.5'], ['two\nlines', '2']], { style: 'striped' }) })];
    const { pptx } = await buildPptx(p);
    const zip = await JSZip.loadAsync((await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer);
    const slide = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(slide).toContain('<a:tbl>');
    expect((slide.match(/<a:tr /g) ?? []).length).toBe(3);
    for (const s of ['Group', 'Mean', '1.5', 'two', 'lines']) expect(slide).toContain(`<a:t>${s}</a:t>`);
    expect(slide).toContain('1F4E79'); // header fill
    expect(slide).toContain('algn="r"'); // number column
  });
});

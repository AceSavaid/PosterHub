import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import fs from 'node:fs';
import path from 'node:path';
import { classifyFormat, columnIndex, excelDate, plainNumber, readWorkbook, SpreadsheetError, tidy } from '../../src/lib/xlsx';
import { cellsFromCsvText, isXlsxFile, readDataFile } from '../../src/components/DataFilePicker';

// tests/fixtures/results.xlsx was written by openpyxl and re-saved by LibreOffice Calc,
// so it has shared strings, styles, a cached formula value and a hidden sheet, like a real file.
const fixture = fs.readFileSync(path.join(__dirname, '../fixtures/results.xlsx'));

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/** Builds a tiny workbook by hand, for the cases the fixture doesn't cover. */
async function workbook(sheetXml: string, opts: { shared?: string; styles?: string; workbookPr?: string } = {}) {
  const zip = new JSZip();
  zip.file('xl/workbook.xml', `<workbook ${NS}>${opts.workbookPr ?? ''}<sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="/xl/worksheets/sheet1.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml', `<worksheet ${NS}><sheetData>${sheetXml}</sheetData></worksheet>`);
  if (opts.shared) zip.file('xl/sharedStrings.xml', `<sst ${NS}>${opts.shared}</sst>`);
  if (opts.styles) zip.file('xl/styles.xml', `<styleSheet ${NS}>${opts.styles}</styleSheet>`);
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('readWorkbook', () => {
  it('reads a real workbook as Excel shows it', async () => {
    const sheets = await readWorkbook(fixture);
    expect(sheets.map((s) => s.name)).toEqual(['Results', 'Notes']); // the hidden "Scratch" sheet is left out
    expect(sheets[0].rows).toEqual([
      ['Condition', 'Mean RT (ms)', 'SD', 'Accuracy', 'Session'],
      ['Control', '512.0', '48.25', '93.1%', '2024-03-01'],
      ['Caffeine', '468.0', '41.50', '95.2%', '2024-03-08'],
      ['Placebo', '505.0', '45.00', '94.0%', '2024-03-15'],
      ['Mean', '495.0', '', '', ''], // formula: the value Excel (here Calc) last worked out
    ]);
    expect(sheets[1].rows).toEqual([['Notes'], ['Reaction times from the pilot study']]);
  });

  it('accepts a Blob, as a picked file gives', async () => {
    const sheets = await readWorkbook(new Blob([fixture]));
    expect(sheets[0].rows[0][0]).toBe('Condition');
  });

  it('handles inline strings, rich text, booleans, errors, gaps and prefixed tags', async () => {
    const data = await workbook(
      `<row r="1"><c r="A1" t="inlineStr"><is><t>Group</t></is></c><c r="C1" t="s"><v>0</v></c></row>
       <row r="3"><c r="A3" t="b"><v>1</v></c><c r="B3" t="e"><v>#DIV/0!</v></c><c r="C3"><v>0.1</v></c></row>
       <row><c t="str"><v>after</v></c><c><v>0.30000000000000004</v></c></row>`,
      { shared: '<si><r><t>Bold</t></r><r><t xml:space="preserve"> part</t></r><rPh><t>ふりがな</t></rPh></si>' },
    );
    const [s] = await readWorkbook(data);
    expect(s.rows).toEqual([
      ['Group', '', 'Bold part'],
      ['TRUE', '#DIV/0!', '0.1'],
      ['after', '0.3', ''],
    ]);
  });

  it('reads files whose tags carry a namespace prefix', async () => {
    const zip = new JSZip();
    zip.file('xl/workbook.xml', '<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><x:sheets><x:sheet name="P" sheetId="1" r:id="rId9"/></x:sheets></x:workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Target="worksheets/a.xml"/></Relationships>');
    zip.file('xl/worksheets/a.xml', '<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData><x:row r="1"><x:c r="B1" t="inlineStr"><x:is><x:t>hi</x:t></x:is></x:c></x:row></x:sheetData></x:worksheet>');
    const [s] = await readWorkbook(await zip.generateAsync({ type: 'uint8array' }));
    expect(s).toEqual({ name: 'P', rows: [['hi']] });
  });

  it('uses custom number formats and the 1904 date system', async () => {
    const styles = `<numFmts count="2"><numFmt numFmtId="164" formatCode="[$-409]d mmm yyyy;@"/><numFmt numFmtId="165" formatCode="#,##0.000"/></numFmts>
      <cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="165"/><xf numFmtId="20"/></cellXfs>`;
    const data = await workbook('<row r="1"><c r="A1" s="1"><v>0</v></c><c r="B1" s="2"><v>1234.5</v></c><c r="C1" s="3"><v>0.75</v></c></row>', { styles, workbookPr: '<workbookPr date1904="1"/>' });
    const [s] = await readWorkbook(data);
    expect(s.rows).toEqual([['1904-01-01', '1234.500', '18:00']]);
  });

  it('explains old .xls, password-protected and non-Excel files', async () => {
    const cfb = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    await expect(readWorkbook(cfb)).rejects.toThrow(/older Excel file \(\.xls\) or a password-protected/);
    await expect(readWorkbook(new TextEncoder().encode('a,b\n1,2'))).rejects.toThrow(SpreadsheetError);
    const notExcel = new JSZip();
    notExcel.file('word/document.xml', '<w/>');
    await expect(readWorkbook(await notExcel.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/isn’t an Excel workbook/);
  });
});

describe('helpers', () => {
  it('turns column letters into indexes', () => {
    expect(['A1', 'Z9', 'AA1', 'AZ3', 'BA1', 'XFD1'].map(columnIndex)).toEqual([0, 25, 26, 51, 52, 16383]);
  });

  it('sorts number formats', () => {
    expect(classifyFormat('General').kind).toBe('general');
    expect(classifyFormat('0.00')).toEqual({ kind: 'fixed', decimals: 2 });
    expect(classifyFormat('#,##0.0_);[Red]\\(#,##0.0\\)')).toEqual({ kind: 'fixed', decimals: 1 });
    expect(classifyFormat('0%')).toEqual({ kind: 'percent', decimals: 0 });
    expect(classifyFormat('dd/mm/yyyy').kind).toBe('date');
    expect(classifyFormat('mmm-yy').kind).toBe('date');
    expect(classifyFormat('mm:ss').kind).toBe('time');
    expect(classifyFormat('[h]:mm:ss').kind).toBe('time');
    expect(classifyFormat('yyyy-mm-dd hh:mm').kind).toBe('datetime');
    expect(classifyFormat('0.00 "mm"').kind).toBe('fixed'); // quoted unit text is not a date
    expect(classifyFormat('0.00E+00').kind).toBe('general');
    expect(classifyFormat('@').kind).toBe('text');
  });

  it('writes dates and numbers plainly', () => {
    expect(excelDate(45352, 'date')).toBe('2024-03-01');
    expect(excelDate(61, 'date')).toBe('1900-03-01');
    expect(excelDate(45352.5, 'datetime')).toBe('2024-03-01 12:00');
    expect(excelDate(0.5 + 30 / 86400, 'time')).toBe('12:00:30');
    expect(plainNumber(1 / 3)).toBe('0.333333333333333');
    expect(plainNumber(1e21)).toBe('1e+21');
  });

  it('tidies the grid', () => {
    expect(tidy([undefined, ['', 'a', '', ''], ['', '', '', ''], ['', '1', '2']])).toEqual([['a', ''], ['1', '2']]);
    expect(tidy([])).toEqual([]);
  });

  it('recognises Excel files by name or type', () => {
    expect(isXlsxFile({ name: 'Data.XLSX' })).toBe(true);
    expect(isXlsxFile({ name: 'macro.xlsm' })).toBe(true);
    expect(isXlsxFile({ name: 'blob', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })).toBe(true);
    expect(isXlsxFile({ name: 'data.csv', type: 'text/csv' })).toBe(false);
  });

  it('reads CSV text, with or without a byte order mark', () => {
    expect(cellsFromCsvText('\uFEFFa,b\n1,2\n\n,\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(cellsFromCsvText('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('readDataFile', () => {
  it('gives the sheets to choose from when a workbook has several', async () => {
    const got = await readDataFile(new File([fixture], 'results.xlsx'));
    expect('sheets' in got && got.sheets.map((s) => s.name)).toEqual(['Results', 'Notes']);
  });

  it('gives cells straight away for CSV and single-sheet workbooks', async () => {
    expect(await readDataFile(new File(['x,y\n1,2'], 'd.csv', { type: 'text/csv' }))).toEqual({ cells: [['x', 'y'], ['1', '2']] });
    const one = await workbook('<row r="1"><c r="A1" t="inlineStr"><is><t>only</t></is></c></row>');
    expect(await readDataFile(new File([one], 'one.xlsx'))).toEqual({ cells: [['only']] });
  });

  it('asks for .xlsx when given an old or non-Excel spreadsheet', async () => {
    await expect(readDataFile(new File(['x'], 'old.xls'))).rejects.toThrow(/save it as “Excel Workbook \(\.xlsx\)”/);
  });
});

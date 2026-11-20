// Helpers for checking exported PDFs in tests.
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFStream } from 'pdf-lib';

/** All text on page 1, as extracted by PDF.js (what readers and search use). */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const text = content.items.map((i) => ('str' in i ? i.str : '')).join(' ');
  await doc.destroy();
  return text.replace(/\s+/g, ' ');
}

export interface PdfSummary {
  fonts: { name: string; embedded: boolean }[];
  images: { width: number; height: number }[];
  pageSize: [number, number];
}

/** Lists fonts (and whether their files are embedded) and images in a PDF. */
export async function inspectPdf(bytes: Uint8Array): Promise<PdfSummary> {
  const doc = await PDFDocument.load(bytes);
  const fonts: PdfSummary['fonts'] = [];
  const images: PdfSummary['images'] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFDict ? obj : obj instanceof PDFStream || obj instanceof PDFRawStream ? obj.dict : null;
    if (!dict) continue;
    const type = dict.get(PDFName.of('Type'));
    const subtype = dict.get(PDFName.of('Subtype'));
    if (type === PDFName.of('FontDescriptor')) {
      fonts.push({
        name: String(dict.get(PDFName.of('FontName'))).replace(/^\//, ''),
        embedded: !!(dict.get(PDFName.of('FontFile2')) || dict.get(PDFName.of('FontFile3')) || dict.get(PDFName.of('FontFile'))),
      });
    }
    if (subtype === PDFName.of('Image')) {
      images.push({ width: Number(String(dict.get(PDFName.of('Width')))), height: Number(String(dict.get(PDFName.of('Height')))) });
    }
  }
  const { width, height } = doc.getPage(0).getSize();
  return { fonts, images, pageSize: [width, height] };
}

const root = path.join(import.meta.dirname, '..', '..');

/** Serves Fontsource font requests from the local devDependencies, so tests work offline. */
export function localFontsource(url: string): Uint8Array | null {
  const m = url.match(/@fontsource\/([^@/]+)@5\/files\/(.+)$/);
  if (!m) return null;
  const file = path.join(root, 'node_modules', '@fontsource', m[1], 'files', m[2]);
  return fs.existsSync(file) ? new Uint8Array(fs.readFileSync(file)) : null;
}

export const fixture = (name: string) => new Uint8Array(fs.readFileSync(path.join(root, 'tests', 'fixtures', name)));

/** The decoded drawing instructions of page 1, for checking what was painted. */
export async function pageContent(bytes: Uint8Array): Promise<string> {
  const { decodePDFRawStream, PDFArray, PDFRef } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(0);
  const contents = page.node.get(PDFName.of('Contents'));
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  let out = '';
  for (const r of refs) {
    const s = r instanceof PDFRef ? doc.context.lookup(r) : r;
    if (s instanceof PDFRawStream) out += new TextDecoder().decode(decodePDFRawStream(s).decode()) + '\n';
    else if (s instanceof PDFStream) out += new TextDecoder().decode(s.getContents()) + '\n';
  }
  return out;
}

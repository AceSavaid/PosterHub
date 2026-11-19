// QR codes made entirely in the browser, so they work offline and in the desktop app.
import qrcode from 'qrcode-generator';

/** qrcode-generator reads one byte per character, so pass UTF-8 bytes as a binary string. */
function utf8Binary(text: string): string {
  return Array.from(new TextEncoder().encode(text), (b) => String.fromCharCode(b)).join('');
}

function make(text: string) {
  // 'M' recovers from ~15% damage: a good balance for printed posters.
  const qr = qrcode(0, 'M');
  qr.addData(utf8Binary(text), 'Byte');
  qr.make();
  return qr;
}

/** The QR code as rows of dark (true) / light (false) modules, without the quiet zone. */
export function qrMatrix(text: string): boolean[][] {
  const qr = make(text);
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** Longest text that fits in a QR code at this error-correction level. */
export const QR_MAX_LENGTH = 2300;

/**
 * A crisp GIF data URL of the QR code with a white quiet zone.
 * GIF needs no canvas, so this works in tests and is accepted by every exporter (PDF, PNG, PowerPoint).
 */
export function qrDataUrl(text: string): string {
  const qr = make(text);
  const n = qr.getModuleCount();
  const cell = Math.max(4, Math.ceil(600 / (n + 8)));
  return qr.createDataURL(cell, cell * 4);
}

/** Adds https:// to bare web addresses such as "doi.org/10.1/abc" so phones open them as links. */
export function normaliseLink(input: string): string {
  const t = input.trim();
  if (!t) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t; // already has a scheme (https:, mailto:, tel:, …)
  if (/^10\.\d{4,}\//.test(t)) return 'https://doi.org/' + t; // a bare DOI
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return 'https://' + t; // looks like a web address
  return t;
}

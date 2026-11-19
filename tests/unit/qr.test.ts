import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import { QR_MAX_LENGTH, normaliseLink, qrDataUrl, qrMatrix } from '../../src/lib/qr';

/** Renders the module matrix to RGBA pixels with a quiet zone and decodes it with an independent reader. */
function decode(text: string): string | undefined {
  const m = qrMatrix(text);
  const cell = 4;
  const quiet = 4;
  const n = m.length + 2 * quiet;
  const size = n * cell;
  const px = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let r = 0; r < m.length; r++)
    for (let c = 0; c < m.length; c++)
      if (m[r][c])
        for (let y = 0; y < cell; y++)
          for (let x = 0; x < cell; x++) {
            const i = (((r + quiet) * cell + y) * size + (c + quiet) * cell + x) * 4;
            px[i] = px[i + 1] = px[i + 2] = 0;
          }
  return jsQR(px, size, size)?.data;
}

describe('QR codes', () => {
  it('encodes links that a QR reader scans back exactly', () => {
    for (const link of ['https://doi.org/10.1234/abcd.5678', 'https://example.org/lab?ref=poster&id=42', 'mailto:you@university.edu']) {
      expect(decode(link)).toBe(link);
    }
  });

  it('keeps accented and non-Latin characters intact', () => {
    const text = 'https://example.org/é/Ünïcødé/日本語';
    const m = qrMatrix(text);
    expect(m.length).toBeGreaterThan(20);
    // jsQR decodes byte mode as UTF-8
    expect(decode(text)).toBe(text);
  });

  it('grows with the amount of data and makes a crisp image', () => {
    expect(qrMatrix('a'.repeat(400)).length).toBeGreaterThan(qrMatrix('https://x.org').length);
    const url = qrDataUrl('https://example.org');
    expect(url).toMatch(/^data:image\/gif;base64,/);
  });

  it('rejects text that cannot fit', () => {
    expect(() => qrMatrix('x'.repeat(QR_MAX_LENGTH + 2000))).toThrow();
    expect(() => qrMatrix('x'.repeat(QR_MAX_LENGTH))).not.toThrow();
  });

  it('turns what people paste into links phones will open', () => {
    expect(normaliseLink('  doi.org/10.1/abc ')).toBe('https://doi.org/10.1/abc');
    expect(normaliseLink('10.1038/s41586-020-2649-2')).toBe('https://doi.org/10.1038/s41586-020-2649-2');
    expect(normaliseLink('www.mylab.org')).toBe('https://www.mylab.org');
    expect(normaliseLink('http://a.b/c')).toBe('http://a.b/c');
    expect(normaliseLink('mailto:me@uni.edu')).toBe('mailto:me@uni.edu');
    expect(normaliseLink('Thanks for visiting!')).toBe('Thanks for visiting!');
    expect(normaliseLink('   ')).toBe('');
  });
});

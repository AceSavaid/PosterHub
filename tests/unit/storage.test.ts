import { describe, expect, it } from 'vitest';
import { readPosterFile, safeFileName } from '../../src/lib/storage';
import { createPoster, PALETTES, sizeFor } from '../../src/model';
import { fontNameFromFile } from '../../src/lib/fonts';

describe('project files', () => {
  it('round-trips a poster through JSON', async () => {
    const p = createPoster({ name: 'Round trip', ...sizeFor('A1', 'landscape'), sizePreset: 'A1', columns: 4, palette: PALETTES[1], headingFont: 'Lora', bodyFont: 'Inter', template: 'banner' });
    const file = new File([JSON.stringify({ app: 'posterhub', ...p })], 'x.poster.json');
    const back = await readPosterFile(file);
    expect(back).toEqual(p);
  });
  it('rejects other JSON', async () => {
    await expect(readPosterFile(new File(['{"foo":1}'], 'x.json'))).rejects.toThrow(/not a PosterHub project/);
    await expect(readPosterFile(new File(['not json'], 'x.json'))).rejects.toThrow();
  });
  it('makes safe file names', () => {
    expect(safeFileName('My poster: v2/final?')).toBe('My-poster-v2final');
    expect(safeFileName('')).toBe('poster');
  });
});

describe('custom font names', () => {
  it('derives a family name from the file name', () => {
    expect(fontNameFromFile('OpenDyslexic-Regular.otf')).toBe('OpenDyslexic');
    expect(fontNameFromFile('my_lab_font.woff2')).toBe('my lab font');
  });
});

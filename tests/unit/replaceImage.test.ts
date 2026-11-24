import { describe, expect, it } from 'vitest';
import { createPoster, makeElement, PALETTES, sizeFor } from '../../src/model';
import { applyReplacement, needsFitChoice } from '../../src/lib/replaceImage';

const poster = createPoster({ name: 'P', ...sizeFor('A0', 'portrait'), sizePreset: 'A0', columns: 3, palette: PALETTES[0], headingFont: 'Montserrat', bodyFont: 'Open Sans', template: 'blank' });
const photo = (over = {}) => makeElement('image', poster, { w: 400, h: 200, src: 'data:image/png;base64,OLD', ...over });

describe('needsFitChoice', () => {
  it('asks when a picture is replaced by one of a different shape', () => {
    expect(needsFitChoice(photo(), 1)).toBe(true); // square into a 2:1 box
    expect(needsFitChoice(photo(), 0.5)).toBe(true);
  });
  it('does not ask when the shapes match (within 2%)', () => {
    expect(needsFitChoice(photo(), 2)).toBe(false);
    expect(needsFitChoice(photo(), 2.03)).toBe(false);
  });
  it('does not ask for an empty picture box, a QR code or a bad size', () => {
    expect(needsFitChoice(photo({ src: undefined }), 1)).toBe(false);
    expect(needsFitChoice(photo({ qr: 'https://example.org' }), 1)).toBe(false);
    expect(needsFitChoice(photo({ h: 0 }), 1)).toBe(false);
    expect(needsFitChoice(photo(), 0)).toBe(false);
  });
});

describe('applyReplacement', () => {
  it('“Fit in the same space” keeps the box and shows the whole picture', () => {
    const el = photo({ fit: 'cover' });
    applyReplacement(el, 'NEW', 1, 'contain');
    expect(el).toMatchObject({ src: 'NEW', w: 400, h: 200, fit: 'contain' });
  });
  it('“Fill the same space” keeps the box and fills it', () => {
    const el = photo();
    applyReplacement(el, 'NEW', 1, 'cover');
    expect(el).toMatchObject({ src: 'NEW', w: 400, h: 200, fit: 'cover' });
  });
  it('“Use the new picture’s shape” keeps the width and changes the height', () => {
    const el = photo({ fit: 'contain' });
    applyReplacement(el, 'NEW', 0.75, 'natural');
    expect(el).toMatchObject({ src: 'NEW', w: 400, h: 533.3, fit: 'contain' });
  });
  it('drops the old picture’s crop and QR link', () => {
    const el = photo({ crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, qr: 'https://example.org' });
    applyReplacement(el, 'NEW', 1, 'contain');
    expect(el.crop).toBeUndefined();
    expect(el.qr).toBeUndefined();
  });
});

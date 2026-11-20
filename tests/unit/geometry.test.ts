import { describe, expect, it } from 'vitest';
import { clampCrop, isCropped, normAngle, outerBounds, placeImage, rotatePoint, resizeRotated, snapAngle, type Handle } from '../../src/lib/geometry';
import { checkPoster } from '../../src/lib/checks';
import { PALETTES, createPoster, makeElement, sizeFor } from '../../src/model';

const blank = () =>
  createPoster({ name: 't', ...sizeFor('A0', 'portrait'), sizePreset: 'A0', columns: 3, palette: PALETTES[0], headingFont: 'Inter', bodyFont: 'Inter', template: 'blank' });
const close = (a: number, b: number, d = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(d);

/** Screen position of a box corner/edge point (u, v in -1..1 from the centre). */
function worldPoint(b: { x: number; y: number; w: number; h: number }, rot: number, u: number, v: number) {
  const [rx, ry] = rotatePoint((u * b.w) / 2, (v * b.h) / 2, rot);
  return [b.x + b.w / 2 + rx, b.y + b.h / 2 + ry];
}

describe('angles', () => {
  it('normalises to (-180, 180]', () => {
    expect(normAngle(0)).toBe(0);
    expect(normAngle(270)).toBe(-90);
    expect(normAngle(-270)).toBe(90);
    expect(normAngle(180)).toBe(180);
    expect(normAngle(-180)).toBe(180);
    expect(normAngle(725)).toBe(5);
    expect(normAngle(12.345)).toBe(12.3);
  });

  it('snaps near multiples of 45° but leaves other angles alone', () => {
    expect(snapAngle(2)).toBe(0);
    expect(snapAngle(-3)).toBe(0);
    expect(snapAngle(47)).toBe(45);
    expect(snapAngle(88.5)).toBe(90);
    expect(snapAngle(30)).toBe(30);
    expect(snapAngle(-120)).toBe(-120);
  });

  it('snaps to a fixed step when Shift is held', () => {
    expect(snapAngle(22, 15)).toBe(15);
    expect(snapAngle(23, 15)).toBe(30);
    expect(snapAngle(-8, 15)).toBe(-15);
  });
});

describe('outerBounds', () => {
  it('is the box itself when not rotated', () => {
    expect(outerBounds({ x: 10, y: 20, w: 100, h: 50 })).toEqual({ x: 10, y: 20, w: 100, h: 50 });
  });

  it('swaps width and height at 90°, keeping the centre', () => {
    const b = outerBounds({ x: 0, y: 0, w: 100, h: 50, rotation: 90 });
    close(b.w, 50);
    close(b.h, 100);
    close(b.x + b.w / 2, 50);
    close(b.y + b.h / 2, 25);
  });

  it('grows at 45°', () => {
    const b = outerBounds({ x: 0, y: 0, w: 100, h: 100, rotation: 45 });
    close(b.w, 100 * Math.SQRT2);
    close(b.h, 100 * Math.SQRT2);
  });
});

describe('resizeRotated', () => {
  const orig = { x: 100, y: 100, w: 200, h: 100 };
  const opposite: Record<Handle, [number, number]> = { nw: [1, 1], n: [0, 1], ne: [-1, 1], e: [-1, 0], se: [-1, -1], s: [0, -1], sw: [1, -1], w: [1, 0] };

  for (const rot of [0, 30, 90, -135])
    for (const handle of Object.keys(opposite) as Handle[])
      it(`keeps the opposite side fixed: ${handle} at ${rot}°`, () => {
        const r = resizeRotated(orig, rot, handle, 17, -9, { min: 1 });
        const [u, v] = opposite[handle];
        const [ax, ay] = worldPoint(orig, rot, u, v);
        const [bx, by] = worldPoint(r, rot, u, v);
        close(ax, bx);
        close(ay, by);
      });

  it('resizes along the element’s own axes', () => {
    // At 90° the element's width runs down the page, so dragging the east handle down widens it.
    const r = resizeRotated(orig, 90, 'e', 0, 40);
    close(r.w, 240);
    close(r.h, 100);
  });

  it('respects the minimum size and keeps the ratio on corners when asked', () => {
    expect(resizeRotated(orig, 20, 'e', -1000, 0).w).toBe(5);
    const r = resizeRotated(orig, 20, 'se', 60, 0, { keepRatio: true });
    close(r.w / r.h, 2);
  });
});

describe('cropping', () => {
  it('knows when a crop changes anything', () => {
    expect(isCropped(undefined)).toBe(false);
    expect(isCropped({ x: 0, y: 0, w: 1, h: 1 })).toBe(false);
    expect(isCropped({ x: 0.1, y: 0, w: 0.9, h: 1 })).toBe(true);
  });

  it('keeps crops inside the picture and not too small', () => {
    const c = clampCrop({ x: -0.2, y: 0.5, w: 0.5, h: 0.8 });
    expect(c.x).toBe(0);
    close(c.y, 0.2);
    expect(clampCrop({ x: 0.5, y: 0.5, w: 0, h: 2 })).toEqual({ x: 0.5, y: 0, w: 0.02, h: 1 });
  });

  it('places an uncropped picture like object-fit', () => {
    const contain = placeImage(200, 200, 400, 200, 'contain');
    expect(contain.region).toEqual({ x: 0, y: 50, w: 200, h: 100 });
    expect(contain.image).toEqual(contain.region);
    const cover = placeImage(200, 200, 400, 200, 'cover');
    expect(cover.region).toEqual({ x: -100, y: 0, w: 400, h: 200 });
  });

  it('fits only the cropped part and shifts the whole picture behind it', () => {
    // Keep the right half of a 400 × 200 picture (a 200 × 200 square) in a 100 × 100 box.
    const { region, image } = placeImage(100, 100, 400, 200, 'contain', { x: 0.5, y: 0, w: 0.5, h: 1 });
    expect(region).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(image).toEqual({ x: -100, y: 0, w: 200, h: 100 });
  });

  it('stretches the cropped part with fill', () => {
    const { region, image } = placeImage(100, 50, 400, 200, 'fill', { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    expect(region).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    expect(image).toEqual({ x: -50, y: -25, w: 200, h: 100 });
  });
});

describe('checks with rotation and crop', () => {
  it('flags a rotated box that hangs over the edge even though its unrotated box fits', () => {
    const p = blank();
    // 600 × 40 bar centred 30 mm from the top: fine flat, cut off when stood upright.
    p.elements = [makeElement('text', p, { html: 'Words', x: 100, y: 10, w: 600, h: 40, rotation: 90 })];
    expect(checkPoster(p).map((i) => i.id)).toContain('edge-' + p.elements[0].id);
    p.elements[0].rotation = 0;
    expect(checkPoster(p).map((i) => i.id)).not.toContain('edge-' + p.elements[0].id);
  });

  it('counts only the kept pixels of a cropped picture for print sharpness', () => {
    const p = blank();
    const img = makeElement('image', p, { src: 'data:image/png;base64,x', x: 100, y: 100, w: 100, h: 100 });
    p.elements = [img];
    const info = new Map([[img.id, { width: 1000 }]]); // 254 dpi uncropped
    expect(checkPoster(p, info).some((i) => i.id === 'dpi-' + img.id)).toBe(false);
    img.crop = { x: 0, y: 0, w: 0.4, h: 0.4 }; // ~102 dpi
    expect(checkPoster(p, info).some((i) => i.id === 'dpi-' + img.id)).toBe(true);
  });
});

describe('screen reader labels', () => {
  it('say when an element is turned or a picture is cropped', async () => {
    const { elementLabel } = await import('../../src/lib/a11y');
    const p = blank();
    const img = makeElement('image', p, { src: 'data:image/png;base64,x', alt: 'Map', rotation: 30, crop: { x: 0, y: 0, w: 0.5, h: 1 }, locked: true });
    expect(elementLabel(img)).toBe('Image: Map (cropped, rotated 30°, locked)');
    expect(elementLabel(makeElement('shape', p, { shape: 'star' }))).toBe('Star');
  });
});

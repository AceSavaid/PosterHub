// Rotation and crop maths shared by the editor, the checks and the exporters.
import type { CropRect, PosterElement } from '../types';

export const rad = (deg: number) => (deg * Math.PI) / 180;

/** Normalises an angle to (-180, 180]. */
export function normAngle(deg: number) {
  let a = ((deg % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return Math.round(a * 10) / 10;
}

/**
 * Snaps an angle while dragging the rotate handle: to the nearest step when
 * `step` is given (Shift), otherwise only near 0/45/90/… so it is easy to get straight.
 */
export function snapAngle(deg: number, step?: number) {
  if (step) return normAngle(Math.round(deg / step) * step);
  const near = Math.round(deg / 45) * 45;
  return normAngle(Math.abs(deg - near) < 4 ? near : deg);
}

export function rotatePoint(x: number, y: number, deg: number): [number, number] {
  const a = rad(deg);
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
}

/** Axis-aligned box around a (possibly rotated) element. */
export function outerBounds(e: Pick<PosterElement, 'x' | 'y' | 'w' | 'h' | 'rotation'>) {
  if (!e.rotation) return { x: e.x, y: e.y, w: e.w, h: e.h };
  const a = rad(e.rotation);
  const w = Math.abs(e.w * Math.cos(a)) + Math.abs(e.h * Math.sin(a));
  const h = Math.abs(e.w * Math.sin(a)) + Math.abs(e.h * Math.cos(a));
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/**
 * Resizes a rotated box by dragging one of its handles. `dx, dy` is the pointer
 * movement in poster mm; the opposite edge or corner stays where it is on screen.
 */
export function resizeRotated(
  orig: { x: number; y: number; w: number; h: number },
  rotation: number,
  handle: Handle,
  dx: number,
  dy: number,
  opts: { min?: number; keepRatio?: boolean } = {},
) {
  const min = opts.min ?? 5;
  const [lx, ly] = rotatePoint(dx, dy, -rotation);
  let w = orig.w;
  let h = orig.h;
  if (handle.includes('e')) w = orig.w + lx;
  if (handle.includes('w')) w = orig.w - lx;
  if (handle.includes('s')) h = orig.h + ly;
  if (handle.includes('n')) h = orig.h - ly;
  w = Math.max(min, w);
  h = Math.max(min, h);
  if (opts.keepRatio && handle.length === 2) h = w / (orig.w / orig.h);
  const sx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
  const sy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
  const [wx, wy] = rotatePoint((sx * (w - orig.w)) / 2, (sy * (h - orig.h)) / 2, rotation);
  const cx = orig.x + orig.w / 2 + wx;
  const cy = orig.y + orig.h / 2 + wy;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

export function isCropped(c?: CropRect) {
  return !!c && (c.x > 0.0005 || c.y > 0.0005 || c.w < 0.9995 || c.h < 0.9995);
}

/**
 * Where to draw an image inside a box so that its crop region is placed by `fit`.
 * Returns the region rectangle (to clip to) and the full image rectangle, in box units.
 */
export function placeImage(
  boxW: number,
  boxH: number,
  imgW: number,
  imgH: number,
  fit: 'contain' | 'cover' | 'fill' = 'contain',
  crop: CropRect = FULL_CROP,
) {
  const regionW = imgW * crop.w;
  const regionH = imgH * crop.h;
  let rw = boxW;
  let rh = boxH;
  if (fit !== 'fill' && regionW > 0 && regionH > 0) {
    const s = fit === 'cover' ? Math.max(boxW / regionW, boxH / regionH) : Math.min(boxW / regionW, boxH / regionH);
    rw = regionW * s;
    rh = regionH * s;
  }
  const rx = (boxW - rw) / 2;
  const ry = (boxH - rh) / 2;
  const fw = rw / crop.w;
  const fh = rh / crop.h;
  return { region: { x: rx, y: ry, w: rw, h: rh }, image: { x: rx - crop.x * fw, y: ry - crop.y * fh, w: fw, h: fh } };
}

/** Keeps a crop rectangle inside the image and at least `min` wide/high. */
export function clampCrop(c: CropRect, min = 0.02): CropRect {
  const w = Math.min(1, Math.max(min, c.w));
  const h = Math.min(1, Math.max(min, c.h));
  return { x: Math.min(1 - w, Math.max(0, c.x)), y: Math.min(1 - h, Math.max(0, c.y)), w, h };
}

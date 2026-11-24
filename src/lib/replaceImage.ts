import type { PosterElement } from '../types';

/**
 * How a new picture goes into the box of the picture it replaces.
 * - `contain`: keep the box exactly as it is and show the whole new picture inside it.
 * - `cover`: keep the box exactly as it is and fill it, trimming the picture's edges.
 * - `natural`: keep the box's width and change its height to the new picture's shape.
 */
export type ReplaceFit = 'contain' | 'cover' | 'natural';

/** Shapes closer than this (2%) count as the same, so nothing needs asking. */
const SAME_SHAPE = 0.02;

/**
 * Whether to ask how the new picture should fit: only when an existing picture
 * is being replaced and the new one is a noticeably different shape from its box.
 */
export function needsFitChoice(el: Pick<PosterElement, 'src' | 'qr' | 'w' | 'h'>, newRatio: number): boolean {
  if (!el.src || el.qr || !(el.w > 0) || !(el.h > 0) || !(newRatio > 0)) return false;
  const boxRatio = el.w / el.h;
  return Math.abs(newRatio - boxRatio) / boxRatio > SAME_SHAPE;
}

/** Puts a new picture into an image box (mutates `el`). The old crop and QR link are dropped. */
export function applyReplacement(el: PosterElement, src: string, ratio: number, fit: ReplaceFit) {
  el.src = src;
  delete el.qr;
  delete el.crop;
  if (fit === 'natural') {
    if (ratio > 0) el.h = Math.round((el.w / ratio) * 10) / 10;
  } else {
    el.fit = fit;
  }
}

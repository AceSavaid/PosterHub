// "How does it look from over there?" Helpers for the viewing distance preview.
import type { Poster } from '../types';
import { plain } from './checks';

export const DISTANCES = [1, 2, 3] as const;

/** Assumed distance from the person's eyes to their screen, in metres (about an arm's length). */
export const SCREEN_DISTANCE_M = 0.6;

/**
 * Zoom (relative to real size, 96 css px per inch) at which the poster on the
 * screen looks as big as the printed poster does from `metres` away.
 */
export function distanceZoom(metres: number, screen = SCREEN_DISTANCE_M) {
  return screen / metres;
}

/**
 * Smallest comfortable text size (pt) from a distance: a common poster rule of
 * thumb is about 12 pt per metre (24 pt body text for a reader 2 m away).
 */
export function readablePtAt(metres: number) {
  return Math.round(12 * metres);
}

/** Elements whose text (or graph labels) will be hard to read from `metres` away. */
export function hardToReadAt(p: Poster, metres: number): Set<string> {
  const min = readablePtAt(metres);
  const out = new Set<string>();
  for (const el of p.elements) {
    if (el.style && plain(el.html) && el.style.fontSize < min) out.add(el.id);
    if (el.chart && el.chart.fontSize < min) out.add(el.id);
  }
  return out;
}

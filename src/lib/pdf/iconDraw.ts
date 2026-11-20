// Draws a library icon as real PDF vector paths, so it stays sharp at any print size.
import type { Painter } from './painter';
import { parseColor } from './color';
import { tracePath } from './svgDraw';
import { layoutIcon, pathPaint, type IconArt, type IconColors } from '../icons/library';

/** Paints `art` as large as fits in `box` (poster px), centred. */
export function drawIcon(painter: Painter, art: IconArt, colors: IconColors, box: { x: number; y: number; w: number; h: number }) {
  const at = layoutIcon(art, box);
  if (at.scale <= 0) return;
  const [vx, vy] = art.viewBox;
  const m: [number, number, number, number, number, number] = [at.scale, 0, 0, at.scale, at.x - vx * at.scale, at.y - vy * at.scale];
  for (const p of art.paths) {
    const paint = pathPaint(p, colors);
    const c = parseColor(paint.fill);
    if (!c) continue;
    tracePath(painter, p.d, m);
    painter.fill({ ...c, a: c.a * paint.opacity }, p.evenOdd);
  }
}

/**
 * Pan and zoom maths for Preview (view mode). Pure functions so they can be unit tested.
 *
 * `scale` is relative to "fit to screen" (1 = the whole poster fits). `x`/`y` are the poster's
 * top-left corner inside the stage, in screen pixels.
 */
export interface View {
  scale: number;
  x: number;
  y: number;
}

export interface Box {
  /** poster size on screen at scale 1 */
  w: number;
  h: number;
  /** stage (viewport) size */
  stageW: number;
  stageH: number;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 10;
/** gap kept around the poster edge when zoomed in */
export const EDGE = 24;
/** how far a double-tap or click zooms in */
export const TAP_ZOOM = 3;

/** The poster centred and fitted. */
export function fitView(b: Box): View {
  return { scale: 1, x: (b.stageW - b.w) / 2, y: (b.stageH - b.h) / 2 };
}

function clampAxis(pos: number, size: number, stage: number): number {
  if (size <= stage - 2 * EDGE) return (stage - size) / 2;
  return Math.min(EDGE, Math.max(stage - size - EDGE, pos));
}

/** Keep the poster on screen: centred along an axis when it fits, otherwise no gap wider than EDGE at either side. */
export function clampView(v: View, b: Box): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale));
  return { scale, x: clampAxis(v.x, b.w * scale, b.stageW), y: clampAxis(v.y, b.h * scale, b.stageH) };
}

/** Zoom by `factor`, keeping the poster point under (cx, cy) where it is. */
export function zoomAt(v: View, factor: number, cx: number, cy: number, b: Box): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
  const k = scale / v.scale;
  return clampView({ scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }, b);
}

export function panBy(v: View, dx: number, dy: number, b: Box): View {
  return clampView({ ...v, x: v.x + dx, y: v.y + dy }, b);
}

/**
 * A two-finger pinch: `start` is the view when the second finger landed, the fingers were `d0` apart
 * around midpoint (m0x, m0y) and are now `d1` apart around (m1x, m1y). The poster follows the fingers.
 */
export function pinch(start: View, d0: number, m0x: number, m0y: number, d1: number, m1x: number, m1y: number, b: Box): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, start.scale * (d1 / Math.max(1, d0))));
  const k = scale / start.scale;
  return clampView({ scale, x: m1x - (m0x - start.x) * k, y: m1y - (m0y - start.y) * k }, b);
}

/** Double-tap / click: zoom in on the point, or back out to fit when already zoomed in. */
export function toggleZoom(v: View, cx: number, cy: number, b: Box): View {
  return v.scale > 1.05 ? fitView(b) : zoomAt(fitView(b), TAP_ZOOM, cx, cy, b);
}

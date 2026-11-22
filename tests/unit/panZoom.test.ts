import { describe, expect, it } from 'vitest';
import { EDGE, MAX_SCALE, clampView, fitView, panBy, pinch, toggleZoom, zoomAt } from '../../src/lib/panZoom';

// a portrait poster shown 300×400 on a 400×800 phone screen
const b = { w: 300, h: 400, stageW: 400, stageH: 800 };

describe('panZoom', () => {
  it('fits the poster centred', () => {
    expect(fitView(b)).toEqual({ scale: 1, x: 50, y: 200 });
  });

  it('zooms around the given point so it stays under the finger', () => {
    const v = zoomAt(fitView(b), 2, 200, 400, b);
    expect(v.scale).toBe(2);
    // poster point under (200, 400) at scale 1 was (150, 200); at scale 2 it maps back to (200, 400)
    expect(v.x + 150 * 2).toBeCloseTo(200);
    expect(v.y + 200 * 2).toBeCloseTo(400);
  });

  it('never zooms out past fit or in past the maximum', () => {
    expect(zoomAt(fitView(b), 0.2, 0, 0, b)).toEqual(fitView(b));
    expect(zoomAt(fitView(b), 100, 200, 400, b).scale).toBe(MAX_SCALE);
  });

  it('keeps the poster on screen when panning', () => {
    const v = zoomAt(fitView(b), 4, 200, 400, b);
    const far = panBy(v, 10_000, 10_000, b);
    expect(far.x).toBe(EDGE);
    expect(far.y).toBe(EDGE);
    const other = panBy(v, -10_000, -10_000, b);
    expect(other.x).toBe(b.stageW - b.w * 4 - EDGE);
    expect(other.y).toBe(b.stageH - b.h * 4 - EDGE);
  });

  it('centres an axis that still fits', () => {
    // wide stage: zoomed 1.5× the poster is 450 wide (fits 1000) but 600 tall (does not fit 500)
    const wide = { w: 300, h: 400, stageW: 1000, stageH: 500 };
    const v = clampView({ scale: 1.5, x: 0, y: 100 }, wide);
    expect(v.x).toBe((1000 - 450) / 2);
    expect(v.y).toBe(EDGE);
  });

  it('pinch follows the fingers: spread doubles the size and moving the midpoint pans', () => {
    const start = fitView(b);
    const v = pinch(start, 100, 200, 400, 200, 220, 410, b);
    expect(v.scale).toBe(2);
    expect(v.x + 150 * 2).toBeCloseTo(220);
    expect(v.y + 200 * 2).toBeCloseTo(410);
  });

  it('double-tap zooms in, and a second double-tap goes back to fit', () => {
    const inV = toggleZoom(fitView(b), 200, 400, b);
    expect(inV.scale).toBe(3);
    expect(toggleZoom(inV, 10, 10, b)).toEqual(fitView(b));
  });
});

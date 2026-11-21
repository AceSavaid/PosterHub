import { beforeEach, describe, expect, it } from 'vitest';
import { TOUR_KEY, TOUR_STEPS, hasSeenTour, markTourSeen, placeCard, resetTour } from '../../src/lib/tour';

beforeEach(() => localStorage.clear());

describe('first-time tour', () => {
  it('has the four steps in order: edit, Insert, Check, Export', () => {
    expect(TOUR_STEPS.map((s) => s.title)).toEqual(['Click to edit', 'Add things from Insert', 'Check before you print', 'Export when you’re ready']);
    for (const s of TOUR_STEPS) {
      expect(s.targets.length).toBeGreaterThan(0);
      // short enough to read at a glance
      expect(s.body.length).toBeLessThan(200);
    }
  });

  it('remembers that it was seen, and can be reset', () => {
    expect(hasSeenTour()).toBe(false);
    markTourSeen();
    expect(localStorage.getItem(TOUR_KEY)).toBe('done');
    expect(hasSeenTour()).toBe(true);
    resetTour();
    expect(hasSeenTour()).toBe(false);
  });

  it('ignores other values in storage', () => {
    localStorage.setItem(TOUR_KEY, 'maybe');
    expect(hasSeenTour()).toBe(false);
  });
});

describe('placing the tour card', () => {
  const view = { width: 1440, height: 900 };
  const card = { width: 320, height: 180 };
  const inside = (p: { left: number; top: number }) => p.left >= 8 && p.top >= 8 && p.left + card.width <= view.width - 8 && p.top + card.height <= view.height - 8;

  it('centres the card when there is nothing to point at', () => {
    expect(placeCard(null, card, view)).toEqual({ left: 560, top: 360 });
  });

  it('puts it below a top-bar button, lined up with its right edge near the screen edge', () => {
    const p = placeCard({ left: 1360, top: 10, width: 70, height: 30 }, card, view);
    expect(p.top).toBe(52);
    expect(p.left + card.width).toBeLessThanOrEqual(1430);
    expect(inside(p)).toBe(true);
  });

  it('puts it to the right of a tall side panel', () => {
    const p = placeCard({ left: 0, top: 50, width: 280, height: 850 }, card, view);
    expect(p).toEqual({ left: 292, top: 50 });
  });

  it('puts it to the left of a tall panel on the right', () => {
    const p = placeCard({ left: 1160, top: 50, width: 280, height: 850 }, card, view);
    expect(p).toEqual({ left: 828, top: 50 });
  });

  it('stays on screen when the target fills the whole window', () => {
    const p = placeCard({ left: 0, top: 0, width: 1440, height: 900 }, card, view);
    expect(inside(p)).toBe(true);
  });

  it('stays on screen on a phone', () => {
    const phone = { width: 375, height: 667 };
    const small = { width: 343, height: 220 };
    const p = placeCard({ left: 0, top: 0, width: 375, height: 400 }, small, phone);
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + small.width).toBeLessThanOrEqual(367);
    expect(p.top + small.height).toBeLessThanOrEqual(659);
  });
});

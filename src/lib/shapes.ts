import type { PosterElement, ShapeKind } from '../types';

/** Outline shapes drawn as SVG polygons in a 100 × 100 box (stretched to the element). */
export const POLYGONS: Partial<Record<ShapeKind, string>> = {
  triangle: '50,0 100,100 0,100',
  diamond: '50,0 100,50 50,100 0,50',
  arrow: '0,30 60,30 60,0 100,50 60,100 60,70 0,70',
  star: starPoints(),
};

function starPoints() {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 19 : 50;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${+(50 + r * Math.cos(a)).toFixed(2)},${+(52 + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

export const ARROW_ROTATION = { right: 0, down: 90, left: 180, up: 270 } as const;

export const SHAPE_CHOICES: { kind: ShapeKind; label: string; icon: string; extra?: Partial<PosterElement> }[] = [
  { kind: 'rect', label: 'Rectangle', icon: '▭' },
  { kind: 'rect', label: 'Rounded box', icon: '▢', extra: { radius: 6 } },
  { kind: 'ellipse', label: 'Circle', icon: '◯', extra: { fill: '@accent' } },
  { kind: 'line', label: 'Line', icon: '―', extra: { fill: '@primary', h: 1.5 } },
  { kind: 'arrow', label: 'Arrow', icon: '➜', extra: { fill: '@secondary', direction: 'right' } },
  { kind: 'triangle', label: 'Triangle', icon: '△', extra: { fill: '@accent' } },
  { kind: 'diamond', label: 'Diamond', icon: '◇', extra: { fill: '@secondary' } },
  { kind: 'star', label: 'Star', icon: '☆', extra: { fill: '@accent' } },
];

export const isPolygon = (el: PosterElement) => el.type === 'shape' && !!el.shape && el.shape in POLYGONS;

// Draws simple SVG artwork (the paths and rectangles that the equation
// typesetter produces) as real PDF vector paths, so maths stays sharp at any
// print size. Anything this does not understand is reported so the caller
// can fall back to an image.
import type { Painter } from './painter';
import { parseColor, type RGBA } from './color';
import { type Matrix, apply, multiply, scaleOf } from './matrix';

export interface SvgDrawResult {
  /** False if the artwork used something that could not be drawn as vectors. */
  complete: boolean;
}

/**
 * Draws SVG markup (the children of an <svg>) with `matrix` mapping SVG user
 * units to poster px. `currentColor` and unset fills use `color`.
 */
export function drawSvgMarkup(painter: Painter, inner: string, matrix: Matrix, color: RGBA): SvgDrawResult {
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.getElementsByTagName('parsererror').length) return { complete: false };
  const state = { complete: true };
  walk(painter, root, matrix, { fill: color, stroke: color, strokeWidth: 0 }, state);
  return state;
}

interface Inherited {
  fill: RGBA | null;
  stroke: RGBA | null;
  strokeWidth: number;
}

function paint(value: string | null, current: RGBA, inherited: RGBA | null): RGBA | null {
  if (value == null) return inherited;
  if (value === 'none') return null;
  if (value === 'currentColor') return current;
  return parseColor(value) ?? inherited;
}

function walk(painter: Painter, el: Element, m: Matrix, inh: Inherited, state: { complete: boolean }) {
  for (const child of Array.from(el.children)) {
    const tag = child.localName;
    if (tag === 'title' || tag === 'desc' || tag === 'defs' || tag === 'metadata') continue;
    const cm = child.hasAttribute('transform') ? multiply(m, parseTransform(child.getAttribute('transform')!)) : m;
    const base = inh.fill ?? inh.stroke ?? { r: 0, g: 0, b: 0, a: 1 };
    const sw = child.getAttribute('stroke-width');
    const ci: Inherited = {
      fill: paint(child.getAttribute('fill'), base, inh.fill),
      stroke: paint(child.getAttribute('stroke'), base, inh.stroke),
      strokeWidth: sw != null ? parseFloat(sw) || 0 : inh.strokeWidth,
    };
    if (child.getAttribute('data-background') === 'true') continue;
    switch (tag) {
      case 'g':
      case 'svg':
        walk(painter, child, cm, ci, state);
        break;
      case 'path': {
        const d = child.getAttribute('d') ?? '';
        if (!d.trim()) break;
        if (!tracePath(painter, d, cm)) state.complete = false;
        finish(painter, ci, cm);
        break;
      }
      case 'rect': {
        const x = num(child, 'x');
        const y = num(child, 'y');
        const w = num(child, 'width');
        const h = num(child, 'height');
        if (w <= 0 || h <= 0) break;
        polygon(painter, cm, [
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
        ]);
        finish(painter, ci, cm);
        break;
      }
      case 'line': {
        const a = apply(cm, num(child, 'x1'), num(child, 'y1'));
        const b = apply(cm, num(child, 'x2'), num(child, 'y2'));
        painter.moveTo(...a);
        painter.lineTo(...b);
        if (ci.stroke && ci.strokeWidth > 0) painter.stroke(ci.stroke, { width: ci.strokeWidth * scaleOf(cm) });
        else painter.endPath();
        break;
      }
      case 'polygon':
      case 'polyline': {
        const nums = (child.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
        const pts: [number, number][] = [];
        for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
        if (pts.length < 2) break;
        polygon(painter, cm, pts, tag === 'polygon');
        finish(painter, tag === 'polyline' ? { ...ci, fill: null } : ci, cm);
        break;
      }
      case 'ellipse':
      case 'circle': {
        const cx = num(child, 'cx');
        const cy = num(child, 'cy');
        const rx = tag === 'circle' ? num(child, 'r') : num(child, 'rx');
        const ry = tag === 'circle' ? num(child, 'r') : num(child, 'ry');
        if (!tracePath(painter, ellipsePath(cx, cy, rx, ry), cm)) state.complete = false;
        finish(painter, ci, cm);
        break;
      }
      default:
        // <text>, <image>, <use>, … cannot be drawn faithfully here.
        state.complete = false;
    }
  }
}

function finish(painter: Painter, s: Inherited, m: Matrix) {
  if (s.fill) painter.fill(s.fill);
  else if (s.stroke && s.strokeWidth > 0) painter.stroke(s.stroke, { width: s.strokeWidth * scaleOf(m) });
  else painter.endPath();
}

function polygon(painter: Painter, m: Matrix, pts: [number, number][], close = true) {
  pts.forEach(([x, y], i) => (i ? painter.lineTo(...apply(m, x, y)) : painter.moveTo(...apply(m, x, y))));
  if (close) painter.closePath();
}

const num = (el: Element, name: string) => parseFloat(el.getAttribute(name) ?? '0') || 0;

function ellipsePath(cx: number, cy: number, rx: number, ry: number) {
  const k = 0.5522847498;
  return (
    `M${cx + rx} ${cy}C${cx + rx} ${cy + ry * k} ${cx + rx * k} ${cy + ry} ${cx} ${cy + ry}` +
    `C${cx - rx * k} ${cy + ry} ${cx - rx} ${cy + ry * k} ${cx - rx} ${cy}` +
    `C${cx - rx} ${cy - ry * k} ${cx - rx * k} ${cy - ry} ${cx} ${cy - ry}` +
    `C${cx + rx * k} ${cy - ry} ${cx + rx} ${cy - ry * k} ${cx + rx} ${cy}Z`
  );
}

/** Parses an SVG transform list such as "translate(10,20) scale(1,-1)". */
export function parseTransform(t: string): Matrix {
  let m: Matrix = [1, 0, 0, 1, 0, 0];
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(t))) {
    const a = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let n: Matrix;
    switch (match[1]) {
      case 'matrix':
        n = [a[0], a[1], a[2], a[3], a[4], a[5]].map((v) => v || 0) as Matrix;
        break;
      case 'translate':
        n = [1, 0, 0, 1, a[0] || 0, a[1] || 0];
        break;
      case 'scale':
        n = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const r = ((a[0] || 0) * Math.PI) / 180;
        const c = Math.cos(r);
        const s = Math.sin(r);
        n = [c, s, -s, c, 0, 0];
        if (a.length >= 3) n = multiply(multiply([1, 0, 0, 1, a[1], a[2]], n), [1, 0, 0, 1, -a[1], -a[2]]);
        break;
      }
      case 'skewX':
        n = [1, 0, Math.tan(((a[0] || 0) * Math.PI) / 180), 1, 0, 0];
        break;
      default:
        n = [1, Math.tan(((a[0] || 0) * Math.PI) / 180), 0, 1, 0, 0];
    }
    m = multiply(m, n);
  }
  return m;
}

/** Splits path data into commands with their numbers. */
export function parsePathData(d: string): { cmd: string; args: number[] }[] {
  const out: { cmd: string; args: number[] }[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(d))) {
    if (match[1]) out.push({ cmd: match[1], args: [] });
    else if (out.length) out[out.length - 1].args.push(Number(match[2]));
  }
  return out;
}

const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/**
 * Adds an SVG path to the painter's current path. Returns false if it had
 * something only approximated (elliptical arcs are drawn as straight lines).
 */
export function tracePath(painter: Painter, d: string, m: Matrix): boolean {
  let exact = true;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  // Last control point, for the smooth S / T commands.
  let cx = 0;
  let cy = 0;
  let prev = '';
  const P = (px: number, py: number) => apply(m, px, py);
  for (const { cmd, args } of parsePathData(d)) {
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    const n = ARITY[up];
    if (up === 'Z') {
      painter.closePath();
      x = sx;
      y = sy;
      prev = 'Z';
      continue;
    }
    if (!n) continue;
    for (let i = 0; i + n <= args.length; i += n) {
      const a = args.slice(i, i + n);
      const ox = rel ? x : 0;
      const oy = rel ? y : 0;
      // Extra pairs after M are implicit L.
      const c = up === 'M' && i > 0 ? 'L' : up;
      switch (c) {
        case 'M':
          x = a[0] + ox;
          y = a[1] + oy;
          sx = x;
          sy = y;
          painter.moveTo(...P(x, y));
          break;
        case 'L':
          x = a[0] + ox;
          y = a[1] + oy;
          painter.lineTo(...P(x, y));
          break;
        case 'H':
          x = a[0] + ox;
          painter.lineTo(...P(x, y));
          break;
        case 'V':
          y = a[0] + oy;
          painter.lineTo(...P(x, y));
          break;
        case 'C': {
          const [x1, y1, x2, y2, ex, ey] = [a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy, a[4] + ox, a[5] + oy];
          painter.curveTo(...P(x1, y1), ...P(x2, y2), ...P(ex, ey));
          cx = x2;
          cy = y2;
          x = ex;
          y = ey;
          break;
        }
        case 'S': {
          const smooth = /[CS]/.test(prev);
          const x1 = smooth ? 2 * x - cx : x;
          const y1 = smooth ? 2 * y - cy : y;
          const [x2, y2, ex, ey] = [a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy];
          painter.curveTo(...P(x1, y1), ...P(x2, y2), ...P(ex, ey));
          cx = x2;
          cy = y2;
          x = ex;
          y = ey;
          break;
        }
        case 'Q':
        case 'T': {
          let qx: number;
          let qy: number;
          let ex: number;
          let ey: number;
          if (c === 'Q') {
            [qx, qy, ex, ey] = [a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy];
          } else {
            const smooth = /[QT]/.test(prev);
            qx = smooth ? 2 * x - cx : x;
            qy = smooth ? 2 * y - cy : y;
            [ex, ey] = [a[0] + ox, a[1] + oy];
          }
          // Quadratic → cubic.
          painter.curveTo(...P(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y)), ...P(ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey)), ...P(ex, ey));
          cx = qx;
          cy = qy;
          x = ex;
          y = ey;
          break;
        }
        case 'A':
          exact = false;
          x = a[5] + ox;
          y = a[6] + oy;
          painter.lineTo(...P(x, y));
          break;
      }
      prev = c;
    }
  }
  return exact;
}

// A subset of CanvasRenderingContext2D that draws straight into the PDF as
// vectors. It is enough for Chart.js, so charts come out as sharp shapes and
// real text rather than a bitmap.
import { parseColor, withAlpha, type RGBA } from './color';
import type { FontRegistry } from './fonts';
import { type Matrix, apply, multiply, scaleOf } from './matrix';
import type { Painter } from './painter';

type Cmd = ['M', number, number] | ['L', number, number] | ['C', number, number, number, number, number, number] | ['Z'];

interface State {
  ctm: Matrix;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  miterLimit: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  lineDash: number[];
  lineDashOffset: number;
}

export interface ParsedFont {
  family: string;
  size: number;
  weight: number;
  italic: boolean;
}

export function parseCssFont(font: string): ParsedFont {
  const m = font.match(/(\d*\.?\d+)px(?:\s*\/\s*\S+)?\s+(.+)$/);
  const size = m ? parseFloat(m[1]) : 10;
  const familyList = m ? m[2] : 'sans-serif';
  const family = familyList.split(',')[0].trim().replace(/^["']|["']$/g, '');
  const pre = m ? font.slice(0, m.index).toLowerCase() : '';
  const wm = pre.match(/\b([1-9]00)\b/);
  const weight = wm ? +wm[1] : /\bbold(er)?\b/.test(pre) ? 700 : /\blighter\b/.test(pre) ? 300 : 400;
  return { family, size, weight, italic: /\b(italic|oblique)\b/.test(pre) };
}

/** Records path commands so Chart.js's Path2D usage can be replayed into the PDF. */
export class RecordingPath2D {
  cmds: [string, ...unknown[]][] = [];
  moveTo(...a: number[]) {
    this.cmds.push(['moveTo', ...a]);
  }
  lineTo(...a: number[]) {
    this.cmds.push(['lineTo', ...a]);
  }
  bezierCurveTo(...a: number[]) {
    this.cmds.push(['bezierCurveTo', ...a]);
  }
  quadraticCurveTo(...a: number[]) {
    this.cmds.push(['quadraticCurveTo', ...a]);
  }
  arc(...a: unknown[]) {
    this.cmds.push(['arc', ...a]);
  }
  ellipse(...a: unknown[]) {
    this.cmds.push(['ellipse', ...a]);
  }
  rect(...a: number[]) {
    this.cmds.push(['rect', ...a]);
  }
  closePath() {
    this.cmds.push(['closePath']);
  }
  addPath(p: RecordingPath2D) {
    this.cmds.push(...p.cmds);
  }
}

export class PdfCanvasContext {
  canvas: { width: number; height: number; style: Record<string, string>; getContext?: () => unknown };
  private s: State;
  private stack: State[] = [];
  private path: Cmd[] = [];
  private cur: [number, number] | null = null;
  private start: [number, number] | null = null;
  // Properties Chart.js may set that have no PDF equivalent.
  globalCompositeOperation = 'source-over';
  shadowColor = 'transparent';
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  imageSmoothingEnabled = true;
  direction: CanvasDirection = 'ltr';

  constructor(
    private painter: Painter,
    private fonts: FontRegistry,
    private base: Matrix,
    width: number,
    height: number,
  ) {
    this.canvas = { width, height, style: {} };
    this.s = {
      ctm: base,
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      miterLimit: 10,
      font: '10px sans-serif',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      globalAlpha: 1,
      lineDash: [],
      lineDashOffset: 0,
    };
  }

  // ---- state properties
  get fillStyle() {
    return this.s.fillStyle as string;
  }
  set fillStyle(v) {
    this.s.fillStyle = v;
  }
  get strokeStyle() {
    return this.s.strokeStyle as string;
  }
  set strokeStyle(v) {
    this.s.strokeStyle = v;
  }
  get lineWidth() {
    return this.s.lineWidth;
  }
  set lineWidth(v) {
    if (Number.isFinite(v) && v > 0) this.s.lineWidth = v;
  }
  get lineCap() {
    return this.s.lineCap;
  }
  set lineCap(v) {
    this.s.lineCap = v;
  }
  get lineJoin() {
    return this.s.lineJoin;
  }
  set lineJoin(v) {
    this.s.lineJoin = v;
  }
  get miterLimit() {
    return this.s.miterLimit;
  }
  set miterLimit(v) {
    if (Number.isFinite(v) && v > 0) this.s.miterLimit = v;
  }
  get font() {
    return this.s.font;
  }
  set font(v) {
    this.s.font = v;
  }
  get textAlign() {
    return this.s.textAlign;
  }
  set textAlign(v) {
    this.s.textAlign = v;
  }
  get textBaseline() {
    return this.s.textBaseline;
  }
  set textBaseline(v) {
    this.s.textBaseline = v;
  }
  get globalAlpha() {
    return this.s.globalAlpha;
  }
  set globalAlpha(v) {
    if (Number.isFinite(v) && v >= 0 && v <= 1) this.s.globalAlpha = v;
  }
  get lineDashOffset() {
    return this.s.lineDashOffset;
  }
  set lineDashOffset(v) {
    this.s.lineDashOffset = Number.isFinite(v) ? v : 0;
  }
  setLineDash(d: number[]) {
    if (!Array.isArray(d) || d.some((x) => !Number.isFinite(x) || x < 0)) return;
    this.s.lineDash = d.length % 2 ? [...d, ...d] : [...d];
  }
  getLineDash() {
    return [...this.s.lineDash];
  }

  save() {
    this.stack.push({ ...this.s, lineDash: [...this.s.lineDash] });
    this.painter.save();
  }
  restore() {
    const prev = this.stack.pop();
    if (!prev) return;
    this.s = prev;
    this.painter.restore();
  }

  // ---- transforms
  setTransform(a: number | DOMMatrix2DInit, b = 0, c = 0, d = 1, e = 0, f = 0) {
    if (typeof a === 'object') ({ a = 1, b = 0, c = 0, d = 1, e = 0, f = 0 } = a as DOMMatrix2DInit & { a?: number });
    this.s.ctm = multiply(this.base, [a as number, b, c, d, e, f]);
  }
  resetTransform() {
    this.s.ctm = this.base;
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.s.ctm = multiply(this.s.ctm, [a, b, c, d, e, f]);
  }
  translate(x: number, y: number) {
    this.transform(1, 0, 0, 1, x, y);
  }
  scale(x: number, y: number) {
    this.transform(x, 0, 0, y, 0, 0);
  }
  rotate(a: number) {
    this.transform(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0);
  }
  getTransform() {
    return this.s.ctm;
  }

  // ---- path building (points are stored in poster space)
  beginPath() {
    this.path = [];
    this.cur = this.start = null;
  }
  private pt(x: number, y: number) {
    return apply(this.s.ctm, x, y);
  }
  moveTo(x: number, y: number) {
    const p = this.pt(x, y);
    this.path.push(['M', p[0], p[1]]);
    this.cur = this.start = p;
  }
  lineTo(x: number, y: number) {
    if (!this.cur) return this.moveTo(x, y);
    const p = this.pt(x, y);
    this.path.push(['L', p[0], p[1]]);
    this.cur = p;
  }
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
    if (!this.cur) this.moveTo(x1, y1);
    const a = this.pt(x1, y1);
    const b = this.pt(x2, y2);
    const p = this.pt(x, y);
    this.path.push(['C', a[0], a[1], b[0], b[1], p[0], p[1]]);
    this.cur = p;
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    if (!this.cur) this.moveTo(cx, cy);
    // Convert using the untransformed current point (affine maps keep curves exact).
    const inv = invert(this.s.ctm);
    const [x0, y0] = apply(inv, this.cur![0], this.cur![1]);
    this.bezierCurveTo(x0 + (2 / 3) * (cx - x0), y0 + (2 / 3) * (cy - y0), x + (2 / 3) * (cx - x), y + (2 / 3) * (cy - y), x, y);
  }
  closePath() {
    if (!this.cur) return;
    this.path.push(['Z']);
    this.cur = this.start;
  }
  rect(x: number, y: number, w: number, h: number) {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
    this.moveTo(x, y);
  }
  roundRect(x: number, y: number, w: number, h: number, r: number | number[] = 0) {
    const rad = Math.min(Math.abs(Array.isArray(r) ? (r[0] ?? 0) : r), Math.abs(w) / 2, Math.abs(h) / 2);
    if (!rad) return this.rect(x, y, w, h);
    this.moveTo(x + rad, y);
    this.arcTo(x + w, y, x + w, y + h, rad);
    this.arcTo(x + w, y + h, x, y + h, rad);
    this.arcTo(x, y + h, x, y, rad);
    this.arcTo(x, y, x + w, y, rad);
    this.closePath();
  }
  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw = false) {
    this.ellipse(cx, cy, r, r, 0, a0, a1, ccw);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw = false) {
    if (rx < 0 || ry < 0) return;
    const TAU = Math.PI * 2;
    let sweep: number;
    if (!ccw) {
      sweep = a1 - a0 >= TAU ? TAU : ((((a1 - a0) % TAU) + TAU) % TAU);
    } else {
      sweep = a0 - a1 >= TAU ? -TAU : -((((a0 - a1) % TAU) + TAU) % TAU);
    }
    const local = (t: number): [number, number] => {
      const x = rx * Math.cos(t);
      const y = ry * Math.sin(t);
      return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)];
    };
    const [sx, sy] = local(a0);
    if (this.cur) this.lineTo(sx, sy);
    else this.moveTo(sx, sy);
    if (!sweep) return;
    const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
    const step = sweep / n;
    const k = (4 / 3) * Math.tan(step / 4);
    for (let i = 0; i < n; i++) {
      const t0 = a0 + i * step;
      const t1 = t0 + step;
      // Control points of the unit-circle segment, then map through the ellipse.
      const p = (x: number, y: number): [number, number] => {
        const ex = rx * x;
        const ey = ry * y;
        return [cx + ex * Math.cos(rot) - ey * Math.sin(rot), cy + ex * Math.sin(rot) + ey * Math.cos(rot)];
      };
      const c1 = p(Math.cos(t0) - k * Math.sin(t0), Math.sin(t0) + k * Math.cos(t0));
      const c2 = p(Math.cos(t1) + k * Math.sin(t1), Math.sin(t1) - k * Math.cos(t1));
      const e = p(Math.cos(t1), Math.sin(t1));
      this.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], e[0], e[1]);
    }
  }
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number) {
    if (!this.cur) this.moveTo(x1, y1);
    const inv = invert(this.s.ctm);
    const [x0, y0] = apply(inv, this.cur![0], this.cur![1]);
    const v1 = [x0 - x1, y0 - y1];
    const v2 = [x2 - x1, y2 - y1];
    const l1 = Math.hypot(v1[0], v1[1]);
    const l2 = Math.hypot(v2[0], v2[1]);
    const ang = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2))));
    if (!r || !l1 || !l2 || !Number.isFinite(ang) || ang === 0 || ang === Math.PI) return this.lineTo(x1, y1);
    const t = r / Math.tan(ang / 2);
    const p1 = [x1 + (v1[0] / l1) * t, y1 + (v1[1] / l1) * t];
    const p2 = [x1 + (v2[0] / l2) * t, y1 + (v2[1] / l2) * t];
    const bis = [v1[0] / l1 + v2[0] / l2, v1[1] / l1 + v2[1] / l2];
    const bl = Math.hypot(bis[0], bis[1]);
    const d = r / Math.sin(ang / 2);
    const c = [x1 + (bis[0] / bl) * d, y1 + (bis[1] / bl) * d];
    const a0 = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
    const a1 = Math.atan2(p2[1] - c[1], p2[0] - c[0]);
    const cross = v1[0] * v2[1] - v1[1] * v2[0];
    this.lineTo(p1[0], p1[1]);
    this.arc(c[0], c[1], r, a0, a1, cross < 0);
  }

  // ---- painting
  private emitPath(path = this.path) {
    for (const c of path) {
      if (c[0] === 'M') this.painter.moveTo(c[1], c[2]);
      else if (c[0] === 'L') this.painter.lineTo(c[1], c[2]);
      else if (c[0] === 'C') this.painter.curveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
      else this.painter.closePath();
    }
  }
  private color(style: unknown): RGBA | null {
    return withAlpha(typeof style === 'string' ? parseColor(style) : { r: 0, g: 0, b: 0, a: 1 }, this.s.globalAlpha);
  }
  private strokeStyleNow() {
    const k = scaleOf(this.s.ctm);
    return {
      width: this.s.lineWidth * k,
      cap: this.s.lineCap,
      join: this.s.lineJoin,
      miterLimit: this.s.miterLimit,
      dash: this.s.lineDash.map((d) => d * k),
      dashOffset: this.s.lineDashOffset * k,
    };
  }
  private withPath(p: unknown, fn: () => void) {
    if (!(p instanceof RecordingPath2D)) return fn();
    const saved = [this.path, this.cur, this.start] as const;
    this.beginPath();
    for (const [name, ...args] of p.cmds) (this as unknown as Record<string, (...a: unknown[]) => void>)[name](...args);
    fn();
    [this.path, this.cur, this.start] = saved as unknown as [Cmd[], [number, number] | null, [number, number] | null];
  }
  private hasDrawable(path: Cmd[]) {
    return path.some((c) => c[0] !== 'M');
  }

  fill(a?: unknown, b?: unknown) {
    const rule = (typeof a === 'string' ? a : b) === 'evenodd';
    this.withPath(a, () => {
      const c = this.color(this.s.fillStyle);
      if (!c || !this.hasDrawable(this.path)) return;
      this.emitPath();
      this.painter.fill(c, rule);
    });
  }
  stroke(p?: unknown) {
    this.withPath(p, () => {
      const c = this.color(this.s.strokeStyle);
      if (!c || !this.hasDrawable(this.path)) return;
      this.emitPath();
      this.painter.stroke(c, this.strokeStyleNow());
    });
  }
  clip(a?: unknown, b?: unknown) {
    const rule = (typeof a === 'string' ? a : b) === 'evenodd';
    this.withPath(a, () => {
      if (!this.path.length) {
        this.painter.rect(0, 0, 0, 0);
      } else this.emitPath();
      this.painter.clip(rule);
    });
  }
  fillRect(x: number, y: number, w: number, h: number) {
    const saved = [this.path, this.cur, this.start] as const;
    this.beginPath();
    this.rect(x, y, w, h);
    this.fill();
    [this.path, this.cur, this.start] = saved as unknown as [Cmd[], [number, number] | null, [number, number] | null];
  }
  strokeRect(x: number, y: number, w: number, h: number) {
    const saved = [this.path, this.cur, this.start] as const;
    this.beginPath();
    this.rect(x, y, w, h);
    this.stroke();
    [this.path, this.cur, this.start] = saved as unknown as [Cmd[], [number, number] | null, [number, number] | null];
  }
  clearRect() {
    /* The PDF starts empty; the element's own background is drawn separately. */
  }
  isPointInPath() {
    return false;
  }
  drawImage() {
    /* not used by charts */
  }

  // ---- text
  measureText(text: string) {
    const f = parseCssFont(this.s.font);
    const width = this.fonts.measure(f.family, f.weight, f.italic, String(text), f.size);
    const face = this.fonts.primaryFace(f.family, f.weight, f.italic, String(text) || 'x');
    return {
      width,
      actualBoundingBoxAscent: face.ascent * f.size,
      actualBoundingBoxDescent: face.descent * f.size,
      fontBoundingBoxAscent: face.ascent * f.size,
      fontBoundingBoxDescent: face.descent * f.size,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: width,
    } as TextMetrics;
  }
  fillText(text: string, x: number, y: number, maxWidth?: number) {
    this.drawText(String(text), x, y, maxWidth, false);
  }
  strokeText(text: string, x: number, y: number, maxWidth?: number) {
    this.drawText(String(text), x, y, maxWidth, true);
  }
  private drawText(text: string, x: number, y: number, maxWidth: number | undefined, stroke: boolean) {
    if (!text) return;
    const color = this.color(stroke ? this.s.strokeStyle : this.s.fillStyle);
    if (!color) return;
    const f = parseCssFont(this.s.font);
    const segs = this.fonts.resolve(f.family, f.weight, f.italic, text);
    const width = segs.reduce((w, s) => w + s.face.advance(s.text) * f.size, 0);
    const hs = maxWidth != null && maxWidth > 0 && width > maxWidth ? maxWidth / width : 1;
    const shown = width * hs;
    const rtl = this.direction === 'rtl';
    const align = this.s.textAlign;
    const dx =
      align === 'center' ? -shown / 2 : align === 'right' || (align === 'end' && !rtl) || (align === 'start' && rtl) ? -shown : 0;
    const face = this.fonts.primaryFace(f.family, f.weight, f.italic, text);
    const asc = face.ascent * f.size;
    const desc = face.descent * f.size;
    const bl = this.s.textBaseline;
    const dy = bl === 'top' || bl === 'hanging' ? asc : bl === 'middle' ? (asc - desc) / 2 : bl === 'bottom' || bl === 'ideographic' ? -desc : 0;
    let pen = 0;
    for (const seg of segs) {
      const m = multiply(this.s.ctm, [hs, 0, 0, -1, x + dx + pen * hs, y + dy]);
      this.painter.textSegment(seg, f.size, color, m);
      pen += seg.face.advance(seg.text) * f.size;
    }
  }
}

function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

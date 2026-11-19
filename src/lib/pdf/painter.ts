// A small drawing layer over pdf-lib's content-stream operators.
// All coordinates are poster CSS pixels (96 per inch, y pointing down); the
// page's base transform maps them to PDF points.
import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames as Op,
  type PDFImage,
  type PDFPage,
  PDFHexString,
  PDFString,
  PDFArray,
} from 'pdf-lib';
import type { RGBA } from './color';
import type { Face, Segment } from './fonts';
import { type Matrix, multiply } from './matrix';

type Arg = number | string | PDFName | PDFHexString | PDFString | PDFArray;
// Non-finite numbers would corrupt the content stream, so they are written as 0.
const num = (n: number) => PDFNumber.of(Number.isFinite(n) ? Math.round(n * 10000) / 10000 : 0);

export interface StrokeStyle {
  width: number;
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'round' | 'bevel';
  dash?: number[];
  dashOffset?: number;
  miterLimit?: number;
}

export interface TextOptions {
  color: RGBA;
  /** Maps text space (x right, y up, 1 unit = 1 px) to poster px. */
  matrix: Matrix;
  size: number;
}

export class Painter {
  readonly ops: PDFOperator[] = [];
  private fontKeys = new Map<object, PDFName>();
  private gsKeys = new Map<string, PDFName>();
  private glyphKeys = new Map<object, Map<number, PDFName>>();
  private imageKeys = new Map<PDFImage, PDFName>();

  constructor(
    readonly doc: PDFDocument,
    readonly page: PDFPage,
  ) {}

  op(name: Op, ...args: Arg[]) {
    this.ops.push(PDFOperator.of(name, args.map((a) => (typeof a === 'number' ? num(a) : typeof a === 'string' ? PDFName.of(a) : a))));
  }

  save() {
    this.op(Op.PushGraphicsState);
  }
  restore() {
    this.op(Op.PopGraphicsState);
  }
  transform(m: Matrix) {
    this.op(Op.ConcatTransformationMatrix, ...m);
  }

  // ---- paths
  moveTo(x: number, y: number) {
    this.op(Op.MoveTo, x, y);
  }
  lineTo(x: number, y: number) {
    this.op(Op.LineTo, x, y);
  }
  curveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
    this.op(Op.AppendBezierCurve, x1, y1, x2, y2, x, y);
  }
  closePath() {
    this.op(Op.ClosePath);
  }
  rect(x: number, y: number, w: number, h: number) {
    this.op(Op.AppendRectangle, x, y, w, h);
  }
  /** Rectangle with corner radius (clamped like CSS border-radius). */
  roundRect(x: number, y: number, w: number, h: number, r: number) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    if (!r) return this.rect(x, y, w, h);
    const k = 0.5522847498 * r;
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.curveTo(x + w - r + k, y, x + w, y + r - k, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.curveTo(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.curveTo(x + r - k, y + h, x, y + h - r + k, x, y + h - r);
    this.lineTo(x, y + r);
    this.curveTo(x, y + r - k, x + r - k, y, x + r, y);
    this.closePath();
  }
  ellipse(x: number, y: number, w: number, h: number) {
    const rx = w / 2;
    const ry = h / 2;
    const cx = x + rx;
    const cy = y + ry;
    const kx = 0.5522847498 * rx;
    const ky = 0.5522847498 * ry;
    this.moveTo(cx + rx, cy);
    this.curveTo(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry);
    this.curveTo(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy);
    this.curveTo(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry);
    this.curveTo(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy);
    this.closePath();
  }

  // ---- painting
  private alpha(fill: number, stroke: number) {
    const key = `${fill}|${stroke}`;
    let name = this.gsKeys.get(key);
    if (!name) {
      const dict = this.doc.context.obj({ Type: 'ExtGState', ca: fill, CA: stroke });
      name = this.page.node.newExtGState('GS', this.doc.context.register(dict));
      this.gsKeys.set(key, name);
    }
    this.op(Op.SetGraphicsStateParams, name);
  }
  setFill(c: RGBA) {
    this.op(Op.NonStrokingColorRgb, c.r, c.g, c.b);
    if (c.a < 1) this.alpha(c.a, 1);
  }
  setStroke(c: RGBA, s: StrokeStyle) {
    this.op(Op.StrokingColorRgb, c.r, c.g, c.b);
    if (c.a < 1) this.alpha(1, c.a);
    this.op(Op.SetLineWidth, s.width);
    this.op(Op.SetLineCapStyle, s.cap === 'round' ? 1 : s.cap === 'square' ? 2 : 0);
    this.op(Op.SetLineJoinStyle, s.join === 'round' ? 1 : s.join === 'bevel' ? 2 : 0);
    if (s.miterLimit) this.op(Op.SetLineMiterLimit, s.miterLimit);
    this.op(Op.SetLineDashPattern, this.doc.context.obj(s.dash?.length ? s.dash.map((d) => Math.max(0, d)) : []) as PDFArray, s.dashOffset ?? 0);
  }
  /** Fills the current path (wrapped in q/Q so alpha does not leak). */
  fill(c: RGBA, evenOdd = false) {
    this.save();
    this.setFill(c);
    this.op(evenOdd ? Op.FillEvenOdd : Op.FillNonZero);
    this.restore();
  }
  stroke(c: RGBA, s: StrokeStyle) {
    this.save();
    this.setStroke(c, s);
    this.op(Op.StrokePath);
    this.restore();
  }
  /** Intersects the clip with the current path. Callers bracket with save()/restore(). */
  clip(evenOdd = false) {
    this.op(evenOdd ? Op.ClipEvenOdd : Op.ClipNonZero);
    this.op(Op.EndPath);
  }
  endPath() {
    this.op(Op.EndPath);
  }

  image(img: PDFImage, x: number, y: number, w: number, h: number, alpha = 1) {
    let key = this.imageKeys.get(img);
    if (!key) {
      key = this.page.node.newXObject('Im', img.ref);
      this.imageKeys.set(img, key);
    }
    this.save();
    if (alpha < 1) this.alpha(alpha, alpha);
    // Image space is a unit square with y up; flip it into our y-down space.
    this.transform([w, 0, 0, -h, x, y + h]);
    this.op(Op.DrawObject, key);
    this.restore();
  }

  // ---- text
  private fontKey(face: Face) {
    let k = this.fontKeys.get(face);
    if (!k) {
      k = this.page.node.newFontDictionary('F', face.pdf!.ref);
      this.fontKeys.set(face, k);
    }
    return k;
  }

  /**
   * Draws one segment of text. `m` maps text space (x right, y up, px) to
   * poster px; the baseline origin is (0,0) in text space.
   */
  textSegment(seg: Segment, size: number, color: RGBA, m: Matrix) {
    const { face, fakeBold, fakeItalic } = seg;
    if (!seg.text) return;
    const tm: Matrix = fakeItalic ? multiply(m, [1, 0, 0.21, 1, 0, 0]) : m;
    if (face.kind === 'outline') return this.outlineText(seg, size, color, tm);
    const k = this.fontKey(face);
    this.save();
    this.setFill(color);
    if (fakeBold) {
      this.setStroke(color, { width: size / 30, join: 'round' });
    }
    this.op(Op.BeginText);
    this.op(Op.SetFontAndSize, k, size);
    this.op(Op.SetTextRenderingMode, fakeBold ? 2 : 0);
    this.op(Op.SetTextMatrix, ...tm);
    this.op(Op.ShowText, face.pdf!.encodeText(seg.text));
    this.op(Op.EndText);
    this.restore();
  }

  /** Draws glyph outlines as vector paths (one reusable XObject per glyph), plus invisible text for search. */
  private outlineText(seg: Segment, size: number, color: RGBA, m: Matrix) {
    const fk = seg.face.fk!;
    const upm = fk.unitsPerEm || 1000;
    const run = fk.layout(seg.text);
    const s = size / upm;
    this.save();
    this.setFill(color);
    if (seg.fakeBold) this.setStroke(color, { width: upm / 30, join: 'round' });
    let pen = 0;
    run.glyphs.forEach((g, i) => {
      const pos = run.positions[i];
      const key = this.glyphKey(seg.face, g, seg.fakeBold);
      if (key) {
        this.save();
        this.transform(multiply(m, [s, 0, 0, s, (pen + pos.xOffset) * s, pos.yOffset * s]));
        this.op(Op.DrawObject, key);
        this.restore();
      }
      pen += pos.xAdvance;
    });
    this.restore();
    // Invisible copy so the text can still be searched and selected.
    const std = this.searchFont();
    const plain = [...seg.text].filter((c) => {
      try {
        std.encodeText(c);
        return true;
      } catch {
        return false;
      }
    });
    if (plain.length) {
      const w = std.widthOfTextAtSize(plain.join(''), size);
      const hs = w > 0 ? (pen * s) / w : 1;
      this.save();
      this.op(Op.BeginText);
      this.op(Op.SetFontAndSize, this.fontKeyFor(std), size);
      this.op(Op.SetTextRenderingMode, 3);
      this.op(Op.SetTextMatrix, ...multiply(m, [hs, 0, 0, 1, 0, 0]));
      this.op(Op.ShowText, std.encodeText(plain.join('')));
      this.op(Op.EndText);
      this.restore();
    }
  }

  private searchStd?: ReturnType<PDFDocument['embedStandardFont']>;
  private searchFont() {
    return (this.searchStd ??= this.doc.embedStandardFont('Helvetica' as never));
  }
  private fontKeyFor(f: { ref: import('pdf-lib').PDFRef }) {
    let k = this.fontKeys.get(f);
    if (!k) {
      k = this.page.node.newFontDictionary('F', f.ref);
      this.fontKeys.set(f, k);
    }
    return k;
  }

  private glyphKey(face: Face, glyph: { id: number; path: unknown }, bold: boolean): PDFName | null {
    let map = this.glyphKeys.get(face);
    if (!map) this.glyphKeys.set(face, (map = new Map()));
    const id = bold ? -1 - glyph.id : glyph.id;
    let key = map.get(id);
    if (key) return key;
    const cmds = (glyph.path as { commands: { command: string; args: number[] }[] }).commands;
    if (!cmds.length) return null;
    const ops: PDFOperator[] = [];
    const push = (name: Op, ...a: number[]) => ops.push(PDFOperator.of(name, a.map(num)));
    let cx = 0;
    let cy = 0;
    for (const { command, args: a } of cmds) {
      switch (command) {
        case 'moveTo':
          push(Op.MoveTo, a[0], a[1]);
          [cx, cy] = a;
          break;
        case 'lineTo':
          push(Op.LineTo, a[0], a[1]);
          [cx, cy] = a;
          break;
        case 'quadraticCurveTo':
          push(Op.AppendBezierCurve, cx + (2 / 3) * (a[0] - cx), cy + (2 / 3) * (a[1] - cy), a[2] + (2 / 3) * (a[0] - a[2]), a[3] + (2 / 3) * (a[1] - a[3]), a[2], a[3]);
          [cx, cy] = [a[2], a[3]];
          break;
        case 'bezierCurveTo':
          push(Op.AppendBezierCurve, ...a);
          [cx, cy] = [a[4], a[5]];
          break;
        case 'closePath':
          ops.push(PDFOperator.of(Op.ClosePath));
          break;
      }
    }
    ops.push(PDFOperator.of(bold ? Op.FillNonZeroAndStroke : Op.FillNonZero));
    const fk = face.fk!;
    const bb = fk.bbox;
    const stream = this.doc.context.formXObject(ops, { BBox: [bb.minX - 10, bb.minY - 10, bb.maxX + 10, bb.maxY + 10] });
    key = this.page.node.newXObject('G', this.doc.context.register(stream));
    map.set(id, key);
    return key;
  }

  flush() {
    this.page.pushOperators(...this.ops);
    this.ops.length = 0;
  }
}

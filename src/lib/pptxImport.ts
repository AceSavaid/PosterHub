// Best-effort import of a PowerPoint (.pptx / .potx) template into a poster.
//
// Brings in: slide size, theme colours and fonts, the background (solid,
// gradient or picture), and the shapes, text boxes, pictures, tables and charts
// from the slide master, layout and the chosen slide. Placeholders inherit their
// position, fill and text styling from the layout and master the way
// PowerPoint does, and grouped shapes are flattened into separate elements.
//
// Use `openPptx` to list the slides (or, for a template with no slides, the
// layouts) so the user can choose one, then `importPage` to convert it.
import JSZip from 'jszip';
import type { ChartKind, ChartSpec, Palette, Poster, PosterElement, TextStyle } from '../types';
import { uid } from '../model';
import { sanitizePoster } from './sanitize';

const EMU_PER_MM = 36000;
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';

// ---------------------------------------------------------------- XML helpers

interface Part {
  path: string;
  doc: Document;
  rels: Record<string, string>;
  relTypes: Record<string, string>;
}

const parseXml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
const kids = (el: Element | null | undefined, ns: string, name: string) =>
  el ? Array.from(el.children).filter((c) => c.namespaceURI === ns && c.localName === name) : [];
const kid = (el: Element | null | undefined, ns: string, name: string) => kids(el, ns, name)[0] ?? null;
const desc = (el: Element | Document | null | undefined, ns: string, name: string) => (el ? el.getElementsByTagNameNS(ns, name)[0] ?? null : null);
const num = (el: Element | null | undefined, attr: string, fallback = 0) => {
  const v = el?.getAttribute(attr);
  return v == null || v === '' ? fallback : Number(v);
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** A font name made safe to put inside an inline style attribute: letters, digits, spaces, - and . only. */
const cssFontName = (s: string) => s.replace(/[^\p{L}\p{N} .-]/gu, '').trim();

function resolvePath(base: string, target: string) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/');
  parts.pop();
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

async function loadPart(zip: JSZip, path: string | null | undefined): Promise<Part | null> {
  if (!path) return null;
  const f = zip.file(path);
  if (!f) return null;
  const doc = parseXml(await f.async('string'));
  if (doc.getElementsByTagName('parsererror').length) return null;
  const rels: Record<string, string> = {};
  const relTypes: Record<string, string> = {};
  const rf = zip.file(path.replace(/([^/]+)$/, '_rels/$1.rels'));
  if (rf) {
    const rd = parseXml(await rf.async('string'));
    for (const r of Array.from(rd.getElementsByTagName('Relationship'))) {
      if (r.getAttribute('TargetMode') === 'External') continue;
      const id = r.getAttribute('Id')!;
      rels[id] = resolvePath(path, r.getAttribute('Target')!);
      relTypes[id] = r.getAttribute('Type') ?? '';
    }
  }
  return { path, doc, rels, relTypes };
}

function relByType(part: Part | null, typeSuffix: string): string | null {
  if (!part) return null;
  for (const id of Object.keys(part.relTypes)) if (part.relTypes[id].endsWith(typeSuffix)) return part.rels[id];
  return null;
}

// ---------------------------------------------------------------- theme & colour

interface Theme {
  colors: Record<string, string>;
  major: string;
  minor: string;
  lineWidths: number[]; // pt, from the theme's line style list
}

function readTheme(doc: Document | null): Theme {
  const colors: Record<string, string> = {};
  const scheme = desc(doc, A, 'clrScheme');
  if (scheme) {
    for (const c of Array.from(scheme.children)) {
      const srgb = desc(c, A, 'srgbClr');
      const sys = desc(c, A, 'sysClr');
      const v = srgb?.getAttribute('val') ?? sys?.getAttribute('lastClr');
      if (v) colors[c.localName] = '#' + v.toLowerCase();
    }
  }
  const major = desc(desc(doc, A, 'majorFont'), A, 'latin')?.getAttribute('typeface') || 'Calibri Light';
  const minor = desc(desc(doc, A, 'minorFont'), A, 'latin')?.getAttribute('typeface') || 'Calibri';
  const lineWidths = kids(desc(doc, A, 'lnStyleLst'), A, 'ln').map((l) => num(l, 'w', 9525) / 12700);
  return { colors, major, minor, lineWidths };
}

const SCHEME_ALIAS: Record<string, string> = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
const PRESET_COLORS: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
  gray: '#808080', grey: '#808080', orange: '#ffa500', purple: '#800080', navy: '#000080', darkBlue: '#00008b',
};

interface Rgba {
  hex: string;
  alpha: number; // 0..1
}

function applyMods(hex: string, el: Element): Rgba {
  let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const val = (n: string) => {
    const v = kid(el, A, n)?.getAttribute('val');
    return v == null ? null : Number(v) / 100000;
  };
  const mod = val('lumMod'), off = val('lumOff'), shade = val('shade'), tint = val('tint');
  const f = (x: number) => {
    if (mod != null) x = x * mod;
    if (off != null) x = x + off;
    if (shade != null) x = x * shade;
    if (tint != null) x = x + (1 - x) * (1 - tint);
    return Math.max(0, Math.min(1, x));
  };
  [r, g, b] = [f(r), f(g), f(b)];
  const alpha = val('alpha') ?? 1;
  return { hex: '#' + [r, g, b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join(''), alpha };
}

/** Reads the colour element (srgbClr, schemeClr, …) directly inside `parent`. */
function colorInfo(parent: Element | null | undefined, theme: Theme): Rgba | undefined {
  if (!parent) return undefined;
  for (const c of Array.from(parent.children)) {
    if (c.namespaceURI !== A) continue;
    switch (c.localName) {
      case 'srgbClr':
        return applyMods('#' + (c.getAttribute('val') ?? '000000').toLowerCase(), c);
      case 'schemeClr': {
        const v = c.getAttribute('val')!;
        const base = theme.colors[SCHEME_ALIAS[v] ?? v];
        return base ? applyMods(base, c) : undefined;
      }
      case 'sysClr':
        return applyMods('#' + (c.getAttribute('lastClr') ?? '000000').toLowerCase(), c);
      case 'prstClr': {
        const base = PRESET_COLORS[c.getAttribute('val') ?? ''];
        return base ? applyMods(base, c) : undefined;
      }
      case 'scrgbClr': {
        const to = (a: string) => Math.round(Math.max(0, Math.min(1, num(c, a) / 100000)) * 255).toString(16).padStart(2, '0');
        return applyMods('#' + to('r') + to('g') + to('b'), c);
      }
    }
  }
  return undefined;
}

/** Hex colour of the colour inside `parent`, or undefined when absent or fully transparent. */
function colorOf(parent: Element | null | undefined, theme: Theme): string | undefined {
  const c = colorInfo(parent, theme);
  return c && c.alpha > 0.02 ? c.hex : undefined;
}

function cssColor(c: Rgba) {
  if (c.alpha >= 0.999) return c.hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${+c.alpha.toFixed(3)})`;
}

/** Converts a DrawingML gradient fill into a CSS gradient. */
export function gradientToCss(grad: Element, theme: Theme): { css: string; first: string } | null {
  const stops = kids(kid(grad, A, 'gsLst'), A, 'gs')
    .map((gs) => ({ pos: num(gs, 'pos') / 1000, c: colorInfo(gs, theme) }))
    .filter((s): s is { pos: number; c: Rgba } => !!s.c)
    .sort((a, b) => a.pos - b.pos);
  if (!stops.length) return null;
  const list = stops.map((s) => `${cssColor(s.c)} ${+s.pos.toFixed(1)}%`).join(', ');
  const path = kid(grad, A, 'path');
  let css: string;
  if (path) {
    const rect = kid(path, A, 'fillToRect');
    const x = rect ? num(rect, 'l') / 1000 : 50;
    const y = rect ? num(rect, 't') / 1000 : 50;
    css = `radial-gradient(${path.getAttribute('path') === 'circle' ? 'circle' : 'ellipse'} at ${+x.toFixed(1)}% ${+y.toFixed(1)}%, ${list})`;
  } else {
    // DrawingML angles start at "left to right" and turn clockwise; CSS starts at "bottom to top".
    const ang = num(kid(grad, A, 'lin'), 'ang') / 60000;
    css = `linear-gradient(${+((ang + 90) % 360).toFixed(2)}deg, ${list})`;
  }
  return { css, first: stops[0].c.hex };
}

type Fill =
  | { kind: 'none' }
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; css: string; color: string }
  | { kind: 'image'; target: string; crop: Element | null };

/** Reads an explicit fill from the children of a spPr / bgPr / tcPr. Null when not specified. */
function readFill(parent: Element | null | undefined, theme: Theme, part: Part): Fill | null {
  if (!parent) return null;
  for (const c of Array.from(parent.children)) {
    if (c.namespaceURI !== A) continue;
    switch (c.localName) {
      case 'noFill':
        return { kind: 'none' };
      case 'solidFill': {
        const color = colorOf(c, theme);
        return color ? { kind: 'solid', color } : { kind: 'none' };
      }
      case 'gradFill': {
        const g = gradientToCss(c, theme);
        return g ? { kind: 'gradient', css: g.css, color: g.first } : { kind: 'none' };
      }
      case 'pattFill': {
        const color = colorOf(kid(c, A, 'fgClr'), theme);
        return color ? { kind: 'solid', color } : { kind: 'none' };
      }
      case 'blipFill': {
        const target = blipTarget(c, part);
        return target ? { kind: 'image', target, crop: kid(c, A, 'srcRect') } : { kind: 'none' };
      }
    }
  }
  return null;
}

/** Fill from a shape's style reference (shapes drawn in PowerPoint use these instead of explicit fills). */
function styleRefFill(styleEl: Element | null, theme: Theme): Fill | null {
  const ref = kid(styleEl, A, 'fillRef');
  if (!ref || num(ref, 'idx') === 0) return null;
  const color = colorOf(ref, theme);
  return color ? { kind: 'solid', color } : null;
}

function readLine(spPr: Element | null, styleEl: Element | null, theme: Theme): { color: string; width: number } | null | undefined {
  const ln = kid(spPr, A, 'ln');
  const ref = kid(styleEl, A, 'lnRef');
  const refIdx = num(ref, 'idx');
  const width = ln?.hasAttribute('w') ? num(ln, 'w') / 12700 : refIdx ? theme.lineWidths[refIdx - 1] ?? 0.75 : 1;
  if (ln) {
    if (kid(ln, A, 'noFill')) return null;
    const solid = kid(ln, A, 'solidFill');
    if (solid) {
      const color = colorOf(solid, theme);
      return color ? { color, width } : null;
    }
    const grad = kid(ln, A, 'gradFill');
    if (grad) {
      const g = gradientToCss(grad, theme);
      return g ? { color: g.first, width } : null;
    }
  }
  if (ref && refIdx) {
    const color = colorOf(ref, theme);
    if (color) return { color, width };
  }
  return ln ? null : undefined;
}

// ---------------------------------------------------------------- pictures

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp',
};

function blipTarget(blipFill: Element, part: Part): string | null {
  const blip = kid(blipFill, A, 'blip');
  if (!blip) return null;
  // Prefer the crisp SVG that newer PowerPoint versions store next to the PNG fallback.
  const svg = Array.from(blip.getElementsByTagName('*')).find((e) => e.localName === 'svgBlip');
  const svgId = svg?.getAttributeNS(R, 'embed');
  if (svgId && part.rels[svgId]) return part.rels[svgId];
  const id = blip.getAttributeNS(R, 'embed');
  return id ? part.rels[id] ?? null : null;
}

async function imageDataUrl(zip: JSZip, target: string, warn: (m: string) => void): Promise<string | null> {
  const ext = target.split('.').pop()!.toLowerCase();
  const mime = IMAGE_MIME[ext];
  const f = zip.file(target);
  if (!f) return null;
  if (!mime) {
    if (/^(emf|wmf)$/.test(ext)) warn('Some vector images (EMF/WMF) cannot be shown in a browser and were skipped.');
    else if (/^tiff?$/.test(ext)) warn('Some TIFF images cannot be shown in a browser and were skipped. Re-insert them as PNG or JPEG.');
    return null;
  }
  return `data:${mime};base64,${await f.async('base64')}`;
}

/** Applies a PowerPoint picture crop (srcRect). Needs a real browser; elsewhere the picture is kept uncropped. */
async function cropImage(src: string, srcRect: Element | null): Promise<string> {
  if (!srcRect) return src;
  const [l, t, r, b] = ['l', 't', 'r', 'b'].map((k) => num(srcRect, k) / 100000);
  if (!(l || t || r || b) || [l, t, r, b].some((v) => v < 0) || l + r >= 1 || t + b >= 1) return src;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined' || src.startsWith('data:image/svg')) return src;
  try {
    const bmp = await createImageBitmap(await (await fetch(src)).blob());
    const sw = bmp.width * (1 - l - r);
    const sh = bmp.height * (1 - t - b);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw));
    canvas.height = Math.max(1, Math.round(sh));
    const ctx = canvas.getContext('2d');
    if (!ctx) return src;
    ctx.drawImage(bmp, bmp.width * l, bmp.height * t, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(src.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png', 0.92);
  } catch {
    return src;
  }
}

// ---------------------------------------------------------------- text

/** Text properties that cascade from master → layout → slide → paragraph → run. */
interface RunProps {
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  font?: string;
  align?: string;
  bullet?: boolean;
}
type Levels = RunProps[]; // one entry per outline level (1–9)

const emptyLevels = (): Levels => Array.from({ length: 9 }, () => ({}));
function mergeProps(a: RunProps, b: RunProps): RunProps {
  const o: RunProps = { ...a };
  for (const k of Object.keys(b) as (keyof RunProps)[]) if (b[k] !== undefined) (o as Record<string, unknown>)[k] = b[k];
  return o;
}
const mergeLevels = (a: Levels, b: Levels): Levels => a.map((x, i) => mergeProps(x, b[i] ?? {}));
const flag = (v: string | null) => (v == null ? undefined : v === '1' || v === 'true');

const fontFace = (tf: string | null | undefined, theme: Theme) =>
  !tf ? undefined : tf.startsWith('+mj') ? theme.major : tf.startsWith('+mn') ? theme.minor : tf;

function rPrProps(rPr: Element | null, theme: Theme): RunProps {
  if (!rPr) return {};
  const u = rPr.getAttribute('u');
  const grad = kid(rPr, A, 'gradFill');
  return {
    size: rPr.hasAttribute('sz') ? num(rPr, 'sz') / 100 : undefined,
    bold: flag(rPr.getAttribute('b')),
    italic: flag(rPr.getAttribute('i')),
    underline: u == null ? undefined : u !== 'none',
    color: colorOf(kid(rPr, A, 'solidFill'), theme) ?? (grad ? gradientToCss(grad, theme)?.first : undefined),
    font: fontFace(kid(rPr, A, 'latin')?.getAttribute('typeface'), theme),
  };
}

function pPrProps(pPr: Element | null, theme: Theme): RunProps {
  if (!pPr) return {};
  const bullet = kid(pPr, A, 'buChar') || kid(pPr, A, 'buAutoNum') ? true : kid(pPr, A, 'buNone') ? false : undefined;
  return mergeProps(rPrProps(kid(pPr, A, 'defRPr'), theme), { align: pPr.getAttribute('algn') ?? undefined, bullet });
}

function levelsOf(lst: Element | null, theme: Theme): Levels {
  return Array.from({ length: 9 }, (_, i) => pPrProps(kid(lst, A, `lvl${i + 1}pPr`), theme));
}

const ALIGN: Record<string, TextStyle['align']> = { l: 'left', ctr: 'center', r: 'right', just: 'justify', dist: 'justify' };

interface TextResult {
  html: string;
  style: TextStyle;
}

function textFromBody(body: Element, theme: Theme, kind: 'title' | 'subtitle' | 'text', inherited: Levels): TextResult | null {
  const levels = mergeLevels(inherited, levelsOf(kid(body, A, 'lstStyle'), theme));
  let first: RunProps | null = null;
  const blocks: { bullet: boolean; html: string; align?: string }[] = [];
  let plain = '';
  for (const p of kids(body, A, 'p')) {
    const pPr = kid(p, A, 'pPr');
    const lvl = Math.min(8, num(pPr, 'lvl'));
    const base = mergeProps(levels[lvl], pPrProps(pPr, theme));
    let html = '';
    for (const r of Array.from(p.children)) {
      if (r.localName === 'br') {
        html += '<br>';
        continue;
      }
      if (r.localName !== 'r' && r.localName !== 'fld') continue;
      const t = kid(r, A, 't')?.textContent ?? '';
      if (!t) continue;
      plain += t;
      const props = mergeProps(base, rPrProps(kid(r, A, 'rPr'), theme));
      if (!first) first = props;
      let s = esc(t);
      if (props.bold && !first.bold) s = `<b>${s}</b>`;
      if (props.italic && !first.italic) s = `<i>${s}</i>`;
      if (props.underline && !first.underline) s = `<u>${s}</u>`;
      const style: string[] = [];
      if (!props.bold && first.bold) style.push('font-weight:normal');
      if (!props.italic && first.italic) style.push('font-style:normal');
      if (props.color && props.color !== first.color) style.push(`color:${props.color}`);
      if (props.size && props.size !== (first.size ?? 18)) style.push(`font-size:${props.size}pt`);
      if (props.font && props.font !== first.font && cssFontName(props.font)) style.push(`font-family:'${cssFontName(props.font)}'`);
      html += style.length ? `<span style="${style.join(';')}">${s}</span>` : s;
    }
    blocks.push({ bullet: !!base.bullet && !!html, html, align: base.align });
  }
  if (!plain.trim() || !first) return null;
  const f: RunProps = first;
  const align = ALIGN[f.align ?? ''] ?? 'left';
  let out = '';
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const a = ALIGN[b.align ?? ''];
    const alignCss = a && a !== align ? ` style="text-align:${a}"` : '';
    if (b.bullet) {
      out += '<ul>';
      for (; i < blocks.length && blocks[i].bullet; i++) out += `<li>${blocks[i].html}</li>`;
      out += '</ul>';
      i--;
    } else out += `<div${alignCss}>${b.html || '<br>'}</div>`;
  }
  const defaults = { title: 44, subtitle: 32, text: 18 };
  const style: TextStyle = {
    fontFamily: f.font ?? (kind === 'title' ? '@heading' : '@body'),
    fontSize: f.size ?? defaults[kind],
    color: f.color ?? '@text',
    bold: !!f.bold,
    italic: !!f.italic,
    underline: !!f.underline,
    align,
    lineHeight: 1.2,
  };
  if (f.font === theme.major) style.fontFamily = '@heading';
  else if (f.font === theme.minor) style.fontFamily = '@body';
  return { html: out, style };
}

// ---------------------------------------------------------------- placeholders

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function readXfrm(x: Element | null): (Box & { rot: number }) | null {
  if (!x) return null;
  const off = kid(x, A, 'off');
  const ext = kid(x, A, 'ext');
  if (!off || !ext) return null;
  return { x: num(off, 'x'), y: num(off, 'y'), w: num(ext, 'cx'), h: num(ext, 'cy'), rot: num(x, 'rot') };
}

interface PhKey {
  type: string;
  idx: string;
}
interface PhInfo {
  key: PhKey;
  box: Box | null;
  spPr: Element | null;
  style: Element | null;
  levels: Levels;
  part: Part;
}
interface PhMap {
  byIdx: Map<string, PhInfo>;
  byType: Map<string, PhInfo>;
}

function phKey(node: Element): PhKey | null {
  const nv = Array.from(node.children).find((c) => c.localName.startsWith('nv'));
  const ph = desc(nv, P, 'ph');
  if (!ph) return null;
  return { type: ph.getAttribute('type') ?? 'body', idx: ph.getAttribute('idx') ?? '' };
}

const TITLE_TYPES = /^(title|ctrTitle)$/;
const FURNITURE_TYPES = /^(dt|ftr|sldNum|hdr)$/; // date, footer, slide number: never brought in
const masterType = (t: string) => (TITLE_TYPES.test(t) ? 'title' : FURNITURE_TYPES.test(t) ? t : 'body');

function buildPhMap(part: Part | null, theme: Theme): PhMap {
  const map: PhMap = { byIdx: new Map(), byType: new Map() };
  if (!part) return map;
  for (const sp of Array.from(part.doc.getElementsByTagNameNS(P, 'sp'))) {
    const key = phKey(sp);
    if (!key) continue;
    const spPr = kid(sp, P, 'spPr');
    const info: PhInfo = {
      key,
      box: readXfrm(kid(spPr, A, 'xfrm')),
      spPr,
      style: kid(sp, P, 'style'),
      levels: levelsOf(kid(kid(sp, P, 'txBody'), A, 'lstStyle'), theme),
      part,
    };
    if (key.idx && !map.byIdx.has(key.idx)) map.byIdx.set(key.idx, info);
    if (!map.byType.has(key.type)) map.byType.set(key.type, info);
  }
  return map;
}

// ---------------------------------------------------------------- tables

function tableHtml(tbl: Element, theme: Theme, part: Part, styled: boolean): TextResult | null {
  const cols = kids(kid(tbl, A, 'tblGrid'), A, 'gridCol').map((c) => num(c, 'w'));
  const totalW = cols.reduce((a, b) => a + b, 0) || 1;
  const rows = kids(tbl, A, 'tr');
  if (!rows.length) return null;
  const tblPr = kid(tbl, A, 'tblPr');
  const firstRow = flag(tblPr?.getAttribute('firstRow') ?? null);
  const bandRow = flag(tblPr?.getAttribute('bandRow') ?? null);
  const accent = theme.colors.accent1 ?? '#4472c4';
  const light = theme.colors.lt1 ?? '#ffffff';
  const tintOf = (pct: number) => applyMods(accent, parseXml(`<x xmlns="${A}"><tint val="${pct * 1000}"/></x>`).documentElement).hex;
  const pt = (emu: number) => +(emu / 12700).toFixed(2);

  // First pass: read every cell. Second pass: write cells, only spelling out text styles that differ from the table's most common one.
  const grid = rows.map((tr, ri) =>
    kids(tr, A, 'tc')
      .filter((tc) => !flag(tc.getAttribute('hMerge')) && !flag(tc.getAttribute('vMerge')))
      .map((tc) => {
        const tcPr = kid(tc, A, 'tcPr');
        const isHeader = !!firstRow && ri === 0;
        const css: string[] = [];
        // Fill: explicit cell fill, else an approximation of PowerPoint's default table style.
        const fill = readFill(tcPr, theme, part);
        const bg =
          fill?.kind === 'solid' || fill?.kind === 'gradient'
            ? fill.color
            : fill?.kind === 'none' || !styled
              ? null
              : isHeader
                ? accent
                : bandRow && (ri - (firstRow ? 1 : 0)) % 2 === 0
                  ? tintOf(40)
                  : tintOf(20);
        if (bg) css.push(`background-color:${bg}`);
        for (const [side, el] of [['left', 'lnL'], ['right', 'lnR'], ['top', 'lnT'], ['bottom', 'lnB']] as const) {
          const ln = kid(tcPr, A, el);
          const color = ln && !kid(ln, A, 'noFill') ? colorOf(kid(ln, A, 'solidFill'), theme) : undefined;
          if (color) css.push(`border-${side}:${pt(num(ln, 'w', 12700))}pt solid ${color}`);
          else if (styled && !ln) css.push(`border-${side}:1pt solid ${light}`);
        }
        const anchor = tcPr?.getAttribute('anchor');
        css.push(`vertical-align:${anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top'}`);
        const mar = (k: string, d: number) => +(num(tcPr, k, d) / EMU_PER_MM).toFixed(2);
        css.push(`padding:${mar('marT', 45720)}mm ${mar('marR', 91440)}mm ${mar('marB', 45720)}mm ${mar('marL', 91440)}mm`);
        const inherited = emptyLevels().map(() => (styled && isHeader ? { bold: true, color: light } : {}));
        const txBody = kid(tc, A, 'txBody');
        const text = txBody ? textFromBody(txBody, theme, 'text', inherited) : null;
        const span = (attr: string, n: string) => (num(tc, n, 1) > 1 ? ` ${attr}="${num(tc, n)}"` : '');
        return { css, text, spans: span('colspan', 'gridSpan') + span('rowspan', 'rowSpan') };
      }),
  );
  const keyOf = (s: TextStyle) => `${s.fontSize}|${s.color}|${s.bold}|${s.italic}|${s.fontFamily}`;
  const counts = new Map<string, { n: number; style: TextStyle }>();
  for (const row of grid)
    for (const c of row) {
      if (!c.text) continue;
      const k = keyOf(c.text.style);
      counts.set(k, { n: (counts.get(k)?.n ?? 0) + 1, style: c.text.style });
    }
  const base: TextStyle = [...counts.values()].sort((a, b) => b.n - a.n)[0]?.style ?? {
    fontFamily: '@body', fontSize: 18, color: '@text', bold: false, italic: false, underline: false, align: 'left', lineHeight: 1.2,
  };
  let body = '';
  grid.forEach((row, ri) => {
    let cells = '';
    for (const c of row) {
      const s = c.text?.style;
      if (s) {
        if (s.fontSize !== base.fontSize) c.css.push(`font-size:${s.fontSize}pt`);
        if (s.color !== base.color) c.css.push(`color:${s.color === '@text' ? theme.colors.dk1 ?? '#000000' : s.color}`);
        if (s.bold !== base.bold) c.css.push(`font-weight:${s.bold ? 'bold' : 'normal'}`);
        if (s.italic !== base.italic) c.css.push(`font-style:${s.italic ? 'italic' : 'normal'}`);
        if (s.fontFamily !== base.fontFamily && !s.fontFamily.startsWith('@') && cssFontName(s.fontFamily)) c.css.push(`font-family:'${cssFontName(s.fontFamily)}'`);
        if (s.align !== 'left') c.css.push(`text-align:${s.align}`);
      }
      cells += `<td${c.spans} style="${c.css.join(';')}">${c.text ? c.text.html : '<br>'}</td>`;
    }
    body += `<tr style="height:${+(num(rows[ri], 'h') / EMU_PER_MM).toFixed(2)}mm">${cells}</tr>`;
  });
  const colgroup = cols.map((w) => `<col style="width:${+((w / totalW) * 100).toFixed(2)}%">`).join('');
  const style = base;
  // Cells set their own alignment; the table itself stays left-aligned.
  return {
    html: `<table style="width:100%;height:100%;border-collapse:collapse;table-layout:fixed"><colgroup>${colgroup}</colgroup><tbody>${body}</tbody></table>`,
    style: { ...style, align: 'left' },
  };
}

// ---------------------------------------------------------------- charts

function cTextOf(el: Element | null): string {
  if (!el) return '';
  const rich = desc(el, A, 'p') ? Array.from(el.getElementsByTagNameNS(A, 't')).map((t) => t.textContent ?? '').join('') : '';
  if (rich) return rich;
  return desc(el, C, 'v')?.textContent ?? '';
}

function cPoints(el: Element | null): { count: number; pts: Map<number, string> } {
  const pts = new Map<number, string>();
  if (!el) return { count: 0, pts };
  // Use the first cache/literal found (strCache, numCache, strLit, numLit, or the first level of multiLvlStrCache).
  const cache = Array.from(el.getElementsByTagNameNS(C, '*')).find((e) => /^(strCache|numCache|strLit|numLit|lvl)$/.test(e.localName));
  if (!cache) return { count: 0, pts };
  for (const pt of kids(cache, C, 'pt')) pts.set(num(pt, 'idx'), kid(pt, C, 'v')?.textContent ?? '');
  const count = Math.max(num(kid(cache, C, 'ptCount'), 'val'), pts.size ? Math.max(...pts.keys()) + 1 : 0);
  return { count, pts };
}

const CHART_KINDS: [RegExp, (g: Element) => ChartKind][] = [
  [/^bar(3D)?Chart$/, (g) => (kid(g, C, 'barDir')?.getAttribute('val') === 'bar' ? 'horizontalBar' : 'bar')],
  [/^(line|line3D|area|area3D|stock|radar)Chart$/, () => 'line'],
  [/^(pie|pie3D|ofPie)Chart$/, () => 'pie'],
  [/^doughnutChart$/, () => 'doughnut'],
  [/^(scatter|bubble)Chart$/, () => 'scatter'],
];

/** Converts an embedded PowerPoint chart into an editable chart using the data cached in the file. */
export function chartSpecFromXml(doc: Document): { spec: ChartSpec; fill?: string } | null {
  const chart = desc(doc, C, 'chart');
  const plot = desc(chart, C, 'plotArea');
  if (!chart || !plot) return null;
  let kind: ChartKind | null = null;
  const series: Element[] = [];
  for (const g of Array.from(plot.children)) {
    const match = CHART_KINDS.find(([re]) => re.test(g.localName));
    if (!match) continue;
    kind ??= match[1](g);
    series.push(...kids(g, C, 'ser'));
  }
  if (!kind || !series.length) return null;
  const scatter = kind === 'scatter';
  const data = series.map((s, i) => ({
    name: cTextOf(kid(s, C, 'tx')) || `Series ${i + 1}`,
    cat: cPoints(kid(s, C, scatter ? 'xVal' : 'cat')),
    val: cPoints(kid(s, C, scatter ? 'yVal' : 'val')),
  }));
  const n = Math.max(...data.map((d) => Math.max(d.cat.count, d.val.count)));
  if (!n) return null;
  const cats = data.find((d) => d.cat.count)?.cat.pts;
  const rows = Array.from({ length: n }, (_, i) => [cats?.get(i) ?? String(i + 1), ...data.map((d) => d.val.pts.get(i) ?? '')]);

  const axes = [...kids(plot, C, 'catAx'), ...kids(plot, C, 'valAx'), ...kids(plot, C, 'dateAx')];
  const axTitle = (pos: RegExp, type?: string) => {
    const ax = axes.find((a) => (!type || a.localName === type) && pos.test(kid(a, C, 'axPos')?.getAttribute('val') ?? ''));
    return cTextOf(kid(ax, C, 'title'));
  };
  const xLabel = scatter ? axTitle(/^[bt]$/) : axTitle(/./, 'catAx') || axTitle(/./, 'dateAx');
  const yLabel = scatter ? axTitle(/^[lr]$/) : axTitle(/./, 'valAx');

  const titleEl = kid(chart, C, 'title');
  const autoDeleted = kid(chart, C, 'autoTitleDeleted')?.getAttribute('val') === '1';
  // A title element without text is PowerPoint's automatic title: the series name for single-series charts.
  const title = titleEl && !autoDeleted ? cTextOf(kid(titleEl, C, 'tx')) || (data.length === 1 ? data[0].name : '') : '';

  const sz = desc(kid(doc.documentElement, C, 'txPr'), A, 'defRPr')?.getAttribute('sz');
  const fillEl = kid(kid(doc.documentElement, C, 'spPr'), A, 'solidFill');
  const fill = fillEl ? kid(fillEl, A, 'srgbClr')?.getAttribute('val') : null;
  return {
    spec: {
      kind,
      title,
      columns: [scatter ? 'X' : 'Category', ...data.map((d) => d.name)],
      rows,
      xColumn: 0,
      yColumns: data.map((_, i) => i + 1),
      rowStart: 0,
      rowEnd: rows.length - 1,
      xLabel,
      yLabel,
      showLegend: !!kid(chart, C, 'legend') && (data.length > 1 || kind === 'pie' || kind === 'doughnut'),
      fontSize: sz ? Number(sz) / 100 : 18,
    },
    fill: fill ? '#' + fill.toLowerCase() : undefined,
  };
}

// ---------------------------------------------------------------- shape tree

interface Xform {
  ox: number;
  oy: number;
  sx: number;
  sy: number;
}
const IDENTITY: Xform = { ox: 0, oy: 0, sx: 1, sy: 1 };

type Role = 'master' | 'layout' | 'slide';

interface TextDefaults {
  title: Levels;
  body: Levels;
  other: Levels;
}

interface Ctx {
  zip: JSZip;
  theme: Theme;
  part: Part;
  role: Role;
  out: PosterElement[];
  /** Include placeholders found in this part (slides always; a layout only when it is the chosen page). */
  includePlaceholders: boolean;
  layoutPh: PhMap;
  masterPh: PhMap;
  text: TextDefaults;
  warn: (m: string) => void;
}

const SUPPORTED_PRST = /^(rect|roundRect|ellipse|line|straightConnector\d*|snip1Rect|flowChartProcess|flowChartAlternateProcess)$/;

function phChain(k: PhKey, ctx: Ctx): PhInfo[] {
  const chain: PhInfo[] = [];
  let typeForMaster = k.type;
  if (ctx.role === 'slide') {
    const lay = (k.idx && ctx.layoutPh.byIdx.get(k.idx)) || ctx.layoutPh.byType.get(k.type) || ctx.layoutPh.byType.get(masterType(k.type));
    if (lay) {
      chain.push(lay);
      typeForMaster = lay.key.type;
    }
  }
  if (ctx.role !== 'master') {
    const mas = ctx.masterPh.byType.get(typeForMaster) ?? ctx.masterPh.byType.get(masterType(typeForMaster));
    if (mas) chain.push(mas);
  }
  return chain; // nearest first
}

async function walkTree(tree: Element, ctx: Ctx, xf: Xform) {
  const toMm = (b: Box) => ({
    x: (b.x * xf.sx + xf.ox) / EMU_PER_MM,
    y: (b.y * xf.sy + xf.oy) / EMU_PER_MM,
    w: (b.w * xf.sx) / EMU_PER_MM,
    h: (b.h * xf.sy) / EMU_PER_MM,
  });
  const checkRot = (b: { rot: number } | null) => {
    if (b && b.rot % 10800000 !== 0) ctx.warn('Rotated shapes were brought in without their rotation.');
  };

  for (const node of Array.from(tree.children)) {
    // Newer PowerPoint features are wrapped in AlternateContent; the fallback is always plain DrawingML.
    if (node.localName === 'AlternateContent') {
      const alt = Array.from(node.children).find((c) => c.localName === 'Fallback') ?? Array.from(node.children).find((c) => c.localName === 'Choice');
      if (alt) await walkTree(alt, ctx, xf);
      continue;
    }
    if (node.namespaceURI !== P) continue;

    if (node.localName === 'grpSp') {
      const gx = kid(kid(node, P, 'grpSpPr'), A, 'xfrm');
      const off = readXfrm(gx);
      checkRot(off);
      const chOff = kid(gx, A, 'chOff');
      const chExt = kid(gx, A, 'chExt');
      if (off && chOff && chExt) {
        const cx = num(chOff, 'x'), cy = num(chOff, 'y');
        const cw = num(chExt, 'cx') || 1, ch = num(chExt, 'cy') || 1;
        const sx = off.w / cw, sy = off.h / ch;
        // child -> group: off.x + (x - chOff.x) * sx, then apply the outer transform
        const inner: Xform = { sx: sx * xf.sx, sy: sy * xf.sy, ox: (off.x - cx * sx) * xf.sx + xf.ox, oy: (off.y - cy * sy) * xf.sy + xf.oy };
        await walkTree(node, ctx, inner);
      } else await walkTree(node, ctx, xf);
      continue;
    }

    const k = phKey(node);
    if (k && (!ctx.includePlaceholders || FURNITURE_TYPES.test(k.type))) continue;
    const chain = k ? phChain(k, ctx) : [];

    if (node.localName === 'sp' || node.localName === 'cxnSp') {
      const spPr = kid(node, P, 'spPr');
      const styleEl = kid(node, P, 'style');
      const own = readXfrm(kid(spPr, A, 'xfrm'));
      checkRot(own);
      const box = own ?? chain.find((c) => c.box)?.box ?? null;
      if (!box) continue;
      const mm = toMm(box);
      const prst = kid(spPr, A, 'prstGeom')?.getAttribute('prst') ?? (kid(spPr, A, 'custGeom') ? 'custom' : 'rect');

      let fill = readFill(spPr, ctx.theme, ctx.part) ?? styleRefFill(styleEl, ctx.theme);
      for (const c of chain) fill ??= readFill(c.spPr, ctx.theme, c.part) ?? styleRefFill(c.style, ctx.theme);
      let line = readLine(spPr, styleEl, ctx.theme);
      for (const c of chain) if (line === undefined) line = readLine(c.spPr, c.style, ctx.theme);

      // Lines and connectors
      if (node.localName === 'cxnSp' || prst === 'line' || prst.startsWith('straightConnector') || prst.endsWith('Connector')) {
        if (!line) continue;
        const thick = Math.max(0.2, (line.width * 25.4) / 72);
        if (mm.w > 0.5 && mm.h > 0.5) ctx.warn('Diagonal lines were brought in as straight lines.');
        const vertical = mm.h > mm.w;
        ctx.out.push({
          id: uid(),
          type: 'shape',
          shape: 'line',
          ...mm,
          ...(vertical ? { w: Math.max(mm.w, thick) } : { h: Math.max(mm.h, thick) }),
          fill: line.color,
        });
        continue;
      }

      // Text levels: master text style → master placeholder → layout placeholder (own lstStyle is read by textFromBody)
      const isTitle = !!k && TITLE_TYPES.test(k.type);
      const kind = isTitle ? 'title' : k?.type === 'subTitle' ? 'subtitle' : 'text';
      let levels = k ? (isTitle ? ctx.text.title : ctx.text.body) : ctx.text.other;
      for (const c of [...chain].reverse()) levels = mergeLevels(levels, c.levels);
      const fontColor = colorOf(kid(styleEl, A, 'fontRef'), ctx.theme);
      if (fontColor) levels = levels.map((l) => ({ ...l, color: fontColor }));
      const body = kid(node, P, 'txBody');
      const text = body ? textFromBody(body, ctx.theme, kind, levels) : null;

      // Empty picture / chart placeholders become empty frames the user can fill in.
      if (!text && k && /^(pic|chart|clipArt|media)$/.test(k.type) && fill?.kind !== 'image') {
        ctx.out.push({ id: uid(), type: k.type === 'chart' ? 'chart' : 'image', ...mm, fit: 'cover', fill: fill?.kind === 'solid' ? fill.color : undefined });
        continue;
      }

      const radius = prst === 'roundRect' ? Math.min(mm.w, mm.h) * 0.1 : 0;
      const border = line ? { borderColor: line.color, borderWidth: +line.width.toFixed(2) } : {};
      if (fill?.kind === 'image') {
        const src = await imageDataUrl(ctx.zip, fill.target, ctx.warn);
        if (src) ctx.out.push({ id: uid(), type: 'image', ...mm, src: await cropImage(src, fill.crop), fit: 'fill', radius: radius || undefined, ...border });
      }
      const fillColor = fill?.kind === 'solid' || fill?.kind === 'gradient' ? fill.color : undefined;
      const gradient = fill?.kind === 'gradient' ? fill.css : undefined;
      const hasPaint = !!(fillColor || line);
      if (hasPaint && !SUPPORTED_PRST.test(prst) && prst !== 'custom') ctx.warn('Some shapes (such as arrows or stars) were brought in as rectangles.');
      if (hasPaint && prst === 'custom') ctx.warn('Some freeform shapes were brought in as rectangles.');

      if (text) {
        ctx.out.push({
          id: uid(),
          type: kind,
          ...mm,
          html: text.html,
          style: text.style,
          fill: fill?.kind === 'image' ? undefined : fillColor,
          gradient,
          ...(fill?.kind === 'image' ? {} : border),
          padding: 2.5,
          radius: radius || undefined,
        });
      } else if (hasPaint && fill?.kind !== 'image') {
        ctx.out.push({
          id: uid(),
          type: 'shape',
          shape: prst === 'ellipse' ? 'ellipse' : 'rect',
          ...mm,
          fill: fillColor ?? 'transparent',
          gradient,
          ...border,
          radius,
        });
      }
      continue;
    }

    if (node.localName === 'pic') {
      const spPr = kid(node, P, 'spPr');
      const own = readXfrm(kid(spPr, A, 'xfrm'));
      checkRot(own);
      const box = own ?? chain.find((c) => c.box)?.box ?? null;
      const blipFill = kid(node, P, 'blipFill');
      const target = blipFill ? blipTarget(blipFill, ctx.part) : null;
      if (!box || !target) continue;
      const src = await imageDataUrl(ctx.zip, target, ctx.warn);
      if (!src) continue;
      const line = readLine(spPr, kid(node, P, 'style'), ctx.theme);
      ctx.out.push({
        id: uid(),
        type: 'image',
        ...toMm(box),
        src: await cropImage(src, kid(blipFill, A, 'srcRect')),
        fit: 'fill',
        ...(line ? { borderColor: line.color, borderWidth: +line.width.toFixed(2) } : {}),
      });
      continue;
    }

    if (node.localName === 'graphicFrame') {
      const own = readXfrm(kid(node, P, 'xfrm'));
      const box = own ?? chain.find((c) => c.box)?.box ?? null;
      const gd = desc(node, A, 'graphicData');
      const uri = gd?.getAttribute('uri') ?? '';
      if (!box || !gd) continue;
      const mm = toMm(box);
      if (uri.endsWith('/table')) {
        const tbl = kid(gd, A, 'tbl');
        const styled = !!desc(tbl, A, 'tableStyleId') || !!(kid(tbl, A, 'tblPr')?.getAttribute('firstRow') && !desc(tbl, A, 'tcPr'));
        const t = tbl ? tableHtml(tbl, ctx.theme, ctx.part, styled) : null;
        if (t) {
          // Rows may be taller than the frame says once text wraps; keep the larger of the two.
          const rowsH = kids(tbl, A, 'tr').reduce((s, tr) => s + num(tr, 'h'), 0) * xf.sy;
          ctx.out.push({ id: uid(), type: 'text', ...mm, h: Math.max(mm.h, rowsH / EMU_PER_MM), html: t.html, style: t.style, padding: 0 });
        }
      } else if (uri.endsWith('/chart')) {
        const id = desc(gd, C, 'chart')?.getAttributeNS(R, 'id');
        const chartPart = id ? await loadPart(ctx.zip, ctx.part.rels[id]) : null;
        const parsed = chartPart ? chartSpecFromXml(chartPart.doc) : null;
        if (parsed) ctx.out.push({ id: uid(), type: 'chart', ...mm, chart: parsed.spec, fill: parsed.fill });
        else ctx.warn('A chart in the PowerPoint could not be read; recreate it with the Chart tool.');
      } else if (uri.includes('diagram')) {
        ctx.warn('SmartArt graphics were skipped; rebuild them from shapes and text boxes.');
      } else {
        ctx.warn('Embedded objects (such as videos or OLE objects) were skipped.');
      }
    }
  }
}

// ---------------------------------------------------------------- background

interface Background {
  color?: string;
  gradient?: string;
  image?: string;
}

async function background(part: Part | null, zip: JSZip, theme: Theme, warn: (m: string) => void): Promise<Background | null> {
  if (!part) return null;
  const bg = desc(part.doc, P, 'bg');
  if (!bg) return null;
  const bgPr = kid(bg, P, 'bgPr');
  if (bgPr) {
    const fill = readFill(bgPr, theme, part);
    if (fill?.kind === 'solid') return { color: fill.color };
    if (fill?.kind === 'gradient') return { color: fill.color, gradient: fill.css };
    if (fill?.kind === 'image') {
      const src = await imageDataUrl(zip, fill.target, warn);
      if (src) return { image: await cropImage(src, fill.crop) };
    }
  }
  const ref = kid(bg, P, 'bgRef');
  if (ref) {
    const color = colorOf(ref, theme);
    if (color) return { color };
  }
  return null;
}

// ---------------------------------------------------------------- public API

export interface PptxImportResult {
  poster: Omit<Poster, 'id' | 'createdAt' | 'updatedAt' | 'name' | 'columns' | 'margin' | 'gutter' | 'sizePreset' | 'version' | 'customFonts' | 'googleFonts'>;
  /** Number of slides in the file (0 for a template that only has layouts). */
  slideCount: number;
  warnings: string[];
}

export interface PptxPage {
  index: number;
  kind: 'slide' | 'layout';
  /** e.g. "Slide 2" or "Title Slide" */
  label: string;
  /** Title text found on the page, if any. */
  title: string;
  hidden: boolean;
}

export interface PptxDeck {
  slideCount: number;
  /** The slides, or the layouts when the file has no slides (typical for .potx templates). */
  pages: PptxPage[];
  importPage(index: number): Promise<PptxImportResult>;
}

function titleText(part: Part | null): string {
  if (!part) return '';
  const sps = Array.from(part.doc.getElementsByTagNameNS(P, 'sp'));
  const titled = sps.find((sp) => TITLE_TYPES.test(phKey(sp)?.type ?? '')) ?? sps.find((sp) => desc(sp, A, 't'));
  return Array.from(titled?.getElementsByTagNameNS(A, 't') ?? [])
    .map((t) => t.textContent ?? '')
    .join('')
    .trim();
}

/** Opens a .pptx / .potx and lists the slides (or layouts) that can be imported. */
export async function openPptx(file: Blob): Promise<PptxDeck> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('This file does not look like a PowerPoint presentation.');
  }
  const pres = await loadPart(zip, 'ppt/presentation.xml');
  if (!pres) throw new Error('This file does not look like a PowerPoint presentation.');
  const sz = desc(pres.doc, P, 'sldSz');
  const width = num(sz, 'cx', 12192000) / EMU_PER_MM;
  const height = num(sz, 'cy', 6858000) / EMU_PER_MM;

  const masterPaths = Array.from(pres.doc.getElementsByTagNameNS(P, 'sldMasterId'))
    .map((m) => pres.rels[m.getAttributeNS(R, 'id')!])
    .filter(Boolean);
  const slidePaths = Array.from(pres.doc.getElementsByTagNameNS(P, 'sldId'))
    .map((s) => pres.rels[s.getAttributeNS(R, 'id')!])
    .filter((p) => p && zip.file(p));

  const pages: (PptxPage & { path: string })[] = [];
  if (slidePaths.length) {
    for (const [i, path] of slidePaths.entries()) {
      const part = await loadPart(zip, path);
      pages.push({ index: i, kind: 'slide', label: `Slide ${i + 1}`, title: titleText(part), hidden: part?.doc.documentElement.getAttribute('show') === '0', path });
    }
  } else {
    for (const mp of masterPaths) {
      const master = await loadPart(zip, mp);
      for (const lid of Array.from(master?.doc.getElementsByTagNameNS(P, 'sldLayoutId') ?? [])) {
        const path = master!.rels[lid.getAttributeNS(R, 'id')!];
        const part = await loadPart(zip, path);
        if (!part) continue;
        const name = desc(part.doc, P, 'cSld')?.getAttribute('name') || `Layout ${pages.length + 1}`;
        pages.push({ index: pages.length, kind: 'layout', label: name, title: '', hidden: false, path });
      }
    }
  }

  async function importPage(index: number): Promise<PptxImportResult> {
    const warnings = new Set<string>();
    const warn = (m: string) => void warnings.add(m);
    const page = pages[Math.max(0, Math.min(index, pages.length - 1))];
    const slide = page?.kind === 'slide' ? await loadPart(zip, page.path) : null;
    const layout = page?.kind === 'layout' ? await loadPart(zip, page.path) : await loadPart(zip, relByType(slide, '/slideLayout'));
    const master = (await loadPart(zip, relByType(layout, '/slideMaster'))) ?? (await loadPart(zip, masterPaths[0]));
    const themeFile = zip.file(relByType(master, '/theme') ?? '');
    const theme = readTheme(themeFile ? parseXml(await themeFile.async('string')) : null);

    const c = theme.colors;
    const palette: Palette = {
      name: 'From template',
      primary: c.accent1 ?? c.dk2 ?? '#1f4e79',
      secondary: c.accent2 ?? c.accent1 ?? '#2e75b6',
      accent: c.accent4 ?? c.accent3 ?? '#f4b183',
      background: c.lt1 ?? '#ffffff',
      surface: c.lt2 ?? '#eeeeee',
      text: c.dk1 ?? '#111111',
    };

    const txStyles = desc(master?.doc, P, 'txStyles');
    const text: TextDefaults = {
      title: levelsOf(kid(txStyles, P, 'titleStyle'), theme),
      body: levelsOf(kid(txStyles, P, 'bodyStyle'), theme),
      // Plain text boxes use the presentation's default text style.
      other: levelsOf(desc(pres!.doc, P, 'defaultTextStyle'), theme),
    };

    const masterPh = buildPhMap(master, theme);
    const layoutPh = buildPhMap(layout, theme);
    const out: PosterElement[] = [];
    const base = { zip, theme, out, layoutPh, masterPh, text, warn };
    const tree = (part: Part | null) => desc(part?.doc, P, 'spTree');
    const showMaster = (part: Part | null) => part?.doc.documentElement.getAttribute('showMasterSp') !== '0';
    const showLayoutShapes = showMaster(slide);
    const showMasterShapes = showLayoutShapes && showMaster(layout);

    if (master && showMasterShapes && tree(master)) await walkTree(tree(master)!, { ...base, part: master, role: 'master', includePlaceholders: false }, IDENTITY);
    if (layout && showLayoutShapes && tree(layout)) await walkTree(tree(layout)!, { ...base, part: layout, role: 'layout', includePlaceholders: !slide }, IDENTITY);
    if (slide && tree(slide)) await walkTree(tree(slide)!, { ...base, part: slide, role: 'slide', includePlaceholders: true }, IDENTITY);

    const bg = (await background(slide, zip, theme, warn)) ?? (await background(layout, zip, theme, warn)) ?? (await background(master, zip, theme, warn));
    if (bg?.color) palette.background = bg.color;
    if (bg?.gradient) {
      // A gradient background becomes a locked full-page shape at the back, so it can still be removed or recoloured.
      out.unshift({ id: uid(), type: 'shape', shape: 'rect', x: 0, y: 0, w: width, h: height, fill: bg.color, gradient: bg.gradient, radius: 0, locked: true });
    }

    return {
      poster: { width, height, palette, headingFont: theme.major, bodyFont: theme.minor, elements: out, backgroundImage: bg?.image },
      slideCount: slidePaths.length,
      warnings: [...warnings],
    };
  }

  return { slideCount: slidePaths.length, pages: pages.map(({ path: _path, ...p }) => p), importPage };
}

/** Imports one slide (by index) from a PowerPoint file. */
export async function importPptx(file: Blob, slideIndex = 0): Promise<PptxImportResult> {
  return (await openPptx(file)).importPage(slideIndex);
}

/** Turns an import result into a complete poster with sensible grid settings. */
export function posterFromImport(r: PptxImportResult, name: string): Poster {
  const short = Math.min(r.poster.width, r.poster.height);
  const now = Date.now();
  return sanitizePoster({
    ...r.poster,
    id: uid(),
    name,
    version: 1,
    sizePreset: 'custom',
    columns: r.poster.width > r.poster.height ? 4 : 3,
    margin: Math.round(short * 0.03),
    gutter: Math.round(short * 0.025),
    customFonts: [],
    googleFonts: [],
    createdAt: now,
    updatedAt: now,
  });
}

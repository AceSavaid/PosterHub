// Best-effort import of a PowerPoint (.pptx / .potx) template into a poster.
// Brings in: slide size, theme colours and fonts, background, and the shapes,
// text boxes and pictures from the slide master, layout and first slide.
import JSZip from 'jszip';
import type { Palette, Poster, PosterElement, TextStyle } from '../types';
import { uid } from '../model';

const EMU_PER_MM = 36000;
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

type Theme = { colors: Record<string, string>; major: string; minor: string };

interface Part {
  path: string;
  doc: Document;
  rels: Record<string, string>;
}

const parseXml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
const kids = (el: Element | null | undefined, ns: string, name: string) =>
  el ? Array.from(el.children).filter((c) => c.namespaceURI === ns && c.localName === name) : [];
const kid = (el: Element | null | undefined, ns: string, name: string) => kids(el, ns, name)[0] ?? null;
const desc = (el: Element | Document | null | undefined, ns: string, name: string) => (el ? el.getElementsByTagNameNS(ns, name)[0] ?? null : null);

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

async function loadPart(zip: JSZip, path: string): Promise<Part | null> {
  const f = zip.file(path);
  if (!f) return null;
  const doc = parseXml(await f.async('string'));
  const relPath = path.replace(/([^/]+)$/, '_rels/$1.rels');
  const rels: Record<string, string> = {};
  const rf = zip.file(relPath);
  if (rf) {
    const rd = parseXml(await rf.async('string'));
    for (const r of Array.from(rd.getElementsByTagName('Relationship'))) {
      const mode = r.getAttribute('TargetMode');
      if (mode === 'External') continue;
      rels[r.getAttribute('Id')!] = resolvePath(path, r.getAttribute('Target')!);
    }
  }
  return { path, doc, rels };
}

function relByType(part: Part, zipRelsDoc: Document | null, typeSuffix: string): string | null {
  if (!zipRelsDoc) return null;
  for (const r of Array.from(zipRelsDoc.getElementsByTagName('Relationship'))) {
    if (r.getAttribute('Type')?.endsWith(typeSuffix)) return resolvePath(part.path, r.getAttribute('Target')!);
  }
  return null;
}

async function relsDoc(zip: JSZip, path: string) {
  const f = zip.file(path.replace(/([^/]+)$/, '_rels/$1.rels'));
  return f ? parseXml(await f.async('string')) : null;
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
  const major = desc(desc(doc, A, 'majorFont'), A, 'latin')?.getAttribute('typeface') ?? 'Calibri Light';
  const minor = desc(desc(doc, A, 'minorFont'), A, 'latin')?.getAttribute('typeface') ?? 'Calibri';
  return { colors, major, minor };
}

const SCHEME_ALIAS: Record<string, string> = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };

function applyLum(hex: string, el: Element): string {
  let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mod = desc(el, A, 'lumMod')?.getAttribute('val');
  const off = desc(el, A, 'lumOff')?.getAttribute('val');
  const shade = desc(el, A, 'shade')?.getAttribute('val');
  const tint = desc(el, A, 'tint')?.getAttribute('val');
  const f = (x: number) => {
    if (mod) x = x * (Number(mod) / 100000);
    if (off) x = x + Number(off) / 100000;
    if (shade) x = x * (Number(shade) / 100000);
    if (tint) x = x + (1 - x) * (1 - Number(tint) / 100000);
    return Math.max(0, Math.min(1, x));
  };
  [r, g, b] = [f(r), f(g), f(b)];
  return '#' + [r, g, b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

function colorOf(fillParent: Element | null, theme: Theme): string | undefined {
  if (!fillParent) return undefined;
  const srgb = kid(fillParent, A, 'srgbClr');
  if (srgb) return applyLum('#' + srgb.getAttribute('val')!.toLowerCase(), srgb);
  const sch = kid(fillParent, A, 'schemeClr');
  if (sch) {
    const v = sch.getAttribute('val')!;
    const base = theme.colors[SCHEME_ALIAS[v] ?? v];
    return base ? applyLum(base, sch) : undefined;
  }
  const sys = kid(fillParent, A, 'sysClr');
  if (sys) return '#' + (sys.getAttribute('lastClr') ?? '000000').toLowerCase();
  return undefined;
}

interface Xform {
  ox: number;
  oy: number;
  sx: number;
  sy: number;
}
const IDENTITY: Xform = { ox: 0, oy: 0, sx: 1, sy: 1 };

function readXfrm(x: Element | null) {
  if (!x) return null;
  const off = kid(x, A, 'off');
  const ext = kid(x, A, 'ext');
  if (!off || !ext) return null;
  return { x: +off.getAttribute('x')!, y: +off.getAttribute('y')!, w: +ext.getAttribute('cx')!, h: +ext.getAttribute('cy')! };
}

interface Ctx {
  zip: JSZip;
  theme: Theme;
  part: Part;
  out: PosterElement[];
  placeholders?: Map<string, { x: number; y: number; w: number; h: number }>;
  skipPlaceholders: boolean;
}

function phKey(sp: Element) {
  const ph = desc(sp, P, 'ph');
  if (!ph) return null;
  return { type: ph.getAttribute('type') ?? 'body', idx: ph.getAttribute('idx') ?? '' };
}

function collectPlaceholders(part: Part | null, map: Map<string, { x: number; y: number; w: number; h: number }>) {
  if (!part) return;
  for (const sp of Array.from(part.doc.getElementsByTagNameNS(P, 'sp'))) {
    const k = phKey(sp);
    const xf = readXfrm(desc(kid(sp, P, 'spPr'), A, 'xfrm'));
    if (!k || !xf) continue;
    if (k.idx) map.set('idx:' + k.idx, xf);
    if (!map.has('type:' + k.type)) map.set('type:' + k.type, xf);
  }
}

const fontFace = (tf: string | null | undefined, theme: Theme) =>
  !tf ? undefined : tf.startsWith('+mj') ? theme.major : tf.startsWith('+mn') ? theme.minor : tf;

function textFromBody(body: Element, theme: Theme, isTitle: boolean) {
  const paras = kids(body, A, 'p');
  let first: { size?: number; bold?: boolean; italic?: boolean; color?: string; font?: string; align?: string } | null = null;
  const htmlParas: string[] = [];
  let plain = '';
  for (const p of paras) {
    const pPr = kid(p, A, 'pPr');
    const algn = pPr?.getAttribute('algn');
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
      const rPr = kid(r, A, 'rPr');
      const sz = rPr?.getAttribute('sz');
      const props = {
        size: sz ? Number(sz) / 100 : undefined,
        bold: rPr?.getAttribute('b') === '1',
        italic: rPr?.getAttribute('i') === '1',
        color: colorOf(kid(rPr, A, 'solidFill'), theme),
        font: fontFace(kid(rPr, A, 'latin')?.getAttribute('typeface'), theme),
        align: algn ?? undefined,
      };
      if (!first) first = props;
      let s = t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      if (props.bold && !first.bold) s = `<b>${s}</b>`;
      if (props.italic && !first.italic) s = `<i>${s}</i>`;
      const style: string[] = [];
      if (props.color && props.color !== first.color) style.push(`color:${props.color}`);
      if (props.size && first.size && props.size !== first.size) style.push(`font-size:${props.size}pt`);
      html += style.length ? `<span style="${style.join(';')}">${s}</span>` : s;
    }
    htmlParas.push(html || '<br>');
  }
  if (!plain.trim()) return null;
  const f = first ?? {};
  const alignMap: Record<string, TextStyle['align']> = { l: 'left', ctr: 'center', r: 'right', just: 'justify' };
  const style: TextStyle = {
    fontFamily: f.font ?? (isTitle ? '@heading' : '@body'),
    fontSize: f.size ?? (isTitle ? 44 : 18),
    color: f.color ?? '@text',
    bold: !!f.bold,
    italic: !!f.italic,
    underline: false,
    align: alignMap[f.align ?? ''] ?? 'left',
    lineHeight: 1.2,
  };
  if (f.font === theme.major) style.fontFamily = '@heading';
  else if (f.font === theme.minor) style.fontFamily = '@body';
  return { html: htmlParas.map((h) => `<div>${h}</div>`).join(''), style };
}

async function walkTree(tree: Element, ctx: Ctx, xf: Xform) {
  const toMm = (b: { x: number; y: number; w: number; h: number }) => ({
    x: (b.x * xf.sx + xf.ox) / EMU_PER_MM,
    y: (b.y * xf.sy + xf.oy) / EMU_PER_MM,
    w: (b.w * xf.sx) / EMU_PER_MM,
    h: (b.h * xf.sy) / EMU_PER_MM,
  });
  for (const node of Array.from(tree.children)) {
    if (node.namespaceURI !== P) continue;
    if (node.localName === 'grpSp') {
      const gx = desc(kid(node, P, 'grpSpPr'), A, 'xfrm');
      const off = readXfrm(gx);
      const chOff = kid(gx, A, 'chOff');
      const chExt = kid(gx, A, 'chExt');
      if (off && chOff && chExt) {
        const cx = +chOff.getAttribute('x')!, cy = +chOff.getAttribute('y')!;
        const cw = +chExt.getAttribute('cx')! || 1, ch = +chExt.getAttribute('cy')! || 1;
        const sx = off.w / cw, sy = off.h / ch;
        // child -> parent: off.x + (x - cx) * sx ; then apply outer transform
        const inner: Xform = { sx: sx * xf.sx, sy: sy * xf.sy, ox: (off.x - cx * sx) * xf.sx + xf.ox, oy: (off.y - cy * sy) * xf.sy + xf.oy };
        await walkTree(node, ctx, inner);
      } else await walkTree(node, ctx, xf);
      continue;
    }
    if (node.localName === 'sp' || node.localName === 'cxnSp') {
      const k = phKey(node);
      if (k && ctx.skipPlaceholders) continue;
      const spPr = kid(node, P, 'spPr');
      let box = readXfrm(desc(spPr, A, 'xfrm'));
      if (!box && k && ctx.placeholders) box = ctx.placeholders.get('idx:' + k.idx) ?? ctx.placeholders.get('type:' + k.type) ?? null;
      if (!box) continue;
      const mm = toMm(box);
      const fill = spPr && kid(spPr, A, 'noFill') ? undefined : colorOf(kid(spPr, A, 'solidFill'), ctx.theme);
      const ln = kid(spPr, A, 'ln');
      const lnColor = ln && !kid(ln, A, 'noFill') ? colorOf(kid(ln, A, 'solidFill'), ctx.theme) : undefined;
      const lnW = ln?.getAttribute('w') ? Number(ln.getAttribute('w')) / 12700 : lnColor ? 1 : 0;
      const prst = desc(spPr, A, 'prstGeom')?.getAttribute('prst') ?? 'rect';
      const body = kid(node, P, 'txBody');
      const isTitle = !!k && /title|ctrTitle/i.test(k.type);
      const text = body ? textFromBody(body, ctx.theme, isTitle) : null;
      if (node.localName === 'cxnSp' || prst === 'line' || prst.startsWith('straightConnector')) {
        if (lnColor) ctx.out.push({ id: uid(), type: 'shape', shape: 'line', ...mm, h: Math.max(mm.h, (lnW * 25.4) / 72), fill: lnColor });
        continue;
      }
      if (text) {
        const anchorCtr = desc(body!, A, 'bodyPr')?.getAttribute('anchor') === 'ctr';
        ctx.out.push({
          id: uid(),
          type: isTitle ? 'title' : 'text',
          ...mm,
          html: text.html,
          style: text.style,
          fill,
          borderColor: lnColor,
          borderWidth: lnColor ? lnW : undefined,
          padding: 2.5,
          radius: prst === 'roundRect' ? Math.min(mm.w, mm.h) * 0.1 : undefined,
          ...(anchorCtr ? {} : {}),
        });
      } else if (fill || lnColor) {
        ctx.out.push({
          id: uid(),
          type: 'shape',
          shape: prst === 'ellipse' ? 'ellipse' : 'rect',
          ...mm,
          fill: fill ?? 'transparent',
          borderColor: lnColor,
          borderWidth: lnColor ? lnW : undefined,
          radius: prst === 'roundRect' ? Math.min(mm.w, mm.h) * 0.1 : 0,
        });
      }
      continue;
    }
    if (node.localName === 'pic') {
      if (phKey(node) && ctx.skipPlaceholders) continue;
      const box = readXfrm(desc(kid(node, P, 'spPr'), A, 'xfrm'));
      const embed = desc(node, A, 'blip')?.getAttributeNS(R, 'embed');
      const target = embed ? ctx.part.rels[embed] : null;
      if (!box || !target) continue;
      const f = ctx.zip.file(target);
      if (!f) continue;
      const ext = target.split('.').pop()!.toLowerCase();
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : ext === 'gif' ? 'image/gif' : 'image/png';
      if (!/png|jpe?g|gif|svg/.test(ext)) continue; // EMF/WMF cannot be shown in browsers
      const src = `data:${mime};base64,${await f.async('base64')}`;
      ctx.out.push({ id: uid(), type: 'image', ...toMm(box), src, fit: 'fill' });
    }
  }
}

async function background(part: Part | null, zip: JSZip, theme: Theme): Promise<{ color?: string; image?: string } | null> {
  if (!part) return null;
  const bg = desc(part.doc, P, 'bg');
  if (!bg) return null;
  const bgPr = kid(bg, P, 'bgPr');
  if (bgPr) {
    const solid = kid(bgPr, A, 'solidFill');
    if (solid) return { color: colorOf(solid, theme) };
    const blip = desc(bgPr, A, 'blip')?.getAttributeNS(R, 'embed');
    const target = blip ? part.rels[blip] : null;
    if (target && zip.file(target)) {
      const ext = target.split('.').pop()!.toLowerCase();
      if (/png|jpe?g|gif/.test(ext)) {
        const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
        return { image: `data:${mime};base64,${await zip.file(target)!.async('base64')}` };
      }
    }
    const grad = kid(bgPr, A, 'gradFill');
    if (grad) return { color: colorOf(desc(grad, A, 'gs'), theme) };
  }
  const ref = kid(bg, P, 'bgRef');
  if (ref) return { color: colorOf(ref, theme) };
  return null;
}

export interface PptxImportResult {
  poster: Omit<Poster, 'id' | 'createdAt' | 'updatedAt' | 'name' | 'columns' | 'margin' | 'gutter' | 'sizePreset' | 'version' | 'customFonts' | 'googleFonts'>;
  slideCount: number;
  warnings: string[];
}

export async function importPptx(file: Blob, slideIndex = 0): Promise<PptxImportResult> {
  const zip = await JSZip.loadAsync(file);
  const pres = await loadPart(zip, 'ppt/presentation.xml');
  if (!pres) throw new Error('This file does not look like a PowerPoint presentation.');
  const sz = desc(pres.doc, P, 'sldSz');
  const width = Number(sz?.getAttribute('cx') ?? 12192000) / EMU_PER_MM;
  const height = Number(sz?.getAttribute('cy') ?? 6858000) / EMU_PER_MM;
  const warnings: string[] = [];

  const slideIds = Array.from(pres.doc.getElementsByTagNameNS(P, 'sldId')).map((s) => pres.rels[s.getAttributeNS(R, 'id')!]);
  const slidePath = slideIds[Math.min(slideIndex, slideIds.length - 1)];
  const slide = slidePath ? await loadPart(zip, slidePath) : null;

  const layoutPath = slide ? relByType(slide, await relsDoc(zip, slide.path), '/slideLayout') : null;
  let layout = layoutPath ? await loadPart(zip, layoutPath) : null;
  let masterPath = layout ? relByType(layout, await relsDoc(zip, layout.path), '/slideMaster') : null;
  if (!masterPath) {
    const firstMaster = desc(pres.doc, P, 'sldMasterId');
    masterPath = firstMaster ? pres.rels[firstMaster.getAttributeNS(R, 'id')!] : null;
  }
  const master = masterPath ? await loadPart(zip, masterPath) : null;
  if (!layout && master) {
    // Template with no slides (e.g. .potx): use the first layout (usually the title layout).
    const lid = desc(master.doc, P, 'sldLayoutId');
    const lp = lid ? master.rels[lid.getAttributeNS(R, 'id')!] : null;
    layout = lp ? await loadPart(zip, lp) : null;
  }
  const themePath = master ? relByType(master, await relsDoc(zip, master.path), '/theme') : null;
  const themeFile = themePath ? zip.file(themePath) : null;
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

  const placeholders = new Map<string, { x: number; y: number; w: number; h: number }>();
  collectPlaceholders(master, placeholders);
  collectPlaceholders(layout, placeholders);

  const out: PosterElement[] = [];
  const tree = (part: Part | null) => desc(part?.doc, P, 'spTree');
  if (master && tree(master)) await walkTree(tree(master)!, { zip, theme, part: master, out, skipPlaceholders: true }, IDENTITY);
  if (layout && tree(layout)) await walkTree(tree(layout)!, { zip, theme, part: layout, out, skipPlaceholders: !!slide }, IDENTITY);
  if (slide && tree(slide)) await walkTree(tree(slide)!, { zip, theme, part: slide, out, placeholders, skipPlaceholders: false }, IDENTITY);

  const bg = (await background(slide, zip, theme)) ?? (await background(layout, zip, theme)) ?? (await background(master, zip, theme));
  if (bg?.color) palette.background = bg.color;

  if (slide && desc(slide.doc, P, 'graphicFrame')) warnings.push('Tables and charts inside the PowerPoint were skipped; recreate them with the Chart tool.');
  if (Array.from(zip.file(/\.(emf|wmf)$/i)).length) warnings.push('Some vector images (EMF/WMF) cannot be shown in a browser and were skipped.');

  return {
    poster: { width, height, palette, headingFont: theme.major, bodyFont: theme.minor, elements: out, backgroundImage: bg?.image },
    slideCount: slideIds.length,
    warnings,
  };
}

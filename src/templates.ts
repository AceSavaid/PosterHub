// Starter layouts for new posters.
//
// Each template is a small recipe: a header style, a section style, a body
// layout and a footer. buildTemplate() turns a recipe into elements for any
// poster size, orientation and column count, so every template works for A4
// through 48 × 36 in, portrait or landscape, with 1–6 columns.

import type { Poster, PosterElement, ElementType, ElementRole } from './types';
import { columnLefts, columnWidth, defaultStyle, makeElement, typeScale, uid } from './model';

export type TemplateId =
  | 'classic'
  | 'boxed'
  | 'bars'
  | 'minimal'
  | 'sidebar'
  | 'takeaway'
  | 'showcase'
  | 'framed'
  | 'central'
  | 'banner'
  | 'blank';

export type HeaderStyle = 'band' | 'logos' | 'minimal' | 'split' | 'sidebar' | 'none';
export type SectionStyle = 'plain' | 'boxed' | 'bars' | 'numbered' | 'framed';
export type BodyLayout = 'flow' | 'central' | 'takeaway' | 'wideFigure' | 'none';
export type FooterStyle = 'references' | 'logos' | 'qr' | 'none';

export interface TemplateDef {
  id: TemplateId;
  label: string;
  description: string;
  header: HeaderStyle;
  sections: SectionStyle;
  body: BodyLayout;
  footer: FooterStyle;
  /** A one-sentence key finding strip under the header. */
  banner?: boolean;
}

export const TEMPLATES: TemplateDef[] = [
  { id: 'classic', label: 'Classic columns', description: 'Title band, sections flowing down each column, references at the bottom.', header: 'band', sections: 'plain', body: 'flow', footer: 'references' },
  { id: 'boxed', label: 'Boxed sections', description: 'Logos either side of the title and each section in its own soft card.', header: 'logos', sections: 'boxed', body: 'flow', footer: 'references' },
  { id: 'bars', label: 'Heading bars', description: 'Bold coloured bars for section headings, with a logo strip in the footer.', header: 'band', sections: 'bars', body: 'flow', footer: 'logos' },
  { id: 'minimal', label: 'Clean minimal', description: 'Light header with a thin accent rule, numbered sections and a QR code.', header: 'minimal', sections: 'numbered', body: 'flow', footer: 'qr' },
  { id: 'sidebar', label: 'Sidebar', description: 'Title, authors, summary and QR code in a coloured side column.', header: 'sidebar', sections: 'plain', body: 'flow', footer: 'none' },
  { id: 'takeaway', label: 'Big takeaway', description: 'Your main result in large type down the middle, details either side.', header: 'band', sections: 'plain', body: 'takeaway', footer: 'references' },
  { id: 'showcase', label: 'Results showcase', description: 'A wide results figure across the poster, with a QR code by the title.', header: 'split', sections: 'boxed', body: 'wideFigure', footer: 'logos' },
  { id: 'framed', label: 'Framed panels', description: 'Outlined panels with tab headings, logos in the header and a QR code.', header: 'logos', sections: 'framed', body: 'flow', footer: 'qr' },
  { id: 'central', label: 'Central figure', description: 'A large figure in the middle column with text either side.', header: 'band', sections: 'plain', body: 'central', footer: 'references' },
  { id: 'banner', label: 'Key finding banner', description: 'A bold one-sentence takeaway under the title, then columns.', header: 'band', sections: 'plain', body: 'flow', footer: 'references', banner: true },
  { id: 'blank', label: 'Blank', description: 'An empty canvas with the column grid.', header: 'none', sections: 'plain', body: 'none', footer: 'none' },
];

export function templateDef(id: TemplateId): TemplateDef {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

const LOREM =
  'Replace this text with your own. Keep paragraphs short and readable from two metres away. Use figures to tell the story and text to support them.';
const REFERENCES = '<b>References</b> 1. Author, A. (2025). Title of work. <i>Journal</i>, 1(1), 1–10.';
const CONTACT = '<b>Contact</b> you@university.edu';

// Sections in reading order. A poster with n sections gets the n most important, kept in this order.
const READING_ORDER = [
  'Introduction', 'Background', 'Aims', 'Hypotheses', 'Methods', 'Participants', 'Materials', 'Analysis', 'Results',
  'Key Findings', 'Discussion', 'Limitations', 'Conclusions', 'Future Work', 'Ethics', 'Data and Code', 'Acknowledgements', 'Funding',
];
const IMPORTANCE = [
  'Introduction', 'Methods', 'Results', 'Discussion', 'Conclusions', 'Future Work', 'Background', 'Analysis', 'Limitations',
  'Acknowledgements', 'Aims', 'Key Findings', 'Participants', 'Funding', 'Materials', 'Hypotheses', 'Data and Code', 'Ethics',
];
const pickSections = (n: number, exclude: string[] = []) => {
  const chosen = new Set(IMPORTANCE.filter((x) => !exclude.includes(x)).slice(0, n));
  return READING_ORDER.filter((x) => chosen.has(x));
};
const SHORT_NAMES = ['Background', 'Results', 'Conclusions'];
const FIGURE_SECTIONS = new Set(['Results', 'Methods']);

interface Col {
  x: number;
  w: number;
}

/** Builds the starting elements for a template. Element order is paint order (first is at the back). */
export function buildTemplate(t: TemplateId, poster: Poster): PosterElement[] {
  const def = templateDef(t);
  if (def.body === 'none') return [];
  return new Builder(poster, def).build();
}

class Builder {
  els: PosterElement[] = [];
  s: number;
  W: number;
  H: number;
  m: number;
  g: number;
  headH: number;
  /** Set while building one section, so its elements share a group id. */
  group?: string;

  constructor(
    private poster: Poster,
    private def: TemplateDef,
  ) {
    this.s = typeScale(poster);
    this.W = poster.width;
    this.H = poster.height;
    this.m = poster.margin;
    this.g = poster.gutter;
    this.headH = 32 * this.s;
  }

  add(type: ElementType, at: Partial<PosterElement>) {
    const e = makeElement(type, this.poster, this.group ? { group: this.group, ...at } : at);
    this.els.push(e);
    return e;
  }

  text(at: Partial<PosterElement>, size = 28, extra: Partial<PosterElement['style']> = {}) {
    return this.add('text', { ...at, style: { ...defaultStyle('text', this.s), fontSize: Math.max(6, Math.round(size * this.s)), ...extra } });
  }

  placeholder(label: string, at: Partial<PosterElement>) {
    return this.add('image', { fill: '@surface', placeholder: label, ...at });
  }

  /** A square QR code box with a short caption underneath or beside it. */
  qr(x: number, y: number, size: number, captionColor = '@text', captionBeside = false, maxW = 0) {
    this.placeholder('QR code', { x, y, w: size, h: size, fill: '#ffffff', fit: 'contain' });
    const capSize = 18;
    if (captionBeside) {
      const w = Math.max(maxW - size - this.g, 0);
      if (w > 20 * this.s) this.text({ x: x + size + this.g * 0.6, y, w: w + this.g * 0.4, h: size, html: 'Scan for the full paper, data and code.', role: 'qrCaption' }, capSize, { color: captionColor });
    } else {
      const h = 18 * this.s;
      this.text({ x, y: y + size + 3 * this.s, w: size, h, html: 'Scan for the full paper', role: 'qrCaption' }, capSize, { color: captionColor, align: 'center' });
    }
  }

  build(): PosterElement[] {
    const { header, footer } = this.def;
    let cols = columnLefts(this.poster).map((x) => ({ x, w: columnWidth(this.poster) }));
    let top: number;
    if (header === 'sidebar' && cols.length >= 2) {
      top = this.sidebar(cols[0]);
      cols = cols.slice(1);
    } else {
      top = this.header(header === 'sidebar' ? 'band' : header);
    }
    const left = cols[0].x;
    const right = cols[cols.length - 1].x + cols[cols.length - 1].w;

    if (this.def.banner) top = this.banner(left, right, top);

    let bottom = this.footer(header === 'sidebar' && this.poster.columns < 2 ? 'references' : footer);
    bottom -= this.g;

    switch (this.def.body) {
      case 'central':
        this.central(cols, top, bottom);
        break;
      case 'takeaway':
        this.takeaway(cols, top, bottom);
        break;
      case 'wideFigure':
        this.wideFigure(cols, top, bottom);
        break;
      default:
        this.flow(cols, top, bottom);
    }
    for (const e of this.els) e.role ??= defaultRole(e);
    return this.els;
  }

  // ---------- headers ----------

  bandHeight() {
    return Math.max(this.H * 0.13, 50 * this.s);
  }

  /** Returns the y where the body starts. */
  header(style: HeaderStyle): number {
    const { W, m, s } = this;
    const bandH = this.bandHeight();
    const titleStyle = (color: string, align: 'center' | 'left' = 'center') => ({ ...defaultStyle('title', s), color, align });
    const subStyle = (color: string, align: 'center' | 'left' = 'center') => ({ ...defaultStyle('subtitle', s), color, align });

    if (style === 'minimal') {
      const logo = Math.min(bandH * 0.7, W * 0.18);
      const tw = W - 2 * m - logo - this.g;
      this.add('title', { x: m, y: m, w: tw, h: bandH * 0.5, style: titleStyle('@primary', 'left') });
      this.add('subtitle', { x: m, y: m + bandH * 0.52, w: tw, h: bandH * 0.24, style: subStyle('@secondary', 'left') });
      this.placeholder('Logo', { x: W - m - logo, y: m, w: logo, h: logo * 0.75, fill: undefined });
      const ruleY = m + bandH * 0.82;
      this.add('shape', { x: m, y: ruleY, w: W - 2 * m, h: Math.max(1, 2 * s), fill: '@accent' });
      return ruleY + Math.max(1, 2 * s) + this.g;
    }

    if (style === 'split') {
      const splitX = W * 0.74;
      this.add('shape', { x: 0, y: 0, w: splitX, h: bandH, fill: '@primary' });
      this.add('shape', { x: splitX, y: 0, w: W - splitX, h: bandH, fill: '@secondary' });
      this.add('title', { x: m, y: bandH * 0.14, w: splitX - 2 * m, h: bandH * 0.5, style: titleStyle('#ffffff', 'left') });
      this.add('subtitle', { x: m, y: bandH * 0.66, w: splitX - 2 * m, h: bandH * 0.26, style: subStyle('@surface', 'left') });
      const q = Math.min(bandH * 0.7, (W - splitX) * 0.45);
      this.qr(splitX + m * 0.6, (bandH - q) / 2, q, '#ffffff', true, W - splitX - m * 1.2);
      return bandH + m;
    }

    // band and logos
    this.add('shape', { x: 0, y: 0, w: W, h: bandH, fill: '@primary' });
    let tx = m;
    let tw = W - 2 * m;
    if (style === 'logos') {
      const logo = Math.min(bandH * 0.66, W * 0.14);
      const ly = (bandH - logo) / 2;
      this.placeholder('Logo', { x: m, y: ly, w: logo, h: logo, fill: '#ffffff', radius: 3 * s });
      this.placeholder('Logo', { x: W - m - logo, y: ly, w: logo, h: logo, fill: '#ffffff', radius: 3 * s });
      tx = m + logo + this.g;
      tw = W - 2 * tx;
    }
    this.add('title', { x: tx, y: bandH * 0.14, w: tw, h: bandH * 0.5, style: titleStyle('#ffffff') });
    this.add('subtitle', { x: tx, y: bandH * 0.66, w: tw, h: bandH * 0.26, style: subStyle('@surface') });
    return bandH + m;
  }

  /** Coloured first column holding title, authors, summary and QR code. Returns the body top. */
  sidebar(col: Col): number {
    const { H, m, s, g } = this;
    const x = col.x;
    const w = col.w;
    this.add('shape', { x: 0, y: 0, w: x + w + g / 2, h: H, fill: '@primary' });
    let y = m;
    const titleH = Math.min(H * 0.2, w * 0.9);
    this.add('title', { x, y, w, h: titleH, style: { ...defaultStyle('title', s), fontSize: Math.max(6, Math.round(Math.min(80 * s, w * 0.38))), color: '#ffffff', align: 'left' } });
    y += titleH + g * 0.5;
    const subH = Math.min(H * 0.07, 70 * s);
    this.add('subtitle', { x, y, w, h: subH, style: { ...defaultStyle('subtitle', s), fontSize: Math.round(32 * s), color: '@surface', align: 'left' } });
    y += subH + g;
    this.add('shape', { x, y, w: w * 0.3, h: Math.max(1, 3 * s), fill: '@accent' });
    y += Math.max(1, 3 * s) + g;
    this.add('heading', { x, y, w, h: this.headH, html: 'At a glance', role: 'summaryHeading', style: { ...defaultStyle('heading', s), color: '#ffffff' } });
    y += this.headH + 6 * s;
    const q = Math.min(w * 0.55, H * 0.14);
    const logoH = Math.min(w * 0.35, H * 0.06);
    const refsH = H * 0.08;
    const qrTop = H - m - logoH - g - refsH - g - q - 22 * s;
    const sumH = Math.max(qrTop - g - y, 10 * s);
    this.text({ x, y, w, h: sumH, html: 'Summarise the whole study in three or four short sentences: the question, what you did, what you found and why it matters.', role: 'summary' }, 30, { color: '#ffffff' });
    this.qr(x, qrTop, q, '#ffffff');
    const refsY = qrTop + q + 22 * s + g;
    this.text({ x, y: refsY, w, h: refsH, html: `${REFERENCES}<br>${CONTACT}`, role: 'references' }, 18, { color: '@surface' });
    this.placeholder('Logo', { x, y: H - m - logoH, w: Math.min(w, logoH * 2.5), h: logoH, fill: '#ffffff', radius: 2 * s });
    return m;
  }

  banner(left: number, right: number, top: number) {
    const s = this.s;
    const h = 45 * s;
    this.text(
      { x: left, y: top, w: right - left, h, html: '<b>Key finding:</b> State your main result in one clear sentence that someone walking past will remember.', role: 'keyFinding', fill: '@accent', padding: 8 * s, radius: 4 * s },
      40,
      { align: 'center', fontFamily: '@heading' },
    );
    return top + h + this.g;
  }

  // ---------- footers ----------

  /** Returns the y where the footer starts (the body must end above it). */
  footer(style: FooterStyle): number {
    const { W, H, m, s, g } = this;
    if (style === 'none') return H - m + g;
    const footerH = Math.max(H * (style === 'references' ? 0.06 : 0.075), 25 * s);
    const top = H - footerH - m;
    this.add('shape', { x: 0, y: top, w: W, h: footerH + m, fill: '@surface' });
    const innerY = top + m * 0.5;
    const innerH = footerH;
    if (style === 'references') {
      this.text({ x: m, y: innerY, w: W - 2 * m, h: innerH, html: `${REFERENCES} &nbsp; ${CONTACT}`, role: 'references' }, 20);
    } else if (style === 'logos') {
      const logoH = innerH * 0.8;
      const logoW = Math.min(logoH * 1.8, (W - 2 * m) * 0.15);
      const n = W > 300 ? 3 : 2;
      const stripW = n * logoW + (n - 1) * g * 0.6;
      this.text({ x: m, y: innerY, w: W - 2 * m - stripW - g, h: innerH, html: `${REFERENCES}<br>${CONTACT}`, role: 'references' }, 20);
      for (let i = 0; i < n; i++) {
        this.placeholder('Logo', { x: W - m - stripW + i * (logoW + g * 0.6), y: innerY + (innerH - logoH) / 2, w: logoW, h: logoH, fill: '#ffffff', radius: 2 * s });
      }
    } else {
      const q = innerH * 0.9;
      this.text({ x: m, y: innerY, w: W - 2 * m - q - g, h: innerH, html: `${REFERENCES}<br>${CONTACT}`, role: 'references' }, 20);
      this.placeholder('QR code', { x: W - m - q, y: innerY + (innerH - q) / 2, w: q, h: q, fill: '#ffffff' });
    }
    return top;
  }

  // ---------- sections ----------

  /**
   * Largest font size (pt), up to `size` at this poster's scale, at which the longest
   * section name fits on one line in `width` mm. Keeps headings from wrapping in narrow columns.
   */
  fitHeading(size: number, width: number) {
    const mmPerPt = 0.3528;
    const boldCharWidth = 0.7; // average bold glyph width, in ems
    const longest = 16; // "Acknowledgements"
    return Math.max(6, Math.min(Math.round(size * this.s), Math.floor(width / (longest * boldCharWidth * mmPerPt))));
  }

  sectionCount(cw: number, avail: number) {
    const n = Math.floor(avail / Math.max(cw * 1.3, 350 * this.s));
    const min = avail > 600 * this.s ? 2 : 1;
    return Math.max(min, Math.min(3, n));
  }

  sectionNames(total: number, names = total <= 3 ? SHORT_NAMES : pickSections(total)) {
    return Array.from({ length: total }, (_, i) => names[i] ?? `Section ${i + 1}`);
  }

  /** One section (heading + text, sometimes a figure) inside the given box. */
  section(x: number, y: number, w: number, h: number, name: string, index: number, figure = FIGURE_SECTIONS.has(name)) {
    const { s } = this;
    const style = this.def.sections;
    const headStyle = defaultStyle('heading', s);
    this.group = uid();
    try {
      this.sectionParts(style, x, y, w, h, name, index, figure, headStyle);
    } finally {
      this.group = undefined;
    }
  }

  private sectionParts(style: SectionStyle, x: number, y: number, w: number, h: number, name: string, index: number, figure: boolean, headStyle: PosterElement['style'] & object) {
    const { s } = this;
    let headH = this.headH;
    let bx = x;
    let bw = w;
    let by = y;
    let bh = h;
    const pad = 8 * s;

    if (style === 'boxed' || style === 'framed') {
      this.add('shape', {
        x, y, w, h, radius: 5 * s,
        fill: style === 'boxed' ? '@surface' : undefined,
        borderColor: style === 'framed' ? '@secondary' : undefined,
        borderWidth: style === 'framed' ? Math.max(0.75, 3 * s) : undefined,
      });
      bx = x + pad;
      bw = w - 2 * pad;
      by = y + pad;
      bh = h - 2 * pad;
    }

    if (style === 'bars' || style === 'framed') {
      headH = 40 * s;
      const hp = 4 * s;
      const fs = this.fitHeading(44, bw - 2 * hp);
      // framed tabs are only as wide as the longest name needs
      const hw = style === 'framed' ? Math.min(bw, Math.max(bw * 0.6, 16 * 0.7 * 0.3528 * fs + 2 * hp)) : bw;
      this.add('heading', {
        x: bx, y: by, w: hw, h: headH, html: name, fill: style === 'bars' ? '@primary' : '@secondary',
        padding: hp, radius: 3 * s, style: { ...headStyle, fontSize: fs, color: '#ffffff' },
      });
    } else if (style === 'numbered') {
      const numSize = Math.max(6, Math.round(36 * s));
      this.add('heading', {
        x: bx, y: by, w: headH, h: headH, html: String(index + 1), role: 'number', fill: '@accent', radius: headH / 2,
        // one line box as tall as the circle centres the number vertically (1 pt = 0.3528 mm)
        style: { ...headStyle, align: 'center', color: '#ffffff', fontSize: numSize, lineHeight: headH / (numSize * 0.3528) },
      });
      const hw = bw - headH - 6 * s;
      this.add('heading', { x: bx + headH + 6 * s, y: by, w: hw, h: headH, html: name, style: { ...headStyle, fontSize: this.fitHeading(50, hw) } });
      this.add('shape', { x: bx, y: by + headH + 2 * s, w: bw, h: Math.max(0.5, 1.5 * s), fill: '@surface' });
      headH += 4 * s;
    } else {
      this.add('heading', { x: bx, y: by, w: bw, h: headH, html: name, style: { ...headStyle, fontSize: this.fitHeading(50, bw) } });
    }

    const gap = 6 * s;
    const bodyY = by + headH + gap;
    const bodyH = bh - headH - gap;
    if (bodyH <= 0) return;
    if (figure && bodyH > 140 * s) {
      const textH = bodyH * 0.36;
      this.text({ x: bx, y: bodyY, w: bw, h: textH, html: LOREM, role: 'body' });
      this.placeholder('Figure', { x: bx, y: bodyY + textH + gap, w: bw, h: bodyH - textH - gap, fill: '@surface' });
      if (style === 'boxed') this.els[this.els.length - 1].fill = '@background';
    } else {
      this.text({ x: bx, y: bodyY, w: bw, h: bodyH, html: LOREM, role: 'body' });
    }
  }

  /** Stack `names.length` sections into each column, in reading order (down, then across). */
  flow(cols: Col[], top: number, bottom: number, names?: string[]) {
    const avail = bottom - top;
    const per = this.sectionCount(cols[0].w, avail);
    const all = names ?? this.sectionNames(per * cols.length);
    let n = 0;
    for (const c of cols) {
      const secH = avail / per;
      for (let k = 0; k < per; k++) {
        this.section(c.x, top + k * secH, c.w, secH - (k < per - 1 ? this.g : 0), all[n], n);
        n++;
      }
    }
  }

  /** The middle column (or middle two when the count is even) as one wide block. */
  middle(cols: Col[]): { before: Col[]; mid: Col; after: Col[] } | null {
    if (cols.length < 3) return null;
    const span = cols.length % 2 === 0 ? 2 : 1;
    const i = Math.floor((cols.length - span) / 2);
    const last = cols[i + span - 1];
    return { before: cols.slice(0, i), mid: { x: cols[i].x, w: last.x + last.w - cols[i].x }, after: cols.slice(i + span) };
  }

  sideFlow(parts: { before: Col[]; after: Col[] }, top: number, bottom: number) {
    const sideCols = [...parts.before, ...parts.after];
    const per = this.sectionCount(sideCols[0].w, bottom - top);
    // The middle block already holds the results, so the sides get the other sections.
    const total = per * sideCols.length;
    const pool = total <= 2 ? SHORT_NAMES.filter((n) => n !== 'Results') : pickSections(total, ['Results']);
    const names = this.sectionNames(total, pool);
    this.flow(parts.before, top, bottom, names.slice(0, per * parts.before.length));
    this.flow(parts.after, top, bottom, names.slice(per * parts.before.length));
  }

  central(cols: Col[], top: number, bottom: number) {
    const parts = this.middle(cols);
    if (!parts) return this.flow(cols, top, bottom);
    const { s } = this;
    const { mid } = parts;
    const avail = bottom - top;
    this.group = uid();
    this.add('heading', { x: mid.x, y: top, w: mid.w, h: this.headH, html: 'Key Figure', style: { ...defaultStyle('heading', s), align: 'center' } });
    const imgY = top + this.headH + 6 * s;
    const imgH = avail * 0.6;
    this.placeholder('Figure', { x: mid.x, y: imgY, w: mid.w, h: imgH });
    this.text({ x: mid.x, y: imgY + imgH + 6 * s, w: mid.w, h: Math.min(avail * 0.25, bottom - imgY - imgH - 6 * s), html: '<i>Figure 1.</i> Describe what the figure shows and why it matters.', role: 'caption' }, 28, { align: 'center' });
    this.group = undefined;
    this.sideFlow(parts, top, bottom);
  }

  takeaway(cols: Col[], top: number, bottom: number) {
    const { s, g } = this;
    const statement = 'Write your <b>main finding</b> here in plain words, big enough to read from across the room.';
    const parts = this.middle(cols);
    if (!parts) {
      // Narrow posters: the takeaway spans the top, sections follow underneath.
      const left = cols[0].x;
      const right = cols[cols.length - 1].x + cols[cols.length - 1].w;
      const h = Math.min((bottom - top) * 0.25, 160 * s);
      this.text({ x: left, y: top, w: right - left, h, html: statement, role: 'keyFinding', fill: '@surface', padding: 10 * s, radius: 5 * s }, 64, { fontFamily: '@heading', color: '@primary', align: 'center', lineHeight: 1.15 });
      return this.flow(cols, top + h + g, bottom);
    }
    const { mid } = parts;
    const avail = bottom - top;
    const stH = avail * 0.4;
    this.text({ x: mid.x, y: top, w: mid.w, h: stH, html: statement, role: 'keyFinding', fill: '@primary', padding: 14 * s, radius: 5 * s }, Math.min(80, (mid.w * 0.28) / s), { fontFamily: '@heading', color: '#ffffff', align: 'center', lineHeight: 1.15 });
    const q = Math.min(mid.w * 0.4, avail * 0.16);
    const capH = 22 * s;
    const figY = top + stH + g;
    const figH = avail - stH - g - q - capH - g * 1.5;
    this.placeholder('Figure', { x: mid.x, y: figY, w: mid.w, h: figH });
    this.qr(mid.x + (mid.w - q) / 2, bottom - q - capH, q);
    this.sideFlow(parts, top, bottom);
  }

  /** Sections across the top, one wide figure across the middle, sections across the bottom. */
  wideFigure(cols: Col[], top: number, bottom: number) {
    const { s, g } = this;
    const avail = bottom - top;
    const left = cols[0].x;
    const right = cols[cols.length - 1].x + cols[cols.length - 1].w;
    const rowH = avail * 0.27;
    const topNames = ['Introduction', 'Methods', 'Hypotheses', 'Participants', 'Materials', 'Design'];
    const bottomNames = ['Discussion', 'Conclusions', 'Future Work', 'Limitations', 'Acknowledgements', 'Funding'];
    cols.forEach((c, i) => this.section(c.x, top, c.w, rowH, topNames[i] ?? `Section ${i + 1}`, i, false));

    const midY = top + rowH + g;
    const midH = avail - 2 * rowH - 2 * g;
    const pad = 8 * s;
    this.group = uid();
    this.add('shape', { x: left, y: midY, w: right - left, h: midH, fill: '@surface', radius: 5 * s });
    this.add('heading', { x: left + pad, y: midY + pad, w: right - left - 2 * pad, h: this.headH, html: 'Results', style: { ...defaultStyle('heading', s), align: 'center' } });
    const capH = 30 * s;
    const figY = midY + pad + this.headH + 6 * s;
    const figH = midH - 2 * pad - this.headH - 6 * s - capH - 6 * s;
    this.placeholder('Figure', { x: left + pad, y: figY, w: right - left - 2 * pad, h: figH, fill: '@background' });
    this.text({ x: left + pad, y: figY + figH + 6 * s, w: right - left - 2 * pad, h: capH, html: '<i>Figure 1.</i> Your headline result. Say what the reader should notice first.', role: 'caption' }, 26, { align: 'center' });
    this.group = undefined;

    const botY = midY + midH + g;
    cols.forEach((c, i) => this.section(c.x, botY, c.w, bottom - botY, bottomNames[i] ?? `Section ${cols.length + i + 1}`, cols.length + i, false));
  }
}

const PLACEHOLDER_ROLES: Record<string, ElementRole> = { Logo: 'logo', 'QR code': 'qr', Figure: 'figure' };

function defaultRole(e: PosterElement): ElementRole | undefined {
  if (e.type === 'title' || e.type === 'subtitle') return e.type;
  if (e.type === 'heading') return 'heading';
  if (e.type === 'shape') return 'decor';
  if (e.type === 'image' && e.placeholder) return PLACEHOLDER_ROLES[e.placeholder];
  return undefined;
}

/** Every piece of starter text the templates use, so we can tell it apart from text people have written. */
let defaults: Set<string> | null = null;
export function isStarterText(html: string | undefined): boolean {
  if (!defaults) {
    defaults = new Set();
    const sample = { width: 841, height: 1189, margin: 25, gutter: 21, columns: 3 } as Poster;
    for (const t of TEMPLATES)
      for (const cols of [1, 3, 4])
        for (const e of buildTemplate(t.id, { ...sample, columns: cols, elements: [] } as Poster)) if (e.html) defaults.add(norm(e.html));
    for (const type of ['title', 'subtitle', 'heading', 'text'] as const) {
      const html = makeElement(type, { ...sample, elements: [] } as Poster).html;
      if (html) defaults.add(norm(html));
    }
  }
  return !html || !norm(html) || defaults.has(norm(html));
}

const norm = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

import type { Palette, Poster, PosterElement, TextStyle, ElementType, Orientation, PaletteRole, ColorValue } from './types';

export const MM_TO_PX = 96 / 25.4;
export const MM_TO_IN = 1 / 25.4;
export const IN_TO_MM = 25.4;

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Preset sizes, always stored portrait (width < height). */
export interface SizePreset {
  id: string;
  label: string;
  w: number; // mm
  h: number; // mm
}

export const SIZE_PRESETS: SizePreset[] = [
  { id: 'A0', label: 'A0 (841 × 1189 mm)', w: 841, h: 1189 },
  { id: 'A1', label: 'A1 (594 × 841 mm)', w: 594, h: 841 },
  { id: 'A2', label: 'A2 (420 × 594 mm)', w: 420, h: 594 },
  { id: 'A3', label: 'A3 (297 × 420 mm)', w: 297, h: 420 },
  { id: 'A4', label: 'A4 (210 × 297 mm)', w: 210, h: 297 },
  { id: '36x48', label: '36 × 48 in', w: 36 * IN_TO_MM, h: 48 * IN_TO_MM },
  { id: '42x56', label: '42 × 56 in', w: 42 * IN_TO_MM, h: 56 * IN_TO_MM },
  { id: '30x40', label: '30 × 40 in', w: 30 * IN_TO_MM, h: 40 * IN_TO_MM },
  { id: '24x36', label: '24 × 36 in', w: 24 * IN_TO_MM, h: 36 * IN_TO_MM },
  { id: '18x24', label: '18 × 24 in', w: 18 * IN_TO_MM, h: 24 * IN_TO_MM },
  { id: '11x17', label: 'Tabloid 11 × 17 in', w: 11 * IN_TO_MM, h: 17 * IN_TO_MM },
  { id: 'letter', label: 'Letter 8.5 × 11 in', w: 8.5 * IN_TO_MM, h: 11 * IN_TO_MM },
];

export const PALETTES: Palette[] = [
  { name: 'Academic Blue', primary: '#1f4e79', secondary: '#2e75b6', accent: '#f4b183', background: '#ffffff', surface: '#eaf1f8', text: '#1b1b1b' },
  { name: 'Forest', primary: '#2d5a3d', secondary: '#4f8a5b', accent: '#e0b44a', background: '#fbfaf5', surface: '#e7efe5', text: '#1d261f' },
  { name: 'Crimson', primary: '#8b1e2d', secondary: '#b23a48', accent: '#f2c14e', background: '#ffffff', surface: '#f7e8ea', text: '#231416' },
  { name: 'Slate', primary: '#2f3e4e', secondary: '#55687c', accent: '#3fa7a0', background: '#f7f8fa', surface: '#e6ebf0', text: '#1c232b' },
  { name: 'Ocean', primary: '#00577a', secondary: '#0089a8', accent: '#ff8c61', background: '#ffffff', surface: '#e2f3f7', text: '#0f2530' },
  { name: 'Royal Purple', primary: '#4b2c7f', secondary: '#7651b3', accent: '#f7c548', background: '#ffffff', surface: '#efe9f8', text: '#1e1530' },
  { name: 'Sunset', primary: '#c0392b', secondary: '#e67e22', accent: '#2c3e50', background: '#fffaf3', surface: '#fdebd7', text: '#2a1a12' },
  { name: 'Monochrome', primary: '#111111', secondary: '#555555', accent: '#d13438', background: '#ffffff', surface: '#efefef', text: '#111111' },
  { name: 'Dark Mode', primary: '#4fc3f7', secondary: '#81d4fa', accent: '#ffb74d', background: '#14181f', surface: '#202733', text: '#eef2f7' },
  { name: 'Earth', primary: '#6b4226', secondary: '#a0683c', accent: '#5b8c5a', background: '#fbf7f0', surface: '#efe4d3', text: '#2b1d12' },
];

export const PALETTE_ROLES: PaletteRole[] = ['primary', 'secondary', 'accent', 'background', 'surface', 'text'];

export function resolveColor(c: ColorValue | undefined, p: Palette): string {
  if (!c) return 'transparent';
  if (c.startsWith('@')) {
    const role = c.slice(1) as PaletteRole;
    return p[role] ?? '#000000';
  }
  return c;
}

export function resolveFont(f: string, poster: Poster): string {
  if (f === '@heading') return poster.headingFont;
  if (f === '@body') return poster.bodyFont;
  return f;
}

export function fontStack(family: string): string {
  const generic = /mono|code|courier/i.test(family) ? 'monospace' : /serif|garamond|times|georgia|merriweather|lora|playfair|crimson|libre baskerville|pt serif|source serif/i.test(family) && !/sans/i.test(family) ? 'serif' : 'sans-serif';
  return `"${family}", ${generic}`;
}

/** Scale factor relative to an A0 portrait poster. */
export function typeScale(p: { width: number; height: number }) {
  return Math.min(p.width, p.height) / 841;
}

export function defaultStyle(type: ElementType, scale: number): TextStyle {
  const r = (n: number) => Math.max(6, Math.round(n * scale));
  switch (type) {
    case 'title':
      return { fontFamily: '@heading', fontSize: r(96), color: '#ffffff', bold: true, italic: false, underline: false, align: 'center', lineHeight: 1.1 };
    case 'subtitle':
      return { fontFamily: '@body', fontSize: r(44), color: '#ffffff', bold: false, italic: false, underline: false, align: 'center', lineHeight: 1.2 };
    case 'heading':
      return { fontFamily: '@heading', fontSize: r(50), color: '@primary', bold: true, italic: false, underline: false, align: 'left', lineHeight: 1.15 };
    default:
      return { fontFamily: '@body', fontSize: r(28), color: '@text', bold: false, italic: false, underline: false, align: 'left', lineHeight: 1.35 };
  }
}

export function makeElement(type: ElementType, poster: Poster, at?: Partial<PosterElement>): PosterElement {
  const s = typeScale(poster);
  const colW = columnWidth(poster);
  const base: PosterElement = { id: uid(), type, x: poster.margin, y: poster.margin, w: colW, h: 60 * s, padding: 0 };
  switch (type) {
    case 'title':
      Object.assign(base, { w: poster.width - 2 * poster.margin, h: 70 * s, html: 'Your Poster Title Goes Here', style: { ...defaultStyle('title', s), color: '@primary' } });
      break;
    case 'subtitle':
      Object.assign(base, { w: poster.width - 2 * poster.margin, h: 30 * s, html: 'Author One, Author Two — Department, University', style: { ...defaultStyle('subtitle', s), color: '@secondary' } });
      break;
    case 'heading':
      Object.assign(base, { h: 32 * s, html: 'Section Heading', style: defaultStyle('heading', s) });
      break;
    case 'text':
      Object.assign(base, { h: 150 * s, html: 'Type or paste your text here. Double-click to edit.', style: defaultStyle('text', s) });
      break;
    case 'image':
      Object.assign(base, { h: colW * 0.66, fit: 'contain' });
      break;
    case 'chart':
      Object.assign(base, { h: colW * 0.75, fill: '#ffffff' });
      break;
    case 'shape':
      Object.assign(base, { h: 60 * s, fill: '@surface', shape: 'rect', radius: 0 });
      break;
  }
  return { ...base, ...at };
}

export function columnWidth(p: Pick<Poster, 'width' | 'margin' | 'gutter' | 'columns'>) {
  return (p.width - 2 * p.margin - (p.columns - 1) * p.gutter) / p.columns;
}

export function columnLefts(p: Pick<Poster, 'width' | 'margin' | 'gutter' | 'columns'>) {
  const w = columnWidth(p);
  return Array.from({ length: p.columns }, (_, i) => p.margin + i * (w + p.gutter));
}

export function sizeFor(presetId: string, orientation: Orientation) {
  const p = SIZE_PRESETS.find((s) => s.id === presetId) ?? SIZE_PRESETS[0];
  return orientation === 'portrait' ? { width: p.w, height: p.h } : { width: p.h, height: p.w };
}

export interface NewPosterOptions {
  name: string;
  width: number;
  height: number;
  sizePreset: string;
  columns: number;
  palette: Palette;
  headingFont: string;
  bodyFont: string;
  template: TemplateId;
}

export type TemplateId = 'classic' | 'banner' | 'central' | 'blank';

export const TEMPLATES: { id: TemplateId; label: string; description: string }[] = [
  { id: 'classic', label: 'Classic columns', description: 'Title band, sections flowing down each column, references at the bottom.' },
  { id: 'central', label: 'Central figure', description: 'A large figure in the middle column with text either side.' },
  { id: 'banner', label: 'Key finding banner', description: 'A bold one-sentence takeaway under the title, then columns.' },
  { id: 'blank', label: 'Blank', description: 'An empty canvas with the column grid.' },
];

export function createPoster(o: NewPosterOptions): Poster {
  const now = Date.now();
  const shortSide = Math.min(o.width, o.height);
  const poster: Poster = {
    id: uid(),
    name: o.name || 'Untitled poster',
    version: 1,
    width: o.width,
    height: o.height,
    sizePreset: o.sizePreset,
    palette: { ...o.palette },
    headingFont: o.headingFont,
    bodyFont: o.bodyFont,
    customFonts: [],
    googleFonts: [],
    columns: o.columns,
    margin: Math.round(shortSide * 0.03),
    gutter: Math.round(shortSide * 0.025),
    elements: [],
    createdAt: now,
    updatedAt: now,
  };
  poster.elements = buildTemplate(o.template, poster);
  return poster;
}

const SECTION_NAMES = ['Introduction', 'Methods', 'Results', 'Discussion', 'Conclusion', 'Future Work', 'Background', 'Analysis'];
const LOREM =
  'Replace this text with your own. Keep paragraphs short and readable from two metres away. Use figures to tell the story and text to support them.';

export function buildTemplate(t: TemplateId, poster: Poster): PosterElement[] {
  if (t === 'blank') return [];
  const s = typeScale(poster);
  const W = poster.width;
  const m = poster.margin;
  const els: PosterElement[] = [];
  const bandH = Math.max(poster.height * 0.13, 50 * s);
  els.push(makeElement('shape', poster, { x: 0, y: 0, w: W, h: bandH, fill: '@primary', locked: false }));
  els.push(makeElement('title', poster, { x: m, y: bandH * 0.14, w: W - 2 * m, h: bandH * 0.5, style: { ...defaultStyle('title', s), color: '#ffffff' } }));
  els.push(makeElement('subtitle', poster, { x: m, y: bandH * 0.66, w: W - 2 * m, h: bandH * 0.26, style: { ...defaultStyle('subtitle', s), color: '@surface' } }));

  let top = bandH + m;
  if (t === 'banner') {
    const h = 45 * s;
    els.push(
      makeElement('text', poster, {
        x: m, y: top, w: W - 2 * m, h,
        html: '<b>Key finding:</b> State your main result in one clear sentence that someone walking past will remember.',
        fill: '@accent', padding: 8 * s, radius: 4 * s,
        style: { ...defaultStyle('text', s), fontSize: Math.round(40 * s), align: 'center', color: '@text', fontFamily: '@heading' },
      }),
    );
    top += h + poster.gutter;
  }

  const footerH = Math.max(poster.height * 0.06, 25 * s);
  const bottom = poster.height - m - footerH - poster.gutter;
  const lefts = columnLefts(poster);
  const cw = columnWidth(poster);
  const avail = bottom - top;
  let n = 0;
  lefts.forEach((x, ci) => {
    const centralCol = t === 'central' && poster.columns >= 3 && ci === Math.floor(poster.columns / 2);
    if (centralCol) {
      const headH = 32 * s;
      els.push(makeElement('heading', poster, { x, y: top, w: cw, h: headH, html: 'Key Figure', style: { ...defaultStyle('heading', s), align: 'center' } }));
      els.push(makeElement('image', poster, { x, y: top + headH + 6 * s, w: cw, h: avail * 0.6, fill: '@surface' }));
      els.push(makeElement('text', poster, { x, y: top + headH + avail * 0.6 + 12 * s, w: cw, h: avail * 0.25, html: '<i>Figure 1.</i> Describe what the figure shows and why it matters.', style: { ...defaultStyle('text', s), align: 'center' } }));
      return;
    }
    const sections = poster.height > poster.width ? 2 : 1;
    const secH = avail / sections;
    for (let k = 0; k < sections; k++) {
      const y = top + k * secH;
      const headH = 32 * s;
      els.push(makeElement('heading', poster, { x, y, w: cw, h: headH, html: SECTION_NAMES[n % SECTION_NAMES.length] }));
      els.push(makeElement('text', poster, { x, y: y + headH + 6 * s, w: cw, h: secH - headH - 6 * s - poster.gutter, html: LOREM }));
      n++;
    }
  });
  els.push(makeElement('shape', poster, { x: 0, y: poster.height - footerH - m, w: W, h: footerH + m, fill: '@surface' }));
  els.push(
    makeElement('text', poster, {
      x: m, y: poster.height - footerH - m * 0.5, w: W - 2 * m, h: footerH,
      html: '<b>References</b> 1. Author, A. (2025). Title of work. <i>Journal</i>, 1(1), 1–10. &nbsp; <b>Contact</b> you@university.edu',
      style: { ...defaultStyle('text', s), fontSize: Math.round(20 * s) },
    }),
  );
  return els;
}

/** Fonts that are always available without network access. */
export const SYSTEM_FONTS = ['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Courier New', 'Garamond'];

/** A curated list of Google Fonts that work well on posters. Any other Google font can be typed in. */
export const POPULAR_GOOGLE_FONTS = [
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Source Sans 3', 'Inter', 'Noto Sans', 'Poppins', 'Raleway', 'Nunito', 'Work Sans',
  'IBM Plex Sans', 'Fira Sans', 'PT Sans', 'Oswald', 'Barlow', 'Libre Franklin', 'Merriweather', 'Lora', 'Playfair Display',
  'Source Serif 4', 'PT Serif', 'Libre Baskerville', 'Crimson Pro', 'EB Garamond', 'Noto Serif', 'IBM Plex Serif', 'Roboto Slab',
  'Zilla Slab', 'Atkinson Hyperlegible', 'Lexend', 'JetBrains Mono', 'Fira Code',
];

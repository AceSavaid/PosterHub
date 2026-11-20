// The built-in science icon library: search, lazy loading of the artwork,
// and drawing an icon in the poster's colours. Shared by the editor and every
// exporter so the poster, PDF, PNG and PowerPoint all place icons the same way.
import type { ColorValue, Palette } from '../../types';
import { resolveColor } from '../../model';
import { ICONS } from './catalog';
import type { IconCategory, IconInfo } from './types';

export type { IconCategory, IconInfo } from './types';
export { ICONS } from './catalog';

export const ICON_CATEGORIES: { id: IconCategory; label: string }[] = [
  { id: 'cells', label: 'Cells and molecules' },
  { id: 'body', label: 'Body and health' },
  { id: 'lab', label: 'Lab equipment' },
  { id: 'science', label: 'Physical sciences' },
  { id: 'nature', label: 'Plants and animals' },
  { id: 'people', label: 'People' },
  { id: 'data', label: 'Charts and data' },
  { id: 'symbols', label: 'Symbols' },
];

/** Where the icons come from. Both licences allow use on posters without credit. */
export const ICON_SOURCES: Record<string, { name: string; licence: string; url: string }> = {
  health: { name: 'Health Icons', licence: 'CC0, public domain', url: 'https://healthicons.org' },
  phosphor: { name: 'Phosphor Icons', licence: 'MIT', url: 'https://phosphoricons.com' },
};

export interface IconPath {
  d: string;
  evenOdd: boolean;
  /** 1 = main colour, 2 = second colour (light shading) */
  tone: 1 | 2;
}

export interface IconArt {
  viewBox: [number, number, number, number];
  paths: IconPath[];
}

const byId = new Map(ICONS.map((i) => [i.id, i]));

export const iconInfo = (id: string | undefined): IconInfo | undefined => (id ? byId.get(id) : undefined);

/** Only ids from the library are used, so a file can't point at anything else. */
export const ICON_ID = /^[a-z]+\/[a-z0-9_-]+$/;

// ------------------------------------------------------------------ search

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Icons matching every word of `query` (in the name, search words or category),
 * best matches first. An empty query lists the whole category (or everything).
 */
export function searchIcons(query: string, category?: IconCategory | ''): IconInfo[] {
  const pool = category ? ICONS.filter((i) => i.category === category) : ICONS;
  const words = norm(query).split(/[^a-z0-9]+/).filter(Boolean);
  if (!words.length) return pool;
  const catLabel = Object.fromEntries(ICON_CATEGORIES.map((c) => [c.id, norm(c.label)]));
  const scored: { icon: IconInfo; score: number; i: number }[] = [];
  pool.forEach((icon, i) => {
    const label = norm(icon.label);
    const keys = icon.keywords.map(norm);
    let score = 0;
    for (const w of words) {
      const plural = w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w;
      const hit = (s: string) => s.includes(w) || s.includes(plural);
      let s = 0;
      if (label.split(/\s+/).some((x) => x.startsWith(w) || x.startsWith(plural))) s = 6;
      else if (hit(label)) s = 4;
      else if (keys.some((k) => k.split(/\s+/).some((x) => x.startsWith(w) || x.startsWith(plural)))) s = 3;
      else if (hit(catLabel[icon.category])) s = 1;
      if (!s) return;
      score += s;
    }
    scored.push({ icon, score, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.icon);
}

// ------------------------------------------------------------------ artwork

let svgs: Record<string, string> | null = null;
let loading: Promise<void> | null = null;
const parsed = new Map<string, IconArt | null>();

/** Loads the icon artwork (once). */
export function loadIcons(): Promise<void> {
  if (svgs) return Promise.resolve();
  loading ??= import('./artwork').then((m) => void (svgs = m.SVGS));
  return loading;
}

export const iconsReady = () => svgs != null;

/** The artwork for an icon, or undefined if it isn't in the library (or hasn't loaded yet). */
export function iconArt(id: string | undefined): IconArt | undefined {
  if (!id || !svgs) return undefined;
  if (!parsed.has(id)) parsed.set(id, svgs[id] ? parseIconSvg(svgs[id]) : null);
  return parsed.get(id) ?? undefined;
}

/** Reads the normalised SVG files written by scripts/import-icons.mjs (plain <path> elements only). */
export function parseIconSvg(svg: string): IconArt | null {
  const vb = svg.match(/viewBox="([^"]+)"/)?.[1]?.trim().split(/[\s,]+/).map(Number);
  if (!vb || vb.length !== 4 || vb.some((n) => !Number.isFinite(n)) || vb[2] <= 0 || vb[3] <= 0) return null;
  const paths: IconPath[] = [];
  for (const m of svg.matchAll(/<path\s([^>]*?)\/>/g)) {
    const d = m[1].match(/\bd="([^"]*)"/)?.[1];
    if (!d) continue;
    paths.push({ d, evenOdd: /fill-rule="evenodd"/.test(m[1]), tone: /opacity="0?\.2"/.test(m[1]) ? 2 : 1 });
  }
  return paths.length ? { viewBox: vb as IconArt['viewBox'], paths } : null;
}

export const hasSecondTone = (art: IconArt | undefined) => !!art?.paths.some((p) => p.tone === 2);

// ------------------------------------------------------------------ colours and layout

/** How light the shading is when no second colour is chosen. */
export const TINT_OPACITY = 0.25;

export interface IconColors {
  main: string;
  /** a concrete second colour, or null for a light tint of the main colour */
  second: string | null;
}

export function iconColors(spec: { color: ColorValue; color2?: ColorValue }, pal: Palette): IconColors {
  return { main: resolveColor(spec.color, pal), second: spec.color2 ? resolveColor(spec.color2, pal) : null };
}

/** Fill and opacity for one path. */
export function pathPaint(p: IconPath, c: IconColors): { fill: string; opacity: number } {
  if (p.tone === 2) return c.second ? { fill: c.second, opacity: 1 } : { fill: c.main, opacity: TINT_OPACITY };
  return { fill: c.main, opacity: 1 };
}

/** Where the artwork sits in a box: as large as fits, centred, keeping its shape. */
export function layoutIcon(art: IconArt, box: { x: number; y: number; w: number; h: number }) {
  const [, , vw, vh] = art.viewBox;
  const scale = Math.max(0, Math.min(box.w / vw, box.h / vh));
  const w = vw * scale;
  const h = vh * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h, scale };
}

const attr = (s: string) => s.replace(/[^#\w\s(),.%-]/g, '');

/** A standalone SVG of the icon in the given colours (for PowerPoint and image copies). */
export function iconSvg(art: IconArt, c: IconColors, width?: number, height?: number): string {
  const [x, y, w, h] = art.viewBox;
  const size = width && height ? ` width="${+width.toFixed(2)}" height="${+height.toFixed(2)}"` : '';
  const body = art.paths
    .map((p) => {
      const paint = pathPaint(p, c);
      return `<path d="${attr(p.d)}" fill="${attr(paint.fill)}"${paint.opacity < 1 ? ` fill-opacity="${paint.opacity}"` : ''}${p.evenOdd ? ' fill-rule="evenodd"' : ''}/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}"${size}>${body}</svg>`;
}

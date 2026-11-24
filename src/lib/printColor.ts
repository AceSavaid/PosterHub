// "Will this colour print dull?" Screens mix light (RGB) and can show much
// brighter, more saturated colours than printing inks (CMYK) can. Vivid blues,
// purples, greens and neon tones come out noticeably duller on paper.
//
// We approximate the printable range of a typical coated-paper press
// (FOGRA39 / ISO Coated v2) in CIELAB: for every hue the printable colours form
// a triangle between paper white, the most saturated ink colour at that hue
// (interpolated between the six solid ink colours below) and the darkest black.
// Real presses bulge a little outside that triangle, so only colours clearly
// beyond it are flagged. It is a guide, not a proof: it needs no colour profile
// and runs instantly in the browser.
import type { Palette, PaletteRole, Poster } from '../types';
import { PALETTE_ROLES, resolveColor } from '../model';
import type { Issue } from './checks';
import { seriesData } from './chart';
import { normalizeHex, parseColor, toHex } from './color';

export { normalizeHex };

export type Lab = [number, number, number];

// ---------------------------------------------------------------- colour maths

const WHITE = [0.95047, 1, 1.08883]; // D65
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gam = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const fInv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));

export function hexToLab(hex: string): Lab | null {
  const rgb = parseColor(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => lin(v / 255));
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / WHITE[0];
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / WHITE[1];
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / WHITE[2];
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

export function labToHex([L, a, b]: Lab): string {
  const fy = (L + 16) / 116;
  const x = fInv(fy + a / 500) * WHITE[0];
  const y = fInv(fy) * WHITE[1];
  const z = fInv(fy - b / 200) * WHITE[2];
  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return toHex([r, g, bl].map((v) => gam(Math.min(1, Math.max(0, v))) * 255));
}

// ---------------------------------------------------------------- printable range

/** Solid inks and two-ink overprints on coated paper (FOGRA39), as CIELAB. */
const INK_CUSPS: Lab[] = [
  [55, -37, -50], // cyan
  [25, 20, -46], // blue (cyan + magenta)
  [48, 74, -3], // magenta
  [47, 68, 48], // red (magenta + yellow)
  [89, -5, 93], // yellow
  [50, -65, 27], // green (cyan + yellow)
];
const PAPER_L = 95;
const BLACK_L = 16;

const hueOf = (a: number, b: number) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
const CUSPS = INK_CUSPS.map(([L, a, b]) => ({ L, C: Math.hypot(a, b), h: hueOf(a, b) })).sort((p, q) => p.h - q.h);

/** Most saturated printable colour at a hue (lightness and chroma). */
function cuspAt(h: number) {
  for (let i = 0; i < CUSPS.length; i++) {
    const p = CUSPS[i];
    const q = CUSPS[(i + 1) % CUSPS.length];
    const span = (q.h - p.h + 360) % 360;
    const d = (h - p.h + 360) % 360;
    if (d <= span) {
      const t = span ? d / span : 0;
      return { L: p.L + (q.L - p.L) * t, C: p.C + (q.C - p.C) * t };
    }
  }
  return { L: CUSPS[0].L, C: CUSPS[0].C };
}

/** Highest printable chroma at this lightness and hue (0 outside paper-to-black). */
export function maxPrintableChroma(L: number, h: number): number {
  if (L >= PAPER_L || L <= BLACK_L) return 0;
  const cusp = cuspAt(h);
  return L >= cusp.L ? (cusp.C * (PAPER_L - L)) / (PAPER_L - cusp.L) : (cusp.C * (L - BLACK_L)) / (cusp.L - BLACK_L);
}

/** How far (CIELAB ΔE) a colour has to move to become printable before we mention it. */
export const DULL_THRESHOLD = 18;

export interface GamutResult {
  /** colour difference to the nearest printable colour (ΔE) */
  excess: number;
  /** a similar colour that prints as it looks on screen */
  suggestion: string;
}

/** Nearest point to (px, py) on the segment a–b. */
function nearestOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): [number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return [ax + t * dx, ay + t * dy];
}

/** null when the colour prints fine (or isn't a hex colour). */
export function printsDull(hex: string): GamutResult | null {
  const lab = hexToLab(hex);
  if (!lab) return null;
  const [L, a, b] = lab;
  const C = Math.hypot(a, b);
  // Greys, near-blacks and near-whites always print acceptably; dullness is about vivid colour.
  if (C < 10 || L < 20) return null;
  const h = hueOf(a, b);
  if (L < PAPER_L && C <= maxPrintableChroma(L, h)) return null;
  // Nearest printable colour of the same hue: the closest point on the triangle's two outer edges.
  const cusp = cuspAt(h);
  const candidates = [nearestOnSegment(L, C, PAPER_L, 0, cusp.L, cusp.C), nearestOnSegment(L, C, cusp.L, cusp.C, BLACK_L, 0)];
  const [nL, nC] = candidates.reduce((best, q) => (Math.hypot(q[0] - L, q[1] - C) < Math.hypot(best[0] - L, best[1] - C) ? q : best));
  const excess = Math.hypot(nL - L, nC - C);
  if (excess < DULL_THRESHOLD) return null;
  // Step just inside the edge so the suggestion is safely printable.
  const k = C ? Math.max(0, nC - 2) / C : 0;
  return { excess, suggestion: labToHex([nL, a * k, b * k]) };
}

// ---------------------------------------------------------------- poster colours

const ROLE_NAMES: Record<PaletteRole, string> = { primary: 'Main', secondary: 'Second', accent: 'Accent', background: 'Background', surface: 'Panel', text: 'Text' };

export interface ColorUse {
  hex: string;
  elementIds: string[];
  roles: PaletteRole[];
}

const INLINE_COLOR = /(?:color\s*[:=]\s*["']?)(#[0-9a-f]{3,6}\b|rgba?\([^)]*\))/gi;


/** Every flat colour the poster prints, with where it is used. Photos are left to the print shop. */
export function posterColors(p: Poster): ColorUse[] {
  const uses = new Map<string, ColorUse>();
  const add = (raw: string | undefined, elementId?: string) => {
    if (!raw) return;
    const role = raw.startsWith('@') ? (raw.slice(1) as PaletteRole) : null;
    const hex = normalizeHex(resolveColor(raw, p.palette));
    if (!hex) return;
    let u = uses.get(hex);
    if (!u) uses.set(hex, (u = { hex, elementIds: [], roles: [] }));
    if (elementId && !u.elementIds.includes(elementId)) u.elementIds.push(elementId);
    if (role && PALETTE_ROLES.includes(role) && !u.roles.includes(role)) u.roles.push(role);
  };
  if (!p.backgroundImage) add('@background');
  for (const e of p.elements) {
    if (e.type === 'image') {
      if (e.fill) add(e.fill, e.id);
      if (e.borderWidth) add(e.borderColor ?? '@primary', e.id);
      continue;
    }
    if (e.icon) {
      add(e.icon.color, e.id);
      if (e.icon.color2) add(e.icon.color2, e.id);
    }
    if (e.type === 'shape') add(e.fill ?? (e.shape === 'line' ? '@primary' : undefined), e.id);
    else add(e.fill, e.id);
    if (e.borderWidth) add(e.borderColor ?? '@primary', e.id);
    if (e.style && e.html?.replace(/<[^>]+>/g, '').trim()) add(e.style.color, e.id);
    for (const m of e.html?.matchAll(INLINE_COLOR) ?? []) add(m[1], e.id);
    if (e.type === 'chart' && e.chart) {
      // Data colours come from the palette (see seriesColors in chart.ts); the fixed extras are already print-safe tones.
      const d = seriesData(e.chart);
      const n = e.chart.kind === 'pie' || e.chart.kind === 'doughnut' ? d.labels.length : d.series.length;
      (['@primary', '@accent', '@secondary'] as const).slice(0, Math.max(1, n)).forEach((r) => add(r, e.id));
      add('@text', e.id);
    }
  }
  return [...uses.values()];
}

export function dullColorIssues(p: Poster): Issue[] {
  const issues: Issue[] = [];
  for (const u of posterColors(p)) {
    const r = printsDull(u.hex);
    if (!r) continue;
    const where = u.roles.length
      ? `your palette's ${u.roles.map((x) => ROLE_NAMES[x]).join(' and ')} colour`
      : u.elementIds.length === 1 ? 'one item' : `${u.elementIds.length} items`;
    issues.push({
      id: 'cmyk-' + u.hex.slice(1),
      elementId: u.elementIds[0],
      severity: 'warning',
      title: `${u.hex.toUpperCase()} will print duller than on screen`,
      detail: `This colour (used by ${where}) is brighter than printing inks can reproduce, so it will look flatter on paper. ${r.suggestion.toUpperCase()} is a close colour that prints as it looks.`,
      fix: { label: `Use ${r.suggestion.toUpperCase()}`, from: u.hex, to: r.suggestion },
    });
  }
  return issues;
}

/** Swaps one colour for another everywhere it appears: palette roles, fills, text, borders and inline text colours. */
export function replaceColor(p: Poster, from: string, to: string): Poster {
  const target = normalizeHex(from);
  if (!target) return p;
  const same = (c: string | undefined) => !!c && !c.startsWith('@') && normalizeHex(c) === target;
  const palette: Palette = { ...p.palette };
  for (const r of PALETTE_ROLES) if (normalizeHex(palette[r]) === target) palette[r] = to;
  const html = (s: string | undefined) => s?.replace(INLINE_COLOR, (m, c: string) => (normalizeHex(c) === target ? m.replace(c, to) : m));
  return {
    ...p,
    palette,
    elements: p.elements.map((e) => ({
      ...e,
      fill: same(e.fill) ? to : e.fill,
      borderColor: same(e.borderColor) ? to : e.borderColor,
      style: e.style && same(e.style.color) ? { ...e.style, color: to } : e.style,
      icon: e.icon && (same(e.icon.color) || same(e.icon.color2)) ? { ...e.icon, color: same(e.icon.color) ? to : e.icon.color, color2: same(e.icon.color2) ? to : e.icon.color2 } : e.icon,
      html: html(e.html),
    })),
  };
}

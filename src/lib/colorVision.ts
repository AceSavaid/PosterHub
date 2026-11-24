// Colour vision: simulate how a poster looks to people with colour blindness
// (or printed in black and white), and measure whether two colours can still
// be told apart. Pure functions so they can be unit tested; the live preview
// uses the same matrices as SVG filters (see VisionFilters.tsx).

export type VisionMode = 'normal' | 'deuteranopia' | 'protanopia' | 'tritanopia' | 'greyscale';

export interface VisionInfo {
  id: VisionMode;
  label: string;
  /** plain-language description for people who don't know the term */
  plain: string;
}

export const VISION_MODES: VisionInfo[] = [
  { id: 'normal', label: 'Normal vision', plain: 'Colours as you see them' },
  { id: 'deuteranopia', label: 'Deuteranopia', plain: 'Red-green, the most common kind' },
  { id: 'protanopia', label: 'Protanopia', plain: 'Red-green, reds look dark' },
  { id: 'tritanopia', label: 'Tritanopia', plain: 'Blue-yellow, rare' },
  { id: 'greyscale', label: 'Greyscale', plain: 'Black-and-white printing or photocopies' },
];

export const visionInfo = (m: VisionMode) => VISION_MODES.find((v) => v.id === m)!;

type Mat3 = [number, number, number, number, number, number, number, number, number];

/**
 * 3×3 matrices applied to *linear* RGB. Colour blindness at full severity from
 * Machado, Oliveira & Fernandes (2009); greyscale keeps only relative luminance.
 */
export const VISION_MATRICES: Record<Exclude<VisionMode, 'normal'>, Mat3> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
  greyscale: [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722],
};

/** The matrix as an SVG feColorMatrix `values` string (4×5, alpha unchanged). */
export function feColorMatrixValues(mode: Exclude<VisionMode, 'normal'>): string {
  const m = VISION_MATRICES[mode];
  return [m[0], m[1], m[2], 0, 0, m[3], m[4], m[5], 0, 0, m[6], m[7], m[8], 0, 0, 0, 0, 0, 1, 0].join(' ');
}

// ---- colour conversion
export { parseColor } from './color';
import { parseColor } from './color';

const toLinear = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
};
const hex2 = (n: number) => n.toString(16).padStart(2, '0');

/** How a colour looks under the given kind of vision, as #rrggbb. Unparseable colours come back unchanged. */
export function simulate(color: string, mode: VisionMode): string {
  const rgb = parseColor(color);
  if (!rgb) return color;
  if (mode === 'normal') return '#' + rgb.map((v) => hex2(Math.round(v))).join('');
  const [r, g, b] = rgb.map(toLinear);
  const m = VISION_MATRICES[mode];
  const out = [m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b];
  return '#' + out.map((v) => hex2(fromLinear(v))).join('');
}

/** sRGB → CIE L*a*b* (D65). */
export function toLab(color: string): [number, number, number] | null {
  const rgb = parseColor(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(toLinear);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIEDE2000 colour difference. About 2 is just noticeable; under ~10 is easy to confuse in small chart marks. */
export function deltaE2000(c1: string, c2: string): number | null {
  const a = toLab(c1);
  const b = toLab(c2);
  if (!a || !b) return null;
  const [L1, a1, b1] = a;
  const [L2, a2, b2] = b;
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (bb: number, ap: number) => {
    if (bb === 0 && ap === 0) return 0;
    const h = Math.atan2(bb, ap) / rad;
    return h < 0 ? h + 360 : h;
  };
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2);
  const Lpm = (L1 + L2) / 2;
  const Cpm = (C1p + C2p) / 2;
  let hpm = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hpm = (h1p + h2p) / 2;
    else hpm = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hpm - 30) * rad) + 0.24 * Math.cos(2 * hpm * rad) + 0.32 * Math.cos((3 * hpm + 6) * rad) - 0.2 * Math.cos((4 * hpm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2);
  const SC = 1 + 0.045 * Cpm;
  const SH = 1 + 0.015 * Cpm * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;
  return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH));
}

/** Below this difference two series colours are hard to tell apart in a graph. */
export const CONFUSABLE_DELTA_E = 10;

export interface ConfusablePair {
  i: number;
  j: number;
  mode: VisionMode;
  deltaE: number;
}

/**
 * Pairs of colours that are hard to tell apart under each kind of vision.
 * A pair already too similar in normal vision is reported once as `normal`
 * and not repeated for the other modes.
 */
export function confusablePairs(colors: string[], modes: VisionMode[] = VISION_MODES.map((v) => v.id), threshold = CONFUSABLE_DELTA_E): ConfusablePair[] {
  const out: ConfusablePair[] = [];
  for (let i = 0; i < colors.length; i++)
    for (let j = i + 1; j < colors.length; j++) {
      if (parseColor(colors[i]) == null || parseColor(colors[j]) == null) continue;
      const base = deltaE2000(colors[i], colors[j])!;
      if (base < threshold) {
        if (modes.includes('normal')) out.push({ i, j, mode: 'normal', deltaE: base });
        continue;
      }
      for (const mode of modes) {
        if (mode === 'normal') continue;
        const d = deltaE2000(simulate(colors[i], mode), simulate(colors[j], mode))!;
        if (d < threshold) out.push({ i, j, mode, deltaE: d });
      }
    }
  return out;
}

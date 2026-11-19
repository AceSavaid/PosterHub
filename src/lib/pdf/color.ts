// CSS colour parsing for the PDF exporter. Returns channels in 0..1, or null for
// "nothing to paint" (transparent / none / empty).

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  navy: '#000080',
  teal: '#008080',
  maroon: '#800000',
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function channel(s: string, max: number) {
  s = s.trim();
  return s.endsWith('%') ? clamp01(parseFloat(s) / 100) : clamp01(parseFloat(s) / max);
}

export function parseColor(input: string | undefined | null): RGBA | null {
  if (!input) return null;
  let c = input.trim().toLowerCase();
  if (!c || c === 'transparent' || c === 'none') return null;
  if (NAMED[c]) c = NAMED[c];
  if (c.startsWith('#')) {
    let h = c.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(h)) return fromBrowser(input);
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
    const out = { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
    return out.a === 0 ? null : out;
  }
  const m = c.match(/^rgba?\(([^)]*)\)$/);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const out = { r: channel(parts[0], 255), g: channel(parts[1], 255), b: channel(parts[2], 255), a: parts[3] != null ? channel(parts[3], 1) : 1 };
    return out.a === 0 ? null : out;
  }
  return fromBrowser(input);
}

/** Lets the browser normalise anything else (hsl(), named colours…) via a canvas. */
function fromBrowser(c: string): RGBA | null {
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return { r: 0, g: 0, b: 0, a: 1 };
    ctx.fillStyle = '#000000';
    ctx.fillStyle = c;
    const v = String(ctx.fillStyle);
    if (v === c) return { r: 0, g: 0, b: 0, a: 1 };
    return parseColor(v);
  } catch {
    return { r: 0, g: 0, b: 0, a: 1 };
  }
}

export function withAlpha(c: RGBA | null, alpha: number): RGBA | null {
  if (!c) return null;
  const a = c.a * alpha;
  return a <= 0 ? null : { ...c, a };
}

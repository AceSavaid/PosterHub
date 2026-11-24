// One place that reads colours, so the contrast check, print check, tables and exports
// all agree on what a colour is. Accepts #rgb, #rrggbb, #rrggbbaa (alpha ignored) and rgb()/rgba().

export type Rgb = [number, number, number];

/** The red, green and blue (0–255) of a CSS colour, or null when it isn't one we can read. */
export function parseColor(c: string): Rgb | null {
  const s = c.trim();
  const m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1].slice(0, 6);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
  }
  const r = s.match(/^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/i);
  return r ? ([+r[1], +r[2], +r[3]].map((v) => Math.min(255, Math.max(0, v))) as Rgb) : null;
}

/** Lower-case #rrggbb, rounding and clamping each channel. */
export const toHex = (rgb: readonly number[]) => '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

/** Any readable colour as lower-case #rrggbb, or null. */
export function normalizeHex(c: string): string | null {
  const rgb = parseColor(c);
  return rgb ? toHex(rgb) : null;
}

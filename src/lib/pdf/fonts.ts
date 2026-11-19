// Font handling for the vector PDF exporter.
//
// Browsers load Google Fonts as WOFF2 files, often *variable* fonts where one
// file holds every weight. PDF files cannot use those directly, so for Google
// fonts we fetch static per-weight WOFF files from Fontsource (an open-source
// mirror of Google Fonts) and embed subsets of them as real, selectable text.
// Uploaded fonts are embedded from the poster itself. When a font cannot be
// embedded, glyph outlines are drawn instead (still vector), and as a last
// resort the built-in PDF fonts are used.
import fontkitDefault from '@pdf-lib/fontkit';
import type * as FK from '@pdf-lib/fontkit';
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';
import type { Poster } from '../../types';
import { SYSTEM_FONTS } from '../../model';

export const fontkit = fontkitDefault as typeof FK;

export type FaceKind = 'embedded' | 'outline' | 'standard';

export interface Face {
  kind: FaceKind;
  family: string;
  weight: number;
  italic: boolean;
  /** fontkit font (embedded / outline faces) */
  fk?: FK.Font;
  /** PDF font (embedded / standard faces) */
  pdf?: PDFFont;
  /** ascent / descent as fractions of the em (descent positive) */
  ascent: number;
  descent: number;
  underlinePosition: number;
  underlineThickness: number;
  has(cp: number): boolean;
  /** Advance width of `text` in ems, as the PDF viewer will lay it out. */
  advance(text: string): number;
}

export interface Segment {
  face: Face;
  text: string;
  /** synthesise bold / italic because the face lacks it (as browsers do) */
  fakeBold: boolean;
  fakeItalic: boolean;
}

export type Fetcher = (url: string) => Promise<Uint8Array | null>;

export const FONTSOURCE_CDN = 'https://cdn.jsdelivr.net/npm/@fontsource';
const SUBSETS = ['latin', 'latin-ext', 'greek', 'greek-ext', 'cyrillic', 'cyrillic-ext', 'vietnamese', 'math', 'symbols'];
/** Families tried for characters the chosen font lacks (Greek, maths symbols…). */
const FALLBACK_FAMILIES = ['Noto Sans', 'Noto Sans Math', 'Noto Sans Symbols', 'Noto Sans Symbols 2'];

/** Open, metric-compatible stand-ins for common system fonts (same letter widths). */
export const SYSTEM_SUBSTITUTES: Record<string, string> = {
  arial: 'Arimo',
  helvetica: 'Arimo',
  'times new roman': 'Tinos',
  times: 'Tinos',
  'courier new': 'Cousine',
  courier: 'Cousine',
  georgia: 'Gelasio',
  garamond: 'EB Garamond',
  verdana: 'Noto Sans',
  'trebuchet ms': 'Fira Sans',
};

export const fontsourceId = (family: string) =>
  family
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function fontsourceUrl(family: string, subset: string, weight: number, italic: boolean) {
  const id = fontsourceId(family);
  return `${FONTSOURCE_CDN}/${id}@5/files/${id}-${subset}-${weight}-${italic ? 'italic' : 'normal'}.woff`;
}

/** Weights to try for a request, nearest first (CSS font matching, roughly). */
export function weightCandidates(w: number): number[] {
  const all = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  return all.sort((a, b) => Math.abs(a - w) - Math.abs(b - w) || (w <= 500 ? a - b : b - a)).slice(0, 4);
}

const isWoff2 = (b: Uint8Array) => b[0] === 0x77 && b[1] === 0x4f && b[2] === 0x46 && b[3] === 0x32; // "wOF2"

export const defaultFetcher: Fetcher = async (url) => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
};

export function dataUrlToBytes(url: string): Uint8Array {
  const comma = url.indexOf(',');
  const meta = url.slice(0, comma);
  const body = url.slice(comma + 1);
  if (/;base64/i.test(meta)) {
    const bin = atob(body);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new TextEncoder().encode(decodeURIComponent(body));
}

function genericOf(family: string): 'sans' | 'serif' | 'mono' {
  if (/mono|code|courier|consol/i.test(family)) return 'mono';
  if (/serif|garamond|times|georgia|merriweather|lora|playfair|crimson|baskerville|tinos|gelasio|slab|book/i.test(family) && !/sans/i.test(family)) return 'serif';
  return 'sans';
}

const STANDARD: Record<'sans' | 'serif' | 'mono', [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};
// Vertical metrics of the fonts these stand in for (Arial, Times New Roman, Courier New).
const STANDARD_METRICS = { sans: [0.905, 0.212], serif: [0.891, 0.216], mono: [0.833, 0.3] } as const;

function fkFace(kind: FaceKind, family: string, weight: number, italic: boolean, fk: FK.Font, pdf?: PDFFont): Face {
  const upm = fk.unitsPerEm || 1000;
  const cache = new Map<number, boolean>();
  const post = (fk as unknown as { post?: { underlinePosition?: number; underlineThickness?: number } }).post;
  return {
    kind,
    family,
    weight,
    italic,
    fk,
    pdf,
    ascent: fk.ascent / upm,
    descent: Math.abs(fk.descent) / upm,
    underlinePosition: post?.underlinePosition ? -post.underlinePosition / upm : 0.1,
    underlineThickness: post?.underlineThickness ? post.underlineThickness / upm : 0.06,
    has(cp) {
      let v = cache.get(cp);
      if (v === undefined) {
        v = fk.hasGlyphForCodePoint(cp);
        cache.set(cp, v);
      }
      return v;
    },
    advance(text) {
      if (!text) return 0;
      // Embedded text advances by glyph widths (no kerning), outlines use full layout.
      const run = fk.layout(text);
      let w = 0;
      if (kind === 'embedded') for (const g of run.glyphs) w += g.advanceWidth;
      else for (const p of run.positions) w += p.xAdvance;
      return w / upm;
    },
  };
}

/** Encodes a tiny subset to check that pdf-lib will be able to embed this font. */
async function canEmbed(fk: FK.Font): Promise<boolean> {
  try {
    const glyph = fk.layout('Ag0').glyphs.find((g) => g.id !== 0) ?? fk.getGlyph(1);
    const subset = fk.createSubset();
    subset.includeGlyph(glyph);
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const parts: Uint8Array[] = [];
      const stream = subset.encodeStream() as unknown as { on(ev: string, cb: (x?: unknown) => void): unknown };
      stream.on('data', (d) => parts.push(d as Uint8Array));
      stream.on('end', () => {
        const len = parts.reduce((n, p) => n + p.length, 0);
        const out = new Uint8Array(len);
        let o = 0;
        for (const p of parts) out.set(p, (o += p.length) - p.length);
        resolve(out);
      });
      stream.on('error', (e) => reject(e));
    });
    const back = fontkit.create(bytes);
    return back.numGlyphs > 1;
  } catch {
    return false;
  }
}

interface FamilyState {
  /** faces per "weight|italic" request key */
  faces: Map<string, Face[]>;
  /** subsets already tried per resolved weight/style */
  tried: Set<string>;
}

export class FontRegistry {
  private families = new Map<string, FamilyState>();
  private bytesCache = new Map<string, Promise<Uint8Array | null>>();
  private standard = new Map<string, Face>();
  private googleRules: { family: string; weight: [number, number]; italic: boolean; url: string }[] | null = null;

  constructor(
    private doc: PDFDocument,
    private poster: Pick<Poster, 'customFonts'>,
    private fetcher: Fetcher = defaultFetcher,
  ) {}

  private fetchBytes(url: string) {
    let p = this.bytesCache.get(url);
    if (!p) {
      p = url.startsWith('data:') ? Promise.resolve(dataUrlToBytes(url)) : this.fetcher(url);
      this.bytesCache.set(url, p);
    }
    return p;
  }

  private state(family: string) {
    const k = family.toLowerCase();
    let s = this.families.get(k);
    if (!s) this.families.set(k, (s = { faces: new Map(), tried: new Set() }));
    return s;
  }

  private async makeFace(bytes: Uint8Array, family: string, weight: number, italic: boolean): Promise<Face | null> {
    let fk: FK.Font;
    try {
      fk = fontkit.create(bytes);
    } catch {
      return null;
    }
    if (!isWoff2(bytes) && (await canEmbed(fk))) {
      try {
        const pdf = await this.doc.embedFont(bytes, { subset: true });
        return fkFace('embedded', family, weight, italic, fk, pdf);
      } catch {
        /* fall through to outlines */
      }
    }
    return fkFace('outline', family, weight, italic, fk);
  }

  /**
   * Makes sure faces exist for `family` at this weight/style that cover `chars`
   * where possible. Call before resolve(); safe to call repeatedly.
   */
  async load(family: string, weight: number, italic: boolean, chars: Iterable<number>) {
    const needed = [...new Set(chars)].filter((cp) => cp > 32);
    const key = `${weight}|${italic}`;
    const st = this.state(family);
    let faces = st.faces.get(key);
    if (!faces) st.faces.set(key, (faces = []));
    const missing = () => needed.filter((cp) => !faces!.some((f) => f.has(cp)));

    if (!faces.length) {
      const custom = this.poster.customFonts.find((f) => f.family.toLowerCase() === family.toLowerCase());
      if (custom) {
        const bytes = await this.fetchBytes(custom.dataUrl);
        const face = bytes && (await this.makeFace(bytes, family, 400, false));
        if (face) faces.push(face);
        return;
      }
    } else if (!missing().length) return;

    const sub = SYSTEM_SUBSTITUTES[family.toLowerCase()];
    const source = sub ?? family;
    await this.loadFontsource(source, family, weight, italic, faces, st, missing);

    if (!faces.length && !sub && !SYSTEM_FONTS.some((f) => f.toLowerCase() === family.toLowerCase())) {
      // Fontsource unreachable: use the browser's own Google Fonts files as outlines.
      const face = await this.loadGoogleCssFace(family, weight, italic);
      if (face) faces.push(face);
    }
  }

  private async loadFontsource(source: string, family: string, weight: number, italic: boolean, faces: Face[], st: FamilyState, missing: () => number[]) {
    // Find the nearest weight / style that exists, using the Latin subset.
    let found: { w: number; it: boolean } | null = null;
    const existing = faces.find((f) => f.kind !== 'standard');
    if (existing) found = { w: existing.weight, it: existing.italic };
    else {
      const styles = italic ? [true, false] : [false];
      outer: for (const it of styles)
        for (const w of weightCandidates(weight)) {
          const tag = `${w}|${it}|latin`;
          if (st.tried.has(tag)) continue;
          st.tried.add(tag);
          const bytes = await this.fetchBytes(fontsourceUrl(source, 'latin', w, it));
          if (!bytes) {
            if (w === weightCandidates(weight)[0] && it === styles[0] && !(await this.familyExists(source))) return;
            continue;
          }
          const face = await this.makeFace(bytes, family, w, it);
          if (face) {
            faces.push(face);
            found = { w, it };
            break outer;
          }
        }
    }
    if (!found) return;
    for (const subset of SUBSETS.slice(1)) {
      if (!missing().length) break;
      const tag = `${found.w}|${found.it}|${subset}`;
      if (st.tried.has(tag)) continue;
      st.tried.add(tag);
      const bytes = await this.fetchBytes(fontsourceUrl(source, subset, found.w, found.it));
      const face = bytes && (await this.makeFace(bytes, family, found.w, found.it));
      if (face) faces.push(face);
    }
  }

  private existsCache = new Map<string, Promise<boolean>>();
  /** One cheap probe so unknown families don't cost a dozen 404s. */
  private familyExists(family: string) {
    let p = this.existsCache.get(family);
    if (!p) {
      p = this.fetchBytes(fontsourceUrl(family, 'latin', 400, false)).then((b) => !!b);
      this.existsCache.set(family, p);
    }
    return p;
  }

  private async loadGoogleCssFace(family: string, weight: number, italic: boolean): Promise<Face | null> {
    if (!this.googleRules) this.googleRules = collectGoogleRules();
    const rules = this.googleRules.filter((r) => r.family.toLowerCase() === family.toLowerCase());
    if (!rules.length) return null;
    const dist = (r: (typeof rules)[number]) =>
      (r.italic === italic ? 0 : 1000) + (weight < r.weight[0] ? r.weight[0] - weight : weight > r.weight[1] ? weight - r.weight[1] : 0);
    const best = [...rules].sort((a, b) => dist(a) - dist(b))[0];
    const bytes = await this.fetchBytes(best.url);
    // A variable file renders its default instance (normally 400), so weight is synthesised if needed.
    return bytes ? this.makeFace(bytes, family, best.weight[0] <= 400 && best.weight[1] >= 400 ? 400 : best.weight[0], best.italic) : null;
  }

  private standardFace(family: string, weight: number, italic: boolean): Face {
    const g = genericOf(family);
    const idx = (weight >= 600 ? 1 : 0) + (italic ? 2 : 0);
    const key = `${g}|${idx}`;
    let f = this.standard.get(key);
    if (f) return f;
    const pdf = this.doc.embedStandardFont(STANDARD[g][idx]);
    const cache = new Map<number, boolean>();
    f = {
      kind: 'standard',
      family,
      weight: weight >= 600 ? 700 : 400,
      italic,
      pdf,
      ascent: STANDARD_METRICS[g][0],
      descent: STANDARD_METRICS[g][1],
      underlinePosition: 0.1,
      underlineThickness: 0.06,
      has(cp) {
        let v = cache.get(cp);
        if (v === undefined) {
          try {
            pdf.encodeText(String.fromCodePoint(cp));
            v = true;
          } catch {
            v = false;
          }
          cache.set(cp, v);
        }
        return v;
      },
      advance: (text) => (text ? pdf.widthOfTextAtSize(text, 1) : 0),
    };
    this.standard.set(key, f);
    return f;
  }

  /** Loads the family plus fallbacks for any characters it lacks. */
  async prepare(family: string, weight: number, italic: boolean, text: string) {
    const cps = [...text].map((c) => c.codePointAt(0)!);
    await this.load(family, weight, italic, cps);
    let missing = cps.filter((cp) => cp > 32 && !this.facesFor(family, weight, italic).some((f) => f.has(cp)));
    for (const fb of FALLBACK_FAMILIES) {
      if (!missing.length) break;
      await this.load(fb, weight, italic, missing);
      const faces = this.facesFor(fb, weight, italic);
      missing = missing.filter((cp) => !faces.some((f) => f.has(cp)));
    }
  }

  private facesFor(family: string, weight: number, italic: boolean): Face[] {
    return this.families.get(family.toLowerCase())?.faces.get(`${weight}|${italic}`) ?? [];
  }

  /** Splits text into runs, each drawn with one face. Call after prepare(). */
  resolve(family: string, weight: number, italic: boolean, text: string): Segment[] {
    const primary = this.facesFor(family, weight, italic);
    const fallbacks = FALLBACK_FAMILIES.flatMap((f) => this.facesFor(f, weight, italic));
    const std = this.standardFace(family, weight, italic);
    const chain = [...primary, ...fallbacks, std];
    const out: Segment[] = [];
    let cur = null as Segment | null;
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      let face: Face | undefined;
      if (cp <= 32 || cp === 0xa0) face = cur?.face ?? chain[0];
      else face = chain.find((f) => f.has(cp));
      let piece = ch;
      if (!face) {
        face = std;
        piece = '?';
      }
      if (cur && cur.face === face) cur.text += piece;
      else {
        cur = {
          face,
          text: piece,
          fakeBold: weight >= 600 && face.weight < 600 && face.kind !== 'standard',
          fakeItalic: italic && !face.italic && face.kind !== 'standard',
        };
        out.push(cur);
      }
    }
    return out;
  }

  /** Width of text in px at `size` px (used by the chart canvas for layout). */
  measure(family: string, weight: number, italic: boolean, text: string, size: number) {
    return this.resolve(family, weight, italic, text).reduce((w, s) => w + s.face.advance(s.text) * size, 0);
  }

  /** Metrics of the face that renders most of the text. */
  primaryFace(family: string, weight: number, italic: boolean, text = 'x'): Face {
    const segs = this.resolve(family, weight, italic, text);
    return segs.sort((a, b) => b.text.length - a.text.length)[0]?.face ?? this.standardFace(family, weight, italic);
  }
}

/** @font-face rules from Google Fonts stylesheets already loaded in the page. */
function collectGoogleRules() {
  const out: { family: string; weight: [number, number]; italic: boolean; url: string }[] = [];
  if (typeof document === 'undefined') return out;
  for (const sheet of Array.from(document.styleSheets)) {
    const owner = sheet.ownerNode as HTMLElement | null;
    if (!owner?.dataset?.googleFont) continue;
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        const range = rule.style.getPropertyValue('unicode-range');
        if (range && !/U\+0000-00FF/i.test(range)) continue;
        const url = rule.style.getPropertyValue('src').match(/url\("?([^")]+)"?\)/)?.[1];
        if (!url) continue;
        const w = rule.style.getPropertyValue('font-weight').split(/\s+/).map(Number).filter(Number.isFinite);
        out.push({
          family: rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim(),
          weight: [w[0] ?? 400, w[1] ?? w[0] ?? 400],
          italic: /italic|oblique/.test(rule.style.getPropertyValue('font-style')),
          url,
        });
      }
    } catch {
      /* stylesheet without CORS access */
    }
  }
  return out;
}

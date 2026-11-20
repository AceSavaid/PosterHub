// A brand kit is a person's university or lab look: colours, fonts and logos.
// It is set up once, kept in this browser (or the desktop app), and every new
// poster can start with it. Kits travel between computers as small
// `.brandkit.json` files, which are cleaned on import like any outside file.
//
// The file is an envelope ({ app, kind, version, ... }) so other shareable
// things, such as a person's own saved templates, can use the same format
// later with a different `kind`, and can carry a kit alongside them.
import { useCallback, useEffect, useState } from 'react';
import type { CustomFont, Palette, Poster, PosterElement } from '../types';
import { PALETTES, PALETTE_ROLES, uid } from '../model';
import { fontName, safeFontDataUrl, safeImageUrl } from './sanitize';

export interface BrandLogo {
  id: string;
  /** e.g. "University of Leeds"; becomes the logo's alt text on the poster */
  name: string;
  /** embedded image (data: URL) */
  src: string;
}

export interface BrandKit {
  /** e.g. "University of Leeds" or "Smith Lab" */
  name: string;
  palette: Palette;
  headingFont: string;
  bodyFont: string;
  /** uploaded font files the heading/body fonts may need */
  customFonts: CustomFont[];
  /** extra Google fonts the kit uses */
  googleFonts: string[];
  /** in the order they fill a layout's logo spots */
  logos: BrandLogo[];
  updatedAt: number;
}

export const BRAND_KIT_EXT = '.brandkit.json';
export const MAX_LOGOS = 8;
/** Kit files bigger than this are refused before reading (logos and fonts are embedded). */
export const MAX_KIT_FILE_BYTES = 40 * 1024 * 1024;

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function cleanHex(v: unknown, fallback: string): string {
  if (typeof v !== 'string' || !HEX.test(v.trim())) return fallback;
  const h = v.trim().toLowerCase();
  return h.length === 4 ? '#' + [...h.slice(1)].map((c) => c + c).join('') : h;
}

const cleanText = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : '');

export function emptyBrandKit(): BrandKit {
  return { name: '', palette: { ...PALETTES[0] }, headingFont: 'Montserrat', bodyFont: 'Open Sans', customFonts: [], googleFonts: [], logos: [], updatedAt: 0 };
}

/**
 * Turns anything (a stored kit, an imported file) into a valid kit, dropping
 * whatever is malformed or unsafe. Returns null when there is nothing kit-like.
 */
export function sanitizeBrandKit(raw: unknown): BrandKit | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const base = emptyBrandKit();
  const name = cleanText(r.name, 80);
  const pal = r.palette && typeof r.palette === 'object' ? (r.palette as Record<string, unknown>) : {};
  const palette = { name: name || 'Brand kit' } as Palette;
  for (const role of PALETTE_ROLES) palette[role] = cleanHex(pal[role], base.palette[role]);

  const customFonts: CustomFont[] = [];
  for (const f of Array.isArray(r.customFonts) ? r.customFonts : []) {
    const family = fontName((f as CustomFont)?.family).trim();
    const dataUrl = safeFontDataUrl((f as CustomFont)?.dataUrl);
    if (family && dataUrl && !customFonts.some((x) => x.family === family)) customFonts.push({ family, dataUrl });
  }
  const googleFonts = [...new Set((Array.isArray(r.googleFonts) ? r.googleFonts : []).map((f) => fontName(f).trim()).filter(Boolean))];

  const logos: BrandLogo[] = [];
  for (const l of Array.isArray(r.logos) ? r.logos : []) {
    const src = safeImageUrl((l as BrandLogo)?.src);
    // blob: URLs die with the page, so a kit only keeps embedded images.
    if (!src || !/^data:image\//i.test(src) || logos.length >= MAX_LOGOS) continue;
    logos.push({ id: cleanText((l as BrandLogo).id, 40) || uid(), name: cleanText((l as BrandLogo).name, 80), src });
  }

  return {
    name,
    palette,
    headingFont: fontName(r.headingFont).trim() || base.headingFont,
    bodyFont: fontName(r.bodyFont).trim() || base.bodyFont,
    customFonts,
    googleFonts,
    logos,
    updatedAt: typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : 0,
  };
}

// ---------- files ----------

export function brandKitToText(kit: BrandKit): string {
  return JSON.stringify({ app: 'posterhub', kind: 'brand-kit', version: 1, kit }, null, 1);
}

export function parseBrandKitText(text: string): BrandKit {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not a PosterHub brand kit.');
  }
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || d.kind !== 'brand-kit' || !d.kit) throw new Error('This file is not a PosterHub brand kit.');
  if (typeof d.version === 'number' && d.version > 1) throw new Error('This brand kit was made by a newer version of PosterHub. Update PosterHub and try again.');
  const kit = sanitizeBrandKit(d.kit);
  if (!kit) throw new Error('This file is not a PosterHub brand kit.');
  return kit;
}

// ---------- applying to posters ----------

/** Image boxes a layout set aside for a logo that are still empty. */
export function emptyLogoSpots(p: Poster): PosterElement[] {
  return p.elements.filter((e) => e.type === 'image' && !e.src && !e.qr && (e.role === 'logo' || e.placeholder === 'Logo'));
}

/** Puts the kit's logos into empty logo spots, in order. Returns how many were filled. */
export function fillLogoSpots(p: Poster, kit: BrandKit): number {
  const spots = emptyLogoSpots(p);
  const n = Math.min(spots.length, kit.logos.length);
  for (let i = 0; i < n; i++) {
    const logo = kit.logos[i];
    Object.assign(spots[i], { src: logo.src, alt: logo.name ? `${logo.name} logo` : 'Logo', fit: 'contain' as const });
  }
  return n;
}

/** Makes the kit's uploaded and Google fonts available in the poster's font menus. */
export function addKitFonts(p: Poster, kit: BrandKit) {
  for (const f of kit.customFonts) {
    p.customFonts = p.customFonts.filter((x) => x.family !== f.family);
    p.customFonts.push({ ...f });
  }
  for (const g of kit.googleFonts) if (!p.googleFonts.includes(g)) p.googleFonts.push(g);
}

/** Kit palette as a poster palette, named after the kit. */
export function kitPalette(kit: BrandKit): Palette {
  return { ...kit.palette, name: kit.name || 'Brand kit' };
}

/** Gives a poster (or an editor draft) the kit's colours, fonts and logos. Returns how many logo spots were filled. */
export function applyBrandKit(p: Poster, kit: BrandKit): number {
  p.palette = kitPalette(kit);
  p.headingFont = kit.headingFont;
  p.bodyFont = kit.bodyFont;
  addKitFonts(p, kit);
  return fillLogoSpots(p, kit);
}

/** A kit with a poster's look: its colours, fonts and the logos in its logo spots. */
export function brandKitFromPoster(p: Poster, name: string): BrandKit {
  const used = new Set([p.headingFont, p.bodyFont]);
  const logos: BrandLogo[] = [];
  for (const e of p.elements) {
    if (e.type !== 'image' || !e.src || e.qr || !(e.role === 'logo' || e.placeholder === 'Logo')) continue;
    if (logos.some((l) => l.src === e.src) || logos.length >= MAX_LOGOS) continue;
    logos.push({ id: uid(), name: (e.alt ?? '').replace(/\s*logo$/i, ''), src: e.src });
  }
  return sanitizeBrandKit({
    name,
    palette: p.palette,
    headingFont: p.headingFont,
    bodyFont: p.bodyFont,
    customFonts: p.customFonts.filter((f) => used.has(f.family)),
    googleFonts: p.googleFonts.filter((f) => used.has(f)),
    logos,
    updatedAt: Date.now(),
  })!;
}

// ---------- storage ----------
// Kept in its own IndexedDB database so the poster library's schema is untouched.
// Records are keyed by id; today there is one kit ("default"), but the store can
// hold more (several affiliations, or kits attached to saved templates) later.

const DB_NAME = 'posterhub-brand';
const STORE = 'kits';
const DEFAULT_ID = 'default';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kitTx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadBrandKit(): Promise<BrandKit | null> {
  if (typeof indexedDB === 'undefined') return null;
  const rec = await kitTx<unknown>('readonly', (s) => s.get(DEFAULT_ID));
  return sanitizeBrandKit(rec);
}

async function storeBrandKit(kit: BrandKit | null) {
  if (kit) await kitTx('readwrite', (s) => s.put({ ...kit, id: DEFAULT_ID }));
  else await kitTx('readwrite', (s) => s.delete(DEFAULT_ID));
}

// Shared between the library, the new poster dialog and the editor.
const listeners = new Set<(k: BrandKit | null) => void>();
let cached: Promise<BrandKit | null> | null = null;

const getKit = () => (cached ??= loadBrandKit().catch(() => null));

/** The saved brand kit: undefined while loading, null when there is none. */
export function useBrandKit() {
  const [kit, setKit] = useState<BrandKit | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    getKit().then((k) => live && setKit(k));
    listeners.add(setKit);
    return () => {
      live = false;
      listeners.delete(setKit);
    };
  }, []);
  const save = useCallback(async (k: BrandKit | null) => {
    const clean = k ? sanitizeBrandKit({ ...k, updatedAt: Date.now() }) : null;
    await storeBrandKit(clean);
    cached = Promise.resolve(clean);
    listeners.forEach((l) => l(clean));
    return clean;
  }, []);
  return [kit, save] as const;
}

/** Test hook: forget the cached kit so the next hook reads storage again. */
export function resetBrandKitCache() {
  cached = null;
}

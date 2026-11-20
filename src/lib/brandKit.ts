// Brand kits: a university or lab look (colours, fonts and logos) that a new
// poster can start with. For now kits are a curated, built-in list kept in
// src/brandKits/ — people pick one, they can't create their own. To add a
// kit, add a file there and list it in src/brandKits/index.ts.
import type { Palette, Poster, PosterElement } from '../types';

export interface BrandLogo {
  /** e.g. "Ontario Tech University"; becomes the logo's alt text on the poster */
  name: string;
  /** embedded image (data: URL), e.g. imported with Vite's `?inline` */
  src: string;
}

export interface BrandKit {
  /** stable id, remembered as the person's choice */
  id: string;
  /** e.g. "Ontario Tech University" */
  name: string;
  palette: Palette;
  headingFont: string;
  bodyFont: string;
  /** extra Google fonts the kit uses (besides the heading and body fonts) */
  googleFonts?: string[];
  /** in the order they fill a layout's logo spots */
  logos: BrandLogo[];
  /** where the colours and fonts come from, for whoever maintains the kit */
  source?: string;
}

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
    Object.assign(spots[i], { src: logo.src, alt: `${logo.name || kit.name} logo`, fit: 'contain' as const });
  }
  return n;
}

/** Makes the kit's fonts available in the poster's font menus. */
export function addKitFonts(p: Poster, kit: BrandKit) {
  for (const g of [kit.headingFont, kit.bodyFont, ...(kit.googleFonts ?? [])]) if (!p.googleFonts.includes(g)) p.googleFonts.push(g);
}

/** Kit palette as a poster palette, named after the kit. */
export function kitPalette(kit: BrandKit): Palette {
  return { ...kit.palette, name: kit.name };
}

/** Gives a poster (or an editor draft) the kit's colours, fonts and logos. Returns how many logo spots were filled. */
export function applyBrandKit(p: Poster, kit: BrandKit): number {
  p.palette = kitPalette(kit);
  p.headingFont = kit.headingFont;
  p.bodyFont = kit.bodyFont;
  addKitFonts(p, kit);
  return fillLogoSpots(p, kit);
}

import { describe, expect, it } from 'vitest';
import { createPoster, PALETTES, sizeFor } from '../../src/model';
import type { TemplateId } from '../../src/model';
import { applyBrandKit, emptyLogoSpots, fillLogoSpots, type BrandKit } from '../../src/lib/brandKit';
import { BRAND_KITS, brandKitById } from '../../src/brandKits';
import { ontarioTech } from '../../src/brandKits/ontarioTech';
import { buildNewPoster } from '../../src/components/NewPosterDialog';
import { safeImageUrl } from '../../src/lib/sanitize';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const PNG2 = 'data:image/png;base64,AAAA';

const kit = (over: Partial<BrandKit> = {}): BrandKit => ({
  id: 'test-uni',
  name: 'Test University',
  palette: { name: 'x', primary: '#123456', secondary: '#234567', accent: '#ffcc00', background: '#ffffff', surface: '#eeeeee', text: '#111111' },
  headingFont: 'Ubuntu',
  bodyFont: 'Lora',
  logos: [
    { name: 'Test University', src: PNG },
    { name: 'Smith Lab', src: PNG2 },
  ],
  ...over,
});

const poster = (template: TemplateId) =>
  createPoster({ name: 'P', ...sizeFor('A0', 'portrait'), sizePreset: 'A0', columns: 3, palette: PALETTES[0], headingFont: 'Montserrat', bodyFont: 'Open Sans', template });

describe('built-in brand kits', () => {
  it('has unique ids and valid colours, fonts and embedded logos', () => {
    expect(new Set(BRAND_KITS.map((k) => k.id)).size).toBe(BRAND_KITS.length);
    for (const k of BRAND_KITS) {
      expect(k.id).toMatch(/^[a-z0-9-]{1,40}$/);
      for (const c of [k.palette.primary, k.palette.secondary, k.palette.accent, k.palette.background, k.palette.surface, k.palette.text]) expect(c).toMatch(/^#[0-9a-f]{6}$/);
      expect(k.headingFont).toBeTruthy();
      expect(k.bodyFont).toBeTruthy();
      // logos must be embedded so posters keep working offline and pass the import sanitiser
      for (const l of k.logos) expect(safeImageUrl(l.src)).toBe(l.src);
    }
  });

  it('includes Ontario Tech University with its official colours and font', () => {
    expect(brandKitById('ontario-tech')).toBe(ontarioTech);
    expect(ontarioTech.palette).toMatchObject({ primary: '#003c71', secondary: '#0077ca', accent: '#e75d2a' });
    expect(ontarioTech.headingFont).toBe('Ubuntu');
    expect(ontarioTech.bodyFont).toBe('Ubuntu');
  });

  it('finds nothing for unknown ids', () => {
    expect(brandKitById('')).toBeNull();
    expect(brandKitById('nope')).toBeNull();
    expect(brandKitById(undefined)).toBeNull();
  });
});

describe('applying a kit to posters', () => {
  it('fills a layout’s empty logo spots in order, with alt text', () => {
    const p = poster('boxed'); // logos either side of the title
    expect(emptyLogoSpots(p)).toHaveLength(2);
    expect(fillLogoSpots(p, kit())).toBe(2);
    const logos = p.elements.filter((e) => e.role === 'logo');
    expect(logos.map((e) => e.src)).toEqual([PNG, PNG2]);
    expect(logos.map((e) => e.alt)).toEqual(['Test University logo', 'Smith Lab logo']);
    expect(emptyLogoSpots(p)).toHaveLength(0);
  });

  it('leaves extra spots empty and never touches QR codes', () => {
    const p = poster('bars'); // logo strip in the footer
    const spots = emptyLogoSpots(p).length;
    expect(spots).toBeGreaterThan(1);
    expect(fillLogoSpots(p, kit({ logos: [kit().logos[0]] }))).toBe(1);
    expect(emptyLogoSpots(p)).toHaveLength(spots - 1);
    const q = poster('minimal');
    const qr = q.elements.find((e) => e.role === 'qr')!;
    fillLogoSpots(q, kit());
    expect(qr.src).toBeUndefined();
  });

  it('sets colours and fonts and adds the kit fonts once', () => {
    const p = poster('classic');
    applyBrandKit(p, kit());
    applyBrandKit(p, kit());
    expect(p.palette).toMatchObject({ name: 'Test University', primary: '#123456' });
    expect(p.headingFont).toBe('Ubuntu');
    expect(p.bodyFont).toBe('Lora');
    expect(p.googleFonts).toEqual(['Ubuntu', 'Lora']);
  });

  it('starts a new poster with the kit’s fonts and logos', () => {
    const opts = { name: 'N', ...sizeFor('A1', 'landscape'), sizePreset: 'A1', columns: 4, palette: PALETTES[2], headingFont: 'Ubuntu', bodyFont: 'Lora', template: 'framed' as TemplateId };
    const withKit = buildNewPoster(opts, kit());
    expect(withKit.googleFonts).toContain('Ubuntu');
    expect(withKit.elements.filter((e) => e.role === 'logo' && e.src)).toHaveLength(2);
    // the colours picked in the dialog win
    expect(withKit.palette.name).toBe(PALETTES[2].name);
    const plain = buildNewPoster(opts, null);
    expect(plain.googleFonts).toHaveLength(0);
    expect(plain.elements.some((e) => e.src)).toBe(false);
  });
});

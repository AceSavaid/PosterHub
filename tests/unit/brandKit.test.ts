import { describe, expect, it } from 'vitest';
import { createPoster, PALETTES, sizeFor } from '../../src/model';
import type { TemplateId } from '../../src/model';
import {
  BRAND_KIT_EXT,
  MAX_LOGOS,
  applyBrandKit,
  brandKitFromPoster,
  brandKitToText,
  emptyLogoSpots,
  fillLogoSpots,
  parseBrandKitText,
  sanitizeBrandKit,
  type BrandKit,
} from '../../src/lib/brandKit';
import { buildNewPoster } from '../../src/components/NewPosterDialog';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const PNG2 = 'data:image/png;base64,AAAA';
const FONT = 'data:font/ttf;base64,AAEAAA==';

const kit = (over: Partial<BrandKit> = {}): BrandKit => ({
  name: 'University of Westbrook',
  palette: { name: 'x', primary: '#123456', secondary: '#234567', accent: '#ffcc00', background: '#ffffff', surface: '#eeeeee', text: '#111111' },
  headingFont: 'Westbrook Sans',
  bodyFont: 'Lora',
  customFonts: [{ family: 'Westbrook Sans', dataUrl: FONT }],
  googleFonts: ['Lora'],
  logos: [
    { id: 'a', name: 'University of Westbrook', src: PNG },
    { id: 'b', name: 'Smith Lab', src: PNG2 },
  ],
  updatedAt: 1,
  ...over,
});

const poster = (template: TemplateId) =>
  createPoster({ name: 'P', ...sizeFor('A0', 'portrait'), sizePreset: 'A0', columns: 3, palette: PALETTES[0], headingFont: 'Montserrat', bodyFont: 'Open Sans', template });

describe('brand kit files', () => {
  it('round-trips through a kit file', () => {
    const k = kit();
    const back = parseBrandKitText(brandKitToText(k));
    expect(back).toEqual({ ...k, palette: { ...k.palette, name: k.name } });
    expect(BRAND_KIT_EXT).toBe('.brandkit.json');
  });

  it('marks the file so other kinds (such as saved templates) can share the format', () => {
    const data = JSON.parse(brandKitToText(kit()));
    expect(data).toMatchObject({ app: 'posterhub', kind: 'brand-kit', version: 1 });
  });

  it('rejects files that are not kits', () => {
    expect(() => parseBrandKitText('not json')).toThrow(/not a PosterHub brand kit/);
    expect(() => parseBrandKitText('{"app":"posterhub","elements":[]}')).toThrow(/not a PosterHub brand kit/);
    expect(() => parseBrandKitText('{"kind":"brand-kit","kit":[1]}')).toThrow(/not a PosterHub brand kit/);
    expect(() => parseBrandKitText(JSON.stringify({ kind: 'brand-kit', version: 2, kit: kit() }))).toThrow(/newer version/);
  });
});

describe('cleaning an imported kit', () => {
  it('drops unsafe logos, fonts and colours', () => {
    const k = sanitizeBrandKit({
      name: '<img src=x onerror=alert(1)>Uni',
      palette: { primary: 'red; background:url(https://evil)', secondary: '#ABC', accent: 42 },
      headingFont: 'Evil"; } body { background:url(x)',
      bodyFont: '',
      customFonts: [{ family: 'Bad', dataUrl: 'https://evil.example/font.ttf' }, { family: 'Good', dataUrl: FONT }, { family: 'Good', dataUrl: FONT }],
      googleFonts: ['Lora', 'Lora', '<script>', 7],
      logos: [
        { name: 'remote', src: 'https://evil.example/logo.png' },
        { name: 'script', src: 'javascript:alert(1)' },
        { name: 'blob', src: 'blob:https://x/1' },
        { name: 'ok', src: PNG },
      ],
    })!;
    expect(k.name).not.toMatch(/[<>]/);
    expect(k.palette.primary).toBe(PALETTES[0].primary);
    expect(k.palette.secondary).toBe('#aabbcc');
    expect(k.palette.accent).toBe(PALETTES[0].accent);
    expect(k.headingFont).not.toMatch(/["{};()]/);
    expect(k.bodyFont).toBe('Open Sans');
    expect(k.customFonts).toEqual([{ family: 'Good', dataUrl: FONT }]);
    expect(k.googleFonts).toEqual(['Lora', 'script']);
    expect(k.logos.map((l) => l.name)).toEqual(['ok']);
    expect(k.logos[0].id).toBeTruthy();
  });

  it(`keeps at most ${MAX_LOGOS} logos`, () => {
    const logos = Array.from({ length: 12 }, (_, i) => ({ id: String(i), name: 'L' + i, src: PNG }));
    expect(sanitizeBrandKit({ logos })!.logos).toHaveLength(MAX_LOGOS);
  });

  it('returns null for non-objects', () => {
    expect(sanitizeBrandKit(null)).toBeNull();
    expect(sanitizeBrandKit('kit')).toBeNull();
    expect(sanitizeBrandKit([])).toBeNull();
  });
});

describe('applying a kit to posters', () => {
  it('fills a layout’s empty logo spots in order, with alt text', () => {
    const p = poster('boxed'); // logos either side of the title
    expect(emptyLogoSpots(p)).toHaveLength(2);
    expect(fillLogoSpots(p, kit())).toBe(2);
    const logos = p.elements.filter((e) => e.role === 'logo');
    expect(logos.map((e) => e.src)).toEqual([PNG, PNG2]);
    expect(logos.map((e) => e.alt)).toEqual(['University of Westbrook logo', 'Smith Lab logo']);
    expect(emptyLogoSpots(p)).toHaveLength(0);
  });

  it('leaves extra spots empty and never touches QR codes or filled images', () => {
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
    expect(p.palette).toMatchObject({ name: 'University of Westbrook', primary: '#123456' });
    expect(p.headingFont).toBe('Westbrook Sans');
    expect(p.bodyFont).toBe('Lora');
    expect(p.customFonts).toEqual([{ family: 'Westbrook Sans', dataUrl: FONT }]);
    expect(p.googleFonts).toEqual(['Lora']);
  });

  it('starts a new poster with the kit’s fonts and logos', () => {
    const opts = { name: 'N', ...sizeFor('A1', 'landscape'), sizePreset: 'A1', columns: 4, palette: PALETTES[2], headingFont: 'Westbrook Sans', bodyFont: 'Lora', template: 'framed' as TemplateId };
    const withKit = buildNewPoster(opts, kit());
    expect(withKit.customFonts).toHaveLength(1);
    expect(withKit.elements.filter((e) => e.role === 'logo' && e.src)).toHaveLength(2);
    // the colours the person picked in the dialog win
    expect(withKit.palette.name).toBe(PALETTES[2].name);
    const plain = buildNewPoster(opts, null);
    expect(plain.customFonts).toHaveLength(0);
    expect(plain.elements.some((e) => e.src)).toBe(false);
  });

  it('builds a kit from a poster’s look', () => {
    const p = poster('boxed');
    applyBrandKit(p, kit());
    p.googleFonts.push('Unused Font');
    const k = brandKitFromPoster(p, 'Uni');
    expect(k.name).toBe('Uni');
    expect(k.palette.primary).toBe('#123456');
    expect(k.headingFont).toBe('Westbrook Sans');
    expect(k.googleFonts).toEqual(['Lora']);
    expect(k.logos.map((l) => [l.name, l.src])).toEqual([
      ['University of Westbrook', PNG],
      ['Smith Lab', PNG2],
    ]);
  });
});

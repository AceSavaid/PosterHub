// Font loading: Google Fonts via their CSS API, custom fonts via @font-face
// with the file embedded as a data URL (so it travels inside saved posters
// and is picked up by image/PDF export).
import type { CustomFont, Poster } from '../types';
import { SYSTEM_FONTS } from '../model';

const loadedGoogle = new Set<string>();

export function loadGoogleFont(family: string): Promise<void> {
  if (!family || SYSTEM_FONTS.includes(family) || loadedGoogle.has(family)) return Promise.resolve();
  loadedGoogle.add(family);
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.crossOrigin = 'anonymous'; // lets the exporter read the rules to embed the font
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
    link.dataset.googleFont = family;
    link.onload = () => {
      document.fonts.load(`16px "${family}"`).finally(() => resolve());
    };
    link.onerror = () => {
      // Some families lack italic/bold; retry with the plain family.
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&display=swap`;
      link.onerror = () => resolve();
    };
    document.head.appendChild(link);
  });
}

const loadedCustom = new Set<string>();

export function registerCustomFont(f: CustomFont) {
  if (loadedCustom.has(f.family)) return;
  loadedCustom.add(f.family);
  const style = document.createElement('style');
  style.dataset.customFont = f.family;
  style.textContent = `@font-face { font-family: "${f.family.replace(/"/g, '')}"; src: url(${f.dataUrl}); font-display: block; }`;
  document.head.appendChild(style);
}

export async function ensurePosterFonts(p: Poster) {
  p.customFonts.forEach(registerCustomFont);
  const families = new Set<string>([p.headingFont, p.bodyFont, ...p.googleFonts]);
  for (const el of p.elements) if (el.style && !el.style.fontFamily.startsWith('@')) families.add(el.style.fontFamily);
  const custom = new Set(p.customFonts.map((f) => f.family));
  await Promise.all([...families].filter((f) => !custom.has(f)).map(loadGoogleFont));
}

export function fontNameFromFile(name: string) {
  return name.replace(/\.(ttf|otf|woff2?|eot)$/i, '').replace(/[-_]+/g, ' ').replace(/\s+(regular|normal)$/i, '').trim();
}

/** Gathers @font-face CSS for the fonts in use so exporters can embed them. */
export async function fontEmbedCss(): Promise<string> {
  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    const owner = sheet.ownerNode as HTMLElement | null;
    if (!owner?.dataset?.googleFont && !owner?.dataset?.customFont) continue;
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        // Google serves many unicode subsets; Latin (and Latin-ext) covers posters in most languages.
        const range = rule.style.getPropertyValue('unicode-range');
        if (range && !/U\+0000-00FF|U\+0100-02/i.test(range)) continue;
        parts.push(rule.cssText);
      }
    } catch {
      /* cross-origin sheet without CORS: skip */
    }
  }
  // Inline remote font files as data URLs.
  const out: string[] = [];
  for (const css of parts) {
    const m = css.match(/url\("?([^")]+)"?\)/);
    if (m && m[1].startsWith('http')) {
      try {
        const blob = await (await fetch(m[1])).blob();
        const dataUrl = await new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.readAsDataURL(blob);
        });
        out.push(css.replace(m[0], `url(${dataUrl})`));
      } catch {
        out.push(css);
      }
    } else out.push(css);
  }
  return out.join('\n');
}

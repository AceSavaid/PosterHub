// Cleans content that comes from outside the app (opened project files,
// imported PowerPoints, the clipboard) so a booby-trapped file cannot run
// code or pull things in from the web when a poster is shown.
import DOMPurify from 'dompurify';
import { cleanRules } from './conference';
import type { Poster, PosterElement } from '../types';
import { cleanHeadingIcon } from './headingIcon';

/** The formatting tags text boxes use. Anything else is dropped, keeping its text. */
const TAGS = [
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup', 'span', 'font', 'div', 'p', 'br',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'small', 'big', 'blockquote',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'colgroup', 'col', 'caption',
];
// class / data-cite / contenteditable: citation markers (<span class="cite" data-cite="…" contenteditable="false">)
// reference-list entries (<div class="ref-entry">) and figure caption labels (<b class="fig-label" data-fig="">).
const ATTRS = ['style', 'colspan', 'rowspan', 'align', 'color', 'face', 'size', 'dir', 'class', 'data-cite', 'data-fig', 'contenteditable'];

// Inline styles may not load anything (e.g. background:url(https://…)): drop such declarations.
DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
  if (data.attrName === 'style')
    data.attrValue = data.attrValue
      .split(';')
      .filter((d) => !/url\s*\(|image-set|expression\s*\(|@import|\\/i.test(d))
      .join(';');
});

/** Strips scripts, event handlers, links and embedded resources from rich-text HTML. */
export function cleanHtml(html: string | undefined | null): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ATTRS, KEEP_CONTENT: true });
}

/** Plain text of rich-text HTML, parsed in an inert document so nothing in it loads or runs. */
export function htmlToText(html: string | undefined | null): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<body>${html.replace(/<br\s*\/?>/gi, '\n')}</body>`, 'text/html');
  return doc.body.textContent ?? '';
}

/** Only images embedded in the file itself (data:/blob: URLs) are kept. */
export function safeImageUrl(src: unknown): string | undefined {
  return typeof src === 'string' && /^(data:image\/|blob:)/i.test(src.trim()) ? src : undefined;
}

const FONT_DATA = /^data:(font|application)\/[\w.+-]*;base64,[A-Za-z0-9+/=]*$/i;

export function safeFontDataUrl(url: unknown): string | undefined {
  return typeof url === 'string' && FONT_DATA.test(url) ? url : undefined;
}

/** Font names are used in CSS, so keep them to characters a font name needs. */
const fontName = (f: unknown) => (typeof f === 'string' ? f.replace(/["'\\<>;{}()]/g, '') : '');

/** A palette role ("@primary"), a hex colour or rgb()/rgba(); anything else is dropped. */
export function safeColor(c: unknown): string | undefined {
  if (typeof c !== 'string') return undefined;
  const v = c.trim();
  return /^@[a-z]+$/.test(v) || /^#[0-9a-f]{3,8}$/i.test(v) || /^rgba?\(\s*[\d.%\s,/]+\)$/i.test(v) ? v : undefined;
}

/** Cleans one element in place and returns it. */
export function sanitizeElement(el: PosterElement): PosterElement {
  if (el.html != null) el.html = cleanHtml(el.html);
  if (el.style && typeof el.style === 'object') el.style.fontFamily = fontName(el.style.fontFamily) || '@body';
  if (el.icon != null) {
    const ic = el.icon as unknown as Record<string, unknown>;
    if (ic && typeof ic === 'object' && typeof ic.id === 'string' && /^[a-z]+\/[a-z0-9_-]+$/.test(ic.id)) {
      el.icon = { id: ic.id, color: safeColor(ic.color) ?? '@primary' };
      const c2 = safeColor(ic.color2);
      if (c2) el.icon.color2 = c2;
    } else delete el.icon;
  }
  if (el.captionOf != null && typeof el.captionOf !== 'string') delete el.captionOf;
  if (el.captionPos != null && el.captionPos !== 'above' && el.captionPos !== 'below') delete el.captionPos;
  if (el.captionRoom != null && !(typeof el.captionRoom === 'number' && el.captionRoom >= 0 && el.captionRoom < 10000)) delete el.captionRoom;
  if (el.headingIcon != null) {
    const hi = cleanHeadingIcon(el.headingIcon, safeColor);
    if (hi) el.headingIcon = hi;
    else delete el.headingIcon;
  }
  if (el.textStyle != null && !['heading', 'subheading', 'normal', 'caption'].includes(el.textStyle)) delete el.textStyle;
  if (el.src != null) {
    const s = safeImageUrl(el.src);
    if (s) el.src = s;
    else delete el.src;
  }
  return el;
}

/** Cleans a poster from an untrusted source in place and returns it. */
export function sanitizePoster(p: Poster): Poster {
  if (Array.isArray(p.elements)) p.elements = p.elements.filter((e) => e && typeof e === 'object').map(sanitizeElement);
  if (Array.isArray(p.customFonts)) {
    p.customFonts = p.customFonts
      .filter((f) => f && typeof f.family === 'string' && safeFontDataUrl(f.dataUrl))
      .map((f) => ({ family: fontName(f.family), dataUrl: f.dataUrl }));
  } else p.customFonts = [];
  p.headingFont = fontName(p.headingFont);
  p.bodyFont = fontName(p.bodyFont);
  p.googleFonts = (Array.isArray(p.googleFonts) ? p.googleFonts : []).map(fontName).filter(Boolean);
  if (p.backgroundImage != null && !safeImageUrl(p.backgroundImage)) delete p.backgroundImage;
  if (p.thumbnail != null && !safeImageUrl(p.thumbnail)) delete p.thumbnail;
  if (p.conference != null) {
    const rules = cleanRules(p.conference);
    if (rules) p.conference = rules;
    else delete p.conference;
  }
  return p;
}

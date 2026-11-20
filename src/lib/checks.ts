// "Check poster": common problems that are easy to miss on screen but
// obvious once printed. Pure functions so they can be unit tested; image
// pixel sizes are passed in because reading them needs the browser.
import type { Poster, PosterElement } from '../types';
import { resolveColor, typeScale } from '../model';
import { boundsOf, intersects } from './arrange';

export type Severity = 'problem' | 'warning' | 'tip';

export interface Issue {
  id: string;
  elementId?: string;
  severity: Severity;
  title: string;
  detail: string;
}

export const PLACEHOLDER_TEXT = ['Your Poster Title Goes Here', 'Replace this text with your own', 'Type or paste your text here', 'Section Heading', 'Author One, Author Two', 'Describe what the figure shows', 'State your main result in one clear sentence', 'Author, A. (2025). Title of work'];

// ---- colour maths (WCAG relative luminance)
function parseHex(c: string): [number, number, number] | null {
  const m = c.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function luminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la == null || lb == null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The colour behind an element: its own fill, else the topmost filled element under it, else the page. */
export function backgroundBehind(p: Poster, el: PosterElement): string | null {
  const own = el.fill && resolveColor(el.fill, p.palette);
  if (own && own !== 'transparent') return own;
  const idx = p.elements.indexOf(el);
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  for (let i = idx - 1; i >= 0; i--) {
    const u = p.elements[i];
    if (u.type === 'image' && u.src) return null; // can't know the colour of a picture
    if (u.type === 'shape' && u.shape === 'line') continue;
    const f = u.fill && resolveColor(u.fill, p.palette);
    if (f && f !== 'transparent' && cx >= u.x && cx <= u.x + u.w && cy >= u.y && cy <= u.y + u.h) return f;
  }
  if (p.backgroundImage) return null;
  return resolveColor('@background', p.palette);
}

export const plain = (html = '') => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const NAMES: Record<string, string> = { title: 'Title', subtitle: 'Subtitle', heading: 'Header', text: 'Text box', image: 'Image', chart: 'Graph', shape: 'Shape' };
function label(el: PosterElement) {
  const t = plain(el.html);
  return t ? `${NAMES[el.type]} “${t.length > 32 ? t.slice(0, 30) + '…' : t}”` : NAMES[el.type];
}

/** Smallest comfortable text for this poster: about 20 pt on A0 (body text ideally 24 pt+), scaled for smaller posters viewed closer. */
export function minReadablePt(p: Poster) {
  return Math.max(9, Math.round(20 * typeScale(p)));
}

export interface ImageInfo {
  /** pixel width of the image file */
  width: number;
}

export function checkPoster(p: Poster, images: Map<string, ImageInfo> = new Map(), overflowing: Set<string> = new Set()): Issue[] {
  const issues: Issue[] = [];
  const minPt = minReadablePt(p);
  const page = { x: 0, y: 0, w: p.width, h: p.height };

  if (!p.elements.length) {
    issues.push({ id: 'empty', severity: 'tip', title: 'The poster is empty', detail: 'Add a title from the Insert panel, or pick a layout under Layout → Rebuild layout.' });
    return issues;
  }

  for (const el of p.elements) {
    const name = label(el);
    // ---- off the page
    const inside = el.x >= -1 && el.y >= -1 && el.x + el.w <= p.width + 1 && el.y + el.h <= p.height + 1;
    if (!intersects(el, page)) {
      issues.push({ id: 'off-' + el.id, elementId: el.id, severity: 'problem', title: `${name} is off the poster`, detail: 'It will not be printed. Move it back onto the page or delete it.' });
    } else if (!inside && el.type !== 'shape') {
      issues.push({ id: 'edge-' + el.id, elementId: el.id, severity: 'warning', title: `${name} is cut off at the edge`, detail: 'Part of it hangs over the edge of the poster and will be trimmed.' });
    } else if (el.style && (el.x < 5 || el.y < 5 || el.x + el.w > p.width - 5 || el.y + el.h > p.height - 5)) {
      issues.push({ id: 'edge-' + el.id, elementId: el.id, severity: 'tip', title: `${name} is very close to the edge`, detail: 'Printers often trim a few millimetres; keep text at least 5 mm from the edge.' });
    }

    if (el.style) {
      const text = plain(el.html);
      // ---- placeholder text
      if (PLACEHOLDER_TEXT.some((t) => text.includes(t))) {
        issues.push({ id: 'ph-' + el.id, elementId: el.id, severity: 'warning', title: `${name} still has example text`, detail: 'Replace it with your own words, or delete the box.' });
      } else if (!text) {
        issues.push({ id: 'blank-' + el.id, elementId: el.id, severity: 'tip', title: `An empty ${NAMES[el.type].toLowerCase()}`, detail: 'Type something in it or delete it.' });
      }
      // ---- too small
      if (text && el.style.fontSize < minPt && el.type !== 'title') {
        issues.push({
          id: 'small-' + el.id, elementId: el.id, severity: el.style.fontSize < minPt * 0.7 ? 'problem' : 'warning',
          title: `${name} may be too small to read`,
          detail: `It is ${el.style.fontSize} pt. On a poster this size, aim for at least ${minPt} pt so it can be read from a step or two away.`,
        });
      }
      // ---- contrast
      const fg = resolveColor(el.style.color, p.palette);
      const bg = backgroundBehind(p, el);
      const ratio = bg ? contrastRatio(fg, bg) : null;
      const need = el.type === 'title' || el.type === 'heading' || el.style.fontSize >= minPt * 1.5 ? 3 : 4.5;
      if (text && ratio != null && ratio < need) {
        issues.push({
          id: 'contrast-' + el.id, elementId: el.id, severity: ratio < 2 ? 'problem' : 'warning',
          title: `${name} is hard to read against its background`,
          detail: `The contrast is ${ratio.toFixed(1)}:1; aim for at least ${need}:1. Choose a darker or lighter text colour.`,
        });
      }
      if (overflowing.has(el.id)) {
        issues.push({ id: 'overflow-' + el.id, elementId: el.id, severity: 'problem', title: `${name}: some text is hidden`, detail: 'Select it and use “Shrink text to fit” or “Make box taller”.' });
      }
    }

    if (el.type === 'image') {
      if (!el.src) {
        issues.push({ id: 'noimg-' + el.id, elementId: el.id, severity: 'warning', title: 'An empty image placeholder', detail: 'Double-click it to add a picture, select it and add a graph, or delete it.' });
      } else {
        const info = images.get(el.id);
        if (info) {
          const dpi = info.width / (el.w / 25.4);
          if (dpi < 150) {
            issues.push({
              id: 'dpi-' + el.id, elementId: el.id, severity: dpi < 90 ? 'problem' : 'warning',
              title: 'An image may print blurry',
              detail: `At this size it prints at about ${Math.round(dpi)} dpi; 150 dpi or more looks sharp. Use a larger image file or make it smaller on the poster.`,
            });
          }
        }
      }
    }
    if (el.type === 'chart' && el.chart && el.chart.fontSize < minPt * 0.75) {
      issues.push({ id: 'chartfont-' + el.id, elementId: el.id, severity: 'warning', title: 'Graph labels may be too small', detail: `They are ${el.chart.fontSize} pt; try at least ${Math.round(minPt * 0.75)} pt (Label size in the side panel).` });
    }
  }

  // ---- crowding: content too close to everything else is hard to spot; keep it simple and check overall balance
  const content = p.elements.filter((e) => e.type !== 'shape');
  if (content.length) {
    const b = boundsOf(content);
    if (b.y + b.h < p.height * 0.6) {
      issues.push({ id: 'empty-bottom', severity: 'tip', title: 'The bottom of the poster is empty', detail: 'Spread your sections down the columns, or make figures larger.' });
    }
  }

  const order: Record<Severity, number> = { problem: 0, warning: 1, tip: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}

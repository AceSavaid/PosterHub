import type { PosterElement } from '../types';
import { isCropped } from './geometry';

export const TYPE_NAMES: Record<string, string> = { title: 'Title', subtitle: 'Subtitle', heading: 'Section header', text: 'Text box', image: 'Image', chart: 'Graph', shape: 'Shape', table: 'Table', equation: 'Equation' };

const SHAPE_NAMES: Record<string, string> = { rect: 'Box', ellipse: 'Circle', line: 'Line', triangle: 'Triangle', diamond: 'Diamond', arrow: 'Arrow', star: 'Star' };

/** True when the person has asked their computer for less motion. */
export function reducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

const textCache = new Map<string, string>();
function plainText(html: string) {
  let text = textCache.get(html);
  if (text === undefined) {
    // Parse in an inert document so nothing in the HTML can run.
    const doc = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, ' '), 'text/html');
    text = (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (textCache.size > 500) textCache.clear();
    textCache.set(html, text);
  }
  return text;
}

const clip = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/** What a screen reader says for an element on the poster, e.g. "Section header: Results". */
export function elementLabel(el: PosterElement): string {
  let label: string;
  if (el.style) {
    const text = plainText(el.html ?? '');
    label = `${TYPE_NAMES[el.type]}: ${text ? clip(text) : 'empty'}`;
  } else if (el.type === 'image') {
    if (el.qr) label = `QR code: ${clip(el.qr)}`;
    else if (el.src) label = el.alt ? `Image: ${clip(el.alt)}` : 'Image';
    else label = `${el.placeholder ?? 'Image'} placeholder, empty`;
  } else if (el.type === 'chart') {
    const title = el.alt || el.chart?.title;
    label = el.chart ? `Graph${title ? ': ' + clip(title) : ''}` : 'Graph placeholder, empty';
  } else if (el.type === 'table') {
    const cells = (el.table?.rows ?? []).flat().filter((c) => c.trim());
    label = el.table ? `Table, ${el.table.rows.length} rows${cells.length ? ': ' + clip(cells.slice(0, 4).join(', ')) : ', empty'}` : 'Table';
  } else if (el.type === 'equation') {
    label = `Equation${el.equation?.latex ? ': ' + clip(el.equation.latex) : ''}`;
  } else {
    label = SHAPE_NAMES[el.shape ?? 'rect'] ?? 'Shape';
  }
  const extras: string[] = [];
  if (el.type === 'image' && el.src && isCropped(el.crop)) extras.push('cropped');
  if (el.rotation) extras.push(`rotated ${Math.round(el.rotation)}°`);
  if (el.locked) extras.push('locked');
  return extras.length ? `${label} (${extras.join(', ')})` : label;
}

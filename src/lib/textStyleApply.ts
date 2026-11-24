// Applying a named text style (see textStyles.ts). Loaded the first time someone picks a style.
import type { Poster, TextStyle } from '../types';
import { defaultStyle, typeScale } from '../model';
import { canTakeStyle, styleNameOf, type TextStyleName } from './textStyles';

/** The built-in look of a style at this poster's size. */
export function defaultLook(p: Poster, name: TextStyleName): TextStyle {
  const s = typeScale(p);
  const r = (n: number) => Math.max(6, Math.round(n * s));
  switch (name) {
    case 'heading':
      return defaultStyle('heading', s);
    case 'subheading':
      return { ...defaultStyle('heading', s), fontSize: r(38), color: '@secondary' };
    case 'caption':
      return { ...defaultStyle('text', s), fontSize: r(22), italic: true, lineHeight: 1.25 };
    default:
      return defaultStyle('text', s);
  }
}

/** The look of a style on this poster: copied from the first other box that uses it, else the built-in look. */
export function lookOf(p: Poster, name: TextStyleName, except?: string): TextStyle {
  const other = p.elements.find((e) => e.id !== except && styleNameOf(e) === name);
  return structuredClone(other?.style ?? defaultLook(p, name));
}

/** Gives box `id` a style: its type, role and look change, its words stay. Returns false if it can't take one. */
export function applyTextStyle(p: Poster, id: string, name: TextStyleName): boolean {
  const el = p.elements.find((e) => e.id === id);
  if (!el || !canTakeStyle(el)) return false;
  const look = lookOf(p, name, id);
  const align = el.style!.align;
  el.style = look;
  // a box keeps its own alignment unless it becomes a heading (headings line up with each other)
  if (name !== 'heading' && name !== 'subheading') el.style.align = align;
  el.type = name === 'heading' || name === 'subheading' ? 'heading' : 'text';
  if (name === 'subheading' || name === 'caption') el.textStyle = name;
  else delete el.textStyle;
  if (el.type !== 'heading') delete el.headingIcon;
  if (name === 'heading' || name === 'subheading') {
    if (!el.role || el.role === 'body' || el.role === 'caption') el.role = 'heading';
  } else if (name === 'caption') {
    if (!el.role || el.role === 'body' || el.role === 'heading') el.role = 'caption';
  } else if (!el.role || el.role === 'heading' || el.role === 'caption') el.role = 'body';
  return true;
}

/** "Update Heading to match": every box with box `id`'s style takes its look (each keeps its own alignment). Returns how many changed. */
export function updateStyleToMatch(p: Poster, id: string): number {
  const el = p.elements.find((e) => e.id === id);
  const name = el && styleNameOf(el);
  if (!el || !name) return 0;
  let n = 0;
  for (const e of p.elements) {
    if (e.id === id || styleNameOf(e) !== name) continue;
    e.style = { ...structuredClone(el.style!), align: e.style!.align };
    n++;
  }
  return n;
}

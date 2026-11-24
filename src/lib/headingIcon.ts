// An icon at the end of a heading. Its size and place come only from the heading's
// own font size, line spacing and box, so the editor, PDF and PowerPoint all put it
// in the same spot and it follows the text when the heading is resized or restyled.
import type { ColorValue, HeadingIconSpec, PosterElement } from '../types';
import { MM_TO_PX } from '../model';

const PT_TO_PX = 96 / 72;
/** icon height, in multiples of the font size (icons have a little air inside their artwork) */
export const HEADING_ICON_EM = 1.15;
/** space kept between the words and the icon, in multiples of the font size */
export const HEADING_ICON_GAP_EM = 0.35;

/** Only headings take an end icon. */
export const canHaveHeadingIcon = (el: Pick<PosterElement, 'type'>) => el.type === 'heading';

export interface HeadingIconLayout {
  /** top-left of the icon's square, in px, measured from the inside of the box's border and padding */
  x: number;
  y: number;
  /** side of the square, px */
  size: number;
  /** room kept free on the right of the text (and on the left too when the text is centred), px */
  reserve: number;
  /** extra padding for the left side of the text, px */
  reserveLeft: number;
}

/** The space inside a box's border and padding, px. */
export function contentBox(el: Pick<PosterElement, 'w' | 'h' | 'padding' | 'borderWidth'>) {
  const inset = (el.padding ?? 0) * MM_TO_PX + ((el.borderWidth ?? 0) * 96) / 72;
  return { inset, w: Math.max(0, el.w * MM_TO_PX - 2 * inset), h: Math.max(0, el.h * MM_TO_PX - 2 * inset) };
}

/**
 * Where a heading's end icon goes: against the right-hand edge, centred on the first
 * line of text, about the height of the letters. Returns null when there is no icon.
 */
export function headingIconLayout(el: PosterElement): HeadingIconLayout | null {
  if (!el.headingIcon || !el.style || !canHaveHeadingIcon(el)) return null;
  const st = el.style;
  const box = contentBox(el);
  const font = st.fontSize * PT_TO_PX;
  const line = font * (st.lineHeight || 1);
  // As tall as the letters, never taller than a line, and never more than a third of a narrow box.
  const size = Math.max(0, Math.min(font * HEADING_ICON_EM, Math.max(line, font), box.w / 3, box.h || Infinity));
  const reserve = size > 0 ? size + font * HEADING_ICON_GAP_EM : 0;
  return {
    x: box.w - size,
    y: (Math.min(line, box.h || line) - size) / 2,
    size,
    reserve,
    reserveLeft: st.align === 'center' ? reserve : 0,
  };
}

/** The icon's colours: its own, or the heading's text colour. */
export function headingIconSpec(el: PosterElement): { color: ColorValue; color2?: ColorValue } | null {
  const ic = el.headingIcon;
  if (!ic) return null;
  return { color: ic.color ?? el.style?.color ?? '@primary', ...(ic.color2 ? { color2: ic.color2 } : {}) };
}

/** A clean copy of a heading icon read from an untrusted file, or undefined when it is not valid. */
export function cleanHeadingIcon(raw: unknown, safeColor: (c: unknown) => string | undefined): HeadingIconSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !/^[a-z]+\/[a-z0-9_-]+$/.test(r.id)) return undefined;
  const out: HeadingIconSpec = { id: r.id };
  const c = safeColor(r.color);
  if (c) out.color = c;
  const c2 = safeColor(r.color2);
  if (c2) out.color2 = c2;
  return out;
}

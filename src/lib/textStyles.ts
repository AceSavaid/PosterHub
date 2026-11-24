// Named text styles, like the "Normal text / Heading 1" list in Google Docs.
// A style is not stored on its own: its look is the look of the boxes that use it,
// so "Update Heading to match" just restyles every heading, and a new heading
// copies the look of the headings already on the poster (see textStyleApply.ts,
// which loads the first time a style is applied).
import type { PosterElement } from '../types';
import { keys } from './keys';

export type TextStyleName = 'heading' | 'subheading' | 'normal' | 'caption';

export const TEXT_STYLES: { name: TextStyleName; label: string; key: string }[] = [
  { name: 'heading', label: 'Heading', key: '1' },
  { name: 'subheading', label: 'Subheading', key: '2' },
  { name: 'normal', label: 'Normal text', key: '0' },
  { name: 'caption', label: 'Caption', key: '9' },
];

export const isTextStyleName = (v: unknown): v is TextStyleName => TEXT_STYLES.some((s) => s.name === v);

/** "Ctrl+Alt+1" (or ⌘⌥1 on a Mac) for a style. */
export const styleShortcut = (name: TextStyleName) => keys(`Ctrl/⌘ Alt ${TEXT_STYLES.find((s) => s.name === name)!.key}`);

/** Which style a key press asks for: Ctrl/⌘ + Alt + 1, 2, 0 or 9 (read from the key's position, since Alt changes the character on a Mac). */
export function styleForKey(e: { ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; code: string }): TextStyleName | null {
  if (!(e.ctrlKey || e.metaKey) || !e.altKey || e.shiftKey) return null;
  const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
  return (m && TEXT_STYLES.find((s) => s.key === m[1])?.name) || null;
}

/** Can this box take a text style? (Title, author line and reference list keep their own.) */
export const canTakeStyle = (el: PosterElement) => (el.type === 'text' || el.type === 'heading') && !!el.style && !el.refList && !el.authors;

/** The style a text box uses now. */
export function styleNameOf(el: PosterElement): TextStyleName | null {
  if (!canTakeStyle(el)) return null;
  if (el.textStyle) return el.textStyle;
  if (el.type === 'heading') return 'heading';
  if (el.role === 'caption' || el.role === 'qrCaption') return 'caption';
  return 'normal';
}


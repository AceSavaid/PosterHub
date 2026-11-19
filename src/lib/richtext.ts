// Formatting for the words selected inside a text box while typing.

/** Wraps the current selection in a <span> with the given inline style. Returns false if nothing is selected. */
export function styleSelection(style: Partial<CSSStyleDeclaration>): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const host = (range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest('[contenteditable="true"]');
  if (!host) return false;
  const span = document.createElement('span');
  Object.assign(span.style, style);
  span.appendChild(range.extractContents());
  // Remove the same property from nested spans so the new value wins.
  span.querySelectorAll<HTMLElement>('span').forEach((s) => {
    for (const k of Object.keys(style)) (s.style as unknown as Record<string, string>)[k] = '';
    if (!s.getAttribute('style')) s.replaceWith(...Array.from(s.childNodes));
  });
  range.insertNode(span);
  sel.removeAllRanges();
  const r = document.createRange();
  r.selectNodeContents(span);
  sel.addRange(r);
  host.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/** Font size (pt) at the start of the selection. */
export function selectionFontSizePt(): number | null {
  const sel = window.getSelection();
  const node = sel?.anchorNode;
  const el = node instanceof Element ? node : node?.parentElement;
  if (!el) return null;
  return (parseFloat(getComputedStyle(el).fontSize) * 72) / 96;
}

export function resizeSelection(factor: number): boolean {
  const pt = selectionFontSizePt();
  if (!pt) return false;
  return styleSelection({ fontSize: `${Math.max(4, Math.round(pt * factor * 2) / 2)}pt` });
}

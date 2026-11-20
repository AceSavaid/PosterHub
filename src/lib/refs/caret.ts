// Inserting a citation marker where the caret is in the text box being edited.
import type { Poster } from '../../types';
import { CITE_SELECTOR, citeIds, makeMarker } from './citations';

/** The node just before a collapsed range, skipping empty text. */
function nodeBefore(range: Range): Node | null {
  const { startContainer: c, startOffset: o } = range;
  if (c.nodeType === Node.TEXT_NODE) {
    if (o > 0 && (c.textContent ?? '').slice(0, o).trim()) return null;
    return c.previousSibling;
  }
  return c.childNodes[o - 1] ?? null;
}

/**
 * Inserts a citation of `refId` at the caret, or adds it to a marker the caret
 * sits right after (so clicking two references gives "[1, 2]").
 * Returns the edited text box, or null if the caret isn't in one.
 */
export function insertCitationAtCaret(refId: string, poster: Poster): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  const host = start?.closest<HTMLElement>('[contenteditable="true"]');
  if (!host) return null;
  // never insert inside an existing marker
  const inMarker = start?.closest(CITE_SELECTOR);
  if (inMarker && host.contains(inMarker)) {
    range.setStartAfter(inMarker);
  }
  range.collapse(false);

  const prev = nodeBefore(range);
  if (prev instanceof HTMLElement && prev.matches(CITE_SELECTOR)) {
    const ids = citeIds(prev);
    if (!ids.includes(refId)) prev.setAttribute('data-cite', [...ids, refId].join(','));
  } else {
    const marker = makeMarker([refId], poster);
    const before = range.startContainer.nodeType === Node.TEXT_NODE ? (range.startContainer.textContent ?? '').slice(0, range.startOffset) : '';
    const needsSpace = poster.citationStyle !== 'nature' && before && !/\s$/.test(before);
    range.insertNode(marker);
    if (needsSpace) marker.before(document.createTextNode(' '));
    const after = document.createRange();
    after.setStartAfter(marker);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
  }
  host.dispatchEvent(new Event('input', { bubbles: true }));
  return host;
}

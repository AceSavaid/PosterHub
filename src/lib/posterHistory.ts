// The open poster lives in the address as #/poster/<id>, so the browser's Back button returns to My posters.

export const posterHash = (id: string) => `#/poster/${id}`;
export const hashPosterId = () => location.hash.match(/^#\/poster\/(.+)$/)?.[1] ?? null;
export const libraryUrl = () => location.pathname + location.search;

/**
 * Adds the poster's history entry. Call it straight from the click, before any waiting: Safari's
 * Back button skips entries a page adds a while after the user's last click or key press.
 */
export function pushPosterEntry(id: string) {
  if (hashPosterId() !== id) history.pushState({ posterhub: id }, '', posterHash(id));
}

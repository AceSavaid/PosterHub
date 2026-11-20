// Content Security Policy for the built app (web and desktop). It is a safety
// net: even if something slipped past the HTML cleaning in src/lib/sanitize.ts,
// the browser refuses to run injected scripts or contact unexpected servers.
//
// The only outside servers PosterHub talks to:
// - fonts.googleapis.com / fonts.gstatic.com: Google Fonts
// - cdn.jsdelivr.net: Fontsource font files, embedded into vector PDFs
// - api.crossref.org / api.datacite.org: looking up references by DOI
// ipc: / ipc.localhost are how the desktop app (Tauri) talks to its native side.
const directives: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'data:', 'blob:', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
  'img-src': ["'self'", 'data:', 'blob:'],
  'connect-src': ["'self'", 'data:', 'blob:', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net', 'https://api.crossref.org', 'https://api.datacite.org', 'ipc:', 'http://ipc.localhost'],
  'worker-src': ["'self'", 'blob:'],
  'object-src': ["'none'"],
  'frame-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'none'"],
};

export const contentSecurityPolicy = Object.entries(directives)
  .map(([k, v]) => `${k} ${v.join(' ')}`)
  .join('; ');

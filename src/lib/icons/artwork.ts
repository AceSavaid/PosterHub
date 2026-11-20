// The icon artwork, bundled into one lazily loaded chunk so the editor starts
// quickly. Every file was normalised by scripts/import-icons.mjs.
const files = import.meta.glob('../../assets/icons/*/*.svg', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

/** Raw SVG markup by icon id ("health/dna"). */
export const SVGS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, svg]) => {
    const m = path.match(/icons\/([^/]+)\/([^/]+)\.svg$/)!;
    return [`${m[1]}/${m[2]}`, svg];
  }),
);

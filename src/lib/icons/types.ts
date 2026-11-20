export type IconCategory = 'cells' | 'body' | 'lab' | 'science' | 'nature' | 'people' | 'data' | 'symbols';

/** One icon in the built-in library. The artwork itself is loaded separately (see library.ts). */
export interface IconInfo {
  /** "<source>/<name>", e.g. "health/dna" or "phosphor/flask" */
  id: string;
  label: string;
  category: IconCategory;
  /** lower-case search words */
  keywords: string[];
}

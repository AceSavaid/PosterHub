// Core data model. Everything about a poster lives in one JSON-serialisable
// object, so saving, importing and exporting are simply (de)serialising it.
// All positions and sizes are in millimetres; font sizes are in points.

export type Orientation = 'portrait' | 'landscape';

/** A colour is either a hex string or a reference to a palette role such as "@primary". */
export type ColorValue = string;

export interface Palette {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
}

export type PaletteRole = keyof Omit<Palette, 'name'>;

export interface CustomFont {
  family: string;
  /** data: URL of the font file */
  dataUrl: string;
}

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'triangle' | 'diamond' | 'arrow' | 'star';

export type ElementType = 'title' | 'subtitle' | 'heading' | 'text' | 'image' | 'chart' | 'shape';

export interface TextStyle {
  fontFamily: string; // "@heading" | "@body" | a concrete family
  fontSize: number; // pt
  color: ColorValue;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right' | 'justify';
  lineHeight: number;
}

export type ChartKind = 'bar' | 'horizontalBar' | 'line' | 'scatter' | 'pie' | 'doughnut';

export interface ChartSpec {
  kind: ChartKind;
  title: string;
  /** Source table: first row is the header. */
  columns: string[];
  rows: string[][];
  xColumn: number;
  yColumns: number[];
  /** inclusive row range (0-based, excluding header) */
  rowStart: number;
  rowEnd: number;
  xLabel: string;
  yLabel: string;
  showLegend: boolean;
  fontSize: number; // pt
}

export interface PosterElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  /** HTML for text-like elements */
  html?: string;
  style?: TextStyle;
  fill?: ColorValue; // background colour (or shape fill)
  /** Optional CSS gradient drawn over `fill` (e.g. from an imported PowerPoint template). `fill` stays the fallback colour. */
  gradient?: string;
  borderColor?: ColorValue;
  borderWidth?: number; // pt
  radius?: number; // mm
  padding?: number; // mm
  /** image data URL */
  src?: string;
  /** label shown on an empty image box, e.g. "Logo" or "QR code" */
  placeholder?: string;
  /** the link or text encoded when this image is a generated QR code */
  qr?: string;
  fit?: 'contain' | 'cover' | 'fill';
  chart?: ChartSpec;
  shape?: ShapeKind;
  /** which way an arrow points */
  direction?: 'right' | 'left' | 'up' | 'down';
  locked?: boolean;
}

/**
 * A sticky note left by a supervisor or co-author. Notes live beside the
 * elements (never inside them), so they travel with the .poster.json file
 * but are never drawn into a PDF, PowerPoint, PNG or copied image.
 * `text` is plain text and must always be rendered as text, never as HTML.
 */
export interface ReviewNote {
  id: string;
  /** position of the note's pin, in mm from the poster's top-left corner */
  x: number;
  y: number;
  text: string;
  author: string;
  createdAt: number;
  resolved: boolean;
  /** the element the note was left on, if any */
  elementId?: string;
}

export interface Poster {
  id: string;
  name: string;
  version: 1;
  width: number; // mm
  height: number; // mm
  sizePreset: string;
  palette: Palette;
  headingFont: string;
  bodyFont: string;
  customFonts: CustomFont[];
  googleFonts: string[];
  columns: number;
  margin: number; // mm
  gutter: number; // mm
  backgroundImage?: string;
  elements: PosterElement[];
  /** review notes; optional so older files load unchanged */
  notes?: ReviewNote[];
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
}

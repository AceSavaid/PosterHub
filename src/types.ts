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
  fit?: 'contain' | 'cover' | 'fill';
  chart?: ChartSpec;
  shape?: 'rect' | 'ellipse' | 'line';
  locked?: boolean;
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
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
}

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

export type ElementType = 'title' | 'subtitle' | 'heading' | 'text' | 'image' | 'chart' | 'shape' | 'table' | 'equation' | 'icon';

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

export type ChartKind = 'bar' | 'horizontalBar' | 'stackedBar' | 'line' | 'scatter' | 'pie' | 'doughnut' | 'histogram' | 'box';

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
  /** scatter: draw a least-squares line per series and show its equation and R² */
  trendline?: boolean;
  /** histogram: number of bars; empty means pick automatically */
  bins?: number;
  /** box plot: one box per ticked column, or group rows by the X column's values */
  boxGroups?: 'columns' | 'category';
}

export interface Author {
  name: string;
  /** indexes into AuthorList.affiliations */
  affiliations: number[];
  presenter?: boolean;
  corresponding?: boolean;
  orcid?: string;
}

/** Structured author block; the element's html is generated from it. */
export interface AuthorList {
  authors: Author[];
  affiliations: string[];
  email?: string;
  showOrcid?: boolean;
}

export type TableStyleId = 'academic' | 'striped' | 'grid' | 'minimal';

export interface TableSpec {
  /** Cell text, row by row. Plain text only (newlines allowed), never HTML. */
  rows: string[][];
  /** Treat the first row as column headings. */
  headerRow: boolean;
  style: TableStyleId;
  fontSize: number; // pt
  /** 'auto' right-aligns columns of numbers and left-aligns the rest. */
  align: 'auto' | 'left' | 'center';
  /** Optional relative column widths (any positive numbers); missing = sized to fit the text. */
  colWidths?: number[];
}

/** A typeset maths equation written in LaTeX. */
export interface EquationSpec {
  /** LaTeX source, without surrounding $ signs, e.g. "E = mc^2". */
  latex: string;
  fontSize: number; // pt; 1 em of the maths
  color: ColorValue;
  align: 'left' | 'center' | 'right';
}

/** An icon from the built-in science icon library, drawn in the poster's colours. */
export interface IconSpec {
  /** library id, e.g. "health/dna" or "phosphor/flask" */
  id: string;
  /** main colour (usually a palette role such as "@primary") */
  color: ColorValue;
  /** colour of the light shading on two-tone icons; unset = a pale tint of the main colour */
  color2?: ColorValue;
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
  table?: TableSpec;
  equation?: EquationSpec;
  icon?: IconSpec;
  shape?: ShapeKind;
  /** which way an arrow points */
  direction?: 'right' | 'left' | 'up' | 'down';
  locked?: boolean;
  /**
   * What this element is for in a starter layout (title, section body, logo, …).
   * Lets "Apply layout" move content into the matching place in another layout.
   */
  role?: ElementRole;
  /** Elements of one section (its heading, text and figure) share a group id. */
  group?: string;
  /** set when the text was built with the authors and affiliations tool */
  authors?: AuthorList;
  /** elements sharing a group id move, resize, copy and select together */
  groupId?: string;
  /** This text box is the poster's reference list; its text is generated from `Poster.references`. */
  refList?: boolean;
  /** Heading shown above the reference list ("" for none). */
  refTitle?: string;
  /** Description of an image or graph for screen readers and exported files (alt text). */
  alt?: string;
  /** mm this text box has grown to fit its text, pushing the column below down (it shrinks back by up to this much) */
  grew?: number;
  /** clockwise rotation in degrees, around the element's centre */
  rotation?: number;
  /** part of the image to show, as fractions of the original (0–1) */
  crop?: CropRect;
}

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ElementRole =
  | 'title' | 'subtitle' | 'heading' | 'number' | 'body' | 'figure' | 'caption'
  | 'logo' | 'qr' | 'qrCaption' | 'references' | 'summary' | 'summaryHeading' | 'keyFinding' | 'decor';

export type RefKind = 'article' | 'book' | 'chapter' | 'conference' | 'thesis' | 'report' | 'web' | 'other';

/** A person or organisation. Organisations have only `family`. */
export interface RefName {
  family: string;
  given?: string;
}

/** One entry in the poster's reference library. Every field is plain text (never HTML). */
export interface Reference {
  id: string;
  kind: RefKind;
  authors: RefName[];
  editors?: RefName[];
  title: string;
  /** journal, book title (for a chapter), proceedings or website name */
  container?: string;
  year?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  place?: string;
  edition?: string;
  doi?: string;
  url?: string;
  /** BibTeX key, kept so re-importing the same file doesn't create duplicates */
  key?: string;
}

export type CitationStyle = 'apa' | 'harvard' | 'chicago' | 'vancouver' | 'ieee' | 'nature';

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

/** A conference's poster requirements. Every field is optional: only the rules filled in are checked. */
export interface ConferenceRules {
  name?: string;
  /** required size in mm (width × height as printed; either way round unless orientation is set) */
  width?: number;
  height?: number;
  /** 'exact': must match (within 2 mm); 'max': must fit inside */
  sizeMode?: 'exact' | 'max';
  orientation?: Orientation;
  /** smallest text allowed anywhere on the poster, in pt */
  minFontPt?: number;
  /** poster or abstract number that must appear on the poster, e.g. "P-142" */
  posterNumber?: string;
  requireQr?: boolean;
  /** how many logos must appear (institution, funder, conference) */
  logos?: number;
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
  /** Reference library; cited in text with numbered or author–year markers. */
  references?: Reference[];
  citationStyle?: CitationStyle;
  elements: PosterElement[];
  /** words the spelling check should accept on this poster (names, jargon) */
  ignoredWords?: string[];
  /** Check items (by issue id) the person dismissed on this poster; they stay hidden until brought back */
  dismissedIssues?: string[];
  /** optional word limit set by a conference; the check warns when the poster goes over it */
  wordLimit?: number;
  /** rules from the conference call for posters; Check reports what doesn't meet them */
  conference?: ConferenceRules;
  /** review notes; optional so older files load unchanged */
  notes?: ReviewNote[];
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
}

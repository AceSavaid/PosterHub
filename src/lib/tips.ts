// One short, practical tip per kind of element, shown at the top of the Properties panel.
import type { PosterElement } from '../types';

export function elementTip(el: PosterElement): string {
  if (el.refList) return 'Press Enter to add references or change the citation style. To cite one, select a text box and pick it under Cite.';
  if (el.authors) return 'Use “Edit authors and affiliations…” below to change names or institutions; the numbers are kept in order for you.';
  switch (el.type) {
    case 'title':
      return 'Keep the title to two lines that can be read from across the room. Double-click to type.';
    case 'subtitle':
    case 'heading':
      return 'Double-click to type. Short headings help people find their way around the poster.';
    case 'text':
      return 'Double-click to type. Ctrl/⌘ B, I and U format selected words. Aim for 24 pt or more for body text.';
    case 'image':
      if (el.qr) return 'Scan it with a phone to check the link works before printing.';
      return el.src ? 'Use Crop to trim the picture and add alt text below so screen readers can describe it.' : 'Press Enter to choose a picture, or drag one from your computer onto this box.';
    case 'chart':
      return 'Press Enter to change the data or graph type. Large axis labels are easier to read from a distance.';
    case 'table':
      return 'Press Enter to edit the cells. Paste straight from Excel or Google Sheets to fill it.';
    case 'equation':
      return 'Press Enter to edit the LaTeX. It stays sharp in PDF and PowerPoint.';
    case 'icon':
      return 'Icons use your poster’s colours, so they change with the palette.';
    case 'shape':
      return 'Shapes make good panels behind sections. Right-click to send one to the back.';
    default:
      return '';
  }
}

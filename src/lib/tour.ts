/**
 * The first-time tour: four short cards that point at the main parts of the editor.
 * Whether someone has seen it is kept in localStorage (it's about the person, not the poster).
 */
export interface TourStep {
  /** CSS selectors tried in order; the first visible match is highlighted. None found → the card sits in the middle. */
  targets: string[];
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    targets: ['.poster > .el-title', '.poster'],
    title: 'Click to edit',
    body: 'Click any box on the poster to select it, then drag to move it or pull a corner to resize. Double-click text to type over the example words.',
  },
  {
    targets: ['[data-tour="tools"]'],
    title: 'Add things from Insert',
    body: 'Text, pictures, graphs from a spreadsheet, tables, equations, references and icons are all here. The Layout and Design tabs change columns, colours and fonts.',
  },
  {
    targets: ['[data-tour="check"]'],
    title: 'Check before you print',
    body: 'Check looks for text too small to read, low contrast, blurry pictures and leftover example text. Click a problem to jump straight to it.',
  },
  {
    targets: ['[data-tour="export"]'],
    title: 'Export when you’re ready',
    body: 'Download a print-quality PDF, a PowerPoint, an image or a project file. Your poster also saves itself in this browser as you work.',
  },
];

export const TOUR_KEY = 'posterhub.tour';

export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === 'done';
  } catch {
    return true; // storage blocked: don't show the tour every single time
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(TOUR_KEY, 'done');
  } catch {
    /* private mode: fine, it just may show again */
  }
}

export function resetTour() {
  try {
    localStorage.removeItem(TOUR_KEY);
  } catch {
    /* ignore */
  }
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where to put the tour card (width × height) next to the highlighted target inside the viewport.
 * Tries below, right, left, then above the target; if none fits (e.g. the target fills the
 * screen, like the poster) it overlaps the target near its bottom-right, always fully on screen.
 */
export function placeCard(target: Rect | null, card: { width: number; height: number }, view: { width: number; height: number }, gap = 12, margin = 8): { left: number; top: number } {
  const clampX = (x: number) => Math.max(margin, Math.min(x, view.width - card.width - margin));
  const clampY = (y: number) => Math.max(margin, Math.min(y, view.height - card.height - margin));
  if (!target) return { left: clampX((view.width - card.width) / 2), top: clampY((view.height - card.height) / 2) };
  const right = target.left + target.width;
  const bottom = target.top + target.height;
  const fitsX = (x: number) => x >= margin && x + card.width <= view.width - margin;
  const fitsY = (y: number) => y >= margin && y + card.height <= view.height - margin;
  // below, lined up with the target's right edge for top-bar buttons near the right of the screen
  const belowY = bottom + gap;
  if (fitsY(belowY)) return { left: clampX(Math.min(target.left, right - card.width)), top: belowY };
  const rightX = right + gap;
  if (fitsX(rightX)) return { left: rightX, top: clampY(target.top) };
  const leftX = target.left - gap - card.width;
  if (fitsX(leftX)) return { left: leftX, top: clampY(target.top) };
  const aboveY = target.top - gap - card.height;
  if (fitsY(aboveY)) return { left: clampX(target.left), top: aboveY };
  return { left: clampX(right - card.width - 24), top: clampY(bottom - card.height - 24) };
}

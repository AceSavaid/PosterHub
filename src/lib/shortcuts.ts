// Every keyboard shortcut in the editor, for the "?" sheet and the Properties panel.
// Written with "Ctrl/⌘" and shown through keys() so Macs see ⌘ and others see Ctrl.
import { keys } from './keys';

export interface Shortcut {
  /** one or more key combos, e.g. ["Ctrl/⌘ Shift Z", "Ctrl/⌘ Y"] */
  combos: string[];
  what: string;
}

export interface ShortcutGroup {
  name: string;
  items: Shortcut[];
}

export const SHORTCUTS: ShortcutGroup[] = [
  {
    name: 'Editing',
    items: [
      { combos: ['Ctrl/⌘ Z'], what: 'Undo' },
      { combos: ['Ctrl/⌘ Shift Z', 'Ctrl/⌘ Y'], what: 'Redo' },
      { combos: ['Ctrl/⌘ C', 'Ctrl/⌘ X', 'Ctrl/⌘ V'], what: 'Copy, cut and paste elements, text or images' },
      { combos: ['Ctrl/⌘ D'], what: 'Duplicate' },
      { combos: ['Delete', 'Backspace'], what: 'Delete the selected elements' },
      { combos: ['Ctrl/⌘ G'], what: 'Group the selected elements' },
      { combos: ['Ctrl/⌘ Shift G'], what: 'Ungroup' },
      { combos: ['Ctrl/⌘ S'], what: 'Save now (posters also save on their own)' },
    ],
  },
  {
    name: 'Selecting and moving',
    items: [
      { combos: ['Tab', 'Shift Tab'], what: 'Move between elements on the poster' },
      { combos: ['Ctrl/⌘ A'], what: 'Select everything' },
      { combos: ['Shift-click'], what: 'Add to or take from the selection (or drag a box around elements)' },
      { combos: ['Ctrl/⌘-click'], what: 'Pick one element out of a group' },
      { combos: ['Arrows'], what: 'Nudge 1 mm' },
      { combos: ['Shift Arrows'], what: 'Nudge 10 mm' },
      { combos: ['Alt-drag'], what: 'Move without snapping' },
      { combos: ['Shift F10'], what: 'Actions menu for the selected element' },
      { combos: ['Esc'], what: 'Stop editing, or clear the selection' },
    ],
  },
  {
    name: 'Text',
    items: [
      { combos: ['Enter'], what: 'Edit the selected text, table, equation, image or graph' },
      { combos: ['Ctrl/⌘ B'], what: 'Bold while typing' },
      { combos: ['Ctrl/⌘ I'], what: 'Italic while typing' },
      { combos: ['Ctrl/⌘ U'], what: 'Underline while typing' },
      { combos: ['Ctrl/⌘ Alt 1', 'Ctrl/⌘ Alt 2'], what: 'Make the text a heading or subheading' },
      { combos: ['Ctrl/⌘ Alt 0', 'Ctrl/⌘ Alt 9'], what: 'Make the text normal text or a caption' },
      { combos: ['Ctrl/⌘ Shift 8', 'Ctrl/⌘ Shift 7'], what: 'Bullet or numbered list while typing (or type “- ” or “1. ”)' },
      { combos: ['Ctrl/⌘ Shift .', 'Ctrl/⌘ Shift ,'], what: 'Bigger or smaller text while typing' },
      { combos: ['Ctrl/⌘ .', 'Ctrl/⌘ ,'], what: 'Superscript or subscript while typing' },
      { combos: ['Ctrl/⌘ Shift V'], what: 'Paste the words only (a normal paste keeps bold, italic and lists)' },
      { combos: ['Ctrl/⌘ F', 'Ctrl/⌘ H'], what: 'Find and replace words on the poster' },
    ],
  },
  {
    name: 'View',
    items: [
      { combos: ['Ctrl/⌘ ='], what: 'Zoom in' },
      { combos: ['Ctrl/⌘ -'], what: 'Zoom out' },
      { combos: ['Shift 0', 'Ctrl/⌘ 0'], what: 'Fit the poster to the screen' },
      { combos: ['Ctrl/⌘ \\'], what: 'Hide or show both side panels' },
      { combos: ['?'], what: 'Show this list' },
    ],
  },
];

/** Groups with only the shortcuts matching a search ("undo", "ctrl z", "group"). */
export function searchShortcuts(query: string, groups = SHORTCUTS, onMac?: boolean): ShortcutGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return groups;
  const text = (s: Shortcut, g: ShortcutGroup) =>
    [s.what, g.name, ...s.combos, ...s.combos.map((c) => keys(c, onMac)), ...s.combos.map((c) => keys(c, false))].join(' ').toLowerCase();
  return groups
    .map((g) => ({ ...g, items: g.items.filter((s) => words.every((w) => text(s, g).includes(w))) }))
    .filter((g) => g.items.length > 0);
}

// Every command in the editor, for "Search the menus" (Alt+/). Loaded with the search box,
// not with the editor, so the names and extra search words don't slow down opening a poster.
import type { ElementType, PosterElement } from '../types';
import type { Command } from './commands';
import type { CheckTab } from '../components/CheckPanel';
import type { ExportKind } from '../components/ExportMenu';
import { SHAPE_CHOICES } from './shapes';
import { VISION_MODES, type VisionMode } from './colorVision';

/** What the editor can do and the state that greys commands out. The editor fills it in. */
export interface CommandContext {
  insert: (type: ElementType, extra?: Partial<PosterElement>) => void;
  /** opens a dialog or panel by name */
  open: (what: 'authors' | 'refs' | 'equation' | 'image' | 'chart' | 'qr' | 'icons' | 'poster' | 'design' | 'abstract' | 'rename' | 'copySize' | 'template' | 'deletePoster' | 'find' | 'notes' | 'note' | 'preview' | 'settings' | 'shortcuts' | 'tour') => void;
  check: (tab: CheckTab) => void;
  edit: (what: 'undo' | 'redo' | 'selectAll' | 'duplicate' | 'delete' | 'group' | 'ungroup' | 'front' | 'back') => void;
  view: (what: 'zoomIn' | 'zoomOut' | 'fit' | 'grid' | 'snap' | 'panels') => void;
  vision: (m: VisionMode) => void;
  orientation: (o: 'portrait' | 'landscape') => void;
  exportAs: (kind: ExportKind | 'copyImage') => void;
  can: { undo: boolean; redo: boolean; group: boolean; ungroup: boolean };
  hasSelection: boolean;
  landscape: boolean;
  showGrid: boolean;
  snap: boolean;
  panelsShown: boolean;
}

export function buildCommands(x: CommandContext): Command[] {
  const sel = x.hasSelection;
  const c = (id: string, group: string, label: string, run: () => void, more: Partial<Command> = {}): Command => ({ id, group, label, run, ...more });
  const open = (what: Parameters<CommandContext['open']>[0]) => () => x.open(what);
  const edit = (what: Parameters<CommandContext['edit']>[0]) => () => x.edit(what);
  const view = (what: Parameters<CommandContext['view']>[0]) => () => x.view(what);
  const check = (tab: CheckTab) => () => x.check(tab);
  return [
    // Insert
    c('ins-title', 'Insert', 'Add a title', () => x.insert('title'), { keywords: 'heading name' }),
    c('ins-subtitle', 'Insert', 'Add a subtitle', () => x.insert('subtitle')),
    c('ins-authors', 'Insert', 'Add authors and affiliations…', open('authors'), { keywords: 'names university department affiliation' }),
    c('ins-heading', 'Insert', 'Add a section heading', () => x.insert('heading'), { keywords: 'header title' }),
    c('ins-text', 'Insert', 'Add a text box', () => x.insert('text'), { keywords: 'paragraph words type' }),
    c('ins-refs', 'Insert', 'References and citations…', open('refs'), { keywords: 'cite bibliography doi reference list' }),
    c('ins-eq', 'Insert', 'Add an equation…', open('equation'), { keywords: 'maths math latex formula' }),
    c('ins-image', 'Insert', 'Add a picture…', open('image'), { keywords: 'image photo figure upload logo' }),
    c('ins-table', 'Insert', 'Add a table', () => x.insert('table'), { keywords: 'cells rows columns spreadsheet' }),
    c('ins-chart', 'Insert', 'Add a graph…', open('chart'), { keywords: 'chart plot bar line pie scatter excel data' }),
    c('ins-qr', 'Insert', 'Add a QR code', open('qr'), { keywords: 'link url scan' }),
    c('ins-icon', 'Insert', 'Search science icons', open('icons'), { keywords: 'icon symbol cell flask dna' }),
    ...SHAPE_CHOICES.map((s) => c('ins-shape-' + s.label, 'Insert › Shapes', `Add a ${s.label.toLowerCase()}`, () => x.insert('shape', { shape: s.kind, ...s.extra }), { keywords: 'shape' })),
    // Edit and arrange
    c('undo', 'Edit', 'Undo', edit('undo'), { shortcut: 'Ctrl/⌘ Z', disabled: !x.can.undo }),
    c('redo', 'Edit', 'Redo', edit('redo'), { shortcut: 'Ctrl/⌘ Shift Z', disabled: !x.can.redo }),
    c('select-all', 'Edit', 'Select everything', edit('selectAll'), { shortcut: 'Ctrl/⌘ A' }),
    c('duplicate', 'Edit', 'Duplicate', edit('duplicate'), { shortcut: 'Ctrl/⌘ D', disabled: !sel, keywords: 'copy' }),
    c('delete', 'Edit', 'Delete the selected elements', edit('delete'), { shortcut: 'Delete', disabled: !sel, keywords: 'remove' }),
    c('group', 'Edit', 'Group', edit('group'), { shortcut: 'Ctrl/⌘ G', disabled: !x.can.group }),
    c('ungroup', 'Edit', 'Ungroup', edit('ungroup'), { shortcut: 'Ctrl/⌘ Shift G', disabled: !x.can.ungroup }),
    c('front', 'Arrange', 'Bring to front', edit('front'), { disabled: !sel, keywords: 'layer order top' }),
    c('back', 'Arrange', 'Send to back', edit('back'), { disabled: !sel, keywords: 'layer order bottom behind' }),
    // The whole poster
    c('landscape', 'Poster', 'Make the poster landscape (wide)', () => x.orientation('landscape'), { keywords: 'orientation horizontal rotate', disabled: x.landscape }),
    c('portrait', 'Poster', 'Make the poster portrait (tall)', () => x.orientation('portrait'), { keywords: 'orientation vertical rotate', disabled: !x.landscape }),
    c('size', 'Poster', 'Change the poster size, columns or layout', open('poster'), { keywords: 'page a0 a1 inches mm margins switch layout template columns' }),
    c('colours', 'Poster', 'Change colours, fonts or brand kit', open('design'), { keywords: 'palette colour color theme font design background' }),
    c('abstract', 'Poster', 'Fill from your abstract…', open('abstract'), { keywords: 'paste import' }),
    c('rename', 'Poster', 'Rename the poster', open('rename'), { keywords: 'name' }),
    c('copy-size', 'Poster', 'Make a copy at another size…', open('copySize'), { keywords: 'duplicate resize conference' }),
    c('save-template', 'Poster', 'Save as my template…', open('template')),
    c('delete-poster', 'Poster', 'Delete this poster…', open('deletePoster'), { keywords: 'remove trash' }),
    // Check and review
    c('check', 'Check', 'Check the poster for problems', check('problems'), { keywords: 'review errors warnings print ready' }),
    c('spelling', 'Check', 'Check spelling', check('spelling'), { keywords: 'typos dictionary' }),
    c('words', 'Check', 'Word count', check('words'), { keywords: 'limit length' }),
    c('conference', 'Check', 'Conference rules', check('conference'), { keywords: 'requirements size limit' }),
    c('find', 'Check', 'Find and replace', open('find'), { shortcut: 'Ctrl/⌘ F', keywords: 'search words' }),
    c('notes', 'Check', 'Notes from co-authors', open('notes'), { keywords: 'comments feedback review' }),
    c('add-note', 'Check', 'Add a note', open('note'), { keywords: 'comment' }),
    // View
    c('zoom-in', 'View', 'Zoom in', view('zoomIn'), { shortcut: 'Ctrl/⌘ =' }),
    c('zoom-out', 'View', 'Zoom out', view('zoomOut'), { shortcut: 'Ctrl/⌘ -' }),
    c('fit', 'View', 'Fit the poster to the screen', view('fit'), { shortcut: 'Shift 0', keywords: 'zoom whole' }),
    c('preview', 'View', 'Preview full screen', open('preview'), { keywords: 'present view' }),
    c('grid', 'View', x.showGrid ? 'Hide column guides' : 'Show column guides', view('grid'), { keywords: 'grid lines' }),
    c('snap', 'View', x.snap ? 'Turn off snapping' : 'Turn on snapping', view('snap'), { keywords: 'align guides drag' }),
    c('panels', 'View', x.panelsShown ? 'Hide the side panels' : 'Show the side panels', view('panels'), { shortcut: 'Ctrl/⌘ \\' }),
    ...VISION_MODES.map((m) =>
      c('vision-' + m.id, 'View › Colour vision', m.id === 'normal' ? 'Normal colours' : `See as ${m.label.toLowerCase()}`, () => x.vision(m.id), { keywords: `colour color blind ${m.plain}` }),
    ),
    // Export
    c('pdf', 'Export', 'Download PDF for printing', () => x.exportAs('pdf'), { keywords: 'export print save' }),
    c('png', 'Export', 'Download PNG image', () => x.exportAs('png'), { keywords: 'export picture save' }),
    c('pptx', 'Export', 'Download PowerPoint', () => x.exportAs('pptx'), { keywords: 'export pptx slides save' }),
    c('project', 'Poster', 'Download project file', () => x.exportAs('project'), { keywords: 'backup save' }),
    c('copy-image', 'Export', 'Copy the poster as an image', () => x.exportAs('copyImage'), { keywords: 'clipboard paste slack email' }),
    // Help
    c('settings', 'Help', 'Settings…', open('settings'), { keywords: 'preferences dark mode theme contrast' }),
    c('shortcuts', 'Help', 'Keyboard shortcuts', open('shortcuts'), { shortcut: '?', keywords: 'keys' }),
    c('tour', 'Help', 'Take the tour', open('tour'), { keywords: 'help tutorial' }),
  ];
}

import type { MenuItem } from './ContextMenu';

/**
 * The things you can do to a whole poster. My posters cards and the editor's ⋯ menu
 * both build their menu from this list, so the two always offer the same actions.
 */
export function posterActionItems(a: { onRename?: () => void; onCopy: () => void; onDownload: () => void; onSaveTemplate: () => void; onDelete: () => void }): (MenuItem | '-')[] {
  return [
    ...(a.onRename ? [{ label: 'Rename', onClick: a.onRename }] : []),
    { label: 'Make a copy…', onClick: a.onCopy },
    { label: 'Download project file', onClick: a.onDownload },
    { label: 'Save as my template…', onClick: a.onSaveTemplate },
    '-',
    { label: 'Delete…', danger: true, onClick: a.onDelete },
  ];
}

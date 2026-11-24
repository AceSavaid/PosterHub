import { useRef, useState, type ReactNode } from 'react';
import { usePopover } from '../lib/usePopover';
import { useUiPrefs } from '../lib/uiPrefs';
import { keys } from '../lib/keys';

/**
 * The editor's "View ▾" menu: things you switch while editing (guides, snapping, colour-vision
 * preview from `children`) and which side panels show. How the app looks overall (theme, contrast,
 * interface size) lives in Settings only.
 */
export default function ViewMenu({ children }: { children?: ReactNode }) {
  const [prefs, change] = useUiPrefs();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  usePopover(open, wrap, () => setOpen(false));

  return (
    <div className="menu-wrap" ref={wrap}>
      <button className="btn ghost" title="Guides, snapping, colour-vision preview and side panels" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        View ▾
      </button>
      {open && (
        <div className="menu appearance-menu" role="dialog" aria-label="View options">
          {children}
          <div className="field-label appearance-gap">Side panels</div>
          <label className="check">
            <input type="checkbox" checked={prefs.showTools} onChange={(e) => change({ showTools: e.target.checked })} /> Show tools panel
          </label>
          <label className="check">
            <input type="checkbox" checked={prefs.showProperties} onChange={(e) => change({ showProperties: e.target.checked })} /> Show properties panel
          </label>
          <label className="check">
            <input type="checkbox" checked={prefs.swapPanels} onChange={(e) => change({ swapPanels: e.target.checked })} /> Tools on the right
          </label>
          <p className="hint">
            <kbd>{keys('Ctrl/⌘ \\')}</kbd> hides or shows both panels.
          </p>
        </div>
      )}
    </div>
  );
}

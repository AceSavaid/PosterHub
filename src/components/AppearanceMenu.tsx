import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useUiPrefs, type Theme } from '../lib/uiPrefs';

const THEMES: { id: Theme; label: string }[] = [
  { id: 'system', label: 'Auto' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

/**
 * Small popover for how the app looks to this person. `panels` adds the editor's panel options;
 * with a `label` it becomes a text button (the editor's "View" menu) and `children` go at the top.
 */
export default function AppearanceMenu({ panels = false, label, children }: { panels?: boolean; label?: string; children?: ReactNode }) {
  const [prefs, change] = useUiPrefs();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div className="menu-wrap" ref={wrap}>
      {label ? (
        <button className="btn ghost" title="Guides, snapping, theme and side panels" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {label} ▾
        </button>
      ) : (
        <button className="icon-btn" title="Appearance" aria-label="Appearance" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor" />
          </svg>
        </button>
      )}
      {open && (
        <div className="menu appearance-menu" role="dialog" aria-label={label ? `${label} options` : 'Appearance'}>
          {children}
          <div className={'field-label' + (children ? ' appearance-gap' : '')}>Theme</div>
          <div className="seg theme-seg" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={prefs.theme === t.id}
                className={prefs.theme === t.id ? 'active' : ''}
                onClick={() => change({ theme: t.id })}
                title={t.id === 'system' ? 'Match your computer’s light or dark setting' : `${t.label} theme`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {panels && (
            <>
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
                <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>\</kbd> hides or shows both panels.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { keys } from '../lib/keys';

export interface MenuItem {
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/** A small right-click menu that stays on screen and closes on outside click or Esc. */
export default function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: (MenuItem | '-')[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    setPos({ x: Math.min(x, window.innerWidth - r.width - 8), y: Math.min(y, window.innerHeight - r.height - 8) });
    ref.current!.querySelector('button')?.focus();
  }, [x, y]);

  // Give focus back to whatever had it (e.g. the poster element) when the menu closes.
  // Captured during the first render, before the menu moves focus to its first item.
  const openerRef = useRef<HTMLElement | null | undefined>(undefined);
  if (openerRef.current === undefined) openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  useEffect(() => {
    const opener = openerRef.current;
    return () => {
      const a = document.activeElement;
      if (opener?.isConnected && (!a || a === document.body || ref.current?.contains(a))) opener.focus();
    };
  }, []);

  useEffect(() => {
    // Arrow keys, Home and End move between items (and must not nudge the selected element).
    const nav = (e: KeyboardEvent) => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      if (!items.length) return;
      e.preventDefault();
      e.stopPropagation();
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[next].focus();
    };
    window.addEventListener('keydown', nav, true);
    return () => window.removeEventListener('keydown', nav, true);
  }, []);

  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof KeyboardEvent) e.stopPropagation(); // Escape closes the menu only, not the selection
      if (e.type === 'pointerdown' && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', close, true);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', close, true);
      window.removeEventListener('blur', close);
    };
  }, [onClose]);

  return (
    <div className="context-menu" role="menu" aria-label="Actions" ref={ref} style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        it === '-' ? (
          <div key={i} className="cm-sep" role="separator" />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={it.danger ? 'danger' : ''}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onClick();
            }}
          >
            <span>{it.label}</span>
            {it.shortcut && <kbd>{keys(it.shortcut)}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}

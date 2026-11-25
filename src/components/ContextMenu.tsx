import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { keys } from '../lib/keys';
import { usePopover } from '../lib/usePopover';

export interface MenuItem {
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** a submenu ("Order ▸") that opens beside this item on hover, click or →; onClick is then ignored */
  items?: (MenuItem | '-')[];
}

/** A small right-click menu that stays on screen and closes on outside click or Esc. Items with `items` open a submenu. */
export default function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: (MenuItem | '-')[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [sub, setSub] = useState<number | null>(null);

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
      const a = document.activeElement as HTMLElement | null;
      const inSub = a?.closest('.cm-sub');
      if (e.key === 'ArrowRight' && a?.getAttribute('aria-haspopup') === 'menu') {
        e.preventDefault();
        e.stopPropagation();
        a.click();
        return;
      }
      if ((e.key === 'ArrowLeft' || e.key === 'Escape') && inSub) {
        e.preventDefault();
        e.stopPropagation();
        setSub(null);
        (inSub.parentElement?.querySelector(':scope > [aria-haspopup]') as HTMLElement | null)?.focus();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      const box = inSub ?? ref.current;
      const items = Array.from(box?.querySelectorAll<HTMLElement>(inSub ? '[role="menuitem"]' : ':scope > [role="menuitem"], :scope > .cm-wrap > [role="menuitem"]') ?? []);
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

  usePopover(true, ref, onClose, { closeOnBlur: true });

  const button = (it: MenuItem, i: number) => (
    <button
      key={i}
      role="menuitem"
      className={it.danger ? 'danger' : ''}
      disabled={it.disabled}
      // pointing at another top-level item closes an open submenu; items inside the submenu leave it open
      onMouseEnter={(e) => sub !== null && !e.currentTarget.closest('.cm-sub') && setSub(null)}
      onClick={() => {
        onClose();
        it.onClick?.();
      }}
    >
      <span>{it.label}</span>
      {it.shortcut && <kbd>{keys(it.shortcut)}</kbd>}
    </button>
  );
  const list = (xs: (MenuItem | '-')[]) => xs.map((it, i) => (it === '-' ? <div key={i} className="cm-sep" role="separator" /> : button(it, i)));

  return (
    <div className="context-menu" role="menu" aria-label="Actions" ref={ref} style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        it === '-' ? (
          <div key={i} className="cm-sep" role="separator" />
        ) : it.items ? (
          <div key={i} className="cm-wrap" onMouseEnter={() => setSub(i)} onMouseLeave={() => setSub(null)}>
            <button
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={sub === i}
              disabled={it.disabled}
              onClick={() => {
                setSub(i);
                requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('.cm-sub [role="menuitem"]')?.focus());
              }}
            >
              <span>{it.label}</span>
              <span aria-hidden="true">▸</span>
            </button>
            {sub === i && <SubMenu label={it.label}>{list(it.items)}</SubMenu>}
          </div>
        ) : (
          button(it, i)
        ),
      )}
    </div>
  );
}

/** The submenu beside its item; flips to the left when there's no room on the right. */
function SubMenu({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(false);
  const [up, setUp] = useState(0);
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) setLeft(true);
    if (r.bottom > window.innerHeight - 8) setUp(r.bottom - window.innerHeight + 8);
  }, []);
  return (
    <div className={'context-menu cm-sub' + (left ? ' left' : '')} role="menu" aria-label={label} ref={ref} style={up ? { top: -5 - up } : undefined}>
      {children}
    </div>
  );
}

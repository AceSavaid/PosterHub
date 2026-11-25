import { useRef, useState, type ReactNode } from 'react';
import { usePopover } from '../lib/usePopover';

/**
 * The editor's "View ▾" menu: Preview (the poster full screen, without editing tools) and the
 * things you switch while editing (guides, snapping, colour-vision preview from `children`).
 * Side panels and how the app looks overall live in Settings.
 */
export default function ViewMenu({ children, onPreview }: { children?: ReactNode; onPreview: () => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  usePopover(open, wrap, () => setOpen(false));

  return (
    <div className="menu-wrap" ref={wrap}>
      <button className="btn ghost" title="Preview, guides, snapping and colour-vision preview" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        View ▾
      </button>
      {open && (
        <div className="menu appearance-menu" role="dialog" aria-label="View options">
          <button
            className="btn view-preview"
            title="See the poster full screen, without editing tools"
            onClick={() => {
              setOpen(false);
              onPreview();
            }}
          >
            Preview
          </button>
          {children}
        </div>
      )}
    </div>
  );
}

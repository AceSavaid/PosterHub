// A small formatting bar that floats just above the text being typed, like Canva's and
// Google Slides', so bold, size and colour are where the words are instead of across the screen.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Poster, PosterElement, TextStyle } from '../types';
import { PALETTE_ROLES } from '../model';
import { resizeSelection, styleSelection } from '../lib/richtext';
import { keys } from '../lib/keys';

interface Props {
  el: PosterElement;
  poster: Poster;
  /** the box on screen (to find where the bar goes) */
  node: HTMLElement | null;
  /** changes the whole box's style (used when no words are selected) */
  onStyle: (patch: Partial<TextStyle>) => void;
}

const GAP = 8;

/** Where the bar sits: above the selected words (or the box), flipped below when there's no room. */
export function toolbarPosition(target: { top: number; bottom: number; left: number; width: number }, bar: { width: number; height: number }, view: { width: number; height: number; top?: number }) {
  const minTop = (view.top ?? 0) + 4;
  let top = target.top - bar.height - GAP;
  if (top < minTop) top = target.bottom + GAP;
  top = Math.min(top, view.height - bar.height - 4);
  const left = Math.max(4, Math.min(target.left + target.width / 2 - bar.width / 2, view.width - bar.width - 4));
  return { top: Math.max(minTop, top), left };
}

export default function TextToolbar({ el, poster, node, onStyle }: Props) {
  const bar = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [, tick] = useState(0);
  const st = el.style!;

  // Follow the selection, scrolling and zooming.
  useEffect(() => {
    let frame = 0;
    const again = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => tick((n) => n + 1));
    };
    document.addEventListener('selectionchange', again);
    window.addEventListener('scroll', again, true);
    window.addEventListener('resize', again);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('selectionchange', again);
      window.removeEventListener('scroll', again, true);
      window.removeEventListener('resize', again);
    };
  }, []);

  useLayoutEffect(() => {
    if (!node || !bar.current) return;
    const box = node.getBoundingClientRect();
    const sel = window.getSelection();
    let target: DOMRect = box;
    if (sel && sel.rangeCount && !sel.isCollapsed && node.contains(sel.anchorNode)) {
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r.width || r.height) target = r;
    }
    // keep it below the app's top bar
    const topBar = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
    const next = toolbarPosition(target, { width: bar.current.offsetWidth, height: bar.current.offsetHeight }, { width: window.innerWidth, height: window.innerHeight, top: topBar });
    if (!pos || Math.abs(pos.top - next.top) > 0.5 || Math.abs(pos.left - next.left) > 0.5) setPos(next);
  });

  const keep = (e: React.MouseEvent) => e.preventDefault(); // keep the text selected
  const size = (f: number) => {
    if (!resizeSelection(f)) onStyle({ fontSize: Math.max(4, Math.round(st.fontSize * f * 2) / 2) });
  };
  const colour = (c: string, value: string) => {
    if (!styleSelection({ color: c })) onStyle({ color: value });
  };
  const roles = PALETTE_ROLES.filter((r) => r !== 'background' && r !== 'surface');

  return (
    <div
      ref={bar}
      className="text-toolbar"
      role="toolbar"
      aria-label="Text formatting"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      onMouseDown={keep}
    >
      <button className="fmt" title={keys('Bold (Ctrl/⌘ B)')} aria-label="Bold" onClick={() => document.execCommand('bold')}><b>B</b></button>
      <button className="fmt" title={keys('Italic (Ctrl/⌘ I)')} aria-label="Italic" onClick={() => document.execCommand('italic')}><i>I</i></button>
      <button className="fmt" title={keys('Underline (Ctrl/⌘ U)')} aria-label="Underline" onClick={() => document.execCommand('underline')}><u>U</u></button>
      <span className="sep" />
      <button className="fmt" title="Smaller text" aria-label="A− smaller text" onClick={() => size(1 / 1.15)}>A−</button>
      <button className="fmt" title="Bigger text" aria-label="A+ bigger text" onClick={() => size(1.15)}>A+</button>
      <span className="sep" />
      {roles.map((r) => (
        <button
          key={r}
          className="swatch"
          style={{ background: poster.palette[r] }}
          title={`Colour: ${r}`}
          aria-label={`Text colour ${r}`}
          onClick={() => colour(poster.palette[r], '@' + r)}
        />
      ))}
      <button className="swatch" style={{ background: '#ffffff' }} title="Colour: white" aria-label="Text colour white" onClick={() => colour('#ffffff', '#ffffff')} />
      <span className="sep" />
      <button className="fmt" title="Bullet list" aria-label="Bullet list" onClick={() => document.execCommand('insertUnorderedList')}>•≡</button>
      <button className="fmt" title="Superscript" aria-label="x² superscript" onClick={() => document.execCommand('superscript')}>x²</button>
    </div>
  );
}

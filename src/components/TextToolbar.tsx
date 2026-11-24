// A small formatting bar that floats just above the text being typed, like Canva's and
// Google Slides', so bold, size and colour are where the words are instead of across the screen.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Poster, PosterElement, TextStyle } from '../types';
import { PALETTE_ROLES } from '../model';
import { resizeSelection, styleSelection } from '../lib/richtext';
import { keys } from '../lib/keys';
import { TEXT_STYLES, styleForKey, styleNameOf, styleShortcut, type TextStyleName } from '../lib/textStyles';
import { recentChars, rememberChar, searchChars, SPECIAL_CHARS } from '../lib/specialChars';

interface Props {
  el: PosterElement;
  poster: Poster;
  /** the box on screen (to find where the bar goes) */
  node: HTMLElement | null;
  /** changes the whole box's style (used when no words are selected) */
  onStyle: (patch: Partial<TextStyle>) => void;
  /** gives the box a named text style (Heading, Normal text, …) */
  onTextStyle: (name: TextStyleName) => void;
  /** restyles every box with this box's style to look like it */
  onUpdateStyle: () => void;
  /** stop editing (focus left the box and the bar) */
  onDone: () => void;
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

export default function TextToolbar({ el, poster, node, onStyle, onTextStyle, onUpdateStyle, onDone }: Props) {
  const bar = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [, tick] = useState(0);
  const st = el.style!;
  const [menu, setMenu] = useState<'style' | 'chars' | null>(null);
  const [q, setQ] = useState('');
  const saved = useRef<Range | null>(null);
  const current = styleNameOf(el);
  const label = TEXT_STYLES.find((s) => s.name === current)?.label;

  // Ctrl/⌘ Alt 1 / 2 / 0 / 9 while typing, like Google Docs' paragraph styles.
  const styleKey = useRef(onTextStyle);
  styleKey.current = onTextStyle;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!node?.contains(document.activeElement)) return;
      const name = styleForKey(e);
      const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
      // the Docs keys for lists, sizes and super/subscript
      const cmd = name
        ? () => styleKey.current(name)
        : mod && e.shiftKey && e.code === 'Digit8'
          ? () => document.execCommand('insertUnorderedList')
          : mod && e.shiftKey && e.code === 'Digit7'
            ? () => document.execCommand('insertOrderedList')
            : mod && e.shiftKey && e.code === 'Period'
              ? () => sizeKey.current(1.15)
              : mod && e.shiftKey && e.code === 'Comma'
                ? () => sizeKey.current(1 / 1.15)
                : mod && !e.shiftKey && e.code === 'Period'
                  ? () => document.execCommand('superscript')
                  : mod && !e.shiftKey && e.code === 'Comma'
                    ? () => document.execCommand('subscript')
                    : null;
      if (!cmd) return;
      e.preventDefault();
      e.stopPropagation();
      cmd();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [node]);

  const body = () => node?.querySelector<HTMLElement>('.el-body') ?? null;
  const openChars = () => {
    const sel = window.getSelection();
    saved.current = sel && sel.rangeCount && node?.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    setQ('');
    setMenu(menu === 'chars' ? null : 'chars');
  };
  const insertChar = (ch: string) => {
    const b = body();
    if (!b) return;
    b.focus();
    const sel = window.getSelection();
    if (saved.current && sel) {
      sel.removeAllRanges();
      sel.addRange(saved.current);
    }
    document.execCommand('insertText', false, ch);
    rememberChar(ch);
    const after = window.getSelection();
    saved.current = after && after.rangeCount ? after.getRangeAt(0).cloneRange() : null;
  };
  const backToText = () => {
    setMenu(null);
    const b = body();
    if (!b) return;
    b.focus();
    const sel = window.getSelection();
    if (saved.current && sel) {
      sel.removeAllRanges();
      sel.addRange(saved.current);
    }
  };
  const found = searchChars(q);
  const recent = recentChars();

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

  // keep the text selected (the character search box is the one thing that takes focus)
  const keep = (e: React.MouseEvent) => {
    if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
  };
  const size = (f: number) => {
    if (!resizeSelection(f)) onStyle({ fontSize: Math.max(4, Math.round(st.fontSize * f * 2) / 2) });
  };
  const colour = (c: string, value: string) => {
    if (!styleSelection({ color: c })) onStyle({ color: value });
  };
  const sizeKey = useRef(size);
  sizeKey.current = size;
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
      <span className="tt-menu-wrap">
        <button
          className="fmt tt-style"
          aria-label={`Text style: ${label ?? 'none'}`}
          aria-expanded={menu === 'style'}
          title={keys('Text style: Ctrl/⌘ Alt 1 heading, Ctrl/⌘ Alt 2 subheading, Ctrl/⌘ Alt 0 normal text, Ctrl/⌘ Alt 9 caption')}
          disabled={!current}
          onClick={() => setMenu(menu === 'style' ? null : 'style')}
        >
          {label ?? 'Text'} ▾
        </button>
        {menu === 'style' && current && (
          <div className="tt-pop tt-styles" role="group" aria-label="Text styles">
            {TEXT_STYLES.map((s) => (
              <button
                key={s.name}
                className={'tt-style-item style-' + s.name}
                aria-pressed={s.name === current}
                onClick={() => {
                  setMenu(null);
                  onTextStyle(s.name);
                }}
              >
                <span>{s.label}</span>
                <kbd>{styleShortcut(s.name)}</kbd>
              </button>
            ))}
            <button
              className="tt-style-item update"
              title="Every box with this style takes this box’s font, size and colour"
              onClick={() => {
                setMenu(null);
                onUpdateStyle();
              }}
            >
              Update {label} to match
            </button>
          </div>
        )}
      </span>
      <span className="sep" />
      <button className="fmt" title={keys('Bold (Ctrl/⌘ B)')} aria-label="Bold" onClick={() => document.execCommand('bold')}><b>B</b></button>
      <button className="fmt" title={keys('Italic (Ctrl/⌘ I)')} aria-label="Italic" onClick={() => document.execCommand('italic')}><i>I</i></button>
      <button className="fmt" title={keys('Underline (Ctrl/⌘ U)')} aria-label="Underline" onClick={() => document.execCommand('underline')}><u>U</u></button>
      <span className="sep" />
      <button className="fmt" title={keys('Smaller text (Ctrl/⌘ Shift ,)')} aria-label="A− smaller text" onClick={() => size(1 / 1.15)}>A−</button>
      <button className="fmt" title={keys('Bigger text (Ctrl/⌘ Shift .)')} aria-label="A+ bigger text" onClick={() => size(1.15)}>A+</button>
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
      <button className="fmt" title={keys('Bullet list (Ctrl/⌘ Shift 8), or type “- ” at the start of a line')} aria-label="Bullet list" onClick={() => document.execCommand('insertUnorderedList')}>•≡</button>
      <button className="fmt" title={keys('Numbered list (Ctrl/⌘ Shift 7), or type “1. ” at the start of a line')} aria-label="1. Numbered list" onClick={() => document.execCommand('insertOrderedList')}>1≡</button>
      <button className="fmt" title={keys('Superscript (Ctrl/⌘ .)')} aria-label="x² superscript" onClick={() => document.execCommand('superscript')}>x²</button>
      <button className="fmt" title={keys('Subscript (Ctrl/⌘ ,)')} aria-label="x₂ subscript" onClick={() => document.execCommand('subscript')}>x₂</button>
      <span className="tt-menu-wrap">
        <button className="fmt" title="Special characters: Greek letters, ±, °, µ, arrows" aria-label="Ω special characters" aria-expanded={menu === 'chars'} onClick={openChars}>Ω</button>
        {menu === 'chars' && (
          <div className="tt-pop tt-chars" role="group" aria-label="Special characters">
            <input
              type="search"
              autoFocus
              placeholder="Search, e.g. alpha, degree, plus minus"
              aria-label="Search special characters"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && found[0]) {
                  e.preventDefault();
                  insertChar(found[0].ch);
                  backToText();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  backToText();
                }
              }}
              onBlur={(e) => {
                const to = e.relatedTarget as HTMLElement | null;
                if (to && (to.closest('.text-toolbar') || node?.contains(to))) return;
                setMenu(null);
                onDone();
              }}
            />
            {!q && recent.length > 0 && (
              <div className="tt-chars-group">
                <div className="tt-chars-head">Recently used</div>
                <div className="tt-chars-grid">
                  {recent.map((ch) => {
                    const c = SPECIAL_CHARS.find((x) => x.ch === ch)!;
                    return <button key={'r' + ch} className="tt-char" title={c.name} aria-label={`${ch} ${c.name}`} onClick={() => insertChar(ch)}>{ch}</button>;
                  })}
                </div>
              </div>
            )}
            {found.length === 0 && <p className="tt-chars-none">No character called “{q}”.</p>}
            {[...new Set(found.map((c) => c.group))].map((g) => (
              <div className="tt-chars-group" key={g}>
                <div className="tt-chars-head">{g}</div>
                <div className="tt-chars-grid">
                  {found.filter((c) => c.group === g).map((c) => (
                    <button key={c.ch} className="tt-char" title={c.name} aria-label={`${c.ch} ${c.name}`} onClick={() => insertChar(c.ch)}>{c.ch}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </span>
    </div>
  );
}

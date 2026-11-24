import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Poster, PosterElement, TableSpec } from '../types';
import { MM_TO_PX, columnLefts, columnWidth, fontStack, resolveColor, resolveFont } from '../model';
import ChartView from './ChartView';
import TableView from './TableView';
import { TYPE_NAMES } from '../lib/a11y';
import { isCropped, placeImage } from '../lib/geometry';
import { ARROW_ROTATION, POLYGONS, isPolygon } from '../lib/shapes';
import { cleanHtml } from '../lib/sanitize';
import { simplifyPastedHtml } from '../lib/paste';
import { curlQuote, dashBefore, listFor } from '../lib/autoformat';
import { loadPrefs } from '../lib/uiPrefs';
import { PT_TO_PX, layoutEquation, mathSvg, svgDataUrl, typesetLatex } from '../lib/math';
import { useMathReady } from '../lib/useMath';
import { IconBody, IconSvg } from './IconBody';
import { headingIconLayout, headingIconSpec } from '../lib/headingIcon';
import { iconArt, iconColors } from '../lib/icons/library';
import { useIconsReady } from '../lib/useIcons';

const px = (mm: number) => mm * MM_TO_PX;

interface SurfaceProps {
  poster: Poster;
  zoom: number;
  showGrid?: boolean;
  children?: ReactNode; // overlay (selection handles, guides)
  /** screen-space layer drawn next to (not inside) the poster node, so it can never end up in an export */
  outside?: ReactNode;
  renderElement: (el: PosterElement, index: number) => ReactNode;
}

/** The poster page at true size (1 mm = 3.78 px), scaled visually by `zoom`. */
export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface({ poster, zoom, showGrid, children, outside, renderElement }, ref) {
  const pal = poster.palette;
  const style: CSSProperties = {
    width: px(poster.width),
    height: px(poster.height),
    transform: `scale(${zoom})`,
    background: resolveColor('@background', pal),
    backgroundImage: poster.backgroundImage ? `url(${poster.backgroundImage})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    color: resolveColor('@text', pal),
    fontFamily: fontStack(poster.bodyFont),
    ['--zoom' as string]: zoom,
  };
  return (
    <div className="surface-scroll-size" style={{ width: px(poster.width) * zoom, height: px(poster.height) * zoom }}>
      <div className="poster" ref={ref} style={style}>
        {showGrid && <GridOverlay poster={poster} zoom={zoom} />}
        {poster.elements.map((el, i) => renderElement(el, i))}
        {children}
      </div>
      {outside}
    </div>
  );
});

function GridOverlay({ poster, zoom }: { poster: Poster; zoom: number }) {
  const lefts = columnLefts(poster);
  const w = columnWidth(poster);
  const lw = 1 / zoom;
  return (
    <div className="ui-only grid-overlay">
      <div
        className="grid-margin"
        style={{ left: px(poster.margin), top: px(poster.margin), width: px(poster.width - 2 * poster.margin), height: px(poster.height - 2 * poster.margin), borderWidth: lw }}
      />
      {lefts.map((x, i) => (
        <div key={i} className="grid-col" style={{ left: px(x), width: px(w), top: px(poster.margin), height: px(poster.height - 2 * poster.margin) }} />
      ))}
    </div>
  );
}

interface ElementProps {
  el: PosterElement;
  poster: Poster;
  editing?: boolean;
  onCommitText?: (html: string) => void;
  onCommitTable?: (t: TableSpec) => void;
  onActiveCell?: (cell: { r: number; c: number } | null) => void;
  onEditDone?: () => void;
  className?: string;
  wrapperProps?: React.HTMLAttributes<HTMLDivElement>;
}

export function ElementView({ el, poster, editing, onCommitText, onCommitTable, onActiveCell, onEditDone, className, wrapperProps }: ElementProps) {
  const pal = poster.palette;
  const box: CSSProperties = {
    left: px(el.x),
    top: px(el.y),
    width: px(el.w),
    height: px(el.h),
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
  };
  const deco: CSSProperties = {
    background: el.type === 'shape' && (el.shape === 'line' || isPolygon(el)) ? undefined : resolveColor(el.fill, pal),
    backgroundImage: el.gradient && el.shape !== 'line' && !isPolygon(el) ? el.gradient : undefined,
    borderRadius: el.shape === 'ellipse' ? '50%' : el.radius ? px(el.radius) : undefined,
    border: el.borderWidth && !isPolygon(el) ? `${el.borderWidth}pt solid ${resolveColor(el.borderColor ?? '@primary', pal)}` : undefined,
    padding: el.padding ? px(el.padding) : undefined,
  };

  let inner: ReactNode = null;
  switch (el.type) {
    case 'shape':
      if (el.shape === 'line') inner = <div className="el-line" style={{ background: resolveColor(el.fill ?? '@primary', pal) }} />;
      else if (isPolygon(el))
        inner = (
          <svg className="el-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <polygon
              points={POLYGONS[el.shape!]}
              transform={el.shape === 'arrow' ? `rotate(${ARROW_ROTATION[el.direction ?? 'right']} 50 50)` : undefined}
              fill={resolveColor(el.fill, pal)}
              stroke={el.borderWidth ? resolveColor(el.borderColor ?? '@primary', pal) : 'none'}
              strokeWidth={el.borderWidth ? (el.borderWidth * 96) / 72 : 0}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          </svg>
        );
      break;
    case 'image':
      inner = el.src ? (
        isCropped(el.crop) ? (
          <CroppedImage el={el} />
        ) : (
          <img src={el.src} alt={el.alt ?? ""} draggable={false} style={{ objectFit: el.fit ?? 'contain', imageRendering: el.qr ? 'pixelated' : undefined }} />
        )
      ) : (
        <div className="img-placeholder ui-only">
          <span>{el.placeholder ?? 'Image'}</span>
          <small>Double-click or press Enter to choose, or drop / paste an image</small>
        </div>
      );
      break;
    case 'chart': {
      const pad = el.padding ?? 0;
      inner = el.chart ? (
        <ChartView
          id={el.id}
          spec={el.chart}
          palette={pal}
          font={resolveFont('@body', poster)}
          textColor={resolveColor('@text', pal)}
          widthPx={px(el.w - 2 * pad) - (el.borderWidth ? (el.borderWidth * 96) / 72 * 2 : 0)}
          heightPx={px(el.h - 2 * pad) - (el.borderWidth ? (el.borderWidth * 96) / 72 * 2 : 0)}
        />
      ) : (
        <div className="img-placeholder ui-only">
          <span>Chart</span>
          <small>Double-click or press Enter to load a CSV</small>
        </div>
      );
      break;
    }
    case 'table':
      inner = <TableView el={el} poster={poster} editing={!!editing} onCommit={onCommitTable} onDone={onEditDone} onActiveCell={onActiveCell} />;
      break;
    case 'equation': {
      const inset = 2 * px(el.padding ?? 0) + (el.borderWidth ? ((el.borderWidth * 96) / 72) * 2 : 0);
      inner = <EquationBody el={el} poster={poster} widthPx={px(el.w) - inset} heightPx={px(el.h) - inset} />;
      break;
    }
    case 'icon':
      inner = <IconBody el={el} poster={poster} />;
      break;
    default: {
      const end = headingIconLayout(el);
      inner = (
        <>
          <TextBody el={el} poster={poster} editing={!!editing} onCommit={onCommitText} onDone={onEditDone} reserve={end} />
          {end && <HeadingIcon el={el} poster={poster} />}
        </>
      );
    }
  }

  return (
    <div {...wrapperProps} className={`el el-${el.type} ${className ?? ''}`} style={{ ...box, ...deco }} data-id={el.id}>
      {inner}
    </div>
  );
}

/** A typeset equation, drawn as a crisp SVG picture laid out exactly like the PDF export. */
export function EquationBody({ el, poster, widthPx, heightPx }: { el: PosterElement; poster: Poster; widthPx: number; heightPx: number }) {
  const ready = useMathReady();
  const eq = el.equation;
  if (!eq) return null;
  if (!ready) return <div className="el-math-loading ui-only">Loading equation…</div>;
  const res = typesetLatex(eq.latex);
  if (!res.ok) {
    return (
      <div className="el-math-error ui-only" role="alert">
        <strong>Equation needs fixing</strong>
        <span>{res.error}</span>
      </div>
    );
  }
  const r = res.render;
  const at = layoutEquation(r, eq.fontSize * PT_TO_PX, { x: 0, y: 0, w: Math.max(0, widthPx), h: Math.max(0, heightPx) }, eq.align);
  const color = resolveColor(eq.color, poster.palette);
  return (
    <div className="el-math" data-scale={at.scale.toFixed(3)}>
      <img
        src={svgDataUrl(mathSvg(r, color, at.w, at.h))}
        alt={eq.latex}
        title={eq.latex}
        draggable={false}
        style={{ left: at.x, top: at.y, width: at.w, height: at.h }}
      />
    </div>
  );
}

/** The icon at the end of a heading: against the right-hand edge, or right after the last word (see lib/headingIcon). */
function HeadingIcon({ el, poster }: { el: PosterElement; poster: Poster }) {
  const ready = useIconsReady();
  const ref = useRef<HTMLSpanElement>(null);
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);
  const at = headingIconLayout(el);
  const spec = headingIconSpec(el);
  const after = at?.place === 'after';

  // "After the words" follows the laid-out text, so measure it after every change,
  // while typing, and again once web fonts have loaded.
  useLayoutEffect(() => {
    const span = ref.current;
    const box = span?.parentElement;
    const body = box?.querySelector<HTMLElement>('.el-body');
    if (!after || !at || !box || !body) {
      if (spot) setSpot(null);
      return;
    }
    let live = true;
    const measure = () => {
      if (!live) return;
      const s = afterTheWords(el, box, body, at);
      setSpot((prev) => (prev && s && Math.abs(prev.x - s.x) < 0.5 && Math.abs(prev.y - s.y) < 0.5 ? prev : s));
    };
    measure();
    body.addEventListener('input', measure);
    document.fonts?.ready.then(measure, () => {});
    return () => {
      live = false;
      body.removeEventListener('input', measure);
    };
  });

  const art = ready && el.headingIcon ? iconArt(el.headingIcon.id) : undefined;
  if (!at || !spec || at.size <= 0) return null;
  const pad = px(el.padding ?? 0);
  const where = after && spot ? spot : at;
  return (
    <span
      ref={ref}
      className="el-heading-icon"
      data-icon={el.headingIcon!.id}
      data-place={after && spot ? 'after' : 'end'}
      style={{ left: pad + where.x, top: pad + where.y, width: at.size, height: at.size }}
    >
      {art && <IconSvg art={art} colors={iconColors(spec, poster.palette)} />}
    </span>
  );
}

/** Just after the last word of the heading, centred on that word's line, in px inside the border and padding. */
function afterTheWords(el: PosterElement, box: HTMLElement, body: HTMLElement, at: { size: number; gap: number }) {
  if (el.rotation) return null; // turned boxes can't be measured on screen; the icon goes to the edge instead
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent?.trim()) last = n as Text;
  if (!last) return null;
  const range = document.createRange();
  const text = last.textContent!;
  const end = text.trimEnd().length;
  range.setStart(last, Math.max(0, end - 1));
  range.setEnd(last, end);
  const rects = range.getClientRects();
  const r = rects[rects.length - 1];
  if (!r) return null;
  const b = box.getBoundingClientRect();
  const k = box.offsetWidth ? b.width / box.offsetWidth : 1;
  const inset = px(el.padding ?? 0) + ((el.borderWidth ?? 0) * 96) / 72;
  const contentW = box.offsetWidth - 2 * inset;
  const right = (r.right - b.left) / k - inset;
  const mid = ((r.top + r.bottom) / 2 - b.top) / k - inset;
  return { x: Math.max(0, Math.min(right + at.gap, contentW - at.size)), y: mid - at.size / 2 };
}

function TextBody({ el, poster, editing, onCommit, onDone, reserve }: { el: PosterElement; poster: Poster; editing: boolean; onCommit?: (html: string) => void; onDone?: () => void; reserve?: { reserve: number; reserveLeft: number } | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const st = el.style!;
  const pal = poster.palette;

  // Content is managed imperatively so React never fights the caret while typing.
  const filled = useRef(false);
  const plainNext = useRef(false);
  useLayoutEffect(() => {
    // Fill on first mount (even if it starts in editing mode), then only while not typing.
    if (ref.current && (!editing || !filled.current)) {
      const html = cleanHtml(el.html);
      if (ref.current.innerHTML !== html) ref.current.innerHTML = html;
    }
    filled.current = true;
  }, [el.html, editing]);

  // Flag boxes whose text is cut off, so the editor can show a warning.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (node.parentElement) node.parentElement.dataset.overflow = String(node.scrollHeight > node.clientHeight + 1);
  });

  // Lists from "- " or "1. ", curly quotes and en dashes while typing (Settings can turn this off).
  useEffect(() => {
    const node = ref.current;
    if (!editing || !node) return;
    const onBefore = (ev: InputEvent) => {
      if (ev.inputType !== 'insertText' || !ev.data || !loadPrefs().autoFormat) return;
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
      const at = sel.getRangeAt(0);
      const t = at.startContainer;
      if (t.nodeType !== Node.TEXT_NODE || !node.contains(t)) return;
      const before = (t.textContent ?? '').slice(0, at.startOffset);
      const select = (from: number, to: number) => {
        const r = document.createRange();
        r.setStart(t, from);
        r.setEnd(t, to);
        sel.removeAllRanges();
        sel.addRange(r);
      };
      if (ev.data === '"' || ev.data === "'") {
        ev.preventDefault();
        document.execCommand('insertText', false, curlQuote(before.slice(-1), ev.data));
      } else if (ev.data === ' ') {
        const prev = t.previousSibling;
        const lineStart = (!prev || prev.nodeName === 'BR') && !(t.parentElement?.closest('li'));
        const list = lineStart ? listFor(before) : null;
        if (!list) return;
        ev.preventDefault();
        select(0, before.length);
        document.execCommand('delete');
        document.execCommand(list === 'ul' ? 'insertUnorderedList' : 'insertOrderedList');
      } else if (dashBefore(before, ev.data)) {
        ev.preventDefault();
        select(before.length - 1, before.length);
        document.execCommand('insertText', false, '\u2013' + ev.data);
      }
    };
    node.addEventListener('beforeinput', onBefore);
    return () => node.removeEventListener('beforeinput', onBefore);
  }, [editing]);

  useEffect(() => {
    const node = ref.current;
    if (!editing || !node) return;
    node.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing]);

  const style: CSSProperties = {
    fontFamily: fontStack(resolveFont(st.fontFamily, poster)),
    fontSize: `${st.fontSize}pt`,
    color: resolveColor(st.color, pal),
    fontWeight: st.bold ? 700 : 400,
    fontStyle: st.italic ? 'italic' : 'normal',
    textDecoration: st.underline ? 'underline' : 'none',
    textAlign: st.align,
    lineHeight: st.lineHeight,
    paddingRight: reserve?.reserve || undefined,
    paddingLeft: reserve?.reserveLeft || undefined,
  };

  return (
    <div
      ref={ref}
      className="el-body"
      style={style}
      contentEditable={editing}
      role={editing ? 'textbox' : undefined}
      aria-multiline={editing || undefined}
      aria-label={editing ? `Editing ${TYPE_NAMES[el.type].toLowerCase()}. Press Escape when done.` : undefined}
      suppressContentEditableWarning
      spellCheck={editing}
      onBlur={(e) => {
        if (!editing) return;
        const html = ref.current?.innerHTML ?? '';
        if (html !== el.html) onCommit?.(html);
        // typing in the formatting bar (e.g. searching special characters) keeps the box open
        if (e.relatedTarget instanceof HTMLElement && e.relatedTarget.closest('.text-toolbar')) return;
        onDone?.();
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyV') plainNext.current = true;
        if (e.key === 'Escape') {
          e.preventDefault();
          const box = e.currentTarget.parentElement as HTMLElement | null;
          (e.currentTarget as HTMLElement).blur();
          // Hand focus back to the element itself so keyboard users can carry on from here.
          if (box?.classList.contains('el')) box.focus();
        }
        e.stopPropagation();
      }}
      onPaste={(e) => {
        // Like Docs: Ctrl/⌘ V keeps bold, italic, lists and line breaks in the poster's own font;
        // Ctrl/⌘ Shift V pastes the words only.
        const plain = plainNext.current;
        plainNext.current = false;
        const text = e.clipboardData.getData('text/plain');
        const html = plain ? '' : e.clipboardData.getData('text/html');
        if (!text && !html) return;
        e.preventDefault();
        e.stopPropagation();
        const simple = html ? simplifyPastedHtml(html) : '';
        if (simple) document.execCommand('insertHTML', false, simple);
        else document.execCommand('insertText', false, text);
      }}
    />
  );
}

/** An image showing only its crop region, placed in the box by its fit setting. */
function CroppedImage({ el }: { el: PosterElement }) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const pad = (el.padding ?? 0) * MM_TO_PX;
  const inset = 2 * (pad + ((el.borderWidth ?? 0) * 96) / 72);
  const boxW = Math.max(1, px(el.w) - inset);
  const boxH = Math.max(1, px(el.h) - inset);
  const { region, image } = natural ? placeImage(boxW, boxH, natural.w, natural.h, el.fit ?? 'contain', el.crop) : { region: { x: 0, y: 0, w: boxW, h: boxH }, image: { x: 0, y: 0, w: boxW, h: boxH } };
  return (
    <div className="crop-box" style={{ left: pad + region.x, top: pad + region.y, width: region.w, height: region.h }}>
      <img
        src={el.src}
        alt={el.alt ?? ""}
        draggable={false}
        onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        style={{ position: 'absolute', left: image.x - region.x, top: image.y - region.y, width: image.w, height: image.h, maxWidth: 'none', visibility: natural ? 'visible' : 'hidden' }}
      />
    </div>
  );
}

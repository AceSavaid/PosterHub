import { forwardRef, useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import type { Poster, PosterElement } from '../types';
import { MM_TO_PX, columnLefts, columnWidth, fontStack, resolveColor, resolveFont } from '../model';
import ChartView from './ChartView';

const px = (mm: number) => mm * MM_TO_PX;

interface SurfaceProps {
  poster: Poster;
  zoom: number;
  showGrid?: boolean;
  children?: ReactNode; // overlay (selection handles, guides)
  renderElement: (el: PosterElement, index: number) => ReactNode;
}

/** The poster page at true size (1 mm = 3.78 px), scaled visually by `zoom`. */
export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface({ poster, zoom, showGrid, children, renderElement }, ref) {
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
  };
  return (
    <div className="surface-scroll-size" style={{ width: px(poster.width) * zoom, height: px(poster.height) * zoom }}>
      <div className="poster" ref={ref} style={style}>
        {showGrid && <GridOverlay poster={poster} zoom={zoom} />}
        {poster.elements.map((el, i) => renderElement(el, i))}
        {children}
      </div>
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
  onEditDone?: () => void;
  className?: string;
  wrapperProps?: React.HTMLAttributes<HTMLDivElement>;
}

export function ElementView({ el, poster, editing, onCommitText, onEditDone, className, wrapperProps }: ElementProps) {
  const pal = poster.palette;
  const box: CSSProperties = {
    left: px(el.x),
    top: px(el.y),
    width: px(el.w),
    height: px(el.h),
  };
  const deco: CSSProperties = {
    background: el.type !== 'shape' || el.shape !== 'line' ? resolveColor(el.fill, pal) : undefined,
    borderRadius: el.shape === 'ellipse' ? '50%' : el.radius ? px(el.radius) : undefined,
    border: el.borderWidth ? `${el.borderWidth}pt solid ${resolveColor(el.borderColor ?? '@primary', pal)}` : undefined,
    padding: el.padding ? px(el.padding) : undefined,
  };

  let inner: ReactNode = null;
  switch (el.type) {
    case 'shape':
      inner = el.shape === 'line' ? <div className="el-line" style={{ background: resolveColor(el.fill ?? '@primary', pal) }} /> : null;
      break;
    case 'image':
      inner = el.src ? (
        <img src={el.src} alt="" draggable={false} style={{ objectFit: el.fit ?? 'contain' }} />
      ) : (
        <div className="img-placeholder ui-only">
          <span>Image</span>
          <small>Double-click to choose, or drop / paste an image</small>
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
          <small>Double-click to load a CSV</small>
        </div>
      );
      break;
    }
    default:
      inner = <TextBody el={el} poster={poster} editing={!!editing} onCommit={onCommitText} onDone={onEditDone} />;
  }

  return (
    <div {...wrapperProps} className={`el el-${el.type} ${className ?? ''}`} style={{ ...box, ...deco }} data-id={el.id}>
      {inner}
    </div>
  );
}

function TextBody({ el, poster, editing, onCommit, onDone }: { el: PosterElement; poster: Poster; editing: boolean; onCommit?: (html: string) => void; onDone?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const st = el.style!;
  const pal = poster.palette;

  // Content is managed imperatively so React never fights the caret while typing.
  useLayoutEffect(() => {
    if (ref.current && !editing && ref.current.innerHTML !== (el.html ?? '')) ref.current.innerHTML = el.html ?? '';
  }, [el.html, editing]);

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
  };

  return (
    <div
      ref={ref}
      className="el-body"
      style={style}
      contentEditable={editing}
      suppressContentEditableWarning
      spellCheck={editing}
      onBlur={() => {
        if (!editing) return;
        const html = ref.current?.innerHTML ?? '';
        if (html !== el.html) onCommit?.(html);
        onDone?.();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
        e.stopPropagation();
      }}
      onPaste={(e) => {
        // Paste as clean text (keeps the poster's styling) — formatting can be reapplied with B / I / U.
        const text = e.clipboardData.getData('text/plain');
        if (!text) return;
        e.preventDefault();
        e.stopPropagation();
        document.execCommand('insertText', false, text);
      }}
    />
  );
}

import { forwardRef, useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import type { Poster, PosterElement, TableSpec } from '../types';
import { MM_TO_PX, columnLefts, columnWidth, fontStack, resolveColor, resolveFont } from '../model';
import ChartView from './ChartView';
import TableView from './TableView';
import { ARROW_ROTATION, POLYGONS, isPolygon } from '../lib/shapes';
import { cleanHtml } from '../lib/sanitize';
import { PT_TO_PX, layoutEquation, mathSvg, svgDataUrl, typesetLatex } from '../lib/math';
import { useMathReady } from '../lib/useMath';

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
        <img src={el.src} alt="" draggable={false} style={{ objectFit: el.fit ?? 'contain', imageRendering: el.qr ? 'pixelated' : undefined }} />
      ) : (
        <div className="img-placeholder ui-only">
          <span>{el.placeholder ?? 'Image'}</span>
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
    case 'table':
      inner = <TableView el={el} poster={poster} editing={!!editing} onCommit={onCommitTable} onDone={onEditDone} onActiveCell={onActiveCell} />;
      break;
    case 'equation': {
      const inset = 2 * px(el.padding ?? 0) + (el.borderWidth ? ((el.borderWidth * 96) / 72) * 2 : 0);
      inner = <EquationBody el={el} poster={poster} widthPx={px(el.w) - inset} heightPx={px(el.h) - inset} />;
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

function TextBody({ el, poster, editing, onCommit, onDone }: { el: PosterElement; poster: Poster; editing: boolean; onCommit?: (html: string) => void; onDone?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const st = el.style!;
  const pal = poster.palette;

  // Content is managed imperatively so React never fights the caret while typing.
  const filled = useRef(false);
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

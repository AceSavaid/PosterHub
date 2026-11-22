import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Poster } from '../types';
import { MM_TO_PX } from '../model';
import { ElementView, Surface } from './Surface';
import { DISTANCES, distanceZoom, hardToReadAt, readablePtAt } from '../lib/distance';
import { VISION_MODES, type VisionMode } from '../lib/colorVision';
import { VisionFilters, visionFilter } from './VisionFilters';
import { type Box, type View, clampView, fitView, panBy, pinch, toggleZoom, zoomAt } from '../lib/panZoom';

/**
 * Read-only presentation of the poster, fitted to the screen, for showing it at a conference or checking it on a phone.
 * Pinch (or Ctrl + scroll) zooms, a finger or the mouse drags it around, and a double-tap (or a click) zooms in on
 * that spot, then back out to fit. No editing tools are shown.
 */
interface Props {
  poster: Poster;
  onClose: () => void;
  vision?: VisionMode;
  onVision?: (m: VisionMode) => void;
}

/** a press that moves less than this is a tap/click, not a drag */
const TAP_SLOP = 8;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_GAP = 40;
const PAD = 24;

interface Pt {
  x: number;
  y: number;
}

const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export default function ViewMode({ poster, onClose, vision = 'normal', onVision }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.2);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ scale: 1, x: PAD, y: PAD });
  const viewRef = useRef(view);
  viewRef.current = view;
  /** metres; 0 = fit to screen */
  const [distance, setDistance] = useState(0);
  const [markSmall, setMarkSmall] = useState(true);
  const [touch] = useState(coarse);

  const posterW = poster.width * MM_TO_PX;
  const posterH = poster.height * MM_TO_PX;
  const box: Box = useMemo(() => ({ w: posterW * fit, h: posterH * fit, stageW: stage.w, stageH: stage.h }), [posterW, posterH, fit, stage]);
  const boxRef = useRef(box);
  boxRef.current = box;

  useEffect(() => {
    const calc = () => {
      const el = stageRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const z = Math.max(0.02, Math.min((w - 2 * PAD) / posterW, (h - 2 * PAD) / posterH));
      setFit(z);
      setStage({ w, h });
    };
    calc();
    window.addEventListener('resize', calc);
    // the stage also changes size when the distance note comes and goes, or the bar wraps
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(calc) : null;
    if (stageRef.current) ro?.observe(stageRef.current);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('resize', calc);
      window.removeEventListener('keydown', key);
      ro?.disconnect();
    };
  }, [posterW, posterH, onClose]);

  // A new screen size (phone rotated, window resized) keeps the zoom but keeps the poster on screen.
  const lastFit = useRef(0);
  useEffect(() => {
    if (!stage.w) return;
    setView((v) => (lastFit.current === 0 || v.scale <= 1.001 ? fitView(box) : clampView(v, box)));
    lastFit.current = fit;
  }, [box, fit, stage.w]);

  // ---- gestures (fit mode only; the distance preview is a fixed size you scroll around)
  const pointers = useRef(new Map<number, Pt>());
  /** set the view now (not on the next render), so a finger lifted straight after a move starts from the right place */
  const show = (v: View) => {
    viewRef.current = v;
    setView(v);
  };
  const gesture = useRef<{ start: View; origin: Pt; d0: number; moved: boolean; multi: boolean } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const mid = (): { m: Pt; d: number } => {
    const [a, b] = [...pointers.current.values()];
    return { m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  /** (re)start the gesture from the current view and fingers, so adding or lifting a finger never makes the poster jump */
  const restart = (v: View, moved: boolean, multi: boolean) => {
    const pts = [...pointers.current.values()];
    if (pts.length === 0) return (gesture.current = null);
    if (pts.length >= 2) {
      const { m, d } = mid();
      gesture.current = { start: v, origin: m, d0: d, moved, multi: true };
    } else gesture.current = { start: v, origin: pts[0], d0: 0, moved, multi };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (distance || (e.pointerType === 'mouse' && e.button !== 0)) return;
    stageRef.current?.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    restart(viewRef.current, gesture.current?.moved ?? false, pointers.current.size > 1);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, local(e));
    const g = gesture.current;
    if (pointers.current.size >= 2) {
      const { m, d } = mid();
      g.moved = true;
      show(pinch(g.start, g.d0, g.origin.x, g.origin.y, d, m.x, m.y, boxRef.current));
    } else {
      const p = local(e);
      const dx = p.x - g.origin.x;
      const dy = p.y - g.origin.y;
      if (!g.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
      g.moved = true;
      show(panBy(g.start, dx, dy, boxRef.current));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const g = gesture.current;
    const p = local(e);
    pointers.current.delete(e.pointerId);
    if (e.type === 'pointerup' && g && !g.moved && !g.multi && pointers.current.size === 0) tap(p, e.pointerType);
    restart(viewRef.current, true, true);
  };

  const tap = (p: Pt, kind: string) => {
    if (kind === 'mouse') return setView((v) => toggleZoom(v, p.x, p.y, boxRef.current));
    const last = lastTap.current;
    const now = performance.now();
    if (last && now - last.t < DOUBLE_TAP_MS && Math.hypot(p.x - last.x, p.y - last.y) < DOUBLE_TAP_GAP) {
      lastTap.current = null;
      setView((v) => toggleZoom(v, p.x, p.y, boxRef.current));
    } else lastTap.current = { t: now, x: p.x, y: p.y };
  };

  // Wheel: Ctrl/⌘ + scroll (and trackpad pinch, which arrives as Ctrl + wheel) zooms; plain scroll moves a zoomed poster.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || distance) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      const unit = e.deltaMode === 1 ? 16 : 1;
      if (e.ctrlKey || e.metaKey) setView((v) => zoomAt(v, Math.exp(-e.deltaY * unit * 0.01), p.x, p.y, boxRef.current));
      else setView((v) => panBy(v, -e.deltaX * unit, -e.deltaY * unit, boxRef.current));
    };
    // Safari's own pinch-to-zoom of the whole page
    const noGesture = (e: Event) => e.preventDefault();
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('gesturestart', noGesture);
    return () => {
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('gesturestart', noGesture);
    };
  }, [distance]);

  const zoomBy = useCallback((f: number) => setView((v) => zoomAt(v, f, boxRef.current.stageW / 2, boxRef.current.stageH / 2, boxRef.current)), []);
  const reset = useCallback(() => setView(fitView(boxRef.current)), []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (distance) return;
    const step = 60;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (e.key === '+' || e.key === '=') zoomBy(1.25);
    else if (e.key === '-' || e.key === '_') zoomBy(0.8);
    else if (e.key === '0') reset();
    else if (moves[e.key] && view.scale > 1) setView((v) => panBy(v, ...moves[e.key], boxRef.current));
    else return;
    e.preventDefault();
  };

  const small = useMemo(() => (distance && markSmall ? hardToReadAt(poster, distance) : new Set<string>()), [poster, distance, markSmall]);
  // The poster itself is drawn once at fit size; zooming only changes a CSS transform, so pinching stays smooth.
  const surfaceZoom = distance ? distanceZoom(distance) : fit;
  const surface = useMemo(
    () => <Surface poster={poster} zoom={surfaceZoom} renderElement={(el) => <ElementView key={el.id} el={el} poster={poster} className={small.has(el.id) ? 'too-small' : undefined} />} />,
    [poster, surfaceZoom, small],
  );

  const zoomedIn = view.scale > 1.01;
  // iPhones can't put a page element full screen, so the button only shows where it works
  const canFullscreen = document.fullscreenEnabled !== false && typeof document.documentElement.requestFullscreen === 'function';
  const hint = distance
    ? `As seen from ${distance} m away`
    : touch
      ? 'Pinch to zoom · double-tap to zoom in or out'
      : 'Click to zoom · drag to move · Ctrl + scroll to zoom · Esc to exit';

  return (
    <div className="view-mode" ref={ref}>
      <div className="view-bar">
        <span className="view-name">{poster.name}</span>
        <span className="muted view-hint">{hint}</span>
        {!distance && (
          <span className="view-zoom" role="group" aria-label="Zoom">
            <button className="btn" aria-label="Zoom out" title="Zoom out (−)" disabled={!zoomedIn} onClick={() => zoomBy(0.8)}>
              −
            </button>
            <button className="btn" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomBy(1.25)}>
              +
            </button>
            <button className="btn" title="Fit the whole poster on screen (0)" disabled={!zoomedIn} onClick={reset}>
              Fit
            </button>
          </span>
        )}
        <label className="view-distance">
          <span className="view-distance-label">Viewing distance</span>
          <select aria-label="Viewing distance" value={distance} onChange={(e) => setDistance(+e.target.value)}>
            <option value={0}>Fit to screen</option>
            {DISTANCES.map((d) => (
              <option key={d} value={d}>
                From {d} m
              </option>
            ))}
          </select>
        </label>
        {onVision && (
          <select className="vision-select" aria-label="See the poster as" value={vision} onChange={(e) => onVision(e.target.value as VisionMode)}>
            {VISION_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === 'normal' ? 'Normal colours' : `${m.label} (${m.plain.split(',')[0].toLowerCase()})`}
              </option>
            ))}
          </select>
        )}
        {canFullscreen && (
          <button className="btn view-fullscreen" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : ref.current?.requestFullscreen())}>
            Full screen
          </button>
        )}
        <button className="btn primary" onClick={onClose}>
          Back to editing
        </button>
      </div>
      <VisionFilters />
      {distance > 0 && (
        <div className="distance-note" role="status">
          <span>
            Sit about an arm's length (60 cm) from your screen. From {distance} m, text under {readablePtAt(distance)} pt is hard to read
            {small.size ? `: ${small.size} ${small.size === 1 ? 'box is' : 'boxes are'} marked.` : markSmall ? '. Everything here is big enough.' : '.'}
          </span>
          <label>
            <input type="checkbox" checked={markSmall} onChange={(e) => setMarkSmall(e.target.checked)} /> Mark small text
          </label>
        </div>
      )}
      <div
        ref={stageRef}
        className={'view-stage' + (distance ? ' distance' : ' pan-zoom' + (zoomedIn ? ' zoomed' : ''))}
        tabIndex={0}
        role="region"
        aria-label="Poster preview"
        aria-roledescription={distance ? undefined : 'zoomable poster'}
        style={{ filter: visionFilter(vision) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {distance ? (
          surface
        ) : (
          <div className="pan-layer" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }} data-scale={view.scale.toFixed(3)}>
            {surface}
          </div>
        )}
      </div>
    </div>
  );
}

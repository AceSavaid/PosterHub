import { useEffect, useRef, useState } from 'react';
import type { CropRect, PosterElement } from '../types';
import { FULL_CROP, clampCrop, type Handle } from '../lib/geometry';

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const MAX_W = 640;
const MAX_H = 440;

type Shape = 'free' | 'original' | 'box' | '1' | '4/3' | '3/4' | '16/9';
const SHAPES: { id: Shape; label: string }[] = [
  { id: 'free', label: 'Free' },
  { id: 'box', label: 'Fit the box' },
  { id: 'original', label: 'Original' },
  { id: '1', label: 'Square' },
  { id: '4/3', label: '4:3' },
  { id: '3/4', label: '3:4' },
  { id: '16/9', label: '16:9' },
];

interface Props {
  el: PosterElement;
  /** ratio = width / height of the kept part, in image pixels */
  onApply: (crop: CropRect | undefined, resizeBox: boolean, ratio: number) => void;
  onCancel: () => void;
}

/** Drag the frame (or its handles) over the picture to choose the part to show. */
export default function CropDialog({ el, onApply, onCancel }: Props) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<CropRect>(el.crop ?? FULL_CROP);
  const [shape, setShape] = useState<Shape>('free');
  const [resizeBox, setResizeBox] = useState(el.fit !== 'cover');
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = el.src!;
  }, [el.src]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onCancel]);

  const k = natural ? Math.min(MAX_W / natural.w, MAX_H / natural.h, 1.5) : 1;
  const dispW = natural ? natural.w * k : MAX_W;
  const dispH = natural ? natural.h * k : MAX_H;

  /** Target width/height ratio in image pixels, or null for free. */
  function ratioFor(s: Shape): number | null {
    if (!natural) return null;
    if (s === 'free') return null;
    if (s === 'original') return natural.w / natural.h;
    if (s === 'box') return el.w / el.h;
    const [a, b = '1'] = s.split('/');
    return +a / +b;
  }

  /** Largest crop of the given ratio centred on the current one. */
  function applyShape(s: Shape) {
    setShape(s);
    const r = ratioFor(s);
    if (!r || !natural) return;
    const cx = crop.x + crop.w / 2;
    const cy = crop.y + crop.h / 2;
    // fractions: w*nw / (h*nh) = r
    let w = 1;
    let h = (natural.w / r) / natural.h;
    if (h > 1) {
      h = 1;
      w = (r * natural.h) / natural.w;
    }
    setCrop(clampCrop({ x: cx - w / 2, y: cy - h / 2, w, h }));
  }

  function startDrag(e: React.PointerEvent, handle?: Handle) {
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY };
    const orig = crop;
    const r = ratioFor(shape);
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / dispW;
      const dy = (ev.clientY - start.y) / dispH;
      if (!handle) return setCrop(clampCrop({ ...orig, x: orig.x + dx, y: orig.y + dy }));
      let { x, y, w, h } = orig;
      if (handle.includes('e')) w = orig.w + dx;
      if (handle.includes('w')) (w = orig.w - dx), (x = orig.x + dx);
      if (handle.includes('s')) h = orig.h + dy;
      if (handle.includes('n')) (h = orig.h - dy), (y = orig.y + dy);
      if (r && natural) {
        // keep the chosen shape: follow whichever side moved, fix the other
        const fromW = (w * natural.w) / r / natural.h;
        if (handle === 'n' || handle === 's') {
          const nw = (h * natural.h * r) / natural.w;
          x = orig.x + (orig.w - nw) / 2;
          w = nw;
        } else {
          if (handle.includes('n')) y = orig.y + orig.h - fromW;
          else if (!handle.includes('s')) y = orig.y + (orig.h - fromW) / 2;
          h = fromW;
        }
      }
      if (w < 0.02 || h < 0.02 || x < -0.001 || y < -0.001 || x + w > 1.001 || y + h > 1.001) return;
      setCrop(clampCrop({ x, y, w, h }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  const pxW = natural ? Math.round(crop.w * natural.w) : 0;
  const pxH = natural ? Math.round(crop.h * natural.h) : 0;
  const dpi = pxW ? Math.round(pxW / (el.w / 25.4)) : 0;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal wide crop-dialog" role="dialog" aria-label="Crop image">
        <h2>Crop image</h2>
        <div className="seg crop-shapes">
          {SHAPES.map((s) => (
            <button key={s.id} type="button" className={shape === s.id ? 'active' : ''} onClick={() => applyShape(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="crop-stage-wrap">
          <div className="crop-stage" ref={stage} style={{ width: dispW, height: dispH }}>
            <img src={el.src} alt="" draggable={false} style={{ width: dispW, height: dispH }} />
            {natural && (
              <div
                className="crop-frame"
                data-testid="crop-frame"
                style={{ left: crop.x * dispW, top: crop.y * dispH, width: crop.w * dispW, height: crop.h * dispH }}
                onPointerDown={(e) => startDrag(e)}
              >
                <div className="crop-thirds" />
                {HANDLES.map((h) => (
                  <div key={h} className={'handle h-' + h} data-handle={h} onPointerDown={(e) => startDrag(e, h)} />
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="muted small">
          {natural ? `Keeping ${pxW} × ${pxH} pixels` : 'Loading image…'}
          {dpi > 0 && ` · about ${dpi} dpi at its current size on the poster${dpi < 150 ? ' (may print blurry)' : ''}`}
        </p>
        <label className="check">
          <input type="checkbox" checked={resizeBox} onChange={(e) => setResizeBox(e.target.checked)} /> Change the box's height to match the cropped picture
        </label>
        <div className="modal-actions">
          <button className="btn" onClick={() => setCrop(FULL_CROP)}>Reset</button>
          <span className="spacer" />
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={!natural} onClick={() => onApply(crop.w > 0.999 && crop.h > 0.999 ? undefined : crop, resizeBox, natural ? (crop.w * natural.w) / (crop.h * natural.h) : el.w / el.h)}>
            Apply crop
          </button>
        </div>
      </div>
    </div>
  );
}

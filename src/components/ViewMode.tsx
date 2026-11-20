import { useEffect, useRef, useState } from 'react';
import type { Poster } from '../types';
import { MM_TO_PX } from '../model';
import { ElementView, Surface } from './Surface';
import { VISION_MODES, type VisionMode } from '../lib/colorVision';
import { VisionFilters, visionFilter } from './VisionFilters';

/** Read-only presentation of the poster, fitted to the screen. Click to toggle 100% zoom. */
interface Props {
  poster: Poster;
  onClose: () => void;
  vision?: VisionMode;
  onVision?: (m: VisionMode) => void;
}

export default function ViewMode({ poster, onClose, vision = 'normal', onVision }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.2);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const calc = () => {
      const el = ref.current;
      if (!el) return;
      const z = Math.min((el.clientWidth - 48) / (poster.width * MM_TO_PX), (el.clientHeight - 48) / (poster.height * MM_TO_PX));
      setFit(Math.max(0.02, z));
    };
    calc();
    window.addEventListener('resize', calc);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('resize', calc);
      window.removeEventListener('keydown', key);
    };
  }, [poster, onClose]);

  const zoom = zoomed ? Math.max(fit * 3, 0.5) : fit;

  return (
    <div className="view-mode" ref={ref}>
      <div className="view-bar">
        <span>{poster.name}</span>
        <span className="muted">Click the poster to zoom · Esc to exit</span>
        {onVision && (
          <select className="vision-select" aria-label="See the poster as" value={vision} onChange={(e) => onVision(e.target.value as VisionMode)}>
            {VISION_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === 'normal' ? 'Normal colours' : `${m.label} (${m.plain.split(',')[0].toLowerCase()})`}
              </option>
            ))}
          </select>
        )}
        <button className="btn" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : ref.current?.requestFullscreen())}>Full screen</button>
        <button className="btn primary" onClick={onClose}>Back to editing</button>
      </div>
      <VisionFilters />
      <div className={'view-stage' + (zoomed ? ' zoomed' : '')} style={{ filter: visionFilter(vision) }} onClick={() => setZoomed((z) => !z)}>
        <Surface poster={poster} zoom={zoom} renderElement={(el) => <ElementView key={el.id} el={el} poster={poster} />} />
      </div>
    </div>
  );
}

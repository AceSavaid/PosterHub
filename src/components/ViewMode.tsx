import { useEffect, useRef, useState } from 'react';
import type { Poster } from '../types';
import { MM_TO_PX } from '../model';
import { ElementView, Surface } from './Surface';
import { DISTANCES, distanceZoom, hardToReadAt, readablePtAt } from '../lib/distance';
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
  /** metres; 0 = fit to screen */
  const [distance, setDistance] = useState(0);
  const [markSmall, setMarkSmall] = useState(true);

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

  const zoom = distance ? distanceZoom(distance) : zoomed ? Math.max(fit * 3, 0.5) : fit;
  const small = distance && markSmall ? hardToReadAt(poster, distance) : new Set<string>();

  return (
    <div className="view-mode" ref={ref}>
      <div className="view-bar">
        <span>{poster.name}</span>
        <span className="muted">{distance ? `As seen from ${distance} m away` : 'Click the poster to zoom · Esc to exit'}</span>
        <label className="view-distance">
          Viewing distance
          <select value={distance} onChange={(e) => setDistance(+e.target.value)}>
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
        <button className="btn" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : ref.current?.requestFullscreen())}>Full screen</button>
        <button className="btn primary" onClick={onClose}>Back to editing</button>
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
      <div className={'view-stage' + (distance ? ' distance' : zoomed ? ' zoomed' : '')} style={{ filter: visionFilter(vision) }} onClick={() => !distance && setZoomed((z) => !z)}>
        <Surface poster={poster} zoom={zoom} renderElement={(el) => <ElementView key={el.id} el={el} poster={poster} className={small.has(el.id) ? 'too-small' : undefined} />} />
      </div>
    </div>
  );
}

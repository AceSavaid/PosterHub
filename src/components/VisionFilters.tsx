import { useEffect, useRef, useState } from 'react';
import { VISION_MODES, feColorMatrixValues, visionInfo, type VisionMode } from '../lib/colorVision';

/** CSS `filter` value that shows content as seen with the given kind of vision. */
export function visionFilter(mode: VisionMode): string | undefined {
  return mode === 'normal' ? undefined : `url(#vision-${mode})`;
}

/** Invisible SVG holding the colour-vision filters; render once per screen that previews. */
export function VisionFilters() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
      <defs>
        {VISION_MODES.filter((m) => m.id !== 'normal').map((m) => (
          <filter key={m.id} id={`vision-${m.id}`} colorInterpolationFilters="linearRGB">
            <feColorMatrix type="matrix" values={feColorMatrixValues(m.id as Exclude<VisionMode, 'normal'>)} />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

/** Banner shown over the poster while a preview is on, so it is never mistaken for the real colours. */
export function VisionBanner({ mode, onChange }: { mode: VisionMode; onChange: (m: VisionMode) => void }) {
  if (mode === 'normal') return null;
  const info = visionInfo(mode);
  return (
    <div className="vision-banner" role="status" onPointerDown={(e) => e.stopPropagation()}>
      <span>
        Previewing <strong>{info.label.toLowerCase()}</strong> · {info.plain.toLowerCase()}. Exports are not affected.
      </span>
      <button className="btn" onClick={() => onChange('normal')}>Back to normal colours</button>
    </div>
  );
}

/** Toolbar button + popover to pick a colour-vision preview. */
export default function VisionMenu({ mode, onChange }: { mode: VisionMode; onChange: (m: VisionMode) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div className="menu-wrap" ref={wrap}>
      <button
        className={'icon-btn' + (mode !== 'normal' ? ' active' : '')}
        title="Colour vision preview: see the poster as colour-blind readers do"
        aria-label="Colour vision"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <path d="M1.5 9S4.5 3.75 9 3.75 16.5 9 16.5 9 13.5 14.25 9 14.25 1.5 9 1.5 9z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="9" cy="9" r="2.6" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="menu vision-menu" role="dialog" aria-label="Colour vision">
          <div className="field-label">See the poster as</div>
          <div role="radiogroup" aria-label="See the poster as">
            {VISION_MODES.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={mode === m.id}
                className={'vision-option' + (mode === m.id ? ' active' : '')}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
              >
                <strong>{m.label}</strong>
                <span>{m.plain}</span>
              </button>
            ))}
          </div>
          <p className="hint">About 1 in 12 men and 1 in 200 women are colour-blind. Only your screen changes; exports keep the real colours.</p>
        </div>
      )}
    </div>
  );
}

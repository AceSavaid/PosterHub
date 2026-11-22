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

/** Colour-vision picker for the View menu: a list, since the menu is already a popover. */
export function VisionSelect({ mode, onChange }: { mode: VisionMode; onChange: (m: VisionMode) => void }) {
  return (
    <label title="See the poster as colour-blind readers do. Only your screen changes; exports keep the real colours.">
      Colour vision preview
      <select aria-label="Colour vision" value={mode} onChange={(e) => onChange(e.target.value as VisionMode)}>
        {VISION_MODES.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}: {m.plain}
          </option>
        ))}
      </select>
    </label>
  );
}

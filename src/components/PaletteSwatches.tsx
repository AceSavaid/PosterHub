import type { Palette } from '../types';
import { PALETTES } from '../model';

export function PaletteSwatches({ value, onPick }: { value: string; onPick: (p: Palette) => void }) {
  return (
    <div className="palette-grid">
      {PALETTES.map((p) => (
        <button type="button" key={p.name} className={'palette-chip' + (value === p.name ? ' active' : '')} aria-pressed={value === p.name} onClick={() => onPick(p)} title={p.name}>
          <span className="sw">
            {[p.primary, p.secondary, p.accent, p.surface, p.background].map((c, i) => (
              <i key={i} style={{ background: c }} />
            ))}
          </span>
          <span className="pname">{p.name}</span>
        </button>
      ))}
    </div>
  );
}

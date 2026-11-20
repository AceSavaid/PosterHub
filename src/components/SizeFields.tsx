import { useState } from 'react';
import type { Orientation } from '../types';
import { SIZE_PRESETS, sizeFor, IN_TO_MM } from '../model';

type Unit = 'mm' | 'cm' | 'in';
const PER: Record<Unit, number> = { mm: 1, cm: 10, in: IN_TO_MM };

interface Props {
  orientation: Orientation;
  preset: string;
  width: number;
  height: number;
  onChange: (o: Orientation, preset: string, width: number, height: number) => void;
}

/** Orientation toggle + preset picker + custom width/height with units. */
export function SizeFields({ orientation, preset, width, height, onChange }: Props) {
  const [unit, setUnit] = useState<Unit>(preset.includes('x') || preset === 'letter' ? 'in' : 'mm');
  const fmt = (mm: number) => +(mm / PER[unit]).toFixed(unit === 'mm' ? 0 : 2);

  const setOrientation = (o: Orientation) => {
    if (o === orientation) return;
    onChange(o, preset, height, width);
  };

  return (
    <>
      <div>
        <div className="field-label" id="orientation-label">Orientation</div>
        <div className="seg" role="group" aria-labelledby="orientation-label">
          {(['portrait', 'landscape'] as Orientation[]).map((o) => (
            <button type="button" key={o} aria-pressed={orientation === o} className={orientation === o ? 'active' : ''} onClick={() => setOrientation(o)}>
              <span className={'orient-icon ' + o} aria-hidden /> {o[0].toUpperCase() + o.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <label>
        Size
        <select
          value={preset}
          onChange={(e) => {
            const id = e.target.value;
            if (id === 'custom') return onChange(orientation, 'custom', width, height);
            const s = sizeFor(id, orientation);
            onChange(orientation, id, s.width, s.height);
          }}
        >
          {SIZE_PRESETS.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
          <option value="custom">Custom size…</option>
        </select>
      </label>
      <div className="span2 size-row">
        <label>
          Width
          <input
            type="number"
            min={1}
            step="any"
            value={fmt(width)}
            onChange={(e) => {
              const w = Math.max(10, (+e.target.value || 0) * PER[unit]);
              onChange(w > height ? 'landscape' : 'portrait', 'custom', w, height);
            }}
          />
        </label>
        <span className="times">×</span>
        <label>
          Height
          <input
            type="number"
            min={1}
            step="any"
            value={fmt(height)}
            onChange={(e) => {
              const h = Math.max(10, (+e.target.value || 0) * PER[unit]);
              onChange(width > h ? 'landscape' : 'portrait', 'custom', width, h);
            }}
          />
        </label>
        <label>
          Units
          <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="in">inches</option>
          </select>
        </label>
      </div>
    </>
  );
}

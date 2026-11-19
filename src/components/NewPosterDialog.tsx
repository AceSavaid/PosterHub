import { useState } from 'react';
import type { Orientation, Palette } from '../types';
import { PALETTES, SIZE_PRESETS, TEMPLATES, createPoster, sizeFor, type TemplateId, POPULAR_GOOGLE_FONTS, SYSTEM_FONTS } from '../model';
import type { Poster } from '../types';
import { SizeFields } from './SizeFields';
import { PaletteSwatches } from './PaletteSwatches';

interface Props {
  onCreate: (p: Poster) => void;
  onCancel: () => void;
}

export default function NewPosterDialog({ onCreate, onCancel }: Props) {
  const [name, setName] = useState('');
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [preset, setPreset] = useState('A0');
  const [size, setSize] = useState(sizeFor('A0', 'portrait'));
  const [columns, setColumns] = useState(3);
  const [palette, setPalette] = useState<Palette>(PALETTES[0]);
  const [template, setTemplate] = useState<TemplateId>('classic');
  const [headingFont, setHeadingFont] = useState('Montserrat');
  const [bodyFont, setBodyFont] = useState('Open Sans');

  const fonts = [...POPULAR_GOOGLE_FONTS, ...SYSTEM_FONTS];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        className="modal wide"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(createPoster({ name: name || 'Untitled poster', ...size, sizePreset: preset, columns, palette, template, headingFont, bodyFont }));
        }}
      >
        <h2>New poster</h2>
        <div className="form-grid">
          <label className="span2">
            Name
            <input autoFocus value={name} placeholder="e.g. Conference 2026 – Sleep and memory" onChange={(e) => setName(e.target.value)} />
          </label>
          <SizeFields
            orientation={orientation}
            preset={preset}
            width={size.width}
            height={size.height}
            onChange={(o, pr, w, h) => {
              setOrientation(o);
              setPreset(pr);
              setSize({ width: w, height: h });
            }}
          />
          <label>
            Columns
            <select value={columns} onChange={(e) => setColumns(+e.target.value)}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} column{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Heading font
            <select value={headingFont} onChange={(e) => setHeadingFont(e.target.value)}>
              {fonts.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label>
            Body font
            <select value={bodyFont} onChange={(e) => setBodyFont(e.target.value)}>
              {fonts.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <div className="span2">
            <div className="field-label">Colour palette</div>
            <PaletteSwatches value={palette.name} onPick={setPalette} />
          </div>
          <div className="span2">
            <div className="field-label">Layout</div>
            <div className="template-grid">
              {TEMPLATES.map((t) => (
                <button type="button" key={t.id} className={'template-card' + (template === t.id ? ' active' : '')} onClick={() => setTemplate(t.id)}>
                  <TemplateThumb id={t.id} orientation={orientation} columns={columns} palette={palette} />
                  <strong>{t.label}</strong>
                  <span>{t.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary">Create poster</button>
        </div>
        <p className="hint">Sizes available: {SIZE_PRESETS.length} presets or any custom size.</p>
      </form>
    </div>
  );
}

function TemplateThumb({ id, orientation, columns, palette }: { id: TemplateId; orientation: Orientation; columns: number; palette: Palette }) {
  const W = orientation === 'portrait' ? 60 : 84;
  const H = orientation === 'portrait' ? 84 : 60;
  const m = 4;
  const g = 3;
  const cw = (W - 2 * m - (columns - 1) * g) / columns;
  const top = H * 0.17 + (id === 'banner' ? 9 : 4);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <rect width={W} height={H} fill={palette.background} stroke="#ccc" />
      {id !== 'blank' && <rect width={W} height={H * 0.15} fill={palette.primary} />}
      {id === 'banner' && <rect x={m} y={H * 0.15 + 2} width={W - 2 * m} height={5} fill={palette.accent} />}
      {id !== 'blank' &&
        Array.from({ length: columns }, (_, i) => {
          const x = m + i * (cw + g);
          const central = id === 'central' && columns >= 3 && i === Math.floor(columns / 2);
          return central ? (
            <rect key={i} x={x} y={top} width={cw} height={H * 0.5} fill={palette.surface} stroke={palette.secondary} strokeWidth={0.5} />
          ) : (
            <g key={i}>
              <rect x={x} y={top} width={cw * 0.7} height={2.5} fill={palette.primary} />
              {[0, 1, 2, 3, 4, 5].map((k) => (
                <rect key={k} x={x} y={top + 5 + k * 3.2} width={cw} height={1.4} fill="#bbb" />
              ))}
              <rect x={x} y={top + 26} width={cw * 0.7} height={2.5} fill={palette.primary} />
              {[0, 1, 2, 3].map((k) => (
                <rect key={k} x={x} y={top + 31 + k * 3.2} width={cw} height={1.4} fill="#bbb" />
              ))}
            </g>
          );
        })}
      {id === 'blank' &&
        Array.from({ length: columns }, (_, i) => (
          <rect key={i} x={m + i * (cw + g)} y={m} width={cw} height={H - 2 * m} fill="none" stroke="#9ab" strokeDasharray="2 2" strokeWidth={0.5} />
        ))}
    </svg>
  );
}

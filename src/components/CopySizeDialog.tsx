import { useState } from 'react';
import type { Orientation, Poster } from '../types';
import { TEMPLATES, type TemplateId } from '../model';
import { useDialog } from '../lib/useDialog';
import { SizeFields } from './SizeFields';
import { canRearrange, copyAtSize, defaultCopyName, exactCopy, guessLayout, orientationOf, shapeChanges, suggestColumns, type CopyMode } from '../lib/copyAtSize';

interface Props {
  poster: Poster;
  /** `resized` is false for a same-size copy */
  onCopy: (copy: Poster, message: string, resized: boolean) => void;
  onCancel: () => void;
}

/** "Make a copy": the same size by default, or another size and orientation; the copy is saved as a new poster. */
export default function CopySizeDialog({ poster, onCopy, onCancel }: Props) {
  const dialog = useDialog<HTMLFormElement>(onCancel, 'copy-size-title');
  const start = { preset: poster.sizePreset, width: poster.width, height: poster.height };
  const [size, setSize] = useState(start);
  const [name, setName] = useState<string | null>(null); // null: follow the size
  const [template, setTemplate] = useState<TemplateId>(() => guessLayout(poster));
  const [columns, setColumns] = useState(() => suggestColumns(poster, start.width, start.height));
  const rearrangeable = canRearrange(poster);
  const [mode, setMode] = useState<CopyMode>(rearrangeable && shapeChanges(poster, start.width, start.height) ? 'rearrange' : 'scale');

  const changes = shapeChanges(poster, size.width, size.height);
  const offerRearrange = rearrangeable && changes;
  const effective: CopyMode = offerRearrange ? mode : 'scale';
  const textPct = Math.round(Math.min(size.width / poster.width, size.height / poster.height) * 100);
  const same = Math.abs(size.width - poster.width) < 1 && Math.abs(size.height - poster.height) < 1;

  const pickSize = (_o: Orientation, preset: string, width: number, height: number) => {
    setSize({ preset, width, height });
    setColumns(suggestColumns(poster, width, height));
    setMode(rearrangeable && shapeChanges(poster, width, height) ? 'rearrange' : 'scale');
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        {...dialog}
        className="modal copy-size"
        aria-label="Make a copy"
        onSubmit={(e) => {
          e.preventDefault();
          if (same) {
            const copy = exactCopy(poster, name ?? `${poster.name} (copy)`);
            return onCopy(copy, 'Made an exact copy.', false);
          }
          const { poster: copy, message } = copyAtSize(poster, {
            width: size.width,
            height: size.height,
            sizePreset: size.preset,
            mode: effective,
            template,
            columns,
            name: name ?? undefined,
          });
          onCopy(copy, message, true);
        }}
      >
        <h2 id="copy-size-title">Make a copy</h2>
        <p className="muted small copy-intro">A new poster, the same size or another one, such as A1 landscape or an A4 handout. “{poster.name}” stays as it is.</p>
        <div className="form-grid">
          <SizeFields orientation={orientationOf(size)} preset={size.preset} width={size.width} height={size.height} onChange={pickSize} />
        </div>
        {same ? (
          <p className="hint copy-note" role="status">Same size and shape: an exact copy. Pick another size or orientation to resize it.</p>
        ) : offerRearrange ? (
          <fieldset className="copy-mode">
            <legend>The shape changes. How should your content fit?</legend>
            <label className="check">
              <input type="radio" name="copy-mode" checked={mode === 'rearrange'} onChange={() => setMode('rearrange')} /> Rearrange into a layout (recommended)
            </label>
            {mode === 'rearrange' && (
              <div className="form-grid copy-rearrange">
                <label>
                  Layout
                  <select aria-label="Layout" value={template} onChange={(e) => setTemplate(e.target.value as TemplateId)}>
                    {TEMPLATES.filter((t) => t.id !== 'blank').map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Columns
                  <select aria-label="Columns" value={columns} onChange={(e) => setColumns(+e.target.value)}>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <p className="hint span2">Your text, figures and logos move into the matching places.</p>
              </div>
            )}
            <label className="check">
              <input type="radio" name="copy-mode" checked={mode === 'scale'} onChange={() => setMode('scale')} /> Keep the layout and stretch it to the new shape
            </label>
          </fieldset>
        ) : (
          <p className="hint copy-note">
            Everything is moved and resized in proportion
            {textPct !== 100 ? `, and text is scaled to ${textPct}% so it still fits` : ''}.
            {changes && !rearrangeable ? ' The shape changes, so boxes are stretched to fit; check the copy afterwards.' : ''}
          </p>
        )}
        <label className="field">
          Name of the copy
          <input value={name ?? (same ? `${poster.name} (copy)` : defaultCopyName(poster, size.width, size.height, size.preset))} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary">Make copy</button>
        </div>
      </form>
    </div>
  );
}

import { useState } from 'react';
import type { Orientation, Poster } from '../types';
import { TEMPLATES, sizeFor, type TemplateId } from '../model';
import { useDialog } from '../lib/useDialog';
import { SizeFields } from './SizeFields';
import { canRearrange, copyAtSize, defaultCopyName, guessLayout, orientationOf, shapeChanges, suggestColumns, type CopyMode } from '../lib/copyAtSize';

interface Props {
  poster: Poster;
  onCopy: (copy: Poster, message: string) => void;
  onCancel: () => void;
}

/** "Copy at another size": pick a size and orientation; the copy is saved as a new poster. */
export default function CopySizeDialog({ poster, onCopy, onCancel }: Props) {
  const dialog = useDialog<HTMLFormElement>(onCancel, 'copy-size-title');
  const flipped: Orientation = orientationOf(poster) === 'portrait' ? 'landscape' : 'portrait';
  const start = poster.sizePreset !== 'custom' ? { preset: poster.sizePreset, ...sizeFor(poster.sizePreset, flipped) } : { preset: 'custom', width: poster.height, height: poster.width };
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
        aria-label="Copy at another size"
        onSubmit={(e) => {
          e.preventDefault();
          if (same) return;
          const { poster: copy, message } = copyAtSize(poster, {
            width: size.width,
            height: size.height,
            sizePreset: size.preset,
            mode: effective,
            template,
            columns,
            name: name ?? undefined,
          });
          onCopy(copy, message);
        }}
      >
        <h2 id="copy-size-title">Copy at another size</h2>
        <p className="muted small">
          Makes a new poster in My posters at the size you pick, for example an A1 landscape version or an A4 handout. “{poster.name}” stays as it is.
        </p>
        <div className="form-grid">
          <SizeFields orientation={orientationOf(size)} preset={size.preset} width={size.width} height={size.height} onChange={pickSize} />
        </div>
        {same ? (
          <p className="hint" role="status">That is the poster’s current size. Pick another size or orientation.</p>
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
                <p className="hint span2">Your title, authors, section text, figures, logos and QR codes move into the matching places. Text uses the layout’s sizes for the new page.</p>
              </div>
            )}
            <label className="check">
              <input type="radio" name="copy-mode" checked={mode === 'scale'} onChange={() => setMode('scale')} /> Keep the layout and stretch it to the new shape
            </label>
          </fieldset>
        ) : (
          <p className="hint">
            Everything is moved and resized in proportion
            {textPct !== 100 ? `, and text is scaled to ${textPct}% so it still fits` : ''}.
            {changes && !rearrangeable ? ' The shape changes, so boxes are stretched to fit; check the copy afterwards.' : ''}
          </p>
        )}
        <label className="field">
          Name of the copy
          <input value={name ?? defaultCopyName(poster, size.width, size.height, size.preset)} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={same}>Make copy</button>
        </div>
      </form>
    </div>
  );
}

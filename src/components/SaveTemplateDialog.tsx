import { useState } from 'react';
import type { Poster } from '../types';
import { useDialog } from '../lib/useDialog';
import { isLikelyLogo, templatePictures } from '../lib/userTemplates';

interface Props {
  poster: Poster;
  onSave: (name: string, keepPictures: string[]) => void;
  onCancel: () => void;
}

/** "Save as my template": pick a name and which pictures (logos) to keep. */
export default function SaveTemplateDialog({ poster, onSave, onCancel }: Props) {
  const pictures = templatePictures(poster);
  const [name, setName] = useState(poster.name ? `${poster.name} template` : 'My template');
  const [keep, setKeep] = useState<Set<string>>(() => new Set(pictures.filter((e) => isLikelyLogo(e, poster)).map((e) => e.id)));
  const dialog = useDialog<HTMLFormElement>(onCancel, 'save-template-title');

  const toggle = (id: string) =>
    setKeep((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        {...dialog}
        className="modal"
        aria-label="Save as my template"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(name.trim() || 'My template', pictures.filter((p) => keep.has(p.id)).map((p) => p.id));
        }}
      >
        <h2 id="save-template-title">Save as my template</h2>
        <p className="muted small">
          Keeps the layout, section headings, colours, fonts and background. Your text, graphs, tables and figures are swapped for example
          content. The template appears under <b>My templates</b> when you make a new poster.
        </p>
        <label className="field">
          Template name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
        </label>
        {pictures.length > 0 && (
          <fieldset className="keep-pictures">
            <legend>Pictures to keep (for example your logos)</legend>
            <div className="keep-grid">
              {pictures.map((p, i) => (
                <label key={p.id} className={'keep-pic' + (keep.has(p.id) ? ' on' : '')}>
                  <input type="checkbox" checked={keep.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Keep picture ${i + 1}${p.alt ? `: ${p.alt}` : ''}`} />
                  <img src={p.src} alt="" />
                </label>
              ))}
            </div>
            <p className="muted small">Pictures you don’t keep become empty picture boxes.</p>
          </fieldset>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary">Save template</button>
        </div>
      </form>
    </div>
  );
}

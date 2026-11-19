import { useEffect, useState } from 'react';
import type { Poster } from '../types';
import { MM_TO_PX } from '../model';
import { posterFromImport, type PptxDeck } from '../lib/pptxImport';
import { ElementView, Surface } from './Surface';

const THUMB_W = 180;
const THUMB_H = 150;
const MAX_PREVIEWS = 40;

interface Props {
  deck: PptxDeck;
  fileName: string;
  onPick: (index: number) => void;
  onCancel: () => void;
}

/** Lets the user choose which slide (or, for templates without slides, which layout) to turn into a poster. */
export default function SlidePicker({ deck, fileName, onPick, onCancel }: Props) {
  const [previews, setPreviews] = useState<(Poster | null)[]>([]);
  const isLayouts = deck.pages[0]?.kind === 'layout';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Build previews one at a time so the first ones appear quickly.
      for (const page of deck.pages.slice(0, MAX_PREVIEWS)) {
        let p: Poster | null = null;
        try {
          p = posterFromImport(await deck.importPage(page.index), page.label);
        } catch {
          p = null;
        }
        if (cancelled) return;
        setPreviews((prev) => {
          const next = prev.slice();
          next[page.index] = p;
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deck]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal xwide slide-picker" role="dialog" aria-label={isLayouts ? 'Choose a layout' : 'Choose a slide'}>
        <h2>{isLayouts ? 'Choose a layout to start from' : 'Choose a slide to start from'}</h2>
        <p className="muted">
          “{fileName}” has {deck.pages.length} {isLayouts ? 'layouts' : 'slides'}. Pick the one that looks most like the poster you want — its colours, fonts and
          shapes become your new poster.
        </p>
        <div className="slide-grid">
          {deck.pages.map((page) => {
            const preview = previews[page.index];
            const zoom = preview ? Math.min(THUMB_W / (preview.width * MM_TO_PX), THUMB_H / (preview.height * MM_TO_PX)) : 0;
            const name = page.title ? `${page.label}: ${page.title}` : page.label;
            return (
              <button key={page.index} className="slide-card" onClick={() => onPick(page.index)} aria-label={`Use ${name}`} title={name}>
                <div className="slide-thumb" aria-hidden>
                  {preview ? (
                    <Surface poster={preview} zoom={zoom} renderElement={(el) => <ElementView key={el.id} el={el} poster={preview} />} />
                  ) : (
                    <span className="muted small">{page.index < MAX_PREVIEWS && previews.length <= page.index ? 'Loading…' : 'No preview'}</span>
                  )}
                </div>
                <div className="slide-name">
                  <strong>{page.label}</strong>
                  {page.hidden && <span className="muted small"> (hidden)</span>}
                  {page.title && <div className="muted small slide-title">{page.title}</div>}
                </div>
              </button>
            );
          })}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

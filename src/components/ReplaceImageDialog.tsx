import { useDialog } from '../lib/useDialog';
import type { ReplaceFit } from '../lib/replaceImage';

interface Props {
  /** The new picture. */
  src: string;
  /** Width ÷ height of the new picture. */
  ratio: number;
  /** Width ÷ height of the box it is going into. */
  boxRatio: number;
  onPick: (fit: ReplaceFit) => void;
  onCancel: () => void;
}

const PREVIEW = 96; // px: the longer side of each little preview

function previewSize(ratio: number) {
  return ratio >= 1 ? { width: PREVIEW, height: PREVIEW / ratio } : { width: PREVIEW * ratio, height: PREVIEW };
}

/** Asked when a picture is replaced by one of a different shape: keep the old box size, or use the new shape? */
export default function ReplaceImageDialog({ src, ratio, boxRatio, onPick, onCancel }: Props) {
  const dialog = useDialog(onCancel, 'replace-image-title');
  const options: { fit: ReplaceFit; label: string; hint: string; ratio: number }[] = [
    { fit: 'contain', label: 'Fit in the same space', hint: 'Same size as the old image. The whole picture shows.', ratio: boxRatio },
    { fit: 'cover', label: 'Fill the same space', hint: 'Same size as the old image. Edges are trimmed to fill it.', ratio: boxRatio },
    { fit: 'natural', label: 'Use the new picture’s shape', hint: 'Same width; the height changes to match.', ratio },
  ];
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div {...dialog} className="modal replace-image">
        <h2 id="replace-image-title">How should the new image fit?</h2>
        <p className="muted small">The new picture is a different shape from the one it replaces.</p>
        <div className="replace-options">
          {options.map((o) => (
            <button key={o.fit} type="button" className="replace-option" onClick={() => onPick(o.fit)}>
              <span className="replace-preview" aria-hidden="true">
                <img src={src} alt="" style={{ ...previewSize(o.ratio), objectFit: o.fit === 'cover' ? 'cover' : 'contain' }} />
              </span>
              <strong>{o.label}</strong>
              <span className="hint">{o.hint}</span>
            </button>
          ))}
        </div>
        <p className="hint">You can change this later with “Fit” in the side panel.</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

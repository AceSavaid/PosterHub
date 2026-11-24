import { useDialog } from '../lib/useDialog';

interface Props {
  title: string;
  message?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** An in-app "are you sure?" box, used instead of the browser's own pop-up. */
export default function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onCancel }: Props) {
  // Focus starts on Cancel (the first button), the safe choice.
  const dialog = useDialog(onCancel);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div {...dialog} className="modal confirm" role="alertdialog" aria-label={title}>
        <h2>{title}</h2>
        {message && <p className="muted">{message}</p>}
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className={'btn ' + (danger ? 'danger-btn' : 'primary')} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

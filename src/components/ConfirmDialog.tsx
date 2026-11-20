import { useEffect, useRef } from 'react';
import { useEscape } from '../lib/useEscape';

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
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEscape(onCancel);
  useEffect(() => cancelRef.current?.focus(), []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal confirm" role="alertdialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {message && <p className="muted">{message}</p>}
        <div className="modal-actions">
          <button ref={cancelRef} className="btn" onClick={onCancel}>Cancel</button>
          <button className={'btn ' + (danger ? 'danger-btn' : 'primary')} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

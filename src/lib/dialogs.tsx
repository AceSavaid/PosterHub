// In-app replacements for window.alert / confirm / prompt. The desktop app's
// macOS web view does not show the browser's built-in boxes (they silently
// return "cancel"), so the app asks with its own dialogs everywhere.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

interface Props {
  title: string;
  message?: string;
  input?: { label: string; initial: string };
  okLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  done: (value: string | boolean | null) => void;
}

function Dialog({ title, message, input, okLabel, cancelLabel, danger, done }: Props) {
  const [text, setText] = useState(input?.initial ?? '');
  const okRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.select();
    else okRef.current?.focus();
  }, []);
  const cancel = () => done(input ? null : false);
  const ok = () => done(input ? text : true);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && cancel()}>
      <div
        className="modal app-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel();
          if (e.key === 'Enter' && input) ok();
        }}
      >
        <h2>{title}</h2>
        {message && <p className="app-dialog-msg">{message}</p>}
        {input && (
          <label className="app-dialog-field">
            {input.label}
            <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
        )}
        <div className="modal-actions">
          {cancelLabel && (
            <button className="btn" onClick={cancel}>
              {cancelLabel}
            </button>
          )}
          <button ref={okRef} className={'btn ' + (danger ? 'danger' : 'primary')} onClick={ok} disabled={!!input && !text.trim()}>
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function show<T>(props: Omit<Props, 'done'>): Promise<T> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v: unknown) => {
      root.unmount();
      host.remove();
      resolve(v as T);
    };
    root.render(<Dialog {...props} done={done} />);
  });
}

export const askConfirm = (title: string, message: string, okLabel = 'OK', danger = false) =>
  show<boolean>({ title, message, okLabel, cancelLabel: 'Cancel', danger });

export const askText = (title: string, label: string, initial = '', okLabel = 'OK') =>
  show<string | null>({ title, input: { label, initial }, okLabel, cancelLabel: 'Cancel' });

export const tell = (title: string, message: string) => show<boolean>({ title, message, okLabel: 'OK' }).then(() => undefined);

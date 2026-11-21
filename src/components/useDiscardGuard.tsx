import { useCallback, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

/**
 * For dialogs where people type a lot (graphs, equations, authors): closing with
 * Esc, Cancel or a click outside asks first if anything was changed.
 * Use `request` wherever the dialog would close, and render `prompt`.
 */
export function useDiscardGuard(dirty: boolean, onCancel: () => void) {
  const [asking, setAsking] = useState(false);
  const askingNow = useRef(false);
  askingNow.current = asking;
  const request = useCallback(() => {
    if (askingNow.current) return;
    if (dirty) setAsking(true);
    else onCancel();
  }, [dirty, onCancel]);
  const prompt = asking ? (
    <ConfirmDialog
      title="Discard your changes?"
      message="What you typed in this window hasn’t been added to the poster yet."
      confirmLabel="Discard changes"
      danger
      onConfirm={onCancel}
      onCancel={() => setAsking(false)}
    />
  ) : null;
  return { request, prompt };
}

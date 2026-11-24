import { useEffect, useRef, type RefObject } from 'react';

/**
 * Closes a dropdown or popover the usual ways: Esc, a click or tap outside `inside`, or focus moving
 * out of it (Tab past the end), and optionally the window losing focus. One copy of this so every menu behaves the same.
 */
export function usePopover(open: boolean, inside: RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[], onClose: () => void, opts: { returnFocus?: RefObject<HTMLElement | null>; closeOnBlur?: boolean } = {}) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const refs = Array.isArray(inside) ? inside : [inside];
    const within = (t: EventTarget | null) => t instanceof Node && refs.some((r) => r.current?.contains(t));
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close.current();
      opts.returnFocus?.current?.focus();
    };
    const onDown = (e: PointerEvent) => !within(e.target) && close.current();
    const onFocus = (e: FocusEvent) => !within(e.target) && close.current();
    const onBlur = () => close.current();
    // capture phase, so a click on the poster closes the menu even though elements stop the event
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('focusin', onFocus);
    if (opts.closeOnBlur) window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('focusin', onFocus);
      window.removeEventListener('blur', onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

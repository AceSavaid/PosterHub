import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Makes a box behave as a modal dialog for keyboard and screen reader users:
 * moves focus inside when it opens, keeps Tab inside, closes on Escape and
 * hands focus back to whatever opened it. Spread the result onto the dialog box.
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>(onClose: () => void, labelledBy?: string) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // Remember the opener during the first render, before an autoFocus field takes focus.
  const opener = useRef<HTMLElement | null | undefined>(undefined);
  if (opener.current === undefined) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const back = opener.current;
    // An `autoFocus` field has already taken focus by now; otherwise start on the first control.
    if (!node.contains(document.activeElement)) (node.querySelector<HTMLElement>(FOCUSABLE) ?? node).focus();

    const isTop = () => {
      const open = document.querySelectorAll('[aria-modal="true"]');
      return open[open.length - 1] === node;
    };
    const onKey = (e: KeyboardEvent) => {
      if (!isTop()) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close.current();
      } else if (e.key === 'Tab') {
        const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null || x === document.activeElement);
        if (!items.length) return e.preventDefault();
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (!node.contains(active)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (back?.isConnected) back.focus();
    };
  }, []);

  return { ref, role: 'dialog' as const, 'aria-modal': true, 'aria-labelledby': labelledBy, tabIndex: -1 };
}

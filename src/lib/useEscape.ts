import { useEffect, useRef } from 'react';

// Open dialogs, newest last: Esc only closes the one on top.
const stack: { current: () => void }[] = [];
let listening = false;

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented || !stack.length) return;
  e.preventDefault();
  stack[stack.length - 1].current();
}

/** Calls `onEscape` when Esc is pressed while this dialog is the newest one open. */
export function useEscape(onEscape: () => void, enabled = true) {
  const fn = useRef(onEscape);
  fn.current = onEscape;
  useEffect(() => {
    if (!enabled) return;
    stack.push(fn);
    if (!listening) {
      window.addEventListener('keydown', onKey);
      listening = true;
    }
    return () => {
      const i = stack.lastIndexOf(fn);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [enabled]);
}

/**
 * Follows a pointer drag on the whole window until the button is released.
 *
 * Pointer moves are passed on at most once per screen refresh: pens and fast mice can send
 * 120–240 moves a second, more than can be drawn, and each one would otherwise update the
 * poster. The last move is always delivered before `onEnd`, so a drag ends exactly where the
 * pointer was released.
 */
export function trackPointer(onMove: (ev: PointerEvent) => void, onEnd?: (ev: PointerEvent) => void) {
  let pending: PointerEvent | null = null;
  let frame = 0;
  const flush = () => {
    frame = 0;
    const ev = pending;
    pending = null;
    if (ev) onMove(ev);
  };
  const move = (ev: PointerEvent) => {
    pending = ev;
    if (!frame) frame = requestAnimationFrame(flush);
  };
  const end = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    if (frame) cancelAnimationFrame(frame);
    flush();
    onEnd?.(ev);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

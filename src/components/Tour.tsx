import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { placeCard, TOUR_STEPS, type Rect } from '../lib/tour';
import { useEscape } from '../lib/useEscape';

function findTarget(selectors: string[]): HTMLElement | null {
  for (const s of selectors) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(s))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

/** Visible part of the target (a big poster can run off screen). */
function visibleRect(el: HTMLElement): Rect | null {
  const r = el.getBoundingClientRect();
  const left = Math.max(0, r.left);
  const top = Math.max(0, r.top);
  const right = Math.min(window.innerWidth, r.right);
  const bottom = Math.min(window.innerHeight, r.bottom);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * A short guided tour: a ring around one part of the editor and a card that explains it.
 * It doesn't block the editor, so people can try things while it's open. Esc or "Skip tour" ends it.
 */
export default function Tour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [ring, setRing] = useState<Rect | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const s = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;

  useEscape(onClose);

  useLayoutEffect(() => {
    const measure = () => {
      const t = findTarget(s.targets);
      const r = t ? visibleRect(t) : null;
      setRing((old) => (old && r && old.left === r.left && old.top === r.top && old.width === r.width && old.height === r.height ? old : r));
      const c = card.current;
      if (!c) return;
      const p = placeCard(r, { width: c.offsetWidth, height: c.offsetHeight }, { width: window.innerWidth, height: window.innerHeight });
      setPos((old) => (old && old.left === p.left && old.top === p.top ? old : p));
    };
    measure();
    // The poster zooms to fit and panels can be shown or hidden, so keep following the target.
    const timer = setInterval(measure, 250);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [s]);

  // Move focus to the card on each step so keyboard and screen reader users follow along.
  const opener = useRef<Element | null>(document.activeElement);
  // (Waits until the card has been placed: a hidden button can't take focus.)
  const placed = pos !== null;
  useEffect(() => {
    if (placed) card.current?.querySelector<HTMLElement>('.tour-next')?.focus();
  }, [step, placed]);
  useEffect(() => {
    const back = opener.current;
    return () => {
      if (back instanceof HTMLElement && back.isConnected && (document.activeElement === document.body || !document.activeElement)) back.focus();
    };
  }, []);

  return (
    <>
      {ring && <div className="tour-ring" aria-hidden style={{ left: ring.left - 4, top: ring.top - 4, width: ring.width + 8, height: ring.height + 8 }} />}
      <div
        ref={card}
        className="tour-card"
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden', left: 0, top: 0 }}
      >
        <div className="tour-step muted small">
          Step {step + 1} of {TOUR_STEPS.length}
        </div>
        <h2 id="tour-title">{s.title}</h2>
        <p id="tour-body">{s.body}</p>
        <div className="tour-dots" aria-hidden>
          {TOUR_STEPS.map((_, i) => (
            <span key={i} className={i === step ? 'on' : ''} />
          ))}
        </div>
        <div className="tour-actions">
          {!last && (
            <button className="link tour-skip" onClick={onClose}>
              Skip tour
            </button>
          )}
          <span className="spacer" />
          {step > 0 && (
            <button className="btn" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button className="btn primary tour-next" onClick={() => (last ? onClose() : setStep(step + 1))}>
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}

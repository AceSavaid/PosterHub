import { useCallback, useRef, useState } from 'react';
import { produce, setAutoFreeze } from 'immer';
import type { Poster, PosterElement } from '../types';
import { syncCitations } from './refs/citations';
import { syncCaptions } from './captions';

// Undo steps share every part of the poster an edit didn't touch, so nothing may change a poster
// in place outside `update`. Development builds (and the FREEZE_POSTER test build) freeze each
// version to catch any code that tries; release builds skip the freeze for speed.
setAutoFreeze(import.meta.env.DEV || import.meta.env.VITE_FREEZE_POSTER === '1');

const HISTORY_LIMIT = 100;

/**
 * Holds the poster being edited plus undo/redo history.
 * `update` takes a mutator over a draft of the poster (immer). Only the objects it changes are
 * copied, so undo steps share pictures and untouched elements instead of duplicating them, and an
 * element that didn't change keeps the same object (which lets the canvas skip redrawing it).
 * Passing a `coalesce` key merges rapid updates (dragging, typing in a number field) into one undo step.
 */
export function usePosterHistory(initial: Poster) {
  const [poster, setPoster] = useState(initial);
  const undoStack = useRef<Poster[]>([]);
  const redoStack = useRef<Poster[]>([]);
  const last = useRef<{ key?: string; t: number }>({ t: 0 });
  const current = useRef(poster);
  current.current = poster;
  const [, force] = useState(0);

  const update = useCallback((fn: (draft: Poster) => void, coalesce?: string) => {
    const prev = current.current;
    const now = Date.now();
    const draft = produce(prev, (d) => {
      fn(d);
      // captions stay attached to their figures and numbered in reading order
      syncCaptions(d, prev);
      // citation numbers and the reference list follow every change (text, order, layout)
      syncCitations(d);
      d.updatedAt = now;
    });
    const merge = coalesce && last.current.key === coalesce && now - last.current.t < 1200;
    if (!merge) {
      undoStack.current.push(prev);
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
    }
    redoStack.current = [];
    last.current = { key: coalesce, t: now };
    current.current = draft;
    setPoster(draft);
  }, []);

  const updateElement = useCallback(
    (id: string, patch: Partial<PosterElement> | ((e: PosterElement) => void), coalesce?: string) =>
      update((d) => {
        const el = d.elements.find((e) => e.id === id);
        if (!el) return;
        if (typeof patch === 'function') patch(el);
        else Object.assign(el, patch);
      }, coalesce),
    [update],
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(current.current);
    last.current = { t: 0 };
    current.current = prev;
    setPoster(prev);
    force((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(current.current);
    last.current = { t: 0 };
    current.current = next;
    setPoster(next);
    force((n) => n + 1);
  }, []);

  const reset = useCallback((p: Poster) => {
    undoStack.current = [];
    redoStack.current = [];
    current.current = p;
    setPoster(p);
  }, []);

  return {
    poster,
    update,
    updateElement,
    undo,
    redo,
    reset,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    /** a breakpoint-free way to read the latest value inside event handlers */
    ref: current,
  };
}

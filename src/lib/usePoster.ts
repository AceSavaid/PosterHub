import { useCallback, useRef, useState } from 'react';
import type { Poster, PosterElement } from '../types';
import { syncCitations } from './refs/citations';
import { syncCaptions } from './captions';

const HISTORY_LIMIT = 100;

/**
 * Holds the poster being edited plus undo/redo history.
 * `update` takes a mutator over a structured clone. Passing a `coalesce` key
 * merges rapid updates (dragging, typing in a number field) into one undo step.
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
    const draft = structuredClone(prev);
    fn(draft);
    // captions stay attached to their figures and numbered in reading order
    syncCaptions(draft, prev);
    // citation numbers and the reference list follow every change (text, order, layout)
    syncCitations(draft);
    draft.updatedAt = Date.now();
    const now = Date.now();
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

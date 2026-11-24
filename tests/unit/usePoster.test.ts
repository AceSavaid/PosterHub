import { describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { PALETTES, createPoster, makeElement } from '../../src/model';
import { usePosterHistory } from '../../src/lib/usePoster';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type History = ReturnType<typeof usePosterHistory>;

function mount() {
  const p = createPoster({ name: 'Test', width: 841, height: 1189, sizePreset: 'A0', columns: 3, palette: PALETTES[0], headingFont: 'Montserrat', bodyFont: 'Open Sans', template: 'classic' });
  const img = makeElement('image', p);
  img.src = 'data:image/png;base64,' + 'A'.repeat(1000);
  p.elements.push(img);
  const h: { current: History } = { current: undefined as unknown as History };
  function Probe() {
    h.current = usePosterHistory(p);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(Probe)));
  return { h, img, initial: p };
}

describe('usePosterHistory', () => {
  it('copies only the element an edit changes', () => {
    const { h, img, initial } = mount();
    const target = initial.elements[0];
    act(() => h.current.updateElement(target.id, { x: target.x + 5 }));
    const next = h.current.poster;
    expect(next).not.toBe(initial);
    expect(next.elements[0]).not.toBe(target);
    expect(next.elements[0].x).toBe(target.x + 5);
    // every other element, the picture included, is the very same object as before
    for (let i = 1; i < next.elements.length; i++) expect(next.elements[i]).toBe(initial.elements[i]);
    expect(next.elements.find((e) => e.id === img.id)).toBe(img);
    expect(next.palette).toBe(initial.palette);
  });

  it('undo and redo return the earlier and later versions', () => {
    const { h, initial } = mount();
    const id = initial.elements[0].id;
    act(() => h.current.updateElement(id, { x: 1 }));
    act(() => h.current.updateElement(id, { x: 2 }));
    expect(h.current.canUndo).toBe(true);
    act(() => h.current.undo());
    expect(h.current.poster.elements[0].x).toBe(1);
    act(() => h.current.undo());
    expect(h.current.poster).toBe(initial);
    expect(h.current.canUndo).toBe(false);
    act(() => h.current.redo());
    expect(h.current.poster.elements[0].x).toBe(1);
    expect(h.current.canRedo).toBe(true);
  });

  it('ignores whatever a mutator returns', () => {
    const { h, initial } = mount();
    const el = makeElement('text', initial);
    // `push` returns a number; immer would reject a mutator that both edits and returns a value
    act(() => h.current.update((d) => d.elements.push(el) as unknown as void));
    expect(h.current.poster.elements.at(-1)!.id).toBe(el.id);
  });

  it('freezes each version in development, so nothing can change history in place', () => {
    const { h, initial } = mount();
    act(() => h.current.updateElement(initial.elements[0].id, { x: 3 }));
    expect(Object.isFrozen(h.current.poster.elements[0])).toBe(true);
  });
});

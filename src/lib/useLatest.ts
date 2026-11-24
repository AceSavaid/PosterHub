import { useRef } from 'react';

/**
 * A ref that always holds this render's value. Lets an effect subscribe to window events once
 * and still call the newest handler, instead of unsubscribing and re-subscribing on every render
 * (which, in the editor, meant every frame of a drag).
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

import { useEffect, useState } from 'react';
import { loadMath, mathReady } from './math';

/** True once the equation typesetter has loaded; starts loading it on first use. */
export function useMathReady() {
  const [ready, setReady] = useState(mathReady);
  useEffect(() => {
    if (ready) return;
    let live = true;
    loadMath().then(
      () => live && setReady(true),
      (err) => console.error('Could not load the equation typesetter', err),
    );
    return () => {
      live = false;
    };
  }, [ready]);
  return ready;
}

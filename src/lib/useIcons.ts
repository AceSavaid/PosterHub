import { useEffect, useState } from 'react';
import { iconsReady, loadIcons } from './icons/library';

/** True once the icon artwork has loaded; starts loading it on first use. */
export function useIconsReady() {
  const [ready, setReady] = useState(iconsReady);
  useEffect(() => {
    if (ready) return;
    let live = true;
    loadIcons().then(
      () => live && setReady(true),
      (err) => console.error('Could not load the icon library', err),
    );
    return () => {
      live = false;
    };
  }, [ready]);
  return ready;
}

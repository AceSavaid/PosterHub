import { useEffect, useState } from 'react';
import type { Poster } from './types';
import Library from './components/Library';
import Editor from './components/Editor';
import { loadPoster } from './lib/storage';
import { ensurePosterFonts } from './lib/fonts';
import { sanitizePoster } from './lib/sanitize';

export default function App() {
  const [open, setOpen] = useState<Poster | null>(null);

  // Deep link: #/poster/<id> reopens a poster after a reload.
  useEffect(() => {
    const m = location.hash.match(/^#\/poster\/(.+)$/);
    if (m) loadPoster(m[1]).then((p) => p && openPoster(p));
  }, []);

  async function openPoster(p: Poster) {
    sanitizePoster(p);
    await ensurePosterFonts(p);
    history.replaceState(null, '', `#/poster/${p.id}`);
    setOpen(p);
  }

  function close() {
    history.replaceState(null, '', location.pathname + location.search);
    setOpen(null);
  }

  return open ? <Editor key={open.id} initial={open} onClose={close} /> : <Library onOpen={openPoster} />;
}

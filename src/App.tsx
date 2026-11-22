import { lazy, Suspense, useEffect, useState } from 'react';
import type { Poster } from './types';
import Library from './components/Library';
import { loadPoster } from './lib/storage';
import { ensurePosterFonts } from './lib/fonts';
import { sanitizePoster } from './lib/sanitize';

// The editor (and everything only it uses) loads on first open, so My posters appears sooner.
const Editor = lazy(() => import('./components/Editor'));

const posterHash = (id: string) => `#/poster/${id}`;
const hashPosterId = () => location.hash.match(/^#\/poster\/(.+)$/)?.[1] ?? null;
const libraryUrl = () => location.pathname + location.search;

export default function App() {
  const [open, setOpen] = useState<Poster | null>(null);
  const [notice, setNotice] = useState<string | undefined>();

  useEffect(() => {
    // Deep link: #/poster/<id> reopens a poster after a reload. Put My posters underneath it in
    // the history, so the browser's Back button goes there rather than out of the app.
    const id = hashPosterId();
    if (id) {
      history.replaceState(null, '', libraryUrl());
      loadPoster(id).then((p) => p && openPoster(p));
    }
    // Forward after Back: open the poster again. (Back itself is handled by the editor, which saves first.)
    const onPop = () => {
      const pid = hashPosterId();
      if (pid) loadPoster(pid).then((p) => p && openPoster(p, undefined, false));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  async function openPoster(p: Poster, message?: string, push = true) {
    sanitizePoster(p);
    await ensurePosterFonts(p);
    if (push && hashPosterId() !== p.id) history.pushState({ posterhub: p.id }, '', posterHash(p.id));
    setNotice(message);
    setOpen(p);
  }

  /** The editor has saved; go back to My posters. `viaBack` means the browser already left the poster's history entry. */
  function close(viaBack = false) {
    if (!viaBack && hashPosterId()) {
      if (history.state?.posterhub) history.back();
      else history.replaceState(null, '', libraryUrl());
    }
    setOpen(null);
  }

  return open ? (
    <Suspense fallback={<div className="app-loading" role="status">Opening poster…</div>}>
      <Editor key={open.id} initial={open} notice={notice} onClose={close} />
    </Suspense>
  ) : (
    <Library onOpen={openPoster} />
  );
}

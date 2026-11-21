// A small note in the corner: "ready to work offline" after the first visit,
// and "new version ready" when an update has downloaded.
import { useEffect, useState } from 'react';
import { applyUpdate, registerServiceWorker, type OfflineState } from '../lib/pwa';
import './OfflineStatus.css';

export default function OfflineStatus() {
  const [state, setState] = useState<OfflineState | null>(null);

  useEffect(() => registerServiceWorker(setState), []);

  useEffect(() => {
    if (state !== 'offline-ready') return;
    const t = setTimeout(() => setState(null), 8000);
    return () => clearTimeout(t);
  }, [state]);

  if (!state) return null;
  return (
    <div className="offline-status" role="status">
      {state === 'offline-ready' ? (
        <span>PosterHub is saved on this device and now works without internet.</span>
      ) : (
        <>
          <span>A new version of PosterHub is ready.</span>
          <button className="btn primary" onClick={applyUpdate}>
            Reload
          </button>
        </>
      )}
      <button className="offline-status-close" aria-label="Dismiss" onClick={() => setState(null)}>
        ×
      </button>
    </div>
  );
}

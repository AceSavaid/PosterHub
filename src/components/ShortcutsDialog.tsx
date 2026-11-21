import { useState } from 'react';
import { useDialog } from '../lib/useDialog';
import { keys } from '../lib/keys';
import { searchShortcuts } from '../lib/shortcuts';

/** Every editor shortcut, grouped and searchable. Opened with "?" or from the View menu. */
export default function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const dialog = useDialog(onClose, 'shortcuts-title');
  const groups = searchShortcuts(query);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide shortcuts-dialog" {...dialog}>
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <input type="search" autoFocus placeholder="Search, e.g. undo or group" aria-label="Search shortcuts" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="shortcut-groups">
          {groups.map((g) => (
            <section key={g.name} aria-labelledby={'sc-' + g.name}>
              <h3 id={'sc-' + g.name}>{g.name}</h3>
              <dl>
                {g.items.map((s) => (
                  <div key={s.what} className="shortcut-row">
                    <dt>
                      {s.combos.map((c, i) => (
                        <span key={c}>
                          {i > 0 && <span className="muted"> or </span>}
                          <kbd>{keys(c)}</kbd>
                        </span>
                      ))}
                    </dt>
                    <dd>{s.what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          {!groups.length && <p className="muted">No shortcut matches “{query}”.</p>}
        </div>
        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

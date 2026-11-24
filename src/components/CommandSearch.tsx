import { useMemo, useState } from 'react';
import { useDialog } from '../lib/useDialog';
import { keys } from '../lib/keys';
import { searchCommands, type Command } from '../lib/commands';
import { buildCommands, type CommandContext } from '../lib/commandList';

/**
 * "Search the menus" (Alt+/), like Google Docs: type a few letters of what you want to do
 * and press Enter. Arrow keys move through the matches.
 */
export default function CommandSearch({ context, onClose }: { context: CommandContext; onClose: () => void }) {
  // built once when the box opens: what can run is fixed while it is open
  const [commands] = useState(() => buildCommands(context));
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const dialog = useDialog(onClose, 'command-search-title');
  const found = useMemo(() => searchCommands(query, commands, 12), [query, commands]);
  const current = Math.min(active, Math.max(0, found.length - 1));

  const run = (c: Command | undefined) => {
    if (!c || c.disabled) return;
    onClose();
    // after the search box has closed and handed focus back, so a dialog the command opens keeps it
    setTimeout(c.run, 0);
  };

  return (
    <div className="modal-backdrop command-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal command-search" {...dialog}>
        <h2 id="command-search-title" className="sr-only">Search the menus</h2>
        <input
          type="search"
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls="command-results"
          aria-activedescendant={found[current] ? 'cmd-' + found[current].id : undefined}
          aria-autocomplete="list"
          aria-label="Search the menus"
          placeholder="Search the menus, e.g. landscape or QR code"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              if (!found.length) return;
              const step = e.key === 'ArrowDown' ? 1 : -1;
              setActive((current + step + found.length) % found.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              run(found[current]);
            }
          }}
        />
        <ul id="command-results" role="listbox" aria-label="Commands" className="command-results">
          {found.map((c, i) => (
            <li
              key={c.id}
              id={'cmd-' + c.id}
              role="option"
              aria-selected={i === current}
              aria-disabled={c.disabled || undefined}
              className={'command-row' + (i === current ? ' active' : '') + (c.disabled ? ' disabled' : '')}
              onMouseMove={() => i !== current && setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => run(c)}
            >
              <span className="command-label">{c.label}</span>
              {c.shortcut && <kbd>{keys(c.shortcut)}</kbd>}
              <span className="command-group">{c.group}</span>
            </li>
          ))}
        </ul>
        {!found.length && <p className="muted small command-empty">Nothing matches “{query}”. Try another word, e.g. “picture” or “size”.</p>}
        <p className="muted small command-hint">{keys('↑ ↓ to move · Enter to run · Esc to close · Open any time with Alt /')}</p>
      </div>
    </div>
  );
}

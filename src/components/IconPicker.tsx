import { useId, useMemo, useRef, useState } from 'react';
import { ICON_CATEGORIES, iconArt, searchIcons, type IconCategory, type IconInfo } from '../lib/icons/library';
import { useIconsReady } from '../lib/useIcons';
import { IconSvg } from './IconBody';

const PREVIEW = { main: 'currentColor', second: null };
const COLS = 5;

interface Props {
  onPick: (icon: IconInfo) => void;
  /** highlights the icon currently in use (when changing an icon) */
  selectedId?: string;
  /** label for the search box, e.g. "Search icons" */
  label?: string;
  /** what clicking an icon does, read before its name, e.g. "Insert icon" */
  action?: string;
}

/** Searchable grid of the built-in science icons. Arrow keys move between icons; Enter picks one. */
export function IconPicker({ onPick, selectedId, label = 'Search icons', action = 'Insert icon' }: Props) {
  const ready = useIconsReady();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<IconCategory | ''>('');
  const [active, setActive] = useState(0);
  const grid = useRef<HTMLDivElement>(null);
  const id = useId();
  const results = useMemo(() => searchIcons(query, category), [query, category]);
  const current = Math.min(active, Math.max(0, results.length - 1));

  const focusAt = (i: number) => {
    setActive(i);
    grid.current?.querySelectorAll<HTMLButtonElement>('button')[i]?.focus();
  };

  return (
    <div className="icon-picker">
      <div className="icon-search">
        <input
          type="search"
          aria-label={label}
          placeholder="e.g. cell, flask, mouse"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && results.length) {
              e.preventDefault();
              focusAt(0);
            } else if (e.key === 'Enter' && results.length) {
              e.preventDefault();
              onPick(results[0]);
            }
          }}
        />
        <select aria-label="Icon category" value={category} onChange={(e) => {
          setCategory(e.target.value as IconCategory | '');
          setActive(0);
        }}>
          <option value="">All categories</option>
          {ICON_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>
      <p className="hint icon-count" id={id + '-count'} aria-live="polite">
        {!ready ? 'Loading icons…' : results.length ? `${results.length} icon${results.length === 1 ? '' : 's'}` : 'No icons match. Try another word, such as “cell”, “lab” or “chart”.'}
      </p>
      {ready && results.length > 0 && (
        <div
          className="icon-grid"
          ref={grid}
          role="group"
          aria-label="Icons"
          onKeyDown={(e) => {
            const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS } as Record<string, number>;
            let to = -1;
            if (step[e.key]) to = current + step[e.key];
            else if (e.key === 'Home') to = 0;
            else if (e.key === 'End') to = results.length - 1;
            else return;
            e.preventDefault();
            e.stopPropagation(); // arrows here move between icons, not nudge the selected element
            focusAt(Math.max(0, Math.min(results.length - 1, to)));
          }}
        >
          {results.map((icon, i) => {
            const art = iconArt(icon.id);
            return (
              <button
                key={icon.id}
                type="button"
                className={'icon-btn' + (icon.id === selectedId ? ' on' : '')}
                tabIndex={i === current ? 0 : -1}
                aria-label={`${action}: ${icon.label}`}
                aria-pressed={selectedId ? icon.id === selectedId : undefined}
                title={icon.label}
                data-icon={icon.id}
                onFocus={() => setActive(i)}
                onClick={() => onPick(icon)}
              >
                {art && <IconSvg art={art} colors={PREVIEW} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

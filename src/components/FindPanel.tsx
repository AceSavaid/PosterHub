import { useEffect, useMemo, useRef, useState } from 'react';
import type { Poster } from '../types';
import { BLOCK_TAG_NAMES, findInPoster, replaceAllInPoster, replaceInHtml, searchPattern, searchableText, type FindOptions, type PosterMatch } from '../lib/textTools';

interface Props {
  poster: Poster;
  /** the poster page in the editor, used to highlight matches */
  posterNode: HTMLElement | null;
  onPick: (elementId: string) => void;
  /** apply a change to the poster as one undo step */
  onChange: (fn: (draft: Poster) => void) => void;
  onNotify: (msg: string) => void;
  onClose: () => void;
}

/** Find (and optionally replace) words across every text box on the poster. */
export default function FindPanel({ poster, posterNode, onPick, onChange, onNotify, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [current, setCurrent] = useState(0);
  const findRef = useRef<HTMLInputElement>(null);
  const opts: FindOptions = useMemo(() => ({ matchCase, wholeWord }), [matchCase, wholeWord]);
  const matches = useMemo(() => findInPoster(poster, query, opts), [poster, query, opts]);
  const cur = matches.length ? Math.min(current, matches.length - 1) : -1;
  const boxes = new Set(matches.map((m) => m.elementId)).size;

  useEffect(() => {
    findRef.current?.focus();
    findRef.current?.select();
  }, []);

  // Start again from the first match whenever the search itself changes.
  useEffect(() => setCurrent(0), [query, matchCase, wholeWord]);

  // Select the box with the current match so it is easy to see.
  const curMatch = cur >= 0 ? matches[cur] : null;
  useEffect(() => {
    if (curMatch) onPick(curMatch.elementId);
  }, [curMatch?.elementId, cur]); // eslint-disable-line react-hooks/exhaustive-deps

  useHighlights(posterNode, poster, matches, cur);

  function step(dir: 1 | -1) {
    if (!matches.length) return;
    setCurrent((cur + dir + matches.length) % matches.length);
  }

  function replaceOne() {
    if (!curMatch) return;
    const { elementId, index } = curMatch;
    onChange((d) => {
      const el = d.elements.find((e) => e.id === elementId);
      if (el?.html != null) el.html = replaceInHtml(el.html, query, replacement, opts, index).html;
    });
    // If the new words still match (e.g. "cell" → "cells"), move past them.
    const re = searchPattern(query, opts);
    if (re && re.test(replacement)) setCurrent(cur + 1);
  }

  function replaceAll() {
    if (!matches.length) return;
    let n = 0;
    onChange((d) => {
      n = replaceAllInPoster(d, query, replacement, opts);
    });
    onNotify(`Replaced ${n} ${n === 1 ? 'match' : 'matches'}. Press Ctrl/⌘ Z to undo.`);
  }

  const status = !query.trim() ? 'Type a word or phrase to find it on the poster' : matches.length ? `${cur + 1} of ${matches.length} · in ${boxes} ${boxes === 1 ? 'box' : 'boxes'}` : 'No matches';

  return (
    <div
      className="check-panel find-panel"
      role="dialog"
      aria-label="Find and replace"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="check-head">
        <strong>Find and replace</strong>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <label className="find-field">
        <span>Find</span>
        <input
          ref={findRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              step(e.shiftKey ? -1 : 1);
            }
          }}
          placeholder="Word or phrase"
        />
      </label>
      <div className="find-nav">
        <span className="muted small" role="status">{status}</span>
        <span className="spacer" />
        <button className="icon-btn" disabled={matches.length < 2} onClick={() => step(-1)} aria-label="Previous match" title="Previous (Shift Enter)">↑</button>
        <button className="icon-btn" disabled={matches.length < 2} onClick={() => step(1)} aria-label="Next match" title="Next (Enter)">↓</button>
      </div>
      <label className="find-field">
        <span>Replace with</span>
        <input
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              replaceOne();
            }
          }}
          placeholder="Leave empty to delete"
        />
      </label>
      <div className="find-options">
        <label className="toggle"><input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} /> Match case</label>
        <label className="toggle"><input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} /> Whole words only</label>
      </div>
      <div className="find-actions">
        <button className="btn" disabled={!curMatch} onClick={replaceOne}>Replace</button>
        <button className="btn primary" disabled={!matches.length} onClick={replaceAll}>
          Replace all{matches.length ? ` (${matches.length})` : ''}
        </button>
      </div>
      {matches.length > 0 && (
        <ul className="find-list" aria-label="Matches">
          {matches.slice(0, 100).map((m, i) => (
            <li key={m.elementId + ':' + m.index}>
              <button className={i === cur ? 'on' : ''} aria-current={i === cur} onClick={() => setCurrent(i)}>
                …{m.before}
                <mark>{m.found}</mark>
                {m.after}…
              </button>
            </li>
          ))}
          {matches.length > 100 && <li className="muted small">and {matches.length - 100} more</li>}
        </ul>
      )}
    </div>
  );
}

// ---- highlight matches on the poster itself (CSS Custom Highlight API, where the browser has it)

type HighlightCtor = new (...ranges: Range[]) => unknown;
interface HighlightRegistry {
  set(name: string, h: unknown): void;
  delete(name: string): void;
}

function useHighlights(root: HTMLElement | null, poster: Poster, matches: PosterMatch[], cur: number) {
  useEffect(() => {
    const registry = (globalThis.CSS as unknown as { highlights?: HighlightRegistry })?.highlights;
    const Highlight = (globalThis as unknown as { Highlight?: HighlightCtor }).Highlight;
    if (!root || !registry || !Highlight) return;
    // Wait a frame so the boxes show the latest text before ranges are made.
    const raf = requestAnimationFrame(() => {
      const all: Range[] = [];
      let active: Range | null = null;
      const byEl = new Map<string, { m: PosterMatch; i: number }[]>();
      matches.forEach((m, i) => byEl.set(m.elementId, [...(byEl.get(m.elementId) ?? []), { m, i }]));
      for (const [id, list] of byEl) {
        const body = root.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"] .el-body`);
        const html = poster.elements.find((e) => e.id === id)?.html ?? '';
        if (!body) continue;
        const map = domTextMap(body);
        if (map.text !== searchableText(html)) continue; // the box is being edited; skip rather than guess
        for (const { m, i } of list) {
          const a = map.pos[m.start];
          const b = map.pos[m.end - 1];
          if (!a || !b) continue;
          const r = document.createRange();
          r.setStart(a[0], a[1]);
          r.setEnd(b[0], b[1] + 1);
          all.push(r);
          if (i === cur) active = r;
        }
      }
      registry.set('find-match', new Highlight(...all));
      if (active) registry.set('find-current', new Highlight(active));
      else registry.delete('find-current');
    });
    return () => {
      cancelAnimationFrame(raf);
      registry.delete('find-match');
      registry.delete('find-current');
    };
  }, [root, poster, matches, cur]);
}

/** Walks rendered text the same way the HTML search does, remembering where each character lives. */
function domTextMap(root: Node) {
  let text = '';
  const pos: ([Text, number] | null)[] = [];
  const walk = (n: Node) => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === Node.TEXT_NODE) {
        const t = c as Text;
        for (let i = 0; i < t.data.length; i++) pos.push([t, i]);
        text += t.data;
      } else if (c.nodeType === Node.ELEMENT_NODE) {
        const block = BLOCK_TAG_NAMES.has((c as Element).tagName);
        if (block) {
          text += '\n';
          pos.push(null);
        }
        walk(c);
        if (block && (c as Element).tagName !== 'BR') {
          text += '\n';
          pos.push(null);
        }
      }
    }
  };
  walk(root);
  return { text, pos };
}

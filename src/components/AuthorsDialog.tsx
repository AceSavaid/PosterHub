import { useEffect, useRef, useState } from 'react';
import type { Author, AuthorList } from '../types';
import { authorListProblems, authorsHtml, emptyAuthorList, removeAffiliation } from '../lib/authors';

interface Props {
  initial?: AuthorList;
  /** true when this replaces text the person typed by hand */
  replacing?: boolean;
  onSave: (list: AuthorList, html: string) => void;
  onCancel: () => void;
}

/** Type each author and institution once; the numbered author line is built for you. */
export default function AuthorsDialog({ initial, replacing, onSave, onCancel }: Props) {
  const [list, setList] = useState<AuthorList>(() => structuredClone(initial ?? emptyAuthorList()));
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const setAuthor = (i: number, patch: Partial<Author>) =>
    setList((l) => ({ ...l, authors: l.authors.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));
  const toggleAff = (i: number, k: number) => {
    const a = list.authors[i];
    setAuthor(i, { affiliations: a.affiliations.includes(k) ? a.affiliations.filter((x) => x !== k) : [...a.affiliations, k].sort((x, y) => x - y) });
  };
  const move = (i: number, d: -1 | 1) =>
    setList((l) => {
      const authors = l.authors.slice();
      const j = i + d;
      if (j < 0 || j >= authors.length) return l;
      [authors[i], authors[j]] = [authors[j], authors[i]];
      return { ...l, authors };
    });

  const problems = authorListProblems(list);
  const html = authorsHtml(list);
  const hasName = list.authors.some((a) => a.name.trim());

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal wide authors-dialog" role="dialog" aria-modal="true" aria-labelledby="authors-title">
        <h2 id="authors-title">Authors and affiliations</h2>
        <p className="muted">Type each institution once, then tick which ones each author belongs to. Numbers, commas and the contact line are added for you.</p>

        <h3>Institutions</h3>
        <ol className="aff-list">
          {list.affiliations.map((aff, k) => (
            <li key={k}>
              <input
                aria-label={`Institution ${k + 1}`}
                placeholder="Department, University, City, Country"
                value={aff}
                onChange={(e) => setList((l) => ({ ...l, affiliations: l.affiliations.map((x, j) => (j === k ? e.target.value : x)) }))}
              />
              {list.affiliations.length > 1 && (
                <button className="icon-btn" aria-label={`Remove institution ${k + 1}`} title="Remove" onClick={() => setList((l) => removeAffiliation(l, k))}>
                  ✕
                </button>
              )}
            </li>
          ))}
        </ol>
        <button className="btn small-btn" onClick={() => setList((l) => ({ ...l, affiliations: [...l.affiliations, ''] }))}>
          + Add institution
        </button>

        <h3>Authors</h3>
        <p className="hint">In the order they should appear. Underline marks who is presenting; * marks the contact author.</p>
        <div className="author-rows">
          {list.authors.map((a, i) => (
            <fieldset key={i} className="author-row">
              <legend className="sr-only">Author {i + 1}</legend>
              <div className="author-main">
                <input ref={i === 0 ? first : undefined} aria-label={`Author ${i + 1} name`} placeholder="Full name" value={a.name} onChange={(e) => setAuthor(i, { name: e.target.value })} />
                <button className="icon-btn" aria-label={`Move author ${i + 1} up`} title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="icon-btn" aria-label={`Move author ${i + 1} down`} title="Move down" disabled={i === list.authors.length - 1} onClick={() => move(i, 1)}>↓</button>
                {list.authors.length > 1 && (
                  <button className="icon-btn" aria-label={`Remove author ${i + 1}`} title="Remove" onClick={() => setList((l) => ({ ...l, authors: l.authors.filter((_, j) => j !== i) }))}>
                    ✕
                  </button>
                )}
              </div>
              <div className="author-opts">
                {list.affiliations.length > 0 && (
                  <span className="aff-ticks" role="group" aria-label={`Institutions for author ${i + 1}`}>
                    {list.affiliations.map((aff, k) => (
                      <label key={k} className="chip" title={aff || `Institution ${k + 1}`}>
                        <input type="checkbox" checked={a.affiliations.includes(k)} onChange={() => toggleAff(i, k)} aria-label={`Author ${i + 1} at institution ${k + 1}`} />
                        {k + 1}
                      </label>
                    ))}
                  </span>
                )}
                <label className="chip">
                  <input
                    type="radio"
                    name="presenter"
                    checked={!!a.presenter}
                    onChange={() => setList((l) => ({ ...l, authors: l.authors.map((x, j) => ({ ...x, presenter: j === i })) }))}
                    aria-label={`Author ${i + 1} is presenting`}
                  />
                  Presenting
                </label>
                <label className="chip">
                  <input type="checkbox" checked={!!a.corresponding} onChange={(e) => setAuthor(i, { corresponding: e.target.checked })} aria-label={`Author ${i + 1} is the contact`} />
                  Contact *
                </label>
                {list.showOrcid && (
                  <input className="orcid" aria-label={`Author ${i + 1} ORCID iD`} placeholder="ORCID iD (optional)" value={a.orcid ?? ''} onChange={(e) => setAuthor(i, { orcid: e.target.value })} />
                )}
              </div>
            </fieldset>
          ))}
        </div>
        <button
          className="btn small-btn"
          onClick={() => setList((l) => ({ ...l, authors: [...l.authors, { name: '', affiliations: l.affiliations.length === 1 ? [0] : [] }] }))}
        >
          + Add author
        </button>

        <h3>Contact</h3>
        <div className="author-contact">
          <label>
            Contact email
            <input type="email" placeholder="name@university.edu" value={list.email ?? ''} onChange={(e) => setList((l) => ({ ...l, email: e.target.value }))} />
          </label>
          <label className="toggle">
            <input type="checkbox" checked={!!list.showOrcid} onChange={(e) => setList((l) => ({ ...l, showOrcid: e.target.checked }))} /> Show ORCID iDs
          </label>
        </div>

        <h3>Preview</h3>
        <div className="authors-preview" data-testid="authors-preview" dangerouslySetInnerHTML={{ __html: html || '<span class="muted">Type an author name to see the line.</span>' }} />
        {hasName && problems.length > 0 && (
          <ul className="authors-problems" role="status">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {replacing && <p className="hint">This replaces the text in the selected box, including any changes you typed into it by hand.</p>}

        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={!hasName} onClick={() => onSave(list, html)}>
            {initial ? 'Update authors' : 'Add to poster'}
          </button>
        </div>
      </div>
    </div>
  );
}

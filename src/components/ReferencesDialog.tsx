import { useEffect, useRef, useState } from 'react';
import type { CitationStyle, Poster, RefKind, RefName, Reference } from '../types';
import { uid } from '../model';
import { pickFile } from '../lib/storage';
import { looksLikeBibtex, parseBibtex } from '../lib/refs/bibtex';
import { extractDois, lookupDoi, parseCslJson } from '../lib/refs/doi';
import { CITATION_STYLES, DEFAULT_STYLE, formatReference, shortLabel } from '../lib/refs/format';
import { bibliography, citeCounts, findDuplicate, removeReference } from '../lib/refs/citations';

interface Props {
  poster: Poster;
  update: (fn: (d: Poster) => void, coalesce?: string) => void;
  /** a text box is selected that could become the reference list */
  selectedTextId: string | null;
  onAddList: (useSelected: boolean) => void;
  onShowList: () => void;
  onClose: () => void;
}

const KINDS: { id: RefKind; label: string }[] = [
  { id: 'article', label: 'Journal article' },
  { id: 'book', label: 'Book' },
  { id: 'chapter', label: 'Book chapter' },
  { id: 'conference', label: 'Conference paper' },
  { id: 'thesis', label: 'Thesis' },
  { id: 'report', label: 'Report' },
  { id: 'web', label: 'Web page' },
  { id: 'other', label: 'Other (preprint, dataset…)' },
];

/** Adds references from pasted text: BibTeX, CSL-JSON or DOIs. Returns what was found. */
export async function referencesFromText(text: string, fetchFn?: typeof fetch): Promise<{ refs: Reference[]; errors: string[] }> {
  if (looksLikeBibtex(text)) {
    const refs = parseBibtex(text);
    return { refs, errors: refs.length ? [] : ['No BibTeX entries could be read. Check the text starts with @article{…'] };
  }
  const csl = parseCslJson(text);
  if (csl) return { refs: csl, errors: [] };
  const dois = extractDois(text);
  if (!dois.length) return { refs: [], errors: ['No DOIs or BibTeX found. Paste a DOI such as 10.1038/nature14539, a doi.org link, or BibTeX.'] };
  const results = await Promise.allSettled(dois.map((d) => lookupDoi(d, fetchFn)));
  const refs: Reference[] = [];
  const errors: string[] = [];
  results.forEach((r) => (r.status === 'fulfilled' ? refs.push(r.value) : errors.push((r.reason as Error).message)));
  return { refs, errors };
}

export default function ReferencesDialog({ poster, update, selectedTextId, onAddList, onShowList, onClose }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ msg: string; errors: string[] } | null>(null);
  const [editing, setEditing] = useState<Reference | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const refs = poster.references ?? [];
  const style = poster.citationStyle ?? DEFAULT_STYLE;
  const bib = bibliography(poster);
  const counts = citeCounts(poster);
  const hasList = poster.elements.some((e) => e.refList);

  useEffect(() => {
    box.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (editing) setEditing(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [editing, onClose]);

  function addAll(found: Reference[], errors: string[]) {
    let added = 0;
    let dupes = 0;
    update((d) => {
      d.references ??= [];
      for (const r of found) {
        if (findDuplicate(d.references, r)) dupes++;
        else {
          d.references.push(r);
          added++;
        }
      }
    });
    const bits = [];
    if (added) bits.push(`Added ${added} reference${added > 1 ? 's' : ''}.`);
    if (dupes) bits.push(`${dupes} ${dupes > 1 ? 'were' : 'was'} already in the list.`);
    setStatus({ msg: bits.join(' ') || (errors.length ? '' : 'Nothing new to add.'), errors });
    return added;
  }

  async function addFromText(src = text) {
    if (!src.trim()) return;
    setBusy(true);
    const dois = looksLikeBibtex(src) ? [] : extractDois(src);
    setStatus({ msg: dois.length ? `Looking up ${dois.length} DOI${dois.length > 1 ? 's' : ''}…` : 'Reading…', errors: [] });
    try {
      const { refs: found, errors } = await referencesFromText(src);
      if (addAll(found, errors) || !errors.length) setText('');
    } finally {
      setBusy(false);
    }
  }

  async function importBib() {
    const f = await pickFile('.bib,.bibtex,.json,.txt,text/plain,application/json');
    if (f) await addFromText(await f.text());
  }

  const remove = (r: Reference) => update((d) => removeReference(d, r.id));

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide refs-dialog" role="dialog" aria-modal="true" aria-labelledby="refs-title">
        <div className="refs-head">
          <h2 id="refs-title">References</h2>
          <button className="icon-btn" aria-label="Close" title="Close (Esc)" onClick={onClose}>✕</button>
        </div>

        {editing ? (
          <RefForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={(r) => {
              update((d) => {
                d.references ??= [];
                const k = d.references.findIndex((x) => x.id === r.id);
                if (k >= 0) d.references[k] = r;
                else d.references.push(r);
              });
              setEditing(null);
            }}
          />
        ) : (
          <>
            <label>
              Paste DOIs or BibTeX
              <textarea
                ref={box}
                className="refs-input"
                rows={4}
                value={text}
                placeholder={'10.1038/nature14539\nhttps://doi.org/10.1126/science.aaa8415\n@article{smith2020, author = {Smith, Jane}, title = {…}, …}'}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addFromText();
                }}
              />
            </label>
            <p className="hint">
              One DOI per line, doi.org links or arXiv ids are looked up online. BibTeX from Zotero, Mendeley or Google Scholar works offline.
            </p>
            <div className="toolbar-row">
              <button className="btn primary" disabled={busy || !text.trim()} onClick={() => addFromText()}>
                {busy ? 'Adding…' : 'Add references'}
              </button>
              <button className="btn" disabled={busy} onClick={importBib}>Import .bib file…</button>
              <button className="btn" disabled={busy} onClick={() => setEditing({ id: uid(), kind: 'article', authors: [], title: '' })}>Type one in…</button>
            </div>
            <div className="refs-status" role="status" aria-live="polite">
              {status?.msg && <span>{status.msg}</span>}
              {status?.errors.map((e, k) => (
                <span key={k} className="danger">{e}</span>
              ))}
            </div>

            <div className="refs-style-row">
              <label>
                Citation style
                <select value={style} onChange={(e) => update((d) => void (d.citationStyle = e.target.value as CitationStyle))}>
                  {CITATION_STYLES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label} — cites as {s.example}
                    </option>
                  ))}
                </select>
              </label>
              <div className="refs-list-status">
                {hasList ? (
                  <button className="btn" onClick={onShowList}>Show list on poster</button>
                ) : (
                  <>
                    <button className="btn primary" onClick={() => onAddList(false)}>Add reference list to poster</button>
                    {selectedTextId && (
                      <button className="btn" onClick={() => onAddList(true)} title="Replace the selected text box's text with the reference list">
                        Use selected text box
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {refs.length === 0 ? (
              <p className="muted refs-empty">No references yet. Paste a few DOIs above to get started.</p>
            ) : (
              <ol className="refs-list" aria-label="Your references">
                {bib.ordered.map((r) => {
                  const n = counts.get(r.id) ?? 0;
                  return (
                    <li key={r.id}>
                      <span className="refs-num">{bib.numbers.get(r.id) ?? ''}</span>
                      <div className="refs-text">
                        <div className="refs-formatted" dangerouslySetInnerHTML={{ __html: formatReference(r, style, bib.suffix.get(r.id)) }} />
                        <small className={n ? 'muted' : 'refs-uncited'}>{n ? `Cited ${n}×` : 'Not cited in the text yet'}</small>
                      </div>
                      <div className="refs-actions">
                        <button className="btn small-btn" onClick={() => setEditing(structuredClone(r))} aria-label={`Edit ${shortLabel(r)}`}>Edit</button>
                        <button className="btn small-btn danger" onClick={() => remove(r)} aria-label={`Remove ${shortLabel(r)}`}>Remove</button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="hint">
              <b>To cite:</b> double-click a text box, click where the citation goes, then pick a reference under <b>Cite</b> in the properties panel. Numbers update by
              themselves as you add, move or remove citations.
            </p>
            <div className="modal-actions">
              <button className="btn primary" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const namesToText = (ns: RefName[] | undefined) => (ns ?? []).map((n) => (n.given ? `${n.family}, ${n.given}` : n.family)).join('\n');
const textToNames = (t: string): RefName[] =>
  t
    .split(/\n|;/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      if (l.includes(',')) {
        const [family, ...rest] = l.split(',');
        const given = rest.join(',').trim();
        return given ? { family: family.trim(), given } : { family: family.trim() };
      }
      const w = l.split(/\s+/);
      return w.length > 1 ? { family: w[w.length - 1], given: w.slice(0, -1).join(' ') } : { family: l };
    });

function RefForm({ initial, onSave, onCancel }: { initial: Reference; onSave: (r: Reference) => void; onCancel: () => void }) {
  const [r, setR] = useState(initial);
  const [authors, setAuthors] = useState(namesToText(initial.authors));
  const [editors, setEditors] = useState(namesToText(initial.editors));
  const set = (k: keyof Reference) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setR({ ...r, [k]: e.target.value });
  const field = (k: keyof Reference, label: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label>
      {label}
      <input value={(r[k] as string | undefined) ?? ''} onChange={set(k)} {...extra} />
    </label>
  );
  const containerLabel = r.kind === 'article' ? 'Journal' : r.kind === 'chapter' ? 'Book title' : r.kind === 'conference' ? 'Conference / proceedings' : r.kind === 'web' ? 'Website' : r.kind === 'thesis' ? 'Thesis type (e.g. Doctoral dissertation)' : 'Published in';
  return (
    <form
      className="refs-form"
      onSubmit={(e) => {
        e.preventDefault();
        const out: Reference = { ...r, authors: textToNames(authors), title: r.title.trim() };
        const eds = textToNames(editors);
        if (eds.length) out.editors = eds;
        else delete out.editors;
        for (const k of Object.keys(out) as (keyof Reference)[]) if (typeof out[k] === 'string') (out as unknown as Record<string, string>)[k] = (out[k] as string).trim();
        for (const k of Object.keys(out) as (keyof Reference)[]) if (out[k] === '') delete out[k];
        onSave(out);
      }}
    >
      <div className="row2">
        <label>
          Type
          <select value={r.kind} onChange={set('kind')}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>{k.label}</option>
            ))}
          </select>
        </label>
        {field('year', 'Year', { inputMode: 'numeric', maxLength: 10 })}
      </div>
      <label>
        Authors (one per line, “Family, Given”)
        <textarea rows={3} value={authors} onChange={(e) => setAuthors(e.target.value)} placeholder={'Curie, Marie\nWorld Health Organization'} />
      </label>
      {field('title', 'Title', { required: true, autoFocus: true })}
      {r.kind !== 'book' && r.kind !== 'report' && field('container', containerLabel)}
      {(r.kind === 'article' || r.kind === 'other') && (
        <div className="row3">
          {field('volume', 'Volume')}
          {field('issue', 'Issue')}
          {field('pages', 'Pages')}
        </div>
      )}
      {(r.kind === 'chapter' || r.kind === 'conference') && (
        <>
          <label>
            Editors (optional, one per line)
            <textarea rows={2} value={editors} onChange={(e) => setEditors(e.target.value)} />
          </label>
          {field('pages', 'Pages')}
        </>
      )}
      {r.kind !== 'article' && (
        <div className="row2">
          {field('publisher', r.kind === 'thesis' ? 'University' : 'Publisher')}
          {field('place', 'Place')}
        </div>
      )}
      {r.kind === 'book' && field('edition', 'Edition (e.g. 2)')}
      <div className="row2">
        {field('doi', 'DOI', { placeholder: '10.xxxx/…' })}
        {field('url', 'Web address', { type: 'url', placeholder: 'https://…' })}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn primary">Save reference</button>
      </div>
    </form>
  );
}

import { useMemo, useState } from 'react';
import type { Poster } from '../types';
import { isStarterText } from '../templates';
import { htmlToText } from '../lib/sanitize';
import { pickFile } from '../lib/storage';
import { useDialog } from '../lib/useDialog';
import { parseAbstract, posterSections, readDocx, suggestTargets, type AbstractPart, type FillPlan } from '../lib/abstractImport';

interface Props {
  poster: Poster;
  onFill: (plan: FillPlan) => void;
  onCancel: () => void;
}

interface Row {
  part: AbstractPart;
  /** index into the poster's sections, or -1 to leave the part out */
  target: number;
}

const EXAMPLE = 'Background: …\nMethods: …\nResults: …\nConclusions: …';

/** Paste an abstract or open a Word file; check where each part goes; fill the poster. */
export default function AbstractDialog({ poster, onFill, onCancel }: Props) {
  const dialog = useDialog(onCancel, 'abstract-title');
  const sections = useMemo(() => posterSections(poster.elements), [poster.elements]);
  const titleEl = poster.elements.find((e) => e.type === 'title');
  const [text, setText] = useState('');
  const [docTitle, setDocTitle] = useState<string>();
  const [useTitle, setUseTitle] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [structured, setStructured] = useState(false);
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function review(source: string) {
    const parsed = parseAbstract(source);
    if (!parsed.parts.length) {
      setError('No text found. Paste your abstract into the box first.');
      return;
    }
    const t = suggestTargets(parsed.parts, sections);
    setRows(parsed.parts.map((part, i) => ({ part, target: t[i] ?? -1 })));
    setStructured(parsed.structured);
    setError('');
  }

  async function openWord() {
    const f = await pickFile('.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    if (!f) return;
    setBusy(true);
    try {
      const r = await readDocx(f);
      if (!r.text.trim()) throw new Error('That Word file has no text to use.');
      setText(r.text);
      setDocTitle(r.title);
      setUseTitle(!!r.title && (!titleEl || isStarterText(titleEl.html) || !htmlToText(titleEl.html).trim()));
      review(r.text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, part: { ...r.part, ...(patch.part ?? {}) }, target: patch.target ?? r.target } : r)));
  const overwrites = rows ? [...new Set(rows.filter((r) => r.target >= 0 && r.part.text.trim()).map((r) => r.target))].filter((t) => sections[t].edited) : [];
  const using = rows?.filter((r) => r.target >= 0 && r.part.text.trim()).length ?? 0;

  function fill() {
    if (!rows) return;
    onFill({
      parts: rows.map((r) => ({ part: r.part, bodyId: r.target >= 0 ? sections[r.target].bodyId : null })),
      title: useTitle && docTitle ? docTitle : undefined,
      replace,
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div {...dialog} className="modal wide abstract-dialog">
        <h2 id="abstract-title">Fill from your abstract</h2>
        {!rows ? (
          <>
            <p className="muted">
              Paste your abstract, or open the Word file it is in. Each part (background, methods, results, conclusions) goes into the matching section, and you
              can check it before anything changes.
            </p>
            {!sections.length && (
              <div className="banner warn" role="status">
                This poster has no sections yet. Pick a layout first (Layout tab → Switch layout), then come back.
              </div>
            )}
            <label className="field-label" htmlFor="abstract-text">Abstract</label>
            <textarea id="abstract-text" rows={10} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={`Paste here. Headings help, for example:\n${EXAMPLE}`} />
            {error && <div className="banner error" role="alert">{error}</div>}
            <div className="modal-actions spread">
              <button className="btn" onClick={openWord} disabled={busy}>
                {busy ? 'Reading…' : 'Open a Word file (.docx)…'}
              </button>
              <span>
                <button className="btn" onClick={onCancel}>Cancel</button>{' '}
                <button className="btn primary" disabled={!text.trim() || !sections.length} onClick={() => review(text)}>
                  Next: check where it goes
                </button>
              </span>
            </div>
          </>
        ) : (
          <>
            <p className="muted" role="status">
              {structured
                ? `Found ${rows.length} part${rows.length > 1 ? 's' : ''} by their headings. Check where each one goes.`
                : 'Your abstract has no headings, so this split is a best guess. Check each part, and move sentences between boxes if needed.'}
            </p>
            {docTitle && (
              <label className="check abstract-title-row">
                <input type="checkbox" checked={useTitle} onChange={(e) => setUseTitle(e.target.checked)} /> Use “{docTitle}” as the poster title
              </label>
            )}
            <ol className="abstract-parts">
              {rows.map((r, i) => (
                <li key={i} className={r.target < 0 ? 'left-out' : ''}>
                  <div className="abstract-part-head">
                    <strong id={`abs-part-${i}`}>
                      {r.part.label}
                      {r.part.guessed && <span className="tag">best guess</span>}
                    </strong>
                    <label>
                      Put in{' '}
                      <select aria-label={`Where ${r.part.label} goes`} value={r.target} onChange={(e) => setRow(i, { target: +e.target.value })}>
                        {sections.map((s, k) => (
                          <option key={k} value={k}>{s.name || `Section ${k + 1}`}</option>
                        ))}
                        <option value={-1}>Leave out</option>
                      </select>
                    </label>
                  </div>
                  <textarea aria-labelledby={`abs-part-${i}`} rows={Math.min(8, Math.max(2, Math.ceil(r.part.text.length / 90)))} value={r.part.text} onChange={(e) => setRow(i, { part: { ...r.part, text: e.target.value } })} />
                </li>
              ))}
            </ol>
            {overwrites.length > 0 && (
              <fieldset className="abstract-replace">
                <legend>
                  {overwrites.map((t) => sections[t].name).join(', ')} already {overwrites.length > 1 ? 'have' : 'has'} your own text.
                </legend>
                <label className="check">
                  <input type="radio" name="abs-replace" checked={!replace} onChange={() => setReplace(false)} /> Add the abstract after it
                </label>
                <label className="check">
                  <input type="radio" name="abs-replace" checked={replace} onChange={() => setReplace(true)} /> Replace it
                </label>
              </fieldset>
            )}
            <p className="hint">Parts going to the same section are labelled (for example “Methods.”) so readers can tell them apart. You can undo afterwards.</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setRows(null)}>Back</button>
              <button className="btn" onClick={onCancel}>Cancel</button>
              <button className="btn primary" disabled={!using && !(useTitle && docTitle)} onClick={fill}>
                Fill poster
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDialog } from '../lib/useDialog';
import type { EquationSpec, Poster } from '../types';
import { resolveColor } from '../model';
import { SNIPPETS, insertSnippet, mathSvg, svgDataUrl, typesetLatex } from '../lib/math';
import { useMathReady } from '../lib/useMath';
import { keys } from '../lib/keys';
import { useDiscardGuard } from './useDiscardGuard';

interface Props {
  poster: Poster;
  initial: EquationSpec;
  isNew: boolean;
  onSave: (spec: EquationSpec) => void;
  onCancel: () => void;
}

const EXAMPLES: { label: string; tex: string }[] = [
  { label: 'E = mc²', tex: 'E = mc^2' },
  { label: 'Quadratic formula', tex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
  { label: 'Mean', tex: '\\bar{x} = \\frac{1}{n} \\sum_{i=1}^{n} x_i' },
  { label: 'Standard deviation', tex: 's = \\sqrt{\\frac{1}{n-1} \\sum_{i=1}^{n} (x_i - \\bar{x})^2}' },
  { label: 'Linear model', tex: 'y_i = \\beta_0 + \\beta_1 x_i + \\varepsilon_i' },
  { label: 'Bayes', tex: 'P(A \\mid B) = \\frac{P(B \\mid A)\\,P(A)}{P(B)}' },
];

/** Write or change an equation in LaTeX, with a live preview and buttons for common symbols. */
export default function EquationDialog({ poster, initial, isNew, onSave, onCancel }: Props) {
  const ready = useMathReady();
  const [latex, setLatex] = useState(initial.latex);
  const [fontSize, setFontSize] = useState(initial.fontSize);
  const { request: cancel, prompt: discardPrompt } = useDiscardGuard(latex !== initial.latex || fontSize !== initial.fontSize, onCancel);
  const dialog = useDialog(cancel, 'eq-title');
  const area = useRef<HTMLTextAreaElement>(null);
  /** Where to put the caret once a snippet insert has rendered. */
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const t = area.current;
    if (t && caret.current != null) {
      t.focus();
      t.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [latex]);

  useEffect(() => {
    const t = area.current;
    if (!t) return;
    t.focus();
    t.select();
  }, []);

  const res = ready ? typesetLatex(latex) : null;
  const color = resolveColor(initial.color, poster.palette);
  const bg = resolveColor('@background', poster.palette);
  const canSave = !!res?.ok;

  function add(snippet: string) {
    const t = area.current;
    const start = t?.selectionStart ?? latex.length;
    const end = t?.selectionEnd ?? latex.length;
    const next = insertSnippet(latex, start, end, snippet);
    caret.current = next.caret;
    setLatex(next.text);
  }

  const save = () => canSave && onSave({ ...initial, latex: latex.trim(), fontSize });

  let preview = null;
  if (res?.ok) {
    const r = res.render;
    // Preview at a comfortable on-screen size, shrunk to fit wide equations.
    const em = 34;
    const k = Math.min(1, 620 / (r.width * em), 200 / (r.height * em));
    preview = <img src={svgDataUrl(mathSvg(r, color, r.width * em * k, r.height * em * k))} alt={latex} />;
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && cancel()}>
      <div {...dialog} className="modal wide equation-dialog">
        <h2 id="eq-title">{isNew ? 'Insert equation' : 'Edit equation'}</h2>
        <label className="eq-field">
          LaTeX
          <textarea
            ref={area}
            value={latex}
            spellCheck={false}
            rows={3}
            placeholder="e.g. E = mc^2   or   \frac{a}{b}"
            aria-describedby="eq-help"
            onChange={(e) => setLatex(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                save();
              }
            }}
          />
        </label>
        <div className="eq-snippets" role="toolbar" aria-label="Insert a symbol">
          {SNIPPETS.map((s) => (
            <button key={s.title} type="button" className="fmt" title={s.title} aria-label={'Insert ' + s.title} onMouseDown={(e) => e.preventDefault()} onClick={() => add(s.tex)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="eq-preview" style={{ background: bg }} aria-live="polite" data-testid="equation-preview">
          {!ready && <span className="muted">Loading the equation typesetter…</span>}
          {preview}
          {res && !res.ok && <span className="eq-error" role="alert">{res.error}</span>}
        </div>
        <p id="eq-help" className="hint">
          Type maths as you would in LaTeX, without the $ signs: <code>x^2</code> for powers, <code>x_i</code> for subscripts, <code>\frac{"{a}{b}"}</code> for fractions,{' '}
          <code>\alpha</code> for Greek letters. It stays perfectly sharp in PDF and PowerPoint. <kbd>{keys('Ctrl/⌘ Enter')}</kbd> saves.
        </p>
        <div className="eq-examples">
          <span className="field-label">Examples:</span>
          {EXAMPLES.map((x) => (
            <button key={x.label} type="button" className="btn small-btn" onClick={() => setLatex(x.tex)}>
              {x.label}
            </button>
          ))}
        </div>
        <div className="modal-actions eq-actions">
          <label className="eq-size">
            Size (pt)
            <input type="number" min={4} max={600} value={fontSize} onChange={(e) => setFontSize(Math.max(4, +e.target.value || 4))} />
          </label>
          <span className="spacer" />
          <button className="btn" onClick={cancel}>Cancel</button>
          <button className="btn primary" disabled={!canSave} onClick={save}>
            {isNew ? 'Insert' : 'Save'}
          </button>
        </div>
      </div>
      {discardPrompt}
    </div>
  );
}

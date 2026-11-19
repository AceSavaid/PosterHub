import type { Poster, PosterElement, TextStyle } from '../types';
import { FontSelect } from './FontSelect';
import { ColorInput } from './ColorInput';
import type { AlignMode } from '../lib/arrange';

interface Props {
  poster: Poster;
  el: PosterElement | null;
  editing: boolean;
  onChange: (patch: Partial<PosterElement> | ((e: PosterElement) => void), coalesce?: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onLayer: (dir: 'front' | 'back' | 'up' | 'down') => void;
  onReplaceImage: () => void;
  onEditChart: () => void;
  multi: number;
  overflow: boolean;
  onShrinkText: () => void;
  onGrowBox: () => void;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: 'x' | 'y') => void;
  onMatchSize: (dim: 'w' | 'h') => void;
}

const ALIGN: { mode: AlignMode; label: string; icon: string }[] = [
  { mode: 'left', label: 'Align left edges', icon: '⇤' },
  { mode: 'hcenter', label: 'Align centres (horizontally)', icon: '↔' },
  { mode: 'right', label: 'Align right edges', icon: '⇥' },
  { mode: 'top', label: 'Align top edges', icon: '⤒' },
  { mode: 'vcenter', label: 'Align middles (vertically)', icon: '↕' },
  { mode: 'bottom', label: 'Align bottom edges', icon: '⤓' },
];

function ArrangeSection({ count, onAlign, onDistribute, onMatchSize }: { count: number } & Pick<Props, 'onAlign' | 'onDistribute' | 'onMatchSize'>) {
  return (
    <section>
      <h4>{count > 1 ? 'Line up' : 'Position on the poster'}</h4>
      <div className="toolbar-row">
        {ALIGN.map((a) => (
          <button key={a.mode} className="fmt" title={count > 1 ? a.label : a.label.replace(/edges|centres|middles/, 'to the page')} aria-label={a.label} onClick={() => onAlign(a.mode)}>
            {a.icon}
          </button>
        ))}
      </div>
      {count === 1 && <p className="hint">Lines up with the poster margins.</p>}
      {count > 2 && (
        <div className="toolbar-row">
          <button className="btn small-btn" onClick={() => onDistribute('x')}>Space evenly across</button>
          <button className="btn small-btn" onClick={() => onDistribute('y')}>Space evenly down</button>
        </div>
      )}
      {count > 1 && (
        <div className="toolbar-row">
          <button className="btn small-btn" onClick={() => onMatchSize('w')}>Same width</button>
          <button className="btn small-btn" onClick={() => onMatchSize('h')}>Same height</button>
        </div>
      )}
      {count > 1 && <p className="hint">“Same width / height” copies the size of the first element you selected.</p>}
    </section>
  );
}

const TYPE_NAMES: Record<string, string> = { title: 'Title', subtitle: 'Subtitle', heading: 'Section header', text: 'Text box', image: 'Image', chart: 'Graph', shape: 'Shape' };

export default function Inspector(props: Props) {
  const { poster, el, editing, onChange, onDelete, onDuplicate, onLayer, onReplaceImage, onEditChart, multi, overflow, onShrinkText, onGrowBox } = props;
  if (multi > 1) {
    return (
      <aside className="panel right">
        <div className="panel-body">
          <div className="insp-head">
            <h3>{multi} elements selected</h3>
            <div className="icon-row">
              <button className="icon-btn" title="Duplicate (Ctrl/⌘ D)" onClick={onDuplicate}>⧉</button>
              <button className="icon-btn danger" title="Delete" onClick={onDelete}>🗑</button>
            </div>
          </div>
          <ArrangeSection count={multi} {...props} />
          <p className="hint">Drag any of them to move them together. Shift-click to add or remove one from the selection.</p>
        </div>
      </aside>
    );
  }
  if (!el) {
    return (
      <aside className="panel right">
        <div className="panel-body">
          <h3>Nothing selected</h3>
          <p className="hint">Click an element on the poster to change its text, colours, size and position. Double-click text to type.</p>
          <h3>Shortcuts</h3>
          <ul className="shortcuts">
            <li><kbd>Ctrl/⌘ Z</kbd> undo, <kbd>Ctrl/⌘ Shift Z</kbd> redo</li>
            <li><kbd>Ctrl/⌘ C / X / V</kbd> copy, cut, paste elements, text or images</li>
            <li><kbd>Ctrl/⌘ D</kbd> duplicate</li>
            <li><kbd>Delete</kbd> remove selected</li>
            <li><kbd>Shift</kbd>-click or drag a box to select several</li>
            <li><kbd>Ctrl/⌘ A</kbd> select everything</li>
            <li><kbd>Arrows</kbd> nudge (Shift = 10 mm)</li>
            <li><kbd>Ctrl/⌘ B / I / U</kbd> bold, italic, underline while typing</li>
            <li><kbd>Esc</kbd> stop editing / deselect</li>
          </ul>
        </div>
      </aside>
    );
  }

  const st = el.style;
  const setStyle = (patch: Partial<TextStyle>, key?: string) => onChange((e) => void Object.assign(e.style!, patch), key);
  const n = (v: number) => Math.round(v * 10) / 10;

  // While typing, B/I/U apply to the selected words; otherwise to the whole box.
  const fmt = (cmd: 'bold' | 'italic' | 'underline', key: 'bold' | 'italic' | 'underline') =>
    editing ? document.execCommand(cmd) : setStyle({ [key]: !st![key] } as Partial<TextStyle>);

  return (
    <aside className="panel right">
      <div className="panel-body">
        <div className="insp-head">
          <h3>{TYPE_NAMES[el.type]}</h3>
          <div className="icon-row">
            <button className="icon-btn" title="Duplicate (Ctrl/⌘ D)" onClick={onDuplicate}>⧉</button>
            <button className="icon-btn" title={el.locked ? 'Unlock' : 'Lock position'} onClick={() => onChange({ locked: !el.locked })}>
              {el.locked ? '🔒' : '🔓'}
            </button>
            <button className="icon-btn danger" title="Delete" onClick={onDelete}>🗑</button>
          </div>
        </div>

        {st && overflow && (
          <section className="warn-box" role="status">
            <strong>Some text is hidden</strong>
            <span>The text is longer than its box.</span>
            <div className="toolbar-row">
              <button className="btn small-btn" onClick={onShrinkText}>Shrink text to fit</button>
              <button className="btn small-btn" onClick={onGrowBox}>Make box taller</button>
            </div>
          </section>
        )}

        {st && (
          <section>
            <h4>Text</h4>
            <label>
              Font
              <FontSelect poster={poster} value={st.fontFamily} allowTheme onChange={(f) => setStyle({ fontFamily: f })} />
            </label>
            <div className="row2">
              <label>
                Size (pt)
                <input type="number" min={4} max={600} value={st.fontSize} onChange={(e) => setStyle({ fontSize: Math.max(1, +e.target.value || 1) }, 'fs')} />
              </label>
              <label>
                Line spacing
                <input type="number" min={0.8} max={3} step={0.05} value={st.lineHeight} onChange={(e) => setStyle({ lineHeight: +e.target.value || 1 }, 'lh')} />
              </label>
            </div>
            <div className="toolbar-row">
              <button className={'fmt' + (st.bold ? ' on' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => fmt('bold', 'bold')} title="Bold">
                <b>B</b>
              </button>
              <button className={'fmt' + (st.italic ? ' on' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => fmt('italic', 'italic')} title="Italic">
                <i>I</i>
              </button>
              <button className={'fmt' + (st.underline ? ' on' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => fmt('underline', 'underline')} title="Underline">
                <u>U</u>
              </button>
              {editing && (
                <>
                  <button className="fmt" onMouseDown={(e) => e.preventDefault()} onClick={() => document.execCommand('superscript')} title="Superscript">x²</button>
                  <button className="fmt" onMouseDown={(e) => e.preventDefault()} onClick={() => document.execCommand('subscript')} title="Subscript">x₂</button>
                  <button className="fmt" onMouseDown={(e) => e.preventDefault()} onClick={() => document.execCommand('insertUnorderedList')} title="Bullet list">•≡</button>
                </>
              )}
              <span className="sep" />
              {(['left', 'center', 'right', 'justify'] as const).map((a) => (
                <button key={a} className={'fmt' + (st.align === a ? ' on' : '')} onClick={() => setStyle({ align: a })} title={'Align ' + a}>
                  <AlignIcon a={a} />
                </button>
              ))}
            </div>
            <div className="field-label">Text colour</div>
            <ColorInput value={st.color} palette={poster.palette} onChange={(c) => setStyle({ color: c ?? '@text' })} />
            {editing && <p className="hint">Select words while typing to make only those bold, italic or underlined.</p>}
          </section>
        )}

        {el.type === 'image' && (
          <section>
            <h4>Image</h4>
            <button className="btn" onClick={onReplaceImage}>{el.src ? 'Replace image…' : 'Choose image…'}</button>
            <label>
              Fit
              <select value={el.fit ?? 'contain'} onChange={(e) => onChange({ fit: e.target.value as PosterElement['fit'] })}>
                <option value="contain">Fit inside (no cropping)</option>
                <option value="cover">Fill and crop</option>
                <option value="fill">Stretch</option>
              </select>
            </label>
            <p className="hint">Hold Shift while dragging a corner to keep proportions.</p>
          </section>
        )}

        {el.type === 'chart' && (
          <section>
            <h4>Graph</h4>
            <button className="btn primary" onClick={onEditChart}>Edit data and graph…</button>
            {el.chart && (
              <label>
                Label size (pt)
                <input type="number" min={4} value={el.chart.fontSize} onChange={(e) => onChange((x) => void (x.chart!.fontSize = Math.max(4, +e.target.value || 4)), 'cfs')} />
              </label>
            )}
          </section>
        )}

        {el.type === 'shape' && el.shape !== 'line' && (
          <section>
            <h4>Shape</h4>
            <div className="seg">
              <button className={el.shape !== 'ellipse' ? 'active' : ''} onClick={() => onChange({ shape: 'rect' })}>Rectangle</button>
              <button className={el.shape === 'ellipse' ? 'active' : ''} onClick={() => onChange({ shape: 'ellipse' })}>Ellipse</button>
            </div>
          </section>
        )}

        <section>
          <h4>{el.type === 'shape' ? (el.shape === 'line' ? 'Line colour' : 'Fill') : 'Background'}</h4>
          <ColorInput value={el.fill} palette={poster.palette} allowNone={el.type !== 'shape'} onChange={(c) => onChange({ fill: c })} />
          {el.shape !== 'line' && (
            <>
              <div className="row2">
                <label>
                  Border (pt)
                  <input type="number" min={0} step={0.5} value={el.borderWidth ?? 0} onChange={(e) => onChange({ borderWidth: Math.max(0, +e.target.value || 0) }, 'bw')} />
                </label>
                <label>
                  Corner radius (mm)
                  <input type="number" min={0} value={n(el.radius ?? 0)} onChange={(e) => onChange({ radius: Math.max(0, +e.target.value || 0) }, 'rad')} />
                </label>
              </div>
              {!!el.borderWidth && (
                <>
                  <div className="field-label">Border colour</div>
                  <ColorInput value={el.borderColor ?? '@primary'} palette={poster.palette} onChange={(c) => onChange({ borderColor: c })} />
                </>
              )}
              {el.type !== 'shape' && (
                <label>
                  Inner padding (mm)
                  <input type="number" min={0} value={n(el.padding ?? 0)} onChange={(e) => onChange({ padding: Math.max(0, +e.target.value || 0) }, 'pad')} />
                </label>
              )}
            </>
          )}
        </section>

        <ArrangeSection count={1} {...props} />

        <section>
          <h4>Position and size (mm)</h4>
          <div className="row4">
            {(['x', 'y', 'w', 'h'] as const).map((k) => (
              <label key={k}>
                {k.toUpperCase()}
                <input type="number" value={n(el[k])} onChange={(e) => onChange({ [k]: k === 'w' || k === 'h' ? Math.max(1, +e.target.value || 1) : +e.target.value || 0 }, 'pos-' + k)} />
              </label>
            ))}
          </div>
          <div className="toolbar-row">
            <button className="btn small-btn" onClick={() => onLayer('front')}>Bring to front</button>
            <button className="btn small-btn" onClick={() => onLayer('up')}>Forward</button>
            <button className="btn small-btn" onClick={() => onLayer('down')}>Backward</button>
            <button className="btn small-btn" onClick={() => onLayer('back')}>Send to back</button>
          </div>
        </section>
      </div>
    </aside>
  );
}

function AlignIcon({ a }: { a: string }) {
  const lines = a === 'left' ? [12, 8, 12, 6] : a === 'right' ? [12, 8, 12, 6] : [12, 8, 12, 8];
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden>
      {lines.map((w, i) => {
        const ww = a === 'justify' ? 12 : w;
        const x = a === 'left' || a === 'justify' ? 1 : a === 'right' ? 13 - ww : (14 - ww) / 2;
        return <rect key={i} x={x} y={1 + i * 3} width={ww} height={1.4} fill="currentColor" />;
      })}
    </svg>
  );
}

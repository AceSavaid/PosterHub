import { useState } from 'react';
import type { EquationSpec, IconSpec, Poster, PosterElement, TableSpec, TableStyleId, TextStyle } from '../types';
import { TABLE_STYLES, cellLook, normalizeTable } from '../lib/table';
import { useDataFile } from './DataFilePicker';
import type { CaptionAction, TableAction } from './Editor';
import { canCaption, captionOf, captionText, figureNumbers } from '../lib/captions';
import { typesetLatex } from '../lib/math';
import { useMathReady } from '../lib/useMath';
import { useIconsReady } from '../lib/useIcons';
import { ICON_SOURCES, hasSecondTone, iconArt, iconInfo } from '../lib/icons/library';
import { IconPicker } from './IconPicker';
import { canHaveHeadingIcon } from '../lib/headingIcon';
import { QR_MAX_LENGTH, normaliseLink, qrDataUrl } from '../lib/qr';
import { FontSelect } from './FontSelect';
import { ColorInput } from './ColorInput';
import type { AlignMode } from '../lib/arrange';
import { SHAPE_CHOICES } from '../lib/shapes';
import { isCropped, normAngle } from '../lib/geometry';
import { resizeSelection, styleSelection } from '../lib/richtext';
import { PALETTE_ROLES } from '../model';
import { CITATION_STYLES, DEFAULT_STYLE, shortLabel } from '../lib/refs/format';
import { TYPE_NAMES } from '../lib/a11y';
import { keys } from '../lib/keys';
import { SHORTCUTS } from '../lib/shortcuts';
import { elementTip } from '../lib/tips';
import { useUiPrefs } from '../lib/uiPrefs';

/** The few shortcuts shown in the empty Properties panel; the rest are on the ? sheet. */
const QUICK = new Set(['Undo', 'Redo', 'Copy, cut and paste elements, text or images', 'Duplicate', 'Move between elements on the poster', 'Edit the selected text, table, equation, image or graph', 'Nudge 1 mm', 'Stop editing, or clear the selection']);

interface Props {
  /** opens the full keyboard shortcut list */
  onShowShortcuts?: () => void;
  poster: Poster;
  el: PosterElement | null;
  editing: boolean;
  onChange: (patch: Partial<PosterElement> | ((e: PosterElement) => void), coalesce?: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onLayer: (dir: 'front' | 'back' | 'up' | 'down') => void;
  onReplaceImage: () => void;
  onCrop: () => void;
  onEditChart: () => void;
  onEditAuthors?: () => void;
  onEditEquation: () => void;
  multi: number;
  /** the selection is exactly one group */
  grouped?: boolean;
  onGroup?: () => void;
  onUngroup?: () => void;
  overflow: boolean;
  onShrinkText: () => void;
  onGrowBox: () => void;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: 'x' | 'y') => void;
  onMatchSize: (dim: 'w' | 'h') => void;
  /** insert a citation of this reference at the caret (while typing) */
  onCite: (refId: string) => void;
  onOpenReferences: () => void;
  onSetStyle: (style: Poster['citationStyle']) => void;
  activeCell?: { r: number; c: number } | null;
  onTableAction?: (a: TableAction) => void;
  onTableGraph?: () => void;
  onEditTable?: () => void;
  onConvertTable?: () => void;
  /** replace the table's cells with ones read from an Excel or CSV file */
  onFillTable?: (cells: string[][]) => void;
  /** numbered captions for images, graphs and tables (figure id, action) */
  onCaption?: (figId: string, a: CaptionAction) => void;
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


function ElementTip({ el }: { el: PosterElement }) {
  const [prefs, change] = useUiPrefs();
  const tip = elementTip(el);
  if (!prefs.showTips || !tip) return null;
  return (
    <p className="hint element-tip" data-testid="element-tip">
      {keys(tip)}{' '}
      <button className="link" onClick={() => change({ showTips: false })} title="You can turn tips back on in Settings">
        Hide tips
      </button>
    </p>
  );
}

export default function Inspector(props: Props) {
  const { poster, el, editing, onChange, onDelete, onDuplicate, onLayer, onReplaceImage, onCrop, onEditChart, onEditEquation, multi, overflow, onShrinkText, onGrowBox, onCite, onOpenReferences, onSetStyle } = props;
  if (multi > 1) {
    return (
      <aside className="panel right" aria-label="Properties">
        <div className="panel-body">
          <div className="insp-head">
            <h3>{props.grouped ? `Group of ${multi}` : `${multi} elements selected`}</h3>
            <div className="icon-row">
              <button className="icon-btn" title={keys('Duplicate (Ctrl/⌘ D)')} onClick={onDuplicate}>⧉</button>
              <button className="icon-btn danger" title="Delete" onClick={onDelete}>🗑</button>
            </div>
          </div>
          {(props.onGroup || props.onUngroup) && (
            <section>
              <h4>Group</h4>
              <div className="toolbar-row">
                {props.onGroup && <button className="btn small-btn" onClick={props.onGroup} title={keys('Ctrl/⌘ G')}>Group</button>}
                {props.onUngroup && <button className="btn small-btn" onClick={props.onUngroup} title={keys('Ctrl/⌘ Shift G')}>Ungroup</button>}
              </div>
              <p className="hint">
                {props.grouped
                  ? keys('Drag to move the group; drag a corner to resize it all (Shift lets it stretch). Ctrl/⌘-click picks out one element.')
                  : 'Group them to keep a figure with its caption, or a row of logos, together.'}
              </p>
            </section>
          )}
          <ArrangeSection count={multi} {...props} />
          {!props.grouped && <p className="hint">Drag any of them to move them together. Shift-click to add or remove one from the selection.</p>}
        </div>
      </aside>
    );
  }
  if (!el) {
    return (
      <aside className="panel right" aria-label="Properties">
        <div className="panel-body">
          <h3>Nothing selected</h3>
          <p className="hint">Click an element on the poster to change its text, colours, size and position. Double-click text to type.</p>
          <h3>Shortcuts</h3>
          <ul className="shortcuts">
            {SHORTCUTS.flatMap((g) => g.items)
              .filter((x) => QUICK.has(x.what))
              .map((x) => (
                <li key={x.what}>
                  {x.combos.map((c, i) => (
                    <span key={c}>
                      {i > 0 && ' '}
                      <kbd>{keys(c)}</kbd>
                    </span>
                  ))}{' '}
                  {x.what.charAt(0).toLowerCase() + x.what.slice(1)}
                </li>
              ))}
          </ul>
          {props.onShowShortcuts && (
            <button className="btn small-btn" onClick={props.onShowShortcuts}>
              All shortcuts <kbd>?</kbd>
            </button>
          )}
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
    <aside className="panel right" aria-label="Properties">
      <div className="panel-body">
        <div className="insp-head">
          <h3>{el.refList ? 'Reference list' : TYPE_NAMES[el.type]}</h3>
          <div className="icon-row">
            <button className="icon-btn" title={keys('Duplicate (Ctrl/⌘ D)')} onClick={onDuplicate}>⧉</button>
            <button className="icon-btn" title={el.locked ? 'Unlock' : 'Lock position'} aria-label="Lock position" aria-pressed={!!el.locked} onClick={() => onChange({ locked: !el.locked })}>
              {el.locked ? '🔒' : '🔓'}
            </button>
            <button className="icon-btn danger" title="Delete" onClick={onDelete}>🗑</button>
          </div>
        </div>
        <ElementTip el={el} />

        {(st || el.type === 'table') && overflow && (
          <section className="warn-box" role="status">
            <strong>Some text is hidden</strong>
            <span>{el.type === 'table' ? 'The table is taller than its box.' : 'The text is longer than its box.'}</span>
            <div className="toolbar-row">
              <button className="btn small-btn" onClick={onShrinkText}>Shrink text to fit</button>
              <button className="btn small-btn" onClick={onGrowBox}>Make box taller</button>
            </div>
          </section>
        )}

        {st && props.onEditAuthors && (el.authors || el.type === 'subtitle') && (
          <section>
            <button className="btn primary" onClick={props.onEditAuthors}>{el.authors ? 'Edit authors and affiliations…' : 'Build author list…'}</button>
            {el.authors && <p className="hint">Changes typed straight into this box are replaced when you update the list.</p>}
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
            {editing && (
              <div className="sel-format">
                <div className="field-label">Selected words</div>
                <div className="toolbar-row">
                  <button className="fmt" title="Make selected words larger" aria-label="A+ larger" onMouseDown={(e) => e.preventDefault()} onClick={() => resizeSelection(1.15)}>A+</button>
                  <button className="fmt" title="Make selected words smaller" aria-label="A− smaller" onMouseDown={(e) => e.preventDefault()} onClick={() => resizeSelection(1 / 1.15)}>A−</button>
                  <span className="sep" />
                  {PALETTE_ROLES.filter((r) => r !== 'background' && r !== 'surface').map((r) => (
                    <button
                      key={r}
                      className="swatch"
                      style={{ background: poster.palette[r] }}
                      title={'Colour selected words: ' + r}
                      aria-label={'Colour selected words ' + r}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => styleSelection({ color: poster.palette[r] })}
                    />
                  ))}
                  <button className="swatch" style={{ background: '#ffffff' }} title="White" aria-label="Colour selected words white" onMouseDown={(e) => e.preventDefault()} onClick={() => styleSelection({ color: '#ffffff' })} />
                </div>
                <p className="hint">Select words while typing, then use B / I / U, size or colour to change only those words.</p>
              </div>
            )}
          </section>
        )}

        {el.refList && (
          <section className="refs-section">
            <h4>Reference list</h4>
            <p className="hint">This box is filled in from your references. Numbers follow the order they are cited on the poster.</p>
            <button className="btn primary" onClick={onOpenReferences}>Edit references…</button>
            <label>
              Citation style
              <select value={poster.citationStyle ?? DEFAULT_STYLE} onChange={(e) => onSetStyle(e.target.value as Poster['citationStyle'])}>
                {CITATION_STYLES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
            <label>
              Heading
              <input value={el.refTitle ?? 'References'} onChange={(e) => onChange({ refTitle: e.target.value }, 'reftitle')} placeholder="(no heading)" />
            </label>
          </section>
        )}

        {st && editing && !el.refList && (
          <section className="cite-section">
            <h4>Cite</h4>
            {(poster.references ?? []).length ? (
              <>
                <p className="hint">Click where the citation goes, then pick a reference. Pick several in a row to cite them together.</p>
                <div className="cite-list">
                  {(poster.references ?? []).map((r) => (
                    <button key={r.id} className="cite-pick" onMouseDown={(e) => e.preventDefault()} onClick={() => onCite(r.id)} title={r.title}>
                      <strong>{shortLabel(r)}</strong>
                      <span>{r.title}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="hint">Add references from their DOIs or BibTeX, then cite them here.</p>
            )}
            <button className="btn small-btn" onMouseDown={(e) => e.preventDefault()} onClick={onOpenReferences}>
              {(poster.references ?? []).length ? 'Manage references…' : 'Add references…'}
            </button>
          </section>
        )}
        {st && el.html?.includes('<table') && props.onConvertTable && (
          <section>
            <h4>Table</h4>
            <button className="btn" onClick={props.onConvertTable}>Convert to editable table</button>
            <p className="hint">Imported tables keep their PowerPoint formatting. Convert to type in cells, add rows and pick a table style.</p>
          </section>
        )}

        {el.type === 'table' && <TableSection {...props} el={el} />}

        {el.type === 'image' && (
          <section>
            <h4>Image</h4>
            <div className="toolbar-row">
              <button className="btn" onClick={onReplaceImage}>{el.src ? 'Replace image…' : 'Choose image…'}</button>
              {el.src && !el.qr && (
                <button className="btn" onClick={onCrop}>
                  Crop…
                </button>
              )}
              {isCropped(el.crop) && (
                <button className="btn small-btn" onClick={() => onChange({ crop: undefined })}>
                  Undo crop
                </button>
              )}
            </div>
            <label>
              Fit
              <select value={el.fit ?? 'contain'} onChange={(e) => onChange({ fit: e.target.value as PosterElement['fit'] })}>
                <option value="contain">Fit inside (no cropping)</option>
                <option value="cover">Fill and crop</option>
                <option value="fill">Stretch</option>
              </select>
            </label>
            <p className="hint">Hold Shift while dragging a corner to keep proportions.</p>
            <label>
              Description (alt text)
              <textarea rows={2} value={el.alt ?? ''} placeholder="What does it show? Read aloud by screen readers." onChange={(e) => onChange({ alt: e.target.value || undefined }, 'alt')} />
            </label>
          </section>
        )}

        {canCaption(el) && props.onCaption && <CaptionSection key={'caption-' + el.id} poster={poster} el={el} onCaption={props.onCaption} />}

        {el.type === 'image' && <QrSection key={el.id} el={el} onChange={onChange} />}

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
            <label>
              Description (alt text)
              <textarea rows={2} value={el.alt ?? ''} placeholder="What does it show? Read aloud by screen readers." onChange={(e) => onChange({ alt: e.target.value || undefined }, 'alt')} />
            </label>
          </section>
        )}

        {el.captionOf && props.onCaption && (
          <section className="caption-note">
            <h4>Caption</h4>
            <p className="hint">
              This is the caption of {figureNumbers(poster).get(el.captionOf) ?? 'a figure'}. It stays with the figure, and its number updates by itself.
            </p>
            <button className="btn small-btn" onClick={() => props.onCaption!(el.captionOf!, { kind: 'select', id: el.captionOf! })}>Select the figure</button>
          </section>
        )}

        {el.type === 'icon' && el.icon && <IconSection key={el.id} poster={poster} el={el} onChange={onChange} />}

        {st && canHaveHeadingIcon(el) && <HeadingIconSection key={el.id} poster={poster} el={el} onChange={onChange} />}

        {el.type === 'equation' && el.equation && <EquationSection key={el.id} poster={poster} el={el} onChange={onChange} onEdit={onEditEquation} />}

        {el.type === 'shape' && el.shape !== 'line' && (
          <section>
            <h4>Shape</h4>
            <div className="shape-picker">
              {SHAPE_CHOICES.filter((c) => c.kind !== 'line').map((c) => {
                const rounded = !!c.extra?.radius;
                const active = el.shape === c.kind && (c.kind !== 'rect' || rounded === !!el.radius);
                return (
                  <button
                    key={c.label}
                    className={'fmt' + (active ? ' on' : '')}
                    title={c.label}
                    aria-label={'Change to ' + c.label.toLowerCase()}
                    onClick={() => onChange((x) => {
                      x.shape = c.kind;
                      if (c.kind === 'rect') x.radius = rounded ? c.extra!.radius : 0;
                      if (c.kind === 'arrow' && !x.direction) x.direction = 'right';
                    })}
                  >
                    {c.icon}
                  </button>
                );
              })}
            </div>
            {el.shape === 'arrow' && (
              <label>
                Points
                <select value={el.direction ?? 'right'} onChange={(e) => onChange({ direction: e.target.value as PosterElement['direction'] })}>
                  <option value="right">Right →</option>
                  <option value="left">Left ←</option>
                  <option value="up">Up ↑</option>
                  <option value="down">Down ↓</option>
                </select>
              </label>
            )}
          </section>
        )}

        <section>
          <h4>{el.type === 'shape' ? (el.shape === 'line' ? 'Line colour' : 'Fill') : 'Background'}</h4>
          <ColorInput value={el.fill} palette={poster.palette} allowNone={el.type !== 'shape' || (el.shape !== 'line' && !!el.borderWidth)} onChange={(c) => onChange({ fill: c, gradient: undefined })} />
          {el.gradient && (
            <p className="muted small">
              Gradient from the template.{' '}
              <button className="btn small-btn" onClick={() => onChange({ gradient: undefined })}>
                Use a solid colour
              </button>
            </p>
          )}
          {el.shape !== 'line' && (
            <>
              <div className="row2">
                <label>
                  Border (pt)
                  <input type="number" min={0} step={0.5} value={el.borderWidth ?? 0} onChange={(e) => onChange({ borderWidth: Math.max(0, +e.target.value || 0) }, 'bw')} />
                </label>
                {(el.type !== 'shape' || el.shape === 'rect' || !el.shape) && (
                  <label>
                    Corner radius (mm)
                    <input type="number" min={0} value={n(el.radius ?? 0)} onChange={(e) => onChange({ radius: Math.max(0, +e.target.value || 0) }, 'rad')} />
                  </label>
                )}
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
          {el.shape !== 'line' && (
            <div className="rotate-row">
              <label>
                Rotation (°)
                <input type="number" step={1} value={el.rotation ?? 0} onChange={(e) => onChange({ rotation: normAngle(+e.target.value || 0) || undefined }, 'rot')} />
              </label>
              <button className="fmt" title="Rotate 90° left" aria-label="Rotate 90° left" onClick={() => onChange({ rotation: normAngle((el.rotation ?? 0) - 90) || undefined })}>↺</button>
              <button className="fmt" title="Rotate 90° right" aria-label="Rotate 90° right" onClick={() => onChange({ rotation: normAngle((el.rotation ?? 0) + 90) || undefined })}>↻</button>
              {!!el.rotation && (
                <button className="btn small-btn" onClick={() => onChange({ rotation: undefined })}>
                  Straighten
                </button>
              )}
            </div>
          )}
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

/** Turns an image box into a QR code for a link (paper, data, lab page). Updates as you type. */
function QrSection({ el, onChange }: { el: PosterElement; onChange: Props['onChange'] }) {
  const [text, setText] = useState(el.qr ?? '');
  const [error, setError] = useState('');
  const isQrBox = el.qr != null || el.placeholder === 'QR code';

  function apply(value: string) {
    setText(value);
    const link = normaliseLink(value);
    if (!link) {
      setError('');
      if (el.qr != null) onChange((e) => { delete e.qr; delete e.src; }, 'qr');
      return;
    }
    if (link.length > QR_MAX_LENGTH) return setError(`That is too long for a QR code (${link.length} of ${QR_MAX_LENGTH} characters). Try a shorter link.`);
    try {
      const src = qrDataUrl(link);
      setError('');
      onChange((e) => { e.qr = link; e.src = src; e.fit = 'contain'; }, 'qr');
    } catch {
      setError('That could not be turned into a QR code. Try a shorter link.');
    }
  }

  return (
    <section>
      <h4>QR code</h4>
      <label>
        {isQrBox ? 'Link for the QR code' : 'Or make a QR code from a link'}
        <input
          id="qr-link"
          value={text}
          placeholder="e.g. doi.org/10.1234/abcd"
          spellCheck={false}
          onChange={(e) => apply(e.target.value)}
        />
      </label>
      {error ? (
        <p className="hint error" role="alert">{error}</p>
      ) : el.qr ? (
        <p className="hint">Scans to <b>{el.qr}</b>. Test it with your phone before printing.</p>
      ) : (
        <p className="hint">Paste a link to your paper, data, code or lab page. The QR code is made on your computer and updates as you type.</p>
      )}
    </section>
  );
}

function TableSection({ poster, el, editing, onChange, activeCell, onTableAction, onTableGraph, onEditTable, onFillTable }: Props & { el: PosterElement }) {
  const t = normalizeTable(el.table);
  const [fileError, setFileError] = useState('');
  const dataFile = useDataFile((cells) => {
    setFileError('');
    onFillTable?.(cells);
  }, setFileError);
  const set = (patch: Partial<TableSpec>, key?: string) => onChange((e) => void (e.table = { ...normalizeTable(e.table), ...patch }), key);
  // Buttons keep the cursor in the cell being edited.
  const keep = (e: React.MouseEvent) => e.preventDefault();
  const act = (a: TableAction) => onTableAction?.(a);
  const where = activeCell ? `row ${activeCell.r + 1}, column ${activeCell.c + 1}` : null;
  return (
    <section>
      <h4>Table</h4>
      {!editing && (
        <button className="btn primary" onClick={onEditTable}>Edit cells</button>
      )}
      <p className="hint">
        {editing
          ? 'Type in the cells. Tab moves to the next cell (and adds a row at the end), Enter moves down. Paste cells from Excel or Google Sheets to fill the table.'
          : 'Double-click a cell to type. Paste cells from Excel or Google Sheets onto the poster to make a new table.'}
      </p>
      <div className="field-label">Style</div>
      <div className="table-styles" role="radiogroup" aria-label="Table style">
        {TABLE_STYLES.map((s) => (
          <button key={s.id} role="radio" aria-checked={t.style === s.id} className={t.style === s.id ? 'on' : ''} title={s.hint} onMouseDown={keep} onClick={() => set({ style: s.id })}>
            <StylePreview style={s.id} poster={poster} />
            {s.label}
          </button>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={t.headerRow} onChange={(e) => set({ headerRow: e.target.checked })} /> First row is a header
      </label>
      <div className="row2">
        <label>
          Text size (pt)
          <input type="number" min={4} max={400} value={t.fontSize} onChange={(e) => set({ fontSize: Math.max(4, +e.target.value || 4) }, 'tfs')} />
        </label>
        <label>
          Align columns
          <select value={t.align} onChange={(e) => set({ align: e.target.value as TableSpec['align'] })}>
            <option value="auto">Numbers right</option>
            <option value="left">All left</option>
            <option value="center">All centred</option>
          </select>
        </label>
      </div>
      <div className="field-label">
        Rows and columns{where ? ` (at ${where})` : ''}: {t.rows.length} × {t.rows[0].length}
      </div>
      <div className="toolbar-row">
        <button className="btn small-btn" onMouseDown={keep} onClick={() => act('rowAbove')}>+ Row above</button>
        <button className="btn small-btn" onMouseDown={keep} onClick={() => act('rowBelow')}>+ Row below</button>
        <button className="btn small-btn" onMouseDown={keep} onClick={() => act('colLeft')}>+ Column left</button>
        <button className="btn small-btn" onMouseDown={keep} onClick={() => act('colRight')}>+ Column right</button>
      </div>
      <div className="toolbar-row">
        <button className="btn small-btn" disabled={t.rows.length <= 1} onMouseDown={keep} onClick={() => act('deleteRow')}>− Delete row</button>
        <button className="btn small-btn" disabled={t.rows[0].length <= 1} onMouseDown={keep} onClick={() => act('deleteCol')}>− Delete column</button>
      </div>
      {!where && <p className="hint">Click into a cell first to add or delete next to it; otherwise changes apply at the end.</p>}
      {onFillTable && (
        <>
          <button className="btn" onClick={dataFile.choose} disabled={dataFile.busy}>{dataFile.busy ? 'Reading…' : 'Fill from an Excel or CSV file…'}</button>
          {dataFile.picker}
          {fileError && <p className="hint error" role="alert">{fileError}</p>}
        </>
      )}
      <button className="btn" onClick={onTableGraph}>Make a graph from this table…</button>
    </section>
  );
}

/** A tiny drawing of a table in the given style, using the poster's colours. */
function StylePreview({ style, poster }: { style: TableStyleId; poster: Poster }) {
  const t: TableSpec = { rows: [['', '', ''], ['', '', ''], ['', '', ''], ['', '', '']], headerRow: true, style, fontSize: 10, align: 'auto' };
  const W = 60;
  const H = 30;
  const rw = W / 3;
  const rh = H / 4;
  const out: React.ReactNode[] = [];
  t.rows.forEach((row, r) =>
    row.forEach((_, c) => {
      const l = cellLook(t, poster.palette, r, c);
      const x = c * rw;
      const y = r * rh;
      if (l.fill) out.push(<rect key={`f${r}${c}`} x={x} y={y} width={rw} height={rh} fill={l.fill} />);
      out.push(<rect key={`t${r}${c}`} x={x + 3} y={y + rh / 2 - 0.8} width={rw - 8} height={1.6} rx={0.8} fill={l.color} opacity={l.bold ? 0.95 : 0.45} />);
      const line = (b: typeof l.top, x1: number, y1: number, x2: number, y2: number, k: string) =>
        b && out.push(<line key={k + r + c} x1={x1} y1={y1} x2={x2} y2={y2} stroke={b.color} strokeWidth={b.pt * 0.9} />);
      line(l.top, x, y + 0.5, x + rw, y + 0.5, 'a');
      line(l.bottom, x, y + rh - 0.5, x + rw, y + rh - 0.5, 'b');
      line(l.left, x + 0.4, y, x + 0.4, y + rh, 'c');
      line(l.right, x + rw - 0.4, y, x + rw - 0.4, y + rh, 'd');
    }),
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden style={{ background: poster.palette.background, borderRadius: 3 }}>
      {out}
    </svg>
  );
}
function IconSection({ poster, el, onChange }: { poster: Poster; el: PosterElement; onChange: Props['onChange'] }) {
  const ic = el.icon!;
  const ready = useIconsReady();
  const info = iconInfo(ic.id);
  const art = ready ? iconArt(ic.id) : undefined;
  const source = ICON_SOURCES[ic.id.split('/')[0]];
  const [changing, setChanging] = useState(false);
  const set = (patch: Partial<IconSpec>) => onChange((e) => void Object.assign(e.icon!, patch));
  return (
    <section>
      <h4>Icon{info ? ': ' + info.label : ''}</h4>
      <div className="field-label">Colour</div>
      <ColorInput value={ic.color} palette={poster.palette} onChange={(c) => set({ color: c ?? '@primary' })} />
      {hasSecondTone(art) && (
        <>
          <div className="field-label">Shading colour</div>
          <ColorInput
            value={ic.color2}
            palette={poster.palette}
            allowNone
            onChange={(c) => onChange((e) => {
              if (c && c !== 'transparent') e.icon!.color2 = c;
              else delete e.icon!.color2;
            })}
          />
          <p className="hint">With no shading colour the icon uses a pale tint of its main colour.</p>
        </>
      )}
      <button className="btn" aria-expanded={changing} onClick={() => setChanging(!changing)}>
        {changing ? 'Done changing icon' : 'Change icon…'}
      </button>
      {changing && <IconPicker label="Search for a different icon" action="Use icon" selectedId={ic.id} onPick={(i) => set({ id: i.id })} />}
      <label>
        Description (alt text)
        <textarea rows={2} value={el.alt ?? ''} placeholder={info ? info.label : 'What does it show?'} onChange={(e) => onChange({ alt: e.target.value || undefined }, 'alt')} />
      </label>
      {source && <p className="hint">From {source.name} ({source.licence}). Free to use without credit.</p>}
    </section>
  );
}

/** An icon at the right-hand end of a heading, sized from the heading's text. */
function HeadingIconSection({ poster, el, onChange }: { poster: Poster; el: PosterElement; onChange: Props['onChange'] }) {
  const ic = el.headingIcon;
  const ready = useIconsReady();
  const info = iconInfo(ic?.id);
  const art = ready && ic ? iconArt(ic.id) : undefined;
  const [picking, setPicking] = useState(false);
  const matchText = !!ic && ic.color == null;
  return (
    <section className="heading-icon-section">
      <h4>Icon at the end{info ? ': ' + info.label : ''}</h4>
      {!ic ? (
        <>
          <p className="hint">Add an icon to the right-hand end of this heading. It is sized and lined up to match the text automatically.</p>
          <button className="btn" aria-expanded={picking} onClick={() => setPicking(!picking)}>
            {picking ? 'Cancel' : 'Add icon to heading…'}
          </button>
        </>
      ) : (
        <>
          <div className="field-label" id={el.id + '-icon-place'}>Place the icon</div>
          <div className="toolbar-row" role="group" aria-labelledby={el.id + '-icon-place'}>
            <button className={'btn small-btn' + (ic.place !== 'after' ? ' on' : '')} aria-pressed={ic.place !== 'after'} onClick={() => onChange((x) => void delete x.headingIcon!.place)}>
              At the right edge
            </button>
            <button className={'btn small-btn' + (ic.place === 'after' ? ' on' : '')} aria-pressed={ic.place === 'after'} onClick={() => onChange((x) => void (x.headingIcon!.place = 'after'))}>
              Right after the words
            </button>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={matchText}
              onChange={(e) => onChange((x) => {
                if (e.target.checked) delete x.headingIcon!.color;
                else x.headingIcon!.color = x.style?.color ?? '@primary';
              })}
            />
            Same colour as the heading text
          </label>
          {!matchText && (
            <>
              <div className="field-label">Icon colour</div>
              <ColorInput value={ic.color} palette={poster.palette} onChange={(c) => onChange((x) => void (x.headingIcon!.color = c ?? '@primary'))} />
            </>
          )}
          {hasSecondTone(art) && (
            <>
              <div className="field-label">Shading colour</div>
              <ColorInput
                value={ic.color2}
                palette={poster.palette}
                allowNone
                onChange={(c) => onChange((x) => {
                  if (c && c !== 'transparent') x.headingIcon!.color2 = c;
                  else delete x.headingIcon!.color2;
                })}
              />
            </>
          )}
          <div className="toolbar-row">
            <button className="btn small-btn" aria-expanded={picking} onClick={() => setPicking(!picking)}>
              {picking ? 'Done changing icon' : 'Change icon…'}
            </button>
            <button className="btn small-btn" onClick={() => {
                setPicking(false);
                onChange((x) => void delete x.headingIcon);
              }}>Remove icon</button>
          </div>
          <p className="hint">The icon grows and shrinks with the heading’s text size.</p>
        </>
      )}
      {picking && (
        <IconPicker
          label="Search icons for this heading"
          action={ic ? 'Use icon' : 'Add to heading'}
          selectedId={ic?.id}
          onPick={(i) => {
            onChange((x) => {
              x.headingIcon = { ...(x.headingIcon ?? {}), id: i.id };
            });
            if (!ic) setPicking(false);
          }}
        />
      )}
    </section>
  );
}

function EquationSection({ poster, el, onChange, onEdit }: { poster: Poster; el: PosterElement; onChange: Props['onChange']; onEdit: () => void }) {
  const eq = el.equation!;
  const ready = useMathReady();
  const res = ready ? typesetLatex(eq.latex) : null;
  const set = (patch: Partial<EquationSpec>, key?: string) => onChange((e) => void Object.assign(e.equation!, patch), key);
  return (
    <section>
      <h4>Equation</h4>
      <button className="btn primary" onClick={onEdit}>Edit equation…</button>
      <label>
        LaTeX
        <textarea className="insp-latex" rows={3} spellCheck={false} value={eq.latex} onChange={(e) => set({ latex: e.target.value }, 'latex')} />
      </label>
      {res && !res.ok && <div className="insp-eq-error" role="alert">{res.error}</div>}
      <label>
        Size (pt)
        <input type="number" min={4} max={600} value={eq.fontSize} onChange={(e) => set({ fontSize: Math.max(4, +e.target.value || 4) }, 'eqfs')} />
      </label>
      <div className="toolbar-row">
        {(['left', 'center', 'right'] as const).map((a) => (
          <button key={a} className={'fmt' + (eq.align === a ? ' on' : '')} onClick={() => set({ align: a })} title={'Align ' + a} aria-label={'Align equation ' + a}>
            <AlignIcon a={a} />
          </button>
        ))}
      </div>
      <div className="field-label">Colour</div>
      <ColorInput value={eq.color} palette={poster.palette} onChange={(c) => set({ color: c ?? '@text' })} />
      <p className="hint">If the box is too small the equation shrinks to fit; drag a corner to make it bigger.</p>
    </section>
  );
}

/** Add a numbered caption ("Figure 1: …") above or below an image, graph or table. */
function CaptionSection({ poster, el, onCaption }: { poster: Poster; el: PosterElement; onCaption: NonNullable<Props['onCaption']> }) {
  const cap = captionOf(poster, el.id);
  const label = figureNumbers(poster).get(el.id);
  const what = el.type === 'table' ? 'table' : el.type === 'chart' ? 'graph' : 'picture';
  if (!cap)
    return (
      <section className="caption-section">
        <h4>Caption</h4>
        <p className="hint">Add a numbered description. Numbers (Figure 1, Figure 2{el.type === 'table' ? '; tables get Table 1, 2' : ''}…) follow the reading order and update by themselves.</p>
        <div className="toolbar-row">
          <button className="btn" onClick={() => onCaption(el.id, { kind: 'add', pos: 'below' })}>Add caption below</button>
          <button className="btn small-btn" onClick={() => onCaption(el.id, { kind: 'add', pos: 'above' })}>Above</button>
        </div>
      </section>
    );
  return (
    <section className="caption-section">
      <h4>Caption{label ? ` · ${label}` : ''}</h4>
      <label>
        Caption text
        <textarea
          id="caption-text"
          rows={3}
          value={captionText(cap)}
          placeholder={`Describe what the ${what} shows.`}
          onChange={(e) => onCaption(el.id, { kind: 'text', text: e.target.value })}
        />
      </label>
      <div className="toolbar-row" role="group" aria-label="Caption position">
        <button className={'fmt wide' + (cap.captionPos === 'above' ? ' on' : '')} aria-pressed={cap.captionPos === 'above'} onClick={() => onCaption(el.id, { kind: 'pos', pos: 'above' })}>Above</button>
        <button className={'fmt wide' + (cap.captionPos !== 'above' ? ' on' : '')} aria-pressed={cap.captionPos !== 'above'} onClick={() => onCaption(el.id, { kind: 'pos', pos: 'below' })}>Below</button>
        <span className="sep" />
        <button className="btn small-btn" onClick={() => onCaption(el.id, { kind: 'remove' })}>Remove caption</button>
      </div>
      <p className="hint">To change the caption's font or size, click it on the poster.</p>
    </section>
  );
}

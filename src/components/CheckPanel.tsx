import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Issue } from '../lib/checks';
import type { Poster } from '../types';
import { findMisspellings, loadSpeller, type Misspelling, type Speller } from '../lib/spelling';
import { htmlToText, wordCount } from '../lib/textTools';
import { visionInfo, type VisionMode } from '../lib/colorVision';
import { conferenceResults, hasRules } from '../lib/conference';
import { SIZE_PRESETS, IN_TO_MM } from '../model';
import type { ConferenceRules } from '../types';

const ICON = { problem: '⛔', warning: '⚠️', tip: '💡' };

export type CheckTab = 'problems' | 'spelling' | 'words' | 'conference';

interface Props {
  /** the Check / Find / Notes switcher shown in place of the title */
  switcher?: ReactNode;
  issues: Issue[];
  /** items the person dismissed on this poster (still found by the check, just hidden) */
  dismissed?: Issue[];
  /** hide an item on this poster */
  onDismiss?: (issue: Issue) => void;
  /** bring dismissed items back */
  onRestore?: (issues: Issue[]) => void;
  poster: Poster;
  tab: CheckTab;
  onTab: (t: CheckTab) => void;
  onPick: (elementId: string) => void;
  /** open the review note an issue is about */
  onPickNote?: (noteId: string) => void;
  /** select several boxes (a whole section) */
  onPickMany: (elementIds: string[]) => void;
  /** replace a misspelt word everywhere on the poster */
  onFixWord: (word: string, replacement: string) => void;
  onIgnoreWord: (word: string) => void;
  onWordLimit: (limit: number | undefined) => void;
  /** set or clear the conference's rules; `key` merges typing into one undo step */
  onConference?: (rules: ConferenceRules | undefined, key?: string) => void;
  /** Applies an issue's one-click fix (swap a colour for a printable one, a readable text colour or size). */
  onFix?: (issue: Issue) => void;
  /** Saves a description (alt text) typed straight into the Check list. */
  onAlt?: (elementId: string, alt: string) => void;
  onClose: () => void;
  /** show the poster as seen with this kind of vision */
  onPreview?: (mode: VisionMode) => void;
  /** jump to and start filling the next box with example text or no picture */
  onFillNext?: () => void;
}

/** Poster problems, a spelling pass, and word counts with the conference's rules; the tabs are in `switcher`. */
export default function CheckPanel(props: Props) {
  const { switcher, tab, onClose } = props;
  return (
    <div className="check-panel" role="dialog" aria-label="Poster check">
      <div className="check-head">
        {switcher ?? <strong>Poster check</strong>}
        <button className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
      </div>
      {tab === 'problems' && <Problems {...props} />}
      {tab === 'spelling' && <Spelling {...props} />}
      {(tab === 'words' || tab === 'conference') && (
        <>
          <Words {...props} />
          <h4 className="conference-head" id="conference-rules">Conference rules</h4>
          <Conference {...props} />
        </>
      )}
    </div>
  );
}

function Problems({ issues: all, dismissed = [], onDismiss, onRestore, onPick, onPickNote, onFix, onPreview, onAlt, onFillNext }: Props) {
  // Example text and empty figure boxes are one to-do, not a list of near-identical cards.
  const leftovers = all.filter((i) => i.leftover);
  const grouped = leftovers.length > 1;
  const issues = grouped ? all.filter((i) => !i.leftover) : all;
  const problems = issues.filter((i) => i.severity === 'problem').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  if (all.length === 0)
    return (
      <>
        <div className="check-ok">
          <div className="big-tick">✓</div>
          <p>{dismissed.length ? 'Nothing left to look at. Your poster is ready to export.' : 'No problems found. Your poster is ready to export.'}</p>
        </div>
        <Dismissed dismissed={dismissed} onRestore={onRestore} />
      </>
    );
  return (
    <>
      <p className="muted small check-summary">
        {problems > 0 && `${problems} to fix`}
        {problems > 0 && warnings > 0 && ', '}
        {warnings > 0 && `${warnings} to look at`}
        {grouped && `${problems + warnings > 0 ? ', ' : ''}${leftovers.length} boxes to fill`}
        {problems + warnings === 0 && !grouped && 'Only suggestions'}
        {' · click an item to select it'}
      </p>
      <ul className="issue-list">
        {issues.map((i) => (
          <li key={i.id} className={'issue ' + i.severity}>
            <button disabled={!i.elementId && !(i.noteId && onPickNote)} onClick={() => (i.noteId ? onPickNote?.(i.noteId) : i.elementId && onPick(i.elementId))}>
              <span className="issue-icon" aria-hidden>{ICON[i.severity]}</span>
              <span>
                <strong id={'issue-title-' + i.id}>{i.title}</strong>
                <span className="issue-detail">{i.detail}</span>
              </span>
            </button>
            {i.fix && onFix && (
              <button className="issue-fix" onClick={() => onFix(i)}>
                <span className="swatch" style={{ background: i.fix.from }} aria-hidden />→<span className="swatch" style={{ background: i.fix.to }} aria-hidden />
                {i.fix.label}
              </button>
            )}
            {i.textColor && onFix && (
              <button className="issue-fix" onClick={() => onFix(i)}>
                <span className="swatch" style={{ background: i.textColor.from }} aria-hidden />→<span className="swatch" style={{ background: i.textColor.hex }} aria-hidden />
                {i.textColor.label}
              </button>
            )}
            {i.textSize && onFix && (
              <button className="issue-fix" onClick={() => onFix(i)}>
                <span className="fix-pt" aria-hidden>A↑</span>
                {i.textSize.label}
              </button>
            )}
            {i.needsAlt && i.elementId && onAlt && <AltBox key={i.elementId} elementId={i.elementId} what={i.title} onSave={onAlt} />}
            {i.preview && onPreview && (
              <button className="issue-preview" onClick={() => onPreview(i.preview!)}>
                👁 Preview as {visionInfo(i.preview).label.toLowerCase()}
              </button>
            )}
            {onDismiss && (
              <button className="issue-dismiss" aria-label="Dismiss" aria-describedby={'issue-title-' + i.id} title="Dismiss: hide this on this poster" onClick={() => onDismiss(i)}>
                ×
              </button>
            )}
          </li>
        ))}
        {grouped && (
          <li className="issue warning leftovers">
            <div className="leftover-head">
              <span className="issue-icon" aria-hidden>{ICON.warning}</span>
              <span>
                <strong id="issue-title-leftovers">{leftovers.length} boxes still have example text or no picture</strong>
                <span className="issue-detail">Replace them with your own words and figures, or delete the ones you don’t need.</span>
              </span>
            </div>
            {onFillNext && <button className="btn small-btn primary fill-next-btn" onClick={onFillNext}>Go to an empty box</button>}
            <details className="leftover-list">
              <summary>Show which</summary>
              <ul>
                {leftovers.map((i) => (
                  <li key={i.id}>
                    <button className="link" id={'issue-title-' + i.id} disabled={!i.elementId} onClick={() => i.elementId && onPick(i.elementId)}>{i.title.replace(/ still has example text$/, '')}</button>
                    {onDismiss && (
                      <button className="issue-dismiss inline" aria-label="Dismiss" aria-describedby={'issue-title-' + i.id} title="Dismiss: hide this on this poster" onClick={() => onDismiss(i)}>×</button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        )}
      </ul>
      <Dismissed dismissed={dismissed} onRestore={onRestore} />
    </>
  );
}

/** A folded list of dismissed items at the bottom of Problems, each with a way back. */
function Dismissed({ dismissed, onRestore }: { dismissed: Issue[]; onRestore?: (issues: Issue[]) => void }) {
  const [open, setOpen] = useState(false);
  if (!dismissed.length || !onRestore) return null;
  return (
    <div className="dismissed">
      <div className="dismissed-head">
        <button className="link" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? '▾' : '▸'} {dismissed.length} dismissed
        </button>
        <button className="link" onClick={() => onRestore(dismissed)}>Show all again</button>
      </div>
      {open && (
        <ul className="dismissed-list" aria-label="Dismissed">
          {dismissed.map((i) => (
            <li key={i.id}>
              <span className="issue-icon" aria-hidden>{ICON[i.severity]}</span>
              <span className="dismissed-title">{i.title}</span>
              <button className="link" aria-label={`Bring back: ${i.title}`} onClick={() => onRestore([i])}>Bring back</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A box to describe a picture, graph or icon without leaving the Check list. */
function AltBox({ elementId, what, onSave }: { elementId: string; what: string; onSave: (id: string, alt: string) => void }) {
  const [text, setText] = useState('');
  const fieldId = 'alt-' + elementId;
  const save = () => text.trim() && onSave(elementId, text.trim());
  return (
    <div className="issue-alt">
      <label htmlFor={fieldId} className="sr-only">Description for: {what}</label>
      <textarea
        id={fieldId}
        rows={2}
        value={text}
        placeholder="Describe it in a sentence…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter saves; Shift+Enter starts a new line
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            save();
          }
        }}
      />
      <button className="btn small-btn" disabled={!text.trim()} onClick={save}>Save description</button>
    </div>
  );
}

function Spelling({ poster, onPick, onFixWord, onIgnoreWord }: Props) {
  const [speller, setSpeller] = useState<Speller | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadSpeller().then(
      (s) => live && setSpeller(s),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);
  const words = useMemo(() => (speller ? findMisspellings(poster, speller) : []), [speller, poster]);

  if (failed) return <p className="muted small check-summary">The dictionary could not be loaded. Reload the page and try again.</p>;
  if (!speller) return <p className="muted small check-summary" role="status">Loading the dictionary…</p>;
  if (!words.length)
    return (
      <div className="check-ok">
        <div className="big-tick">✓</div>
        <p>No spelling mistakes found.</p>
        {(poster.ignoredWords?.length ?? 0) > 0 && <p className="muted small">{poster.ignoredWords!.length} word(s) ignored on this poster.</p>}
      </div>
    );
  return (
    <>
      <p className="muted small check-summary">
        {words.length} {words.length === 1 ? 'word' : 'words'} not in the dictionary (US and UK English). Pick a correction, or ignore names and technical terms. Acronyms and words with numbers are skipped.
      </p>
      <ul className="issue-list spell-list">
        {words.map((w) => (
          <SpellingRow key={w.word} w={w} poster={poster} speller={speller} onPick={onPick} onFix={onFixWord} onIgnore={onIgnoreWord} />
        ))}
      </ul>
    </>
  );
}

function SpellingRow({ w, poster, speller, onPick, onFix, onIgnore }: { w: Misspelling; poster: Poster; speller: Speller; onPick: (id: string) => void; onFix: (word: string, r: string) => void; onIgnore: (word: string) => void }) {
  const suggestions = useMemo(() => speller.suggest(w.word).slice(0, 3), [speller, w.word]);
  const context = useMemo(() => {
    const el = poster.elements.find((e) => e.id === w.elementIds[0]);
    const text = htmlToText(el?.html).replace(/\s+/g, ' ');
    const i = text.indexOf(w.word);
    if (i < 0) return null;
    return { before: text.slice(Math.max(0, i - 28), i), after: text.slice(i + w.word.length, i + w.word.length + 28) };
  }, [poster, w]);
  return (
    <li className="spell">
      <div className="spell-row">
        <button className="spell-word" onClick={() => onPick(w.elementIds[0])} title="Show it on the poster">
          <span className="spell-context">
            {context && '…' + context.before}
            <span className="misspelt">{w.word}</span>
            {context && context.after + '…'}
          </span>
          {w.count > 1 && <span className="muted small"> · {w.count} times</span>}
        </button>
        <div className="spell-actions">
          {suggestions.length ? (
            suggestions.map((s) => (
              <button key={s} className="chip" onClick={() => onFix(w.word, s)} title={`Change “${w.word}” to “${s}”${w.count > 1 ? ' everywhere' : ''}`}>
                {s}
              </button>
            ))
          ) : (
            <span className="muted small">No suggestions</span>
          )}
          <button className="link" onClick={() => onIgnore(w.word)} title="Accept this word on this poster">Ignore</button>
        </div>
      </div>
    </li>
  );
}

function Words({ poster, onPickMany, onWordLimit }: Props) {
  const counts = useMemo(() => wordCount(poster), [poster]);
  const limit = poster.wordLimit;
  const max = Math.max(1, ...counts.sections.map((s) => s.words));
  const over = limit ? counts.total - limit : 0;
  return (
    <div className="words-tab">
      <div className="word-total">
        <span className="word-total-n" data-testid="word-total">{counts.total.toLocaleString()}</span>
        <span>{counts.total === 1 ? 'word' : 'words'} on the poster{limit ? ` of ${limit.toLocaleString()} allowed` : ''}</span>
      </div>
      {limit && over > 0 && <p className="word-over">{over.toLocaleString()} over the limit</p>}
      {limit && over <= 0 && <p className="muted small">{(-over).toLocaleString()} words left</p>}
      {counts.sections.length > 0 ? (
        <ul className="word-sections" aria-label="Words per section">
          {counts.sections.map((s, i) => (
            <li key={i}>
              <button onClick={() => onPickMany(s.elementIds)} title="Select this section on the poster">
                <span className="word-name">{s.name}</span>
                <span className="word-n">{s.words.toLocaleString()}</span>
                <span className="word-bar" aria-hidden>
                  <span style={{ width: `${(s.words / max) * 100}%` }} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Add some text to see the count.</p>
      )}
      <label className="word-limit">
        <span>Word limit</span>
        <input
          type="number"
          min={0}
          step={50}
          placeholder="None"
          value={limit ?? ''}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            onWordLimit(Number.isFinite(n) && n > 0 ? n : undefined);
          }}
        />
      </label>
      <p className="muted small">
        A section is a header and the text boxes below it in the same column. Graph labels and text inside images are not counted. If your conference sets a limit, enter it and the check will warn you when you go over.
      </p>
    </div>
  );
}

type Unit = 'mm' | 'in';

/** The conference's rules for posters, and a tick or cross for each. */
function Conference({ poster, onConference, onPickMany }: Props) {
  const rules: ConferenceRules = poster.conference ?? {};
  // inches when the rule (or the poster) is a US size, else mm
  const [unit, setUnit] = useState<Unit>(() => {
    const w = rules.width ?? poster.width;
    return Math.abs(w / IN_TO_MM - Math.round(w / IN_TO_MM)) < 0.02 ? 'in' : 'mm';
  });
  const set = (patch: Partial<ConferenceRules>, key = 'conference') => {
    const next: ConferenceRules = { ...rules, ...patch };
    for (const k of Object.keys(next) as (keyof ConferenceRules)[]) if (next[k] === undefined || next[k] === '' || next[k] === false) delete next[k];
    onConference?.(Object.keys(next).length ? next : undefined, key);
  };
  const results = conferenceResults(poster);
  const preset = rules.width && rules.height ? SIZE_PRESETS.find((p) => Math.abs(p.w - Math.min(rules.width!, rules.height!)) < 1 && Math.abs(p.h - Math.max(rules.width!, rules.height!)) < 1)?.id ?? 'custom' : '';
  const toUnit = (v?: number) => (v == null ? '' : unit === 'in' ? +(v / IN_TO_MM).toFixed(2) : Math.round(v));
  const fromUnit = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) && n > 0 ? (unit === 'in' ? n * IN_TO_MM : n) : undefined;
  };
  const num = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const passed = results.filter((r) => r.ok).length;

  return (
    <div className="conference-tab">
      <p className="muted small">Copy the rules from the conference's poster instructions. Only what you fill in is checked, and anything not met shows up under Problems.</p>
      <label>
        Conference name
        <input placeholder="e.g. ISMB 2026" value={rules.name ?? ''} onChange={(e) => set({ name: e.target.value }, 'conf-name')} />
      </label>

      <fieldset className="conf-group">
        <legend>Size</legend>
        <label>
          Required size
          <select
            value={preset}
            onChange={(e) => {
              const p = SIZE_PRESETS.find((x) => x.id === e.target.value);
              if (e.target.value === '') set({ width: undefined, height: undefined, sizeMode: undefined });
              else if (p) set({ width: p.w, height: p.h, sizeMode: rules.sizeMode ?? 'exact' });
              else set({ width: rules.width ?? poster.width, height: rules.height ?? poster.height, sizeMode: rules.sizeMode ?? 'exact' });
            }}
          >
            <option value="">No size rule</option>
            {SIZE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
            <option value="custom">Custom…</option>
          </select>
        </label>
        {rules.width && rules.height && (
          <>
            <div className="row2">
              <label>
                Width ({unit})
                <input type="number" min={1} step={unit === 'in' ? 0.5 : 1} value={toUnit(rules.width)} onChange={(e) => set({ width: fromUnit(e.target.value) }, 'conf-w')} />
              </label>
              <label>
                Height ({unit})
                <input type="number" min={1} step={unit === 'in' ? 0.5 : 1} value={toUnit(rules.height)} onChange={(e) => set({ height: fromUnit(e.target.value) }, 'conf-h')} />
              </label>
            </div>
            <div className="row2">
              <label>
                Units
                <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                  <option value="mm">mm</option>
                  <option value="in">inches</option>
                </select>
              </label>
              <label>
                Size must be
                <select value={rules.sizeMode ?? 'exact'} onChange={(e) => set({ sizeMode: e.target.value as 'exact' | 'max' })}>
                  <option value="exact">Exactly this</option>
                  <option value="max">This or smaller</option>
                </select>
              </label>
            </div>
          </>
        )}
        <label>
          Orientation
          <select value={rules.orientation ?? ''} onChange={(e) => set({ orientation: (e.target.value || undefined) as ConferenceRules['orientation'] })}>
            <option value="">Either</option>
            <option value="portrait">Portrait (tall)</option>
            <option value="landscape">Landscape (wide)</option>
          </select>
        </label>
      </fieldset>

      <fieldset className="conf-group">
        <legend>Content</legend>
        <div className="row2">
          <label>
            Smallest text (pt)
            <input type="number" min={1} placeholder="None" value={rules.minFontPt ?? ''} onChange={(e) => set({ minFontPt: num(e.target.value) }, 'conf-pt')} />
          </label>
        </div>
        <div className="row2">
          <label>
            Poster number
            <input placeholder="e.g. P-142" value={rules.posterNumber ?? ''} onChange={(e) => set({ posterNumber: e.target.value }, 'conf-num')} />
          </label>
          <label>
            Logos needed
            <input type="number" min={0} max={20} placeholder="None" value={rules.logos ?? ''} onChange={(e) => set({ logos: num(e.target.value) && Math.round(num(e.target.value)!) }, 'conf-logos')} />
          </label>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={!!rules.requireQr} onChange={(e) => set({ requireQr: e.target.checked })} /> A QR code is required
        </label>
      </fieldset>

      {hasRules(poster.conference) ? (
        <>
          <h4 className="conf-summary">{passed === results.length ? `All ${results.length} rules met` : `${passed} of ${results.length} rules met`}</h4>
          <ul className="conf-results" aria-label="Conference rules">
            {results.map((r) => (
              <li key={r.id} className={r.ok ? 'ok' : 'fail'}>
                <button disabled={!r.elementIds?.length} onClick={() => r.elementIds?.length && onPickMany(r.elementIds)}>
                  <span className="conf-mark" aria-label={r.ok ? 'Met' : 'Not met'}>{r.ok ? '✓' : '✕'}</span>
                  <span>
                    <strong>{r.rule}</strong>
                    <span className="issue-detail">{r.detail}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button className="btn small-btn" onClick={() => onConference?.(undefined)}>Clear conference rules</button>
        </>
      ) : null}
    </div>
  );
}

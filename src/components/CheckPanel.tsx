import { useEffect, useMemo, useState } from 'react';
import type { Issue } from '../lib/checks';
import type { Poster } from '../types';
import { findMisspellings, loadSpeller, type Misspelling, type Speller } from '../lib/spelling';
import { htmlToText, wordCount } from '../lib/textTools';

const ICON = { problem: '⛔', warning: '⚠️', tip: '💡' };

export type CheckTab = 'problems' | 'spelling' | 'words';

interface Props {
  issues: Issue[];
  poster: Poster;
  tab: CheckTab;
  onTab: (t: CheckTab) => void;
  onPick: (elementId: string) => void;
  /** select several boxes (a whole section) */
  onPickMany: (elementIds: string[]) => void;
  /** replace a misspelt word everywhere on the poster */
  onFixWord: (word: string, replacement: string) => void;
  onIgnoreWord: (word: string) => void;
  onWordLimit: (limit: number | undefined) => void;
  onClose: () => void;
}

/** Poster problems, a spelling pass and word counts, in three tabs. */
export default function CheckPanel(props: Props) {
  const { issues, tab, onTab, onClose } = props;
  const problems = issues.filter((i) => i.severity !== 'tip').length;
  const tabs: { id: CheckTab; label: string }[] = [
    { id: 'problems', label: problems ? `Problems (${problems})` : 'Problems' },
    { id: 'spelling', label: 'Spelling' },
    { id: 'words', label: 'Words' },
  ];
  return (
    <div className="check-panel" role="dialog" aria-label="Poster check">
      <div className="check-head">
        <strong>Poster check</strong>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <div className="seg check-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => onTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'problems' && <Problems {...props} />}
      {tab === 'spelling' && <Spelling {...props} />}
      {tab === 'words' && <Words {...props} />}
    </div>
  );
}

function Problems({ issues, onPick }: Props) {
  const problems = issues.filter((i) => i.severity === 'problem').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  if (issues.length === 0)
    return (
      <div className="check-ok">
        <div className="big-tick">✓</div>
        <p>No problems found. Your poster is ready to export.</p>
      </div>
    );
  return (
    <>
      <p className="muted small check-summary">
        {problems > 0 && `${problems} to fix`}
        {problems > 0 && warnings > 0 && ', '}
        {warnings > 0 && `${warnings} to look at`}
        {problems + warnings === 0 && 'Only suggestions'}
        {' · click an item to select it'}
      </p>
      <ul className="issue-list">
        {issues.map((i) => (
          <li key={i.id} className={'issue ' + i.severity}>
            <button disabled={!i.elementId} onClick={() => i.elementId && onPick(i.elementId)}>
              <span className="issue-icon" aria-hidden>{ICON[i.severity]}</span>
              <span>
                <strong>{i.title}</strong>
                <span className="issue-detail">{i.detail}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
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

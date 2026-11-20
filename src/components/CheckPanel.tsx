import type { Issue } from '../lib/checks';

const ICON = { problem: '⛔', warning: '⚠️', tip: '💡' };

interface Props {
  issues: Issue[];
  /** called with the clicked issue; issues about an element or a note can be picked */
  onPick: (issue: Issue) => void;
  onClose: () => void;
}

/** List of poster problems; clicking one selects the element (or opens the review note) it is about. */
export default function CheckPanel({ issues, onPick, onClose }: Props) {
  const problems = issues.filter((i) => i.severity === 'problem').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  return (
    <div className="check-panel" role="dialog" aria-label="Poster check">
      <div className="check-head">
        <strong>Poster check</strong>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
      </div>
      {issues.length === 0 ? (
        <div className="check-ok">
          <div className="big-tick">✓</div>
          <p>No problems found. Your poster is ready to export.</p>
        </div>
      ) : (
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
                <button disabled={!i.elementId && !i.noteId} onClick={() => (i.elementId || i.noteId) && onPick(i)}>
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
      )}
    </div>
  );
}

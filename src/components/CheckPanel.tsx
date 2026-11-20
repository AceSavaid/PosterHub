import type { Issue } from '../lib/checks';

const ICON = { problem: '⛔', warning: '⚠️', tip: '💡' };

interface Props {
  issues: Issue[];
  onPick: (elementId: string) => void;
  /** Applies an issue's one-click fix (e.g. swap a colour for a printable one). */
  onFix?: (issue: Issue) => void;
  onClose: () => void;
}

/** List of poster problems; clicking one selects the element it is about. */
export default function CheckPanel({ issues, onPick, onFix, onClose }: Props) {
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
                <button disabled={!i.elementId} onClick={() => i.elementId && onPick(i.elementId)}>
                  <span className="issue-icon" aria-hidden>{ICON[i.severity]}</span>
                  <span>
                    <strong>{i.title}</strong>
                    <span className="issue-detail">{i.detail}</span>
                  </span>
                </button>
                {i.fix && onFix && (
                  <button className="issue-fix" onClick={() => onFix(i)}>
                    <span className="swatch" style={{ background: i.fix.from }} aria-hidden />→<span className="swatch" style={{ background: i.fix.to }} aria-hidden />
                    {i.fix.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

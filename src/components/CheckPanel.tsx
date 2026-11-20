import type { Issue } from '../lib/checks';
import { visionInfo, type VisionMode } from '../lib/colorVision';

const ICON = { problem: '⛔', warning: '⚠️', tip: '💡' };

interface Props {
  issues: Issue[];
  onPick: (elementId: string) => void;
  onClose: () => void;
  /** show the poster as seen with this kind of vision */
  onPreview?: (mode: VisionMode) => void;
}

/** List of poster problems; clicking one selects the element it is about. */
export default function CheckPanel({ issues, onPick, onClose, onPreview }: Props) {
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
                {i.preview && onPreview && (
                  <button className="issue-preview" onClick={() => onPreview(i.preview!)}>
                    👁 Preview as {visionInfo(i.preview).label.toLowerCase()}
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

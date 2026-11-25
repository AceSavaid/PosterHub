import { keys } from '../lib/keys';
import type { CheckTab } from './CheckPanel';

export type SidePanel = 'check' | 'find' | 'notes';

const TABS: { panel: SidePanel; tab?: CheckTab; label: string; title?: string }[] = [
  { panel: 'check', tab: 'problems', label: 'Problems', title: 'Things to fix before printing' },
  { panel: 'check', tab: 'spelling', label: 'Spelling' },
  { panel: 'check', tab: 'words', label: 'Words', title: 'Word counts, word limit and conference rules' },
  { panel: 'find', label: 'Find', title: 'Find and replace (Ctrl/⌘ F)' },
  { panel: 'notes', label: 'Notes', title: 'Notes from co-authors' },
];

/**
 * The one row of tabs at the top of the review panel. Checking the poster (problems, spelling,
 * words), finding words and reading co-authors' notes share one button and one spot beside the poster.
 */
export default function ReviewSwitch({ current, tab, problems, notes, onPick }: { current: SidePanel; tab: CheckTab; problems: number; notes: number; onPick: (p: SidePanel, tab?: CheckTab) => void }) {
  const shown = tab === 'conference' ? 'words' : tab;
  return (
    <div className="seg review-switch" role="tablist" aria-label="Review">
      {TABS.map((t) => {
        const on = current === t.panel && (!t.tab || t.tab === shown);
        const count = t.panel === 'notes' ? notes : t.tab === 'problems' ? problems : 0;
        return (
          <button key={t.label} role="tab" aria-selected={on} className={on ? 'active' : ''} title={t.title && keys(t.title)} onClick={() => onPick(t.panel, t.tab)}>
            {t.label}
            {count > 0 && <span className={'badge' + (t.panel === 'notes' ? ' note-badge' : ' soft')}>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

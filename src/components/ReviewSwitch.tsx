import { keys } from '../lib/keys';

export type SidePanel = 'check' | 'find' | 'notes';

const PANELS: { id: SidePanel; label: string; title?: string }[] = [
  { id: 'check', label: 'Poster check' },
  { id: 'find', label: 'Find', title: 'Find and replace (Ctrl/⌘ F)' },
  { id: 'notes', label: 'Notes' },
];

/**
 * The switcher at the top of the review panel. Checking the poster, finding words and reading
 * co-authors' notes share one button and one spot beside the poster; this flips between them.
 */
export default function ReviewSwitch({ current, notes, onPick }: { current: SidePanel; notes: number; onPick: (p: SidePanel) => void }) {
  return (
    <div className="seg review-switch" role="group" aria-label="Review">
      {PANELS.map((p) => (
        <button key={p.id} aria-pressed={current === p.id} className={current === p.id ? 'active' : ''} title={p.title && keys(p.title)} onClick={() => onPick(p.id)}>
          {p.label}
          {p.id === 'notes' && notes > 0 && <span className="badge note-badge">{notes}</span>}
        </button>
      ))}
    </div>
  );
}

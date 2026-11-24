import { useEffect, useRef, type ReactNode } from 'react';
import type { Poster, ReviewNote } from '../types';
import { MM_TO_PX } from '../model';
import { MAX_AUTHOR_LENGTH, MAX_NOTE_LENGTH, authorName, notesOf, preview, timeAgo } from '../lib/notes';
import { trackPointer } from '../lib/pointer';

// Note text comes from whoever sent the poster file. It is only ever shown as
// React text or a <textarea> value, never as HTML.

const PIN = 26; // px on screen, whatever the zoom
const CARD_W = 270;

interface LayerProps {
  poster: Poster;
  zoom: number;
  showResolved: boolean;
  openId: string | null;
  onOpen: (id: string | null) => void;
  onMove: (id: string, x: number, y: number, coalesce: string) => void;
  onText: (id: string, text: string) => void;
  onResolve: (id: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
}

/** Numbered pins on the poster, plus the card of the open note. Lives outside the poster node. */
export function NotesLayer({ poster, zoom, showResolved, openId, onOpen, onMove, onText, onResolve, onDelete }: LayerProps) {
  const all = notesOf(poster);
  const k = zoom * MM_TO_PX;
  const shown = all.filter((n) => showResolved || !n.resolved || n.id === openId);
  const open = shown.find((n) => n.id === openId);

  function startDrag(e: React.PointerEvent, n: ReviewNote) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY };
    const orig = { x: n.x, y: n.y };
    const key = 'note-move-' + n.id + '-' + Date.now();
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
      moved = true;
      const x = Math.min(poster.width, Math.max(0, orig.x + (ev.clientX - start.x) / k));
      const y = Math.min(poster.height, Math.max(0, orig.y + (ev.clientY - start.y) / k));
      onMove(n.id, x, y, key);
    };
    const up = () => {
      if (!moved) onOpen(openId === n.id ? null : n.id);
    };
    trackPointer(move, up);
  }

  return (
    <div className="notes-layer" onPointerDown={(e) => e.stopPropagation()}>
      {shown.map((n) => {
        const num = all.indexOf(n) + 1;
        return (
          <button
            key={n.id}
            type="button"
            className={'note-pin' + (n.resolved ? ' resolved' : '') + (n.id === openId ? ' open' : '')}
            data-note-id={n.id}
            style={{ left: n.x * k - PIN / 2, top: n.y * k - PIN / 2, width: PIN, height: PIN }}
            aria-label={`Note ${num} from ${authorName(n)}${n.resolved ? ' (resolved)' : ''}: ${preview(n.text, 60)}`}
            title={`${authorName(n)}: ${preview(n.text, 80)}\nClick to open · drag to move`}
            onPointerDown={(e) => startDrag(e, n)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen(openId === n.id ? null : n.id);
              }
            }}
          >
            {n.resolved ? '✓' : num}
          </button>
        );
      })}
      {open && (
        <NoteCard
          key={open.id}
          note={open}
          number={all.indexOf(open) + 1}
          // flip to the left of the pin when there is no room on the right
          left={open.x * k + PIN / 2 + 6 + CARD_W > poster.width * k ? open.x * k - PIN / 2 - 6 - CARD_W : open.x * k + PIN / 2 + 6}
          top={Math.max(0, open.y * k - PIN / 2)}
          onText={(t) => onText(open.id, t)}
          onResolve={() => onResolve(open.id, !open.resolved)}
          onDelete={() => onDelete(open.id)}
          onClose={() => onOpen(null)}
        />
      )}
    </div>
  );
}

interface CardProps {
  note: ReviewNote;
  number: number;
  left: number;
  top: number;
  onText: (t: string) => void;
  onResolve: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function NoteCard({ note, number, left, top, onText, onResolve, onDelete, onClose }: CardProps) {
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // new, empty notes are ready to type into
    if (!note.text) area.current?.focus();
    area.current?.closest('.note-card')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={'note-card' + (note.resolved ? ' resolved' : '')}
      role="dialog"
      aria-label={`Note ${number}`}
      style={{ left, top, width: CARD_W }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="note-card-head">
        <span>
          <strong>{authorName(note)}</strong>
          <span className="muted"> · {timeAgo(note.createdAt)}</span>
        </span>
        <button className="icon-btn" aria-label="Close note" title="Close (Esc)" onClick={onClose}>×</button>
      </div>
      <textarea
        ref={area}
        aria-label="Note text"
        placeholder="Write your comment…"
        value={note.text}
        maxLength={MAX_NOTE_LENGTH}
        rows={4}
        onChange={(e) => onText(e.target.value)}
      />
      <div className="note-card-actions">
        <button className="btn" onClick={onResolve}>{note.resolved ? 'Reopen' : '✓ Resolve'}</button>
        <button className="link danger" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

interface PanelProps {
  /** the Check / Find / Notes switcher shown in place of the title */
  switcher?: ReactNode;
  poster: Poster;
  reviewer: string;
  onReviewer: (name: string) => void;
  showNotes: boolean;
  onShowNotes: (show: boolean) => void;
  showResolved: boolean;
  onShowResolved: (show: boolean) => void;
  onAdd: () => void;
  onPick: (id: string) => void;
  onResolve: (id: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
  onDeleteResolved: () => void;
  onClose: () => void;
}

/** Side list of all notes: add, find, resolve and delete them, and show or hide them on the poster. */
export function NotesPanel(props: PanelProps) {
  const { switcher, poster, reviewer, onReviewer, showNotes, onShowNotes, showResolved, onShowResolved, onAdd, onPick, onResolve, onDelete, onDeleteResolved, onClose } = props;
  const all = notesOf(poster);
  const openCount = all.filter((n) => !n.resolved).length;
  const resolvedCount = all.length - openCount;
  const listed = all.filter((n) => showResolved || !n.resolved);
  return (
    <div className="check-panel notes-panel" role="dialog" aria-label="Review notes">
      <div className="check-head">
        {switcher ?? <strong>Review notes</strong>}
        <button className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <p className="hint notes-hint">
        Leave comments for co-authors and supervisors. Notes are saved with the poster and its project file, and are <strong>never printed or exported</strong>.
      </p>
      <div className="notes-tools">
        <label>
          Your name (shown on your notes)
          <input value={reviewer} maxLength={MAX_AUTHOR_LENGTH} placeholder="e.g. Dr. Lee" onChange={(e) => onReviewer(e.target.value)} />
        </label>
        <button className="btn primary" onClick={onAdd} title="Adds a note on the selected element, or in the middle of the view">+ Add note</button>
      </div>
      <div className="notes-toggles">
        <label className="check">
          <input type="checkbox" checked={showNotes} onChange={(e) => onShowNotes(e.target.checked)} /> Show notes on poster
        </label>
        <label className="check">
          <input type="checkbox" checked={showResolved} onChange={(e) => onShowResolved(e.target.checked)} /> Show resolved ({resolvedCount})
        </label>
      </div>
      {all.length === 0 ? (
        <p className="muted small notes-empty">No notes yet. Select something on the poster and click Add note, or right-click it and choose Add note.</p>
      ) : listed.length === 0 ? (
        <p className="muted small notes-empty">All {resolvedCount} note(s) are resolved. Tick “Show resolved” to see them.</p>
      ) : (
        <ul className="issue-list notes-list">
          {listed.map((n) => (
            <li key={n.id} className={'issue note-item' + (n.resolved ? ' resolved' : '')}>
              <button onClick={() => onPick(n.id)} aria-label={`Open note ${all.indexOf(n) + 1}`}>
                <span className="note-num" aria-hidden>{n.resolved ? '✓' : all.indexOf(n) + 1}</span>
                <span className="note-body">
                  <strong>
                    {authorName(n)} <span className="muted">· {timeAgo(n.createdAt)}</span>
                  </strong>
                  <span className="issue-detail note-text">{n.text || '(empty note)'}</span>
                </span>
              </button>
              <div className="note-item-actions">
                <button className="link" onClick={() => onResolve(n.id, !n.resolved)}>{n.resolved ? 'Reopen' : 'Resolve'}</button>
                <button className="link danger" onClick={() => onDelete(n.id)} aria-label={`Delete note ${all.indexOf(n) + 1}`}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {resolvedCount > 0 && (
        <button className="link danger notes-clear" onClick={onDeleteResolved}>Delete all resolved notes</button>
      )}
      {openCount > 0 && <p className="muted small">{openCount} open note(s). The Check button lists them too.</p>}
    </div>
  );
}

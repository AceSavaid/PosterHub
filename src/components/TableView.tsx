import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { Poster, PosterElement, TableSpec } from '../types';
import { fontStack, resolveFont } from '../model';
import { CELL_PAD, cellLook, cellsFromClipboard, columnAlign, insertRow, normalizeTable, pasteCells, setCell, type Border } from '../lib/table';

interface Props {
  el: PosterElement;
  poster: Poster;
  editing: boolean;
  onCommit?: (t: TableSpec) => void;
  onDone?: () => void;
  onActiveCell?: (cell: { r: number; c: number } | null) => void;
}

const border = (b: Border | null) => (b ? `${b.pt}pt solid ${b.color}` : undefined);

/** Reads what the person typed in a cell (newlines kept, the trailing one browsers add dropped). */
function cellText(td: HTMLElement) {
  const t = (td.innerText ?? td.textContent ?? '').replace(/ /g, ' ');
  return t.replace(/\n$/, '');
}

/**
 * A table on the poster. Cells are plain text; while editing, each cell can be
 * typed in directly, Tab / Enter move between cells (Tab on the last cell adds
 * a row) and cells pasted from a spreadsheet fill the table from the cursor.
 */
export default function TableView({ el, poster, editing, onCommit, onDone, onActiveCell }: Props) {
  const t = normalizeTable(el.table);
  const wrap = useRef<HTMLDivElement>(null);
  const lastPointer = useRef<{ r: number; c: number } | null>(null);
  const pendingFocus = useRef<{ r: number; c: number } | null>(null);
  const pal = poster.palette;
  const aligns = columnAlign(t);

  const cellNode = (r: number, c: number) => wrap.current?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`) ?? null;

  function focusCell(r: number, c: number) {
    const n = cellNode(r, c);
    if (!n) {
      pendingFocus.current = { r, c };
      return;
    }
    n.focus();
    const range = document.createRange();
    range.selectNodeContents(n);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  // Start typing in the cell that was double-clicked (or the first one).
  useEffect(() => {
    if (!editing) return;
    const at = lastPointer.current ?? { r: 0, c: 0 };
    focusCell(Math.min(at.r, t.rows.length - 1), Math.min(at.c, t.rows[0].length - 1));
    return () => onActiveCell?.(null);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // A cell that did not exist yet (e.g. Tab added a row) is focused once it renders.
  useLayoutEffect(() => {
    if (pendingFocus.current && editing) {
      const p = pendingFocus.current;
      pendingFocus.current = null;
      if (cellNode(p.r, p.c)) focusCell(p.r, p.c);
    }
  });

  // Flag tables that no longer fit their box, like text boxes do.
  useLayoutEffect(() => {
    const n = wrap.current;
    if (n?.parentElement) n.parentElement.dataset.overflow = String(n.scrollHeight > n.clientHeight + 1);
  });

  /** The table with every cell's typed text written back. */
  function withTyped(): TableSpec {
    let out = t;
    wrap.current?.querySelectorAll<HTMLElement>('[data-r]').forEach((td) => {
      out = setCell(out, +td.dataset.r!, +td.dataset.c!, cellText(td));
    });
    return out;
  }

  function commit(next: TableSpec) {
    if (JSON.stringify(next) !== JSON.stringify(t)) onCommit?.(next);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLElement>, r: number, c: number) {
    e.stopPropagation();
    const nCols = t.rows[0].length;
    if (e.key === 'Escape') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).blur();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      let nr = r;
      let nc = c + (e.shiftKey ? -1 : 1);
      if (nc >= nCols) (nc = 0), nr++;
      if (nc < 0) (nc = nCols - 1), nr--;
      if (nr < 0) return;
      if (nr >= t.rows.length) {
        // Tab on the last cell adds a row, as in Word and PowerPoint.
        pendingFocus.current = { r: nr, c: 0 };
        commit(insertRow(withTyped(), t.rows.length));
        return;
      }
      focusCell(nr, nc);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (r + 1 < t.rows.length) focusCell(r + 1, c);
      else (e.currentTarget as HTMLElement).blur();
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLElement>, r: number, c: number) {
    e.stopPropagation();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    const cells = cellsFromClipboard(html, text);
    e.preventDefault();
    if (cells) {
      const next = pasteCells(withTyped(), r, c, cells);
      // The focused cell is not refreshed from the model while typing, so update it here.
      e.currentTarget.textContent = next.rows[r][c];
      commit(next);
      return;
    }
    // Plain words: keep them as text, without any outside formatting.
    if (text) document.execCommand('insertText', false, text.replace(/\r\n?/g, '\n'));
  }

  function onBlur(e: React.FocusEvent<HTMLElement>) {
    if (!editing) return;
    const next = e.relatedTarget as Node | null;
    const staying = !!next && !!wrap.current?.contains(next);
    commit(withTyped());
    if (!staying) onDone?.();
  }

  const style: CSSProperties = {
    fontFamily: fontStack(resolveFont('@body', poster)),
    fontSize: `${t.fontSize}pt`,
  };
  const total = t.colWidths?.reduce((a, b) => a + b, 0) ?? 0;

  return (
    <div
      ref={wrap}
      className="el-table-wrap"
      style={style}
      onPointerDownCapture={(e) => {
        const td = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
        if (td) lastPointer.current = { r: +td.dataset.r!, c: +td.dataset.c! };
      }}
    >
      <table className="poster-table" style={{ tableLayout: total ? 'fixed' : 'auto' }}>
        {total > 0 && (
          <colgroup>
            {t.colWidths!.map((w, i) => (
              <col key={i} style={{ width: `${(w / total) * 100}%` }} />
            ))}
          </colgroup>
        )}
        <tbody>
          {t.rows.map((row, r) => (
            <tr key={r}>
              {row.map((text, c) => {
                const look = cellLook(t, pal, r, c);
                const s: CSSProperties = {
                  background: look.fill ?? undefined,
                  color: look.color,
                  fontWeight: look.bold ? 700 : 400,
                  textAlign: aligns[c],
                  borderTop: border(look.top),
                  borderRight: border(look.right),
                  borderBottom: border(look.bottom),
                  borderLeft: border(look.left),
                  padding: `${CELL_PAD.v}em ${CELL_PAD.h}em`,
                };
                const Tag = t.headerRow && r === 0 ? 'th' : 'td';
                return (
                  <Cell
                    key={c}
                    tag={Tag}
                    text={text}
                    r={r}
                    c={c}
                    style={s}
                    editing={editing}
                    onKeyDown={(e) => onKeyDown(e, r, c)}
                    onPaste={(e) => onPaste(e, r, c)}
                    onBlur={onBlur}
                    onFocus={() => onActiveCell?.({ r, c })}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface CellProps {
  tag: 'td' | 'th';
  text: string;
  r: number;
  c: number;
  style: CSSProperties;
  editing: boolean;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLElement>) => void;
  onFocus: () => void;
}

function Cell({ tag: Tag, text, r, c, style, editing, onKeyDown, onPaste, onBlur, onFocus }: CellProps) {
  const ref = useRef<HTMLTableCellElement>(null);
  // Text is set imperatively so React never fights the caret while typing.
  useLayoutEffect(() => {
    const n = ref.current;
    if (n && document.activeElement !== n && cellText(n) !== text) n.textContent = text;
  }, [text, editing]);
  return (
    <Tag
      ref={ref}
      data-r={r}
      data-c={c}
      style={style}
      contentEditable={editing ? 'plaintext-only' : undefined}
      suppressContentEditableWarning
      spellCheck={editing}
      tabIndex={editing ? 0 : undefined}
      onKeyDown={editing ? onKeyDown : undefined}
      onPaste={editing ? onPaste : undefined}
      onBlur={editing ? onBlur : undefined}
      onFocus={editing ? onFocus : undefined}
    />
  );
}

import { forwardRef, useRef, useState } from 'react';
import type { Poster, PosterElement } from '../types';
import { MM_TO_PX, columnLefts, columnWidth } from '../model';
import { ElementView, Surface } from './Surface';
import { boundsOf } from '../lib/arrange';
import { groupMembers, scaleInto, wholeGroup } from '../lib/groups';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

interface Props {
  poster: Poster;
  zoom: number;
  showGrid: boolean;
  snap: boolean;
  selectedIds: string[];
  editingId: string | null;
  /** additive toggles the element (and its group); `only` picks one element out of its group */
  onSelect: (id: string, additive: boolean, only?: boolean) => void;
  onMoveMany: (moves: { id: string; patch: Partial<PosterElement> }[], coalesce?: string) => void;
  onEdit: (id: string | null) => void;
  onChange: (id: string, patch: Partial<PosterElement>, coalesce?: string) => void;
  onCommitText: (id: string, html: string) => void;
  onActivate: (el: PosterElement) => void; // double-click on image/chart
  onContextMenu: (el: PosterElement, x: number, y: number) => void;
}

interface Guide {
  axis: 'x' | 'y';
  at: number;
}

export const Canvas = forwardRef<HTMLDivElement, Props>(function Canvas(props, ref) {
  const { poster, zoom, showGrid, snap, selectedIds, editingId, onSelect, onMoveMany, onEdit, onChange, onCommitText, onActivate, onContextMenu } = props;
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const [guides, setGuides] = useState<Guide[]>([]);
  const dragging = useRef(false);

  const scale = zoom * MM_TO_PX; // screen px per mm

  function snapLines(exclude: string | string[]) {
    const ex = new Set(Array.isArray(exclude) ? exclude : [exclude]);
    const xs = [0, poster.margin, poster.width - poster.margin, poster.width, poster.width / 2];
    const ys = [0, poster.margin, poster.height - poster.margin, poster.height, poster.height / 2];
    const cw = columnWidth(poster);
    for (const l of columnLefts(poster)) xs.push(l, l + cw);
    for (const e of poster.elements) {
      if (ex.has(e.id)) continue;
      xs.push(e.x, e.x + e.w, e.x + e.w / 2);
      ys.push(e.y, e.y + e.h, e.y + e.h / 2);
    }
    return { xs, ys };
  }

  /** Returns the snap delta for a set of candidate edges. */
  function bestSnap(edges: number[], lines: number[], threshold: number) {
    let best: { d: number; at: number } | null = null;
    for (const e of edges)
      for (const l of lines) {
        const d = l - e;
        if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: l };
      }
    return best;
  }

  function startDrag(e: React.PointerEvent, el: PosterElement, handle?: Handle) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.shiftKey && !handle) {
      onSelect(el.id, true);
      return;
    }
    // Dragging one of several selected elements moves the whole group.
    if (!handle && selectedIds.length > 1 && selectedIds.includes(el.id)) return startGroupDrag(e, selectedIds);
    const only = e.ctrlKey || e.metaKey;
    // A grouped element moves with its group, unless it was picked out on its own (Ctrl/⌘-click).
    if (!handle && el.groupId && !only && !(selectedIds.length === 1 && selectedIds[0] === el.id)) {
      const members = groupMembers(el.id, poster.elements);
      onSelect(el.id, false);
      return startGroupDrag(e, members);
    }
    onSelect(el.id, false, only);
    if (el.locked) return;
    const start = { x: e.clientX, y: e.clientY };
    const orig = { x: el.x, y: el.y, w: el.w, h: el.h };
    const lines = snapLines(el.id);
    const threshold = 6 / scale;
    const key = (handle ? 'resize-' : 'move-') + el.id + '-' + Date.now();
    const ratio = orig.w / orig.h;
    let moved = false;

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / scale;
      const dy = (ev.clientY - start.y) / scale;
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 3) return;
      moved = true;
      dragging.current = true;
      const doSnap = snap && !ev.altKey;
      const g: Guide[] = [];
      let { x, y, w, h } = orig;
      if (!handle) {
        x += dx;
        y += dy;
        if (doSnap) {
          const sx = bestSnap([x, x + w / 2, x + w], lines.xs, threshold);
          const sy = bestSnap([y, y + h / 2, y + h], lines.ys, threshold);
          if (sx) (x += sx.d), g.push({ axis: 'x', at: sx.at });
          if (sy) (y += sy.d), g.push({ axis: 'y', at: sy.at });
        }
      } else {
        const minS = 5;
        if (handle.includes('e')) w = Math.max(minS, orig.w + dx);
        if (handle.includes('s')) h = Math.max(minS, orig.h + dy);
        if (handle.includes('w')) {
          w = Math.max(minS, orig.w - dx);
          x = orig.x + orig.w - w;
        }
        if (handle.includes('n')) {
          h = Math.max(minS, orig.h - dy);
          y = orig.y + orig.h - h;
        }
        // Shift keeps proportions on corner handles (handy for images).
        if (ev.shiftKey && handle.length === 2) {
          h = w / ratio;
          if (handle.includes('n')) y = orig.y + orig.h - h;
        }
        if (doSnap) {
          if (handle.includes('e')) {
            const s = bestSnap([x + w], lines.xs, threshold);
            if (s) (w += s.d), g.push({ axis: 'x', at: s.at });
          }
          if (handle.includes('w')) {
            const s = bestSnap([x], lines.xs, threshold);
            if (s) (x += s.d), (w -= s.d), g.push({ axis: 'x', at: s.at });
          }
          if (handle.includes('s')) {
            const s = bestSnap([y + h], lines.ys, threshold);
            if (s) (h += s.d), g.push({ axis: 'y', at: s.at });
          }
          if (handle.includes('n')) {
            const s = bestSnap([y], lines.ys, threshold);
            if (s) (y += s.d), (h -= s.d), g.push({ axis: 'y', at: s.at });
          }
        }
      }
      setGuides(g);
      onChange(el.id, { x, y, w, h }, key);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setGuides([]);
      setTimeout(() => (dragging.current = false), 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function startGroupDrag(e: React.PointerEvent, ids: string[]) {
    const group = poster.elements.filter((x) => ids.includes(x.id) && !x.locked);
    if (!group.length) return;
    const start = { x: e.clientX, y: e.clientY };
    const origs = group.map((g) => ({ id: g.id, x: g.x, y: g.y }));
    const bx = Math.min(...group.map((g) => g.x));
    const by = Math.min(...group.map((g) => g.y));
    const bw = Math.max(...group.map((g) => g.x + g.w)) - bx;
    const bh = Math.max(...group.map((g) => g.y + g.h)) - by;
    const lines = snapLines(ids);
    const threshold = 6 / scale;
    const key = 'group-' + Date.now();
    const move = (ev: PointerEvent) => {
      let dx = (ev.clientX - start.x) / scale;
      let dy = (ev.clientY - start.y) / scale;
      const g: Guide[] = [];
      if (snap && !ev.altKey) {
        const sx = bestSnap([bx + dx, bx + dx + bw / 2, bx + dx + bw], lines.xs, threshold);
        const sy = bestSnap([by + dy, by + dy + bh / 2, by + dy + bh], lines.ys, threshold);
        if (sx) (dx += sx.d), g.push({ axis: 'x', at: sx.at });
        if (sy) (dy += sy.d), g.push({ axis: 'y', at: sy.at });
      }
      setGuides(g);
      onMoveMany(origs.map((o) => ({ id: o.id, patch: { x: o.x + dx, y: o.y + dy } })), key);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setGuides([]);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** Resizing a whole group scales every member inside the group's box. */
  function startGroupResize(e: React.PointerEvent, handle: Handle) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const members = poster.elements.filter((x) => selectedIds.includes(x.id));
    if (members.some((m) => m.locked)) return;
    const orig = boundsOf(members);
    const start = { x: e.clientX, y: e.clientY };
    const ratio = orig.w / orig.h;
    const key = 'group-resize-' + Date.now();
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / scale;
      const dy = (ev.clientY - start.y) / scale;
      const minS = 5;
      let { x, y, w, h } = orig;
      if (handle.includes('e')) w = Math.max(minS, orig.w + dx);
      if (handle.includes('s')) h = Math.max(minS, orig.h + dy);
      if (handle.includes('w')) (w = Math.max(minS, orig.w - dx)), (x = orig.x + orig.w - w);
      if (handle.includes('n')) (h = Math.max(minS, orig.h - dy)), (y = orig.y + orig.h - h);
      // Corner handles keep the group's proportions so pictures don't stretch; Shift frees them.
      if (handle.length === 2 && !ev.shiftKey) {
        h = w / ratio;
        if (handle.includes('n')) y = orig.y + orig.h - h;
      }
      onMoveMany(scaleInto(members, { x, y, w, h }), key);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const groupSel = wholeGroup(selectedIds, poster.elements);
  const groupBox = groupSel ? boundsOf(poster.elements.filter((x) => selectedIds.includes(x.id))) : null;
  const groupLocked = !!groupSel && poster.elements.some((x) => selectedIds.includes(x.id) && x.locked);
  const selected = poster.elements.find((e) => e.id === selectedId);
  const others = selectedIds.length > 1 ? poster.elements.filter((e) => selectedIds.includes(e.id)) : [];
  const hs = 10 / zoom; // handle size in poster px, constant on screen

  return (
    <Surface
      ref={ref}
      poster={poster}
      zoom={zoom}
      showGrid={showGrid}
      renderElement={(el) => {
        const isEditing = editingId === el.id;
        const isText = el.style != null;
        return (
          <ElementView
            key={el.id}
            el={el}
            poster={poster}
            editing={isEditing}
            onCommitText={(html) => onCommitText(el.id, html)}
            onEditDone={() => onEdit(null)}
            className={(selectedIds.includes(el.id) ? 'selected ' : '') + (el.locked ? 'locked ' : '') + (isEditing ? 'editing' : '')}
            wrapperProps={{
              onPointerDown: isEditing ? (e) => e.stopPropagation() : (e) => startDrag(e, el),
              onContextMenu: (e) => {
                if (isEditing) return; // keep the browser's spelling / copy menu while typing
                e.preventDefault();
                e.stopPropagation();
                if (!selectedIds.includes(el.id)) onSelect(el.id, false);
                onContextMenu(el, e.clientX, e.clientY);
              },
              onDoubleClick: (e) => {
                e.stopPropagation();
                if (isText) onEdit(el.id);
                else onActivate(el);
              },
            }}
          />
        );
      }}
    >
      {selected && !editingId && (
        <div
          className="ui-only sel-box"
          style={{ left: selected.x * MM_TO_PX, top: selected.y * MM_TO_PX, width: selected.w * MM_TO_PX, height: selected.h * MM_TO_PX, borderWidth: 2 / zoom }}
        >
          {!selected.locked &&
            HANDLES.map((h) => (
              <div
                key={h}
                className={'handle h-' + h}
                style={{ width: hs, height: hs, margin: -hs / 2, borderWidth: 1.5 / zoom }}
                onPointerDown={(e) => startDrag(e, selected, h)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onContextMenu(selected, e.clientX, e.clientY);
                }}
              />
            ))}
        </div>
      )}
      {others.map((o) => (
        <div
          key={o.id}
          className="ui-only sel-box multi"
          style={{ left: o.x * MM_TO_PX, top: o.y * MM_TO_PX, width: o.w * MM_TO_PX, height: o.h * MM_TO_PX, borderWidth: 2 / zoom }}
        />
      ))}
      {groupBox && !editingId && (
        <div
          className="ui-only sel-box group-box"
          data-testid="group-box"
          style={{ left: groupBox.x * MM_TO_PX, top: groupBox.y * MM_TO_PX, width: groupBox.w * MM_TO_PX, height: groupBox.h * MM_TO_PX, borderWidth: 2 / zoom }}
        >
          {!groupLocked &&
            HANDLES.map((h) => (
              <div
                key={h}
                className={'handle h-' + h}
                style={{ width: hs, height: hs, margin: -hs / 2, borderWidth: 1.5 / zoom }}
                onPointerDown={(e) => startGroupResize(e, h)}
              />
            ))}
        </div>
      )}
      {guides.map((g, i) => (
        <div
          key={i}
          className="ui-only guide"
          style={
            g.axis === 'x'
              ? { left: g.at * MM_TO_PX, top: 0, bottom: 0, width: 1 / zoom }
              : { top: g.at * MM_TO_PX, left: 0, right: 0, height: 1 / zoom }
          }
        />
      ))}
    </Surface>
  );
});

import { createPortal } from 'react-dom';
import { forwardRef, useRef, useState } from 'react';
import type { Poster, PosterElement, TableSpec } from '../types';
import { MM_TO_PX, columnLefts, columnWidth } from '../model';
import { ElementView, Surface } from './Surface';
import { boundsOf, type Bounds } from '../lib/arrange';
import { groupMembers, scaleInto, wholeGroup } from '../lib/groups';
import { elementLabel } from '../lib/a11y';
import { gapLabel, spacingFor, type GapMark } from '../lib/spacing';
import { sectionSlots } from '../lib/sections';

import { resizeRotated, snapAngle, type Handle } from '../lib/geometry';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
/** Touch screens get bigger resize and rotate handles. */
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

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
  onCommitTable: (id: string, t: TableSpec) => void;
  onActiveCell: (cell: { r: number; c: number } | null) => void;
  onActivate: (el: PosterElement) => void; // double-click on image/chart
  onContextMenu: (el: PosterElement, x: number, y: number) => void;
  /** the "+" under a section: add a new section after the one headed by `headingId` */
  onAddSection?: (headingId: string) => void;
  /** review notes layer, drawn outside the exported poster node */
  notes?: React.ReactNode;
}

interface Guide {
  axis: 'x' | 'y';
  at: number;
  /** a centre line ("Middle of the poster" / "Middle of the column"), shown with a label */
  label?: string;
}

interface Line {
  at: number;
  label?: string;
}

export const Canvas = forwardRef<HTMLDivElement, Props>(function Canvas(props, ref) {
  const { poster, zoom, showGrid, snap, selectedIds, editingId, onSelect, onMoveMany, onEdit, onChange, onCommitText, onCommitTable, onActiveCell, onActivate, onContextMenu, onAddSection, notes } = props;
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const [guides, setGuides] = useState<Guide[]>([]);
  const [gaps, setGaps] = useState<GapMark[]>([]);
  /** the element (or its group) under the mouse, outlined so it's clear what a click picks */
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** the last box the mouse left, so a "+" next to it stays put while the mouse moves onto it */
  const [lastHover, setLastHover] = useState<string | null>(null);
  /** the group a double-click stepped inside: clicking its other members then picks them one at a time */
  const insideGroup = useRef<string | null>(null);
  const [angle, setAngle] = useState<{ deg: number; x: number; y: number } | null>(null);
  const dragging = useRef(false);
  /** Firefox starts dragging selected text when a handle or box is pressed, which cancels our own drag. */
  const noNativeDrag = (e: React.DragEvent) => e.preventDefault();
  /** The last finger tap on an element, to spot a double-tap: Safari on iPad doesn't send dblclick for one. */
  const lastTap = useRef<{ id: string; t: number; x: number; y: number } | null>(null);
  /** When a double-tap last opened an element, so a dblclick the browser sends as well is ignored. */
  const tapActivatedAt = useRef(-Infinity);

  const scale = zoom * MM_TO_PX; // screen px per mm

  function snapLines(exclude: string | string[]) {
    const ex = new Set(Array.isArray(exclude) ? exclude : [exclude]);
    const xs: Line[] = [0, poster.margin, poster.width - poster.margin, poster.width].map((at) => ({ at }));
    const ys: Line[] = [0, poster.margin, poster.height - poster.margin, poster.height].map((at) => ({ at }));
    xs.push({ at: poster.width / 2, label: 'Middle of the poster' });
    ys.push({ at: poster.height / 2, label: 'Middle of the poster' });
    const cw = columnWidth(poster);
    if (poster.columns > 1) for (const l of columnLefts(poster)) xs.push({ at: l }, { at: l + cw }, { at: l + cw / 2, label: 'Middle of the column' });
    const others: Bounds[] = [];
    for (const e of poster.elements) {
      if (ex.has(e.id)) continue;
      xs.push({ at: e.x }, { at: e.x + e.w }, { at: e.x + e.w / 2 });
      ys.push({ at: e.y }, { at: e.y + e.h }, { at: e.y + e.h / 2 });
      if (!e.rotation) others.push(e);
    }
    return { xs, ys, others };
  }

  /** Returns the snap delta for a set of candidate edges. Centre lines win a tie, so they're easy to hit. */
  function bestSnap(edges: number[], lines: Line[], threshold: number) {
    let best: { d: number; at: number; label?: string } | null = null;
    for (const e of edges)
      for (const l of lines) {
        const d = l.at - e;
        if (Math.abs(d) > threshold) continue;
        if (!best || Math.abs(d) < Math.abs(best.d) - 1e-6 || (Math.abs(d) <= Math.abs(best.d) + 1e-6 && l.label && !best.label))
          best = { d, at: l.at, label: l.label };
      }
    return best;
  }

  /**
   * Snaps a box being moved: to edges, centres and the middle of the poster or a column first,
   * otherwise so its gap to the neighbours matches gaps already used. Returns the shift, the
   * lines to draw and the gap marks (in mm).
   */
  function snapMove(b: Bounds, lines: ReturnType<typeof snapLines>, threshold: number, doSnap: boolean) {
    let dx = 0;
    let dy = 0;
    const g: Guide[] = [];
    if (doSnap) {
      const sx = bestSnap([b.x, b.x + b.w / 2, b.x + b.w], lines.xs, threshold);
      const sy = bestSnap([b.y, b.y + b.h / 2, b.y + b.h], lines.ys, threshold);
      if (sx) (dx = sx.d), g.push({ axis: 'x', at: sx.at, label: sx.label });
      if (sy) (dy = sy.d), g.push({ axis: 'y', at: sy.at, label: sy.label });
    }
    const marks: GapMark[] = [];
    for (const axis of ['x', 'y'] as const) {
      const edged = axis === 'x' ? !!dx || g.some((l) => l.axis === 'x') : !!dy || g.some((l) => l.axis === 'y');
      const at = { ...b, x: b.x + dx, y: b.y + dy };
      const s = spacingFor(at, lines.others, axis, threshold, doSnap && !edged);
      if (axis === 'x') dx += s.delta;
      else dy += s.delta;
      marks.push(...s.marks);
    }
    return { dx, dy, guides: g, marks };
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
    // Once you've stepped inside a group (double-click), clicking another member picks just that one.
    if (el.groupId !== insideGroup.current) insideGroup.current = null;
    const inside = !!el.groupId && insideGroup.current === el.groupId && selectedIds.length === 1 && poster.elements.find((x) => x.id === selectedIds[0])?.groupId === el.groupId;
    if (!handle && el.groupId && !only && !inside) {
      const members = groupMembers(el.id, poster.elements);
      onSelect(el.id, false);
      return startGroupDrag(e, members);
    }
    onSelect(el.id, false, only || inside);
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
      if (!moved) setBusy(true);
      moved = true;
      dragging.current = true;
      const doSnap = snap && !ev.altKey;
      const g: Guide[] = [];
      let { x, y, w, h } = orig;
      let marks: GapMark[] = [];
      if (!handle) {
        x += dx;
        y += dy;
        if (!el.rotation) {
          const s = snapMove({ x, y, w, h }, lines, threshold, doSnap);
          x += s.dx;
          y += s.dy;
          g.push(...s.guides);
          marks = s.marks;
        }
      } else if (el.rotation) {
        // Rotated boxes resize along their own axes; snapping is off because edges aren't straight.
        ({ x, y, w, h } = resizeRotated(orig, el.rotation, handle, dx, dy, { keepRatio: ev.shiftKey }));
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
      setGaps(marks);
      onChange(el.id, { x, y, w, h }, key);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setGuides([]);
      setGaps([]);
      setBusy(false);
      setTimeout(() => (dragging.current = false), 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /** Drag the round handle above the selection to rotate around the centre. */
  function startRotate(e: React.PointerEvent, el: PosterElement) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const node = (e.currentTarget as HTMLElement).closest('.sel-box') as HTMLElement;
    const r = node.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const key = 'rotate-' + el.id + '-' + Date.now();
    const move = (ev: PointerEvent) => {
      const deg = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
      const rotation = snapAngle(deg, ev.shiftKey ? 15 : undefined);
      setAngle({ deg: rotation, x: ev.clientX, y: ev.clientY });
      onChange(el.id, { rotation }, key);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setAngle(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
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
    let moved = false;
    const move = (ev: PointerEvent) => {
      let dx = (ev.clientX - start.x) / scale;
      let dy = (ev.clientY - start.y) / scale;
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 3) return;
      if (!moved) setBusy(true);
      moved = true;
      const s = snapMove({ x: bx + dx, y: by + dy, w: bw, h: bh }, lines, threshold, snap && !ev.altKey);
      dx += s.dx;
      dy += s.dy;
      setGuides(s.guides);
      setGaps(s.marks);
      onMoveMany(origs.map((o) => ({ id: o.id, patch: { x: o.x + dx, y: o.y + dy } })), key);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setGuides([]);
      setGaps([]);
      setBusy(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
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
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /**
   * Double-click (or double-tap): on a selected group it steps inside and picks the one element
   * under the pointer, like Canva and PowerPoint. Otherwise it edits text or opens a picture or graph.
   */
  function open(el: PosterElement, isText: boolean) {
    if (el.groupId && wholeGroup(selectedIds, poster.elements) === el.groupId) {
      insideGroup.current = el.groupId;
      onSelect(el.id, false, true);
      return;
    }
    if (isText) onEdit(el.id);
    else onActivate(el);
  }

  const groupSel = wholeGroup(selectedIds, poster.elements);
  const groupBox = groupSel ? boundsOf(poster.elements.filter((x) => selectedIds.includes(x.id))) : null;
  const groupLocked = !!groupSel && poster.elements.some((x) => selectedIds.includes(x.id) && x.locked);
  const selected = poster.elements.find((e) => e.id === selectedId);
  const others = selectedIds.length > 1 ? poster.elements.filter((e) => selectedIds.includes(e.id)) : [];
  // Handle size in poster px, constant on screen. Bigger for fingers, but never so big that the handles cover a small box.
  const boxPx = selected ? Math.min(selected.w, selected.h) * MM_TO_PX * zoom : Infinity;
  const hs = (COARSE ? Math.max(10, Math.min(22, boxPx / 3)) : 10) / zoom;
  // The outline under the mouse: the whole group when a click would pick the group.
  const hovered = hoverId && !busy && !editingId ? poster.elements.find((e) => e.id === hoverId) : undefined;
  let hoverBox: (Bounds & { rotation?: number }) | null = null;
  if (hovered && !selectedIds.includes(hovered.id)) {
    const inside = !!hovered.groupId && insideGroup.current === hovered.groupId && selectedIds.length === 1 && poster.elements.find((x) => x.id === selectedIds[0])?.groupId === hovered.groupId;
    const members = hovered.groupId && !inside ? poster.elements.filter((e) => e.groupId === hovered.groupId) : [hovered];
    if (!members.some((m) => selectedIds.includes(m.id))) hoverBox = members.length > 1 ? boundsOf(members) : hovered;
  }
  const showSlots = !!onAddSection && !busy && !editingId;
  const rotBelow = !!selected && selected.y * MM_TO_PX < 40 / zoom;

  return (
    <Surface
      ref={ref}
      poster={poster}
      zoom={zoom}
      showGrid={showGrid}
      outside={notes}
      renderElement={(el) => {
        const isEditing = editingId === el.id;
        const isText = el.style != null || el.type === 'table';
        return (
          <ElementView
            key={el.id}
            el={el}
            poster={poster}
            editing={isEditing}
            onCommitText={(html) => onCommitText(el.id, html)}
            onCommitTable={(t) => onCommitTable(el.id, t)}
            onActiveCell={onActiveCell}
            onEditDone={() => onEdit(null)}
            className={(selectedIds.includes(el.id) ? 'selected ' : '') + (el.locked ? 'locked ' : '') + (isEditing ? 'editing' : '')}
            wrapperProps={{
              // Every element is a stop in the Tab order, so the poster can be edited without a mouse.
              tabIndex: isEditing ? -1 : 0,
              // A labelled group (not a button) so the label can summarise long text without clashing with it.
              role: isEditing ? undefined : 'group',
              'aria-label': isEditing ? undefined : elementLabel(el) + (selectedIds.includes(el.id) ? ', selected' : ''),
              'aria-roledescription': isEditing ? undefined : 'poster element',
              onFocus: (e) => {
                // Keyboard focus selects the element (a mouse click already selected it on pointer down).
                if (e.target !== e.currentTarget || isEditing || !e.currentTarget.matches(':focus-visible')) return;
                if (!selectedIds.includes(el.id) || selectedIds.length > 1) onSelect(el.id, false, true);
              },
              onKeyDown: (e) => {
                if (e.target !== e.currentTarget || isEditing) return;
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'F2') {
                  e.preventDefault();
                  e.stopPropagation();
                  if (isText) onEdit(el.id);
                  else if (el.type === 'image' || el.type === 'chart') onActivate(el);
                } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                  e.preventDefault();
                  e.stopPropagation();
                  const r = e.currentTarget.getBoundingClientRect();
                  onContextMenu(el, r.left + Math.min(r.width / 2, 40), r.top + Math.min(r.height / 2, 40));
                }
              },
              onPointerDown: isEditing ? (e) => e.stopPropagation() : (e) => startDrag(e, el),
              onDragStart: isEditing ? undefined : noNativeDrag,
              onPointerEnter: (e) => e.pointerType === 'mouse' && setHoverId(el.id),
              onPointerLeave: () => {
                setHoverId((h) => (h === el.id ? null : h));
                setLastHover(el.id);
              },
              onContextMenu: (e) => {
                if (isEditing) return; // keep the browser's spelling / copy menu while typing
                e.preventDefault();
                e.stopPropagation();
                if (!selectedIds.includes(el.id)) onSelect(el.id, false);
                onContextMenu(el, e.clientX, e.clientY);
              },
              onPointerUp: (e) => {
                if (isEditing || e.pointerType !== 'touch') return;
                const prev = lastTap.current;
                const t = e.timeStamp;
                if (prev && prev.id === el.id && t - prev.t < 400 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 24) {
                  lastTap.current = null;
                  tapActivatedAt.current = t;
                  open(el, isText);
                } else lastTap.current = { id: el.id, t, x: e.clientX, y: e.clientY };
              },
              onDoubleClick: (e) => {
                e.stopPropagation();
                if (e.timeStamp - tapActivatedAt.current < 600) return;
                open(el, isText);
              },
            }}
          />
        );
      }}
    >
      {selected && !editingId && (
        <div
          className="ui-only sel-box"
          onDragStart={noNativeDrag}
          style={{
            left: selected.x * MM_TO_PX,
            top: selected.y * MM_TO_PX,
            width: selected.w * MM_TO_PX,
            height: selected.h * MM_TO_PX,
            borderWidth: 2 / zoom,
            transform: selected.rotation ? `rotate(${selected.rotation}deg)` : undefined,
          }}
        >
          {!selected.locked && selected.shape !== 'line' && (
            <>
              {/* Above the box, or below it when the box touches the top of the poster (which clips). */}
              <div className="rotate-stem" style={{ height: 22 / zoom, width: 1.5 / zoom, top: rotBelow ? '100%' : -22 / zoom }} />
              <div
                className="rotate-handle"
                title="Drag to rotate (hold Shift for 15° steps)"
                aria-hidden
                style={{
                  width: hs * 1.4,
                  height: hs * 1.4,
                  top: rotBelow ? `calc(100% + ${22 / zoom - hs * 0.7}px)` : -22 / zoom - hs * 0.7,
                  marginLeft: -hs * 0.7,
                  borderWidth: 1.5 / zoom,
                }}
                onPointerDown={(e) => startRotate(e, selected)}
              />
            </>
          )}
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
          style={{ left: o.x * MM_TO_PX, top: o.y * MM_TO_PX, width: o.w * MM_TO_PX, height: o.h * MM_TO_PX, borderWidth: 2 / zoom, transform: o.rotation ? `rotate(${o.rotation}deg)` : undefined }}
        />
      ))}
      {groupBox && !editingId && (
        <div
          className="ui-only sel-box group-box"
          onDragStart={noNativeDrag}
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
      {angle && createPortal(<div className="angle-tip" style={{ left: angle.x + 16, top: angle.y + 16 }}>{angle.deg}°</div>, document.body)}
      {hoverBox && (
        <div
          className="ui-only hover-box"
          data-testid="hover-box"
          style={{
            left: hoverBox.x * MM_TO_PX,
            top: hoverBox.y * MM_TO_PX,
            width: hoverBox.w * MM_TO_PX,
            height: hoverBox.h * MM_TO_PX,
            borderWidth: 1.5 / zoom,
            transform: hoverBox.rotation ? `rotate(${hoverBox.rotation}deg)` : undefined,
          }}
        />
      )}
      {showSlots &&
        sectionSlots(poster)
          .filter((s) => s.near.some((id) => id === hoverId || id === lastHover || selectedIds.includes(id)))
          .map((s) => (
          <button
            key={s.headingId}
            type="button"
            className="ui-only add-section"
            data-testid="add-section"
            title="Add a section here (a heading, text and a figure)"
            aria-label="Add a section here"
            style={{ left: (s.x + s.w / 2) * MM_TO_PX, top: s.y * MM_TO_PX, width: 26 / zoom, height: 26 / zoom, fontSize: 18 / zoom, borderWidth: 1.5 / zoom }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onAddSection!(s.headingId);
            }}
          >
            +
          </button>
        ))}
      {guides.map((g, i) => (
        <div
          key={i}
          className={'ui-only guide' + (g.label ? ' centre' : '')}
          data-testid={g.label ? 'centre-guide' : undefined}
          style={
            g.axis === 'x'
              ? { left: g.at * MM_TO_PX, top: 0, bottom: 0, width: 1 / zoom }
              : { top: g.at * MM_TO_PX, left: 0, right: 0, height: 1 / zoom }
          }
        >
          {g.label && (
            <span className="guide-label" style={{ fontSize: 11 / zoom, padding: `${1 / zoom}px ${5 / zoom}px`, borderRadius: 3 / zoom, top: g.axis === 'x' ? 8 / zoom : undefined, left: g.axis === 'y' ? 8 / zoom : undefined }}>
              {g.label}
            </span>
          )}
        </div>
      ))}
      {gaps.map((m, i) => {
        const len = (m.to - m.from) * MM_TO_PX;
        const pos = m.axis === 'x' ? { left: m.from * MM_TO_PX, top: m.at * MM_TO_PX, width: len, height: 0 } : { top: m.from * MM_TO_PX, left: m.at * MM_TO_PX, height: len, width: 0 };
        return (
          <div key={'gap' + i} className={'ui-only gap-mark gap-' + m.axis + (m.match ? ' match' : '')} data-testid="gap-mark" style={{ ...pos, borderWidth: (m.match ? 1.5 : 1) / zoom }}>
            <span className="gap-label" style={{ fontSize: 11 / zoom, padding: `${1 / zoom}px ${4 / zoom}px`, borderRadius: 3 / zoom }}>
              {gapLabel(m.to - m.from)}
            </span>
          </div>
        );
      })}
    </Surface>
  );
});

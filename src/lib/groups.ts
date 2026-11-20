// Grouping: elements that share a `groupId` are selected, moved, resized,
// duplicated and deleted together. Groups are flat (no groups inside groups);
// grouping elements that already belong to groups merges them into one.
import type { PosterElement } from '../types';
import { boundsOf, type Bounds } from './arrange';

const newGroupId = () => 'g' + Math.random().toString(36).slice(2, 10);

/** Adds every other member of any group touched by `ids`, keeping the original order first. */
export function expandToGroups(ids: string[], elements: PosterElement[]): string[] {
  const groups = new Set(elements.filter((e) => ids.includes(e.id) && e.groupId).map((e) => e.groupId));
  if (!groups.size) return ids;
  const extra = elements.filter((e) => e.groupId && groups.has(e.groupId) && !ids.includes(e.id)).map((e) => e.id);
  return [...ids, ...extra];
}

/** The ids of every member of an element's group (just the element when it has none). */
export function groupMembers(id: string, elements: PosterElement[]): string[] {
  return expandToGroups([id], elements);
}

/** The group id when `ids` is exactly one whole group, otherwise null. */
export function wholeGroup(ids: string[], elements: PosterElement[]): string | null {
  if (ids.length < 2) return null;
  const sel = elements.filter((e) => ids.includes(e.id));
  const g = sel[0]?.groupId;
  if (!g || sel.length !== ids.length || sel.some((e) => e.groupId !== g)) return null;
  return elements.filter((e) => e.groupId === g).length === ids.length ? g : null;
}

/** True when grouping would do something: two or more elements that aren't already exactly one group. */
export function canGroup(ids: string[], elements: PosterElement[]) {
  return ids.length > 1 && !wholeGroup(ids, elements);
}

/** True when any of the elements belongs to a group. */
export function canUngroup(ids: string[], elements: PosterElement[]) {
  return elements.some((e) => ids.includes(e.id) && !!e.groupId);
}

/**
 * Puts the elements into one new group (mutates them; call inside an `update` draft).
 * Other members of groups they belonged to come along too, so nothing is left half-grouped.
 * Returns the ids now in the group.
 */
export function group(elements: PosterElement[], ids: string[]): string[] {
  const all = expandToGroups(ids, elements);
  if (all.length < 2) return all;
  const g = newGroupId();
  for (const e of elements) if (all.includes(e.id)) e.groupId = g;
  return all;
}

/** Removes every group touched by `ids` (mutates). Returns the ids that were ungrouped. */
export function ungroup(elements: PosterElement[], ids: string[]): string[] {
  const all = expandToGroups(ids, elements);
  for (const e of elements) if (all.includes(e.id)) delete e.groupId;
  return all;
}

/** Gives copied elements fresh group ids so copies don't join the originals' groups. */
export function regroupCopies(copies: PosterElement[]) {
  const map = new Map<string, string>();
  for (const c of copies) {
    if (!c.groupId) continue;
    if (!map.has(c.groupId)) map.set(c.groupId, newGroupId());
    c.groupId = map.get(c.groupId);
  }
  // a lone copy of one group member is no longer a group
  const counts = new Map<string, number>();
  for (const c of copies) if (c.groupId) counts.set(c.groupId, (counts.get(c.groupId) ?? 0) + 1);
  for (const c of copies) if (c.groupId && counts.get(c.groupId)! < 2) delete c.groupId;
  return copies;
}

/** After deleting some members, a group of one is dissolved (mutates). */
export function dropLonelyGroups(elements: PosterElement[]) {
  const counts = new Map<string, number>();
  for (const e of elements) if (e.groupId) counts.set(e.groupId, (counts.get(e.groupId) ?? 0) + 1);
  for (const e of elements) if (e.groupId && counts.get(e.groupId)! < 2) delete e.groupId;
}

/**
 * Scales a set of elements from their shared bounds to new bounds, keeping
 * each one's position and size relative to the group. Returns the patches.
 */
export function scaleInto(els: Pick<PosterElement, 'id' | 'x' | 'y' | 'w' | 'h'>[], to: Bounds) {
  const from = boundsOf(els);
  const sx = from.w ? to.w / from.w : 1;
  const sy = from.h ? to.h / from.h : 1;
  return els.map((e) => ({
    id: e.id,
    patch: { x: to.x + (e.x - from.x) * sx, y: to.y + (e.y - from.y) * sy, w: e.w * sx, h: e.h * sy },
  }));
}

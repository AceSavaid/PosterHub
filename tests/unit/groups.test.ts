import { describe, expect, it } from 'vitest';
import type { PosterElement } from '../../src/types';
import { canGroup, canUngroup, dropLonelyGroups, expandToGroups, group, groupMembers, regroupCopies, scaleInto, ungroup, wholeGroup } from '../../src/lib/groups';

const box = (id: string, x: number, y: number, w = 10, h = 10, groupId?: string): PosterElement => ({ id, type: 'shape', x, y, w, h, groupId });

describe('grouping', () => {
  it('groups elements under one shared id and selects them together', () => {
    const els = [box('a', 0, 0), box('b', 20, 0), box('c', 40, 0)];
    const ids = group(els, ['a', 'b']);
    expect(ids).toEqual(['a', 'b']);
    expect(els[0].groupId).toBeTruthy();
    expect(els[0].groupId).toBe(els[1].groupId);
    expect(els[2].groupId).toBeUndefined();
    expect(groupMembers('a', els)).toEqual(['a', 'b']);
    expect(groupMembers('c', els)).toEqual(['c']);
    expect(wholeGroup(['b', 'a'], els)).toBe(els[0].groupId);
    expect(wholeGroup(['a'], els)).toBeNull();
    expect(wholeGroup(['a', 'b', 'c'], els)).toBeNull();
  });

  it('merges existing groups when grouping again, pulling in all their members', () => {
    const els = [box('a', 0, 0, 10, 10, 'g1'), box('b', 20, 0, 10, 10, 'g1'), box('c', 40, 0)];
    const ids = group(els, ['a', 'c']);
    expect(ids.sort()).toEqual(['a', 'b', 'c']);
    expect(new Set(els.map((e) => e.groupId)).size).toBe(1);
    expect(els[0].groupId).not.toBe('g1');
  });

  it('expands a partial selection to whole groups', () => {
    const els = [box('a', 0, 0, 10, 10, 'g1'), box('b', 20, 0, 10, 10, 'g1'), box('c', 40, 0)];
    expect(expandToGroups(['a', 'c'], els)).toEqual(['a', 'c', 'b']);
    expect(expandToGroups(['c'], els)).toEqual(['c']);
  });

  it('knows when group and ungroup apply', () => {
    const els = [box('a', 0, 0, 10, 10, 'g1'), box('b', 20, 0, 10, 10, 'g1'), box('c', 40, 0)];
    expect(canGroup(['a', 'b'], els)).toBe(false); // already one group
    expect(canGroup(['a', 'b', 'c'], els)).toBe(true);
    expect(canGroup(['c'], els)).toBe(false);
    expect(canUngroup(['a'], els)).toBe(true);
    expect(canUngroup(['c'], els)).toBe(false);
  });

  it('ungroups every member', () => {
    const els = [box('a', 0, 0, 10, 10, 'g1'), box('b', 20, 0, 10, 10, 'g1')];
    expect(ungroup(els, ['a']).sort()).toEqual(['a', 'b']);
    expect(els.every((e) => e.groupId === undefined)).toBe(true);
  });

  it('gives copies their own group and drops a group of one', () => {
    const copies = regroupCopies([box('x', 0, 0, 10, 10, 'g1'), box('y', 0, 0, 10, 10, 'g1'), box('z', 0, 0, 10, 10, 'g2')]);
    expect(copies[0].groupId).toBeTruthy();
    expect(copies[0].groupId).not.toBe('g1');
    expect(copies[0].groupId).toBe(copies[1].groupId);
    expect(copies[2].groupId).toBeUndefined(); // lone copy of a member is not a group
  });

  it('dissolves groups left with one member after a delete', () => {
    const els = [box('a', 0, 0, 10, 10, 'g1'), box('c', 0, 0, 10, 10, 'g2'), box('d', 0, 0, 10, 10, 'g2')];
    dropLonelyGroups(els);
    expect(els[0].groupId).toBeUndefined();
    expect(els[1].groupId).toBe('g2');
  });

  it('scales members into new bounds, keeping their layout', () => {
    // a 100 x 50 group: picture on top, caption below
    const els = [box('pic', 10, 10, 100, 40), box('cap', 10, 50, 100, 10)];
    const moves = scaleInto(els, { x: 0, y: 0, w: 200, h: 100 });
    expect(moves).toEqual([
      { id: 'pic', patch: { x: 0, y: 0, w: 200, h: 80 } },
      { id: 'cap', patch: { x: 0, y: 80, w: 200, h: 20 } },
    ]);
  });
});

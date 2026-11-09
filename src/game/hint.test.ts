import { describe, expect, it } from 'vitest';
import type { Level } from '../core/types';
import { pickHint } from './hint';

const level: Level = {
  width: 8, height: 8,
  pieces: [
    { id: 1, cells: [{ x: 0, y: 0 }], dir: 'up' }, // free, frees nobody
    { id: 2, cells: [{ x: 5, y: 3 }], dir: 'up' }, // free, and in the way of 3 and 4
    { id: 3, cells: [{ x: 5, y: 5 }], dir: 'up' },
    { id: 4, cells: [{ x: 2, y: 3 }], dir: 'right' },
  ],
};
const all = new Set([1, 2, 3, 4]);

describe('pickHint', () => {
  it('points at the free animal that frees the most others', () => {
    expect(pickHint(level, all)).toBe(2);
  });
  it('a bomb comes first: the tap that clears the way to it', () => {
    expect(pickHint(level, all, { 3: 5 })).toBe(2);
    expect(pickHint(level, new Set([1, 3, 4]), { 3: 5 })).toBe(3);
  });
  it('only ever points at an animal that can move, and at nothing when none can', () => {
    for (const id of [pickHint(level, all), pickHint(level, new Set([3, 4]))]) expect(id === null || [1, 2, 3, 4].includes(id)).toBe(true);
    const stuck: Level = { width: 4, height: 1, pieces: [{ id: 1, cells: [{ x: 1, y: 0 }], dir: 'right' }, { id: 2, cells: [{ x: 2, y: 0 }], dir: 'left' }] };
    expect(pickHint(stuck, new Set([1, 2]))).toBeNull();
  });
});

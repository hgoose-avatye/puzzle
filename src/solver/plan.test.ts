import { describe, expect, it } from 'vitest';
import type { Level } from '../core/types';
import { tapsToExit } from './plan';

describe('tapsToExit', () => {
  it('counts the blockers that must leave first, plus the piece itself', () => {
    const level: Level = {
      width: 5, height: 5,
      pieces: [
        { id: 1, cells: [{ x: 1, y: 2 }, { x: 0, y: 2 }] },
        { id: 2, cells: [{ x: 4, y: 2 }, { x: 3, y: 2 }] },
      ],
    };
    expect(tapsToExit(level, 2)).toBe(1);
    expect(tapsToExit(level, 1)).toBe(2);
  });
  it('plans through a key carrier and a sleeper wake-up', () => {
    const level: Level = {
      width: 5, height: 5,
      pieces: [
        { id: 1, cells: [{ x: 1, y: 2 }, { x: 0, y: 2 }], lock: 1 },
        { id: 2, cells: [{ x: 4, y: 0 }, { x: 3, y: 0 }], key: 1 },
        { id: 3, cells: [{ x: 1, y: 4 }, { x: 0, y: 4 }], sleeping: true },
        { id: 4, cells: [{ x: 1, y: 3 }, { x: 0, y: 3 }] },
      ],
    };
    expect(tapsToExit(level, 1)).toBe(2);
    expect(tapsToExit(level, 3)).toBe(2);
  });
});

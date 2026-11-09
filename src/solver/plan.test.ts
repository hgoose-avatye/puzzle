import { describe, expect, it } from 'vitest';
import type { Level } from '../core/types';
import { rescueSchedule, tapsToExit, winnable } from './plan';

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

describe('rescueSchedule and winnable', () => {
  // 1 and 3 are bombs. Freeing 3 takes 2 taps (2 is in its way); 1 is free right away.
  const level: Level = {
    width: 6, height: 6,
    pieces: [
      { id: 1, cells: [{ x: 0, y: 0 }], dir: 'up' },
      { id: 2, cells: [{ x: 3, y: 2 }], dir: 'up' },
      { id: 3, cells: [{ x: 3, y: 4 }], dir: 'up' },
    ],
  };

  it('counts taps across bombs: the second bomb leaves after the taps spent on the first', () => {
    const s = rescueSchedule(level, [3, 1])!;
    expect(s.get(1)).toBe(1);
    expect(s.get(3)).toBe(3);
  });

  it('fuses from isolated counts can make a level unwinnable; the shared schedule cannot', () => {
    const isolated = { ...level, pieces: level.pieces.map((p) => (p.id === 1 ? { ...p, fuse: 1 } : p.id === 3 ? { ...p, fuse: 2 } : p)) };
    expect(winnable(isolated)).toBe(false);
    const s = rescueSchedule(level, [1, 3])!;
    const shared = { ...level, pieces: level.pieces.map((p) => (s.has(p.id) ? { ...p, fuse: s.get(p.id)! } : p)) };
    expect(winnable(shared)).toBe(true);
  });
});

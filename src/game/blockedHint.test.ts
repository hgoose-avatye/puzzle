import { describe, expect, it } from 'vitest';
import { decideHint, extendStreak, HINT_LIMIT, type Streak } from './blockedHint';

const at = (n: number, said = false): Streak => ({ id: 1, n, said });

describe('blocked tap words', () => {
  it('plain blocked: silent on the first tap, said on the second, once per streak', () => {
    expect(decideHint('plain', at(1), true, 0).say).toBe(false);
    expect(decideHint('plain', at(2), true, 0).say).toBe(true);
    expect(decideHint('plain', at(3, true), true, 0).say).toBe(false);
  });
  it('a special cause before its tutorial is learnt: every tap, never counted', () => {
    for (const k of ['key', 'sleep', 'crate'] as const) {
      expect(decideHint(k, at(1), false, 99)).toEqual({ say: true, count: false });
      expect(decideHint(k, at(4, true), false, 99)).toEqual({ say: true, count: false });
    }
  });
  it('after it is learnt: the first HINT_LIMIT shown lines count, then only a repeat on the same animal', () => {
    expect(decideHint('key', at(1), true, HINT_LIMIT - 1)).toEqual({ say: true, count: true });
    expect(decideHint('key', at(1), true, HINT_LIMIT)).toEqual({ say: false, count: false });
    expect(decideHint('key', at(2), true, HINT_LIMIT)).toEqual({ say: true, count: false });
    expect(decideHint('key', at(3, true), true, HINT_LIMIT)).toEqual({ say: false, count: false });
  });
  it('a line already shown this streak is not shown again, and not counted again', () => {
    expect(decideHint('sleep', at(2, true), true, 0)).toEqual({ say: false, count: false });
  });
  it('the streak grows on the same animal and restarts on another', () => {
    expect(extendStreak(null, 1)).toEqual({ id: 1, n: 1, said: false });
    expect(extendStreak({ id: 1, n: 1, said: true }, 1)).toEqual({ id: 1, n: 2, said: true });
    expect(extendStreak({ id: 1, n: 2, said: true }, 2)).toEqual({ id: 2, n: 1, said: false });
  });
});

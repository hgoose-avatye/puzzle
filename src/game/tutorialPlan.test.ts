import { describe, expect, it } from 'vitest';
import { canExit } from '../core/rules';
import type { Level } from '../core/types';
import { buildGameLevel } from '../curve/curve';
import { arrowTargets, resultSubjects, startTargets, startTutorial } from './tutorialPlan';

const levelOf = (n: number): Level => buildGameLevel(n)!.level;
const everyone = (l: Level): Set<number> => new Set(l.pieces.map((p) => p.id));
/** Every rule learnt except these. */
const allBut = (...left: string[]): string[] => ['basic', 'arrow', 'hearts', 'crate', 'key', 'sleep', 'bomb'].filter((id) => !left.includes(id));

describe('tutorialPlan', () => {
  it('opens level 1 with the first rule on an animal that can leave right away', () => {
    const l = levelOf(1);
    expect(startTutorial(l, [], 1)).toBe('basic');
    const targets = startTargets(l, everyone(l), 'basic');
    expect(targets.length).toBeGreaterThan(0);
    for (const id of targets) expect(canExit(l, id, everyone(l))).toBe(true);
  });

  it('teaches the first rule later only to a save that has learnt nothing', () => {
    expect(startTutorial(levelOf(10), [], 10)).toBe('basic');
    expect(startTutorial(levelOf(10), ['hearts'], 10)).toBeNull();
    expect(startTutorial(levelOf(2), ['basic'], 2)).toBeNull();
  });

  it('points the key tutorial at the free key carrier of level 61', () => {
    const l = levelOf(61);
    expect(startTutorial(l, allBut('key'), 61)).toBe('key');
    const [target] = startTargets(l, everyone(l), 'key');
    expect(l.pieces.find((p) => p.id === target)?.key).toBeDefined();
    expect(canExit(l, target, everyone(l))).toBe(true);
  });

  it('points the sleep tutorial at a free neighbour of the sleeper on level 91', () => {
    const l = levelOf(91);
    expect(startTutorial(l, allBut('sleep'), 91)).toBe('sleep');
    const targets = startTargets(l, everyone(l), 'sleep');
    expect(targets.length).toBeGreaterThan(0);
    expect(l.pieces.find((p) => p.id === targets[0])?.sleeping).toBeFalsy();
    expect(canExit(l, targets[0], everyone(l))).toBe(true);
  });

  it('points the bomb tutorial at what stands in front of the bomb on level 121, not at the bomb', () => {
    const l = levelOf(121);
    expect(startTutorial(l, allBut('bomb'), 121)).toBe('bomb');
    const [target] = startTargets(l, everyone(l), 'bomb');
    expect(l.pieces.find((p) => p.id === target)?.fuse).toBeUndefined();
    expect(canExit(l, target, everyone(l))).toBe(true);
  });

  it('has no arrow moment on level 6 at the start, and one once the way of an arrow animal is clear', () => {
    const l = levelOf(6);
    const alive = everyone(l);
    expect(arrowTargets(l, alive)).toEqual([]);
    // take free animals out one by one until an animal whose way bends on an arrow can leave
    for (let k = 0; k < l.pieces.length && arrowTargets(l, alive).length === 0; k++) {
      const next = l.pieces.find((p) => alive.has(p.id) && canExit(l, p.id, alive))!;
      alive.delete(next.id);
    }
    const targets = arrowTargets(l, alive);
    expect(targets.length).toBeGreaterThan(0);
    for (const id of targets) expect(canExit(l, id, alive)).toBe(true);
  });

  it('lights up after the tap the animal it changed: the lock opened, the sleeper woken, the bomb cleared', () => {
    const cases: Array<[number, 'key' | 'sleep' | 'bomb', (p: { lock?: number; sleeping?: boolean; fuse?: number }) => boolean]> = [
      [61, 'key', (p) => p.lock !== undefined], [91, 'sleep', (p) => !!p.sleeping], [121, 'bomb', (p) => p.fuse !== undefined],
    ];
    for (const [n, id, is] of cases) {
      const l = levelOf(n);
      const [target] = startTargets(l, everyone(l), id);
      const changed = resultSubjects(l, id, target);
      expect(changed.length).toBeGreaterThan(0);
      for (const c of changed) expect(is(l.pieces.find((p) => p.id === c)!)).toBe(true);
    }
  });

  it('offers nothing for a rule the level does not have', () => {
    const l = levelOf(1);
    expect(startTargets(l, everyone(l), 'key')).toEqual([]);
    expect(arrowTargets(l, everyone(l))).toEqual([]);
  });
});

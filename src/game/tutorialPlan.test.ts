import { describe, expect, it } from 'vitest';
import { gradeKnot } from '../core/bump';
import { createGame, tap } from '../core/game';
import { canExit } from '../core/rules';
import type { Level } from '../core/types';
import { buildGameLevel, knotLevel } from '../curve/curve';
import { arrowTargets, bumpTargets, resultSubjects, startTargets, startTutorial } from './tutorialPlan';

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
    expect(startTutorial(levelOf(3), ['basic'], 3)).toBeNull();
  });

  it('teaches the blocked animal on level 2 only: it points at an animal held by others that can all leave', () => {
    const l = levelOf(2);
    expect(startTutorial(l, ['basic'], 2)).toBe('blocked');
    expect(startTutorial(l, ['basic', 'blocked'], 2)).toBeNull();
    expect(startTutorial(levelOf(7), ['basic', 'arrow'], 7)).toBeNull();
    const targets = startTargets(l, everyone(l), 'blocked');
    expect(targets.length).toBeGreaterThan(0);
    for (const id of targets) {
      expect(canExit(l, id, everyone(l))).toBe(false);
      const inWay = resultSubjects(l, 'blocked', id);
      expect(inWay.length).toBeGreaterThan(0);
      for (const b of inWay) expect(canExit(l, b, everyone(l))).toBe(true);
    }
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

  it('has the arrow moment on level 6 right at the start, on an animal that can leave', () => {
    const l = levelOf(6);
    const alive = everyone(l);
    expect(startTutorial(l, ['basic', 'blocked'], 6)).toBeNull();
    const targets = arrowTargets(l, alive);
    expect(targets.length).toBeGreaterThan(0);
    for (const id of targets) expect(canExit(l, id, alive)).toBe(true);
  });

  it('points the bump tutorial at the push of the winning line once nothing can leave (the first knot level)', () => {
    let n = 1;
    while (!knotLevel(n)) n++;
    const l = levelOf(n);
    let s = createGame(l);
    expect(bumpTargets(s.level, s.alive)).toEqual([]);
    for (const m of gradeKnot(l).line ?? []) {
      if (m.kind === 'push') break;
      s = tap(s, m.id).state;
    }
    expect(s.level.pieces.some((p) => s.alive.has(p.id) && canExit(s.level, p.id, s.alive))).toBe(false);
    expect(bumpTargets(s.level, s.alive)).toEqual([gradeKnot(l).line!.find((m) => m.kind === 'push')!.id]);
  });

  it('lights up after the tap the animal it changed: the sleeper woken, the bomb cleared (no level has locks)', () => {
    const cases: Array<[number, 'sleep' | 'bomb', (p: { sleeping?: boolean; fuse?: number }) => boolean]> = [
      [91, 'sleep', (p) => !!p.sleeping], [121, 'bomb', (p) => p.fuse !== undefined],
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

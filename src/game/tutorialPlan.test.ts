import { describe, expect, it } from 'vitest';
import { gradeKnot } from '../core/bump';
import { createGame, tap } from '../core/game';
import { canExit } from '../core/rules';
import type { Level } from '../core/types';
import { buildGameLevel, knotLevel } from '../curve/curve';
import { arrowTargets, bombToWatch, bumpTargets, crateLessonAt, lessonsBefore, resultSubjects, startTargets, startTutorial } from './tutorialPlan';

const levelOf = (n: number): Level => buildGameLevel(n)!.level;
const everyone = (l: Level): Set<number> => new Set(l.pieces.map((p) => p.id));
/** Every rule learnt except these. */
const allBut = (...left: string[]): string[] => ['basic', 'blocked', 'arrow', 'bump', 'crate', 'crate2', 'key', 'sleep', 'bomb'].filter((id) => !left.includes(id));

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

describe('crate lessons (2026-11-07, crate2 reworked 2026-11-08)', () => {
  it('level 11 opens on crate: a free neighbour of its one-crack crate, and the held animal is the result', () => {
    const l = buildGameLevel(11)!.level;
    expect(startTutorial(l, [], 11)).toBe('basic'); // a newcomer learns the tap first
    expect(startTutorial(l, ['basic', 'blocked'], 11)).toBe('crate');
    const [target] = startTargets(l, everyone(l), 'crate');
    expect(target).toBe(2);
    expect(resultSubjects(l, 'crate', target)).toEqual([1]);
    expect(crateLessonAt(l, everyone(l))).toBeNull(); // a one-crack crate is not the two-crack lesson
  });
  it('level 12 (hand-made) opens on crate2 with no animal to point at: the lesson is the crate (3,4), two cracks', () => {
    const l = buildGameLevel(12)!.level;
    expect(startTutorial(l, ['basic', 'blocked', 'crate'], 12)).toBe('crate2');
    expect(startTargets(l, everyone(l), 'crate2')).toEqual([]);
    expect(crateLessonAt(l, everyone(l))).toEqual({ x: 3, y: 4, hits: 2 });
    // its board: the two neighbours (1, 2) and the far animal (3) are free from the start, 4 is held by the crate alone
    expect(l.pieces).toHaveLength(4);
    const free = l.pieces.filter((p) => startTargets(l, everyone(l), 'basic').includes(p.id)).map((p) => p.id).sort();
    expect(free).toEqual([1, 2, 3]);
    // once a neighbour has left the crate is cracked and no longer the whole-crate lesson
    const after1 = new Set([2, 3, 4]);
    expect(crateLessonAt(l, after1)).toBeNull();
  });
  it('level 13 (hand-made) opens on cratePush: the one push, which stops animal 1 beside the crate', () => {
    const l = buildGameLevel(13)!.level;
    expect(startTutorial(l, ['basic', 'blocked', 'arrow', 'bump', 'crate', 'crate2'], 13)).toBe('cratePush');
    // a save that missed the crate lessons still gets this one here, before them
    expect(startTutorial(l, ['basic', 'blocked'], 13)).toBe('cratePush');
    expect(startTargets(l, everyone(l), 'cratePush')).toEqual([1]);
    // once learnt, level 13 has no start tutorial left, and no other level asks for it
    expect(startTutorial(l, ['basic', 'blocked', 'arrow', 'bump', 'crate', 'crate2', 'cratePush'], 13)).toBeNull();
    expect(startTutorial(buildGameLevel(14)!.level, ['basic', 'blocked', 'arrow', 'bump', 'crate', 'crate2'], 14)).toBeNull();
  });
  it('lessonsBefore: what a player from level 1 has learnt on reaching a level (for dev entry points)', () => {
    const at = (k: number) => buildGameLevel(k)?.level ?? null;
    expect(lessonsBefore(1, at)).toEqual([]);
    expect(lessonsBefore(11, at)).toEqual(['basic', 'blocked', 'arrow', 'bump']);
    expect(lessonsBefore(12, at)).toEqual(['basic', 'blocked', 'arrow', 'bump', 'crate']);
    expect(lessonsBefore(14, at)).toEqual(['basic', 'blocked', 'arrow', 'bump', 'crate', 'crate2', 'cratePush']);
    // then each of those levels opens on its own lesson
    expect(startTutorial(at(11)!, lessonsBefore(11, at), 11)).toBe('crate');
    expect(startTutorial(at(12)!, lessonsBefore(12, at), 12)).toBe('crate2');
    expect(startTutorial(at(13)!, lessonsBefore(13, at), 13)).toBe('cratePush');
  });
  it('a level without a one-crack crate never asks for the crate lesson, nor a level without a two-crack crate for crate2', () => {
    expect(startTutorial(buildGameLevel(12)!.level, ['basic', 'blocked'], 12)).toBe('crate2');
    expect(startTutorial(buildGameLevel(9)!.level, ['basic', 'blocked'], 9)).toBeNull();
  });
});

describe('dynamite lesson targets (2026-11-08)', () => {
  it('points at the first free animal in the dynamite\u2019s chain where there is one (121), and at nothing on 40, where the dynamite sits inside the knot', () => {
    const l121 = buildGameLevel(121)!.level;
    const [t] = startTargets(l121, everyone(l121), 'bomb');
    expect(t).toBe(4);
    const l40 = buildGameLevel(40)!.level;
    expect(startTargets(l40, everyone(l40), 'bomb')).toEqual([]);
    expect(bombToWatch(l40, everyone(l40))).toBe(6);
  });
});

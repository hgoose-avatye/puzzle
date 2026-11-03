import { describe, expect, it } from 'vitest';
import type { Level } from '../core/types';
import {
  badgePairs, CAP, candidatesFor, choose, chooseFinale, finaleAim, finaleBase, LINE_END, LINE_START, lineAt, meaningfulShare, ordinaryLevels,
  runsFor, toughTarget, type Candidate,
} from './seedSelect';

const ordinary = ordinaryLevels(180);

describe('the shared target line', () => {
  it('runs from the first ordinary level to the last without jumping back at chapter boundaries', () => {
    expect(ordinary).toHaveLength(120);
    expect(lineAt(ordinary[0], ordinary)).toBe(LINE_START);
    expect(lineAt(ordinary[ordinary.length - 1], ordinary)).toBe(LINE_END);
    for (let i = 1; i < ordinary.length; i++) expect(lineAt(ordinary[i], ordinary)).toBeGreaterThan(lineAt(ordinary[i - 1], ordinary));
    // chapter 1's last ordinary level (29) and chapter 2's first (36) are neighbours on the line
    const step = (LINE_END - LINE_START) / 119;
    expect(lineAt(36, ordinary) - lineAt(29, ordinary)).toBeCloseTo(step, 6);
  });
  it('puts a tough level between the ordinary levels around it, PEAK above the line', () => {
    expect(lineAt(10, ordinary)).toBeGreaterThan(lineAt(9, ordinary));
    expect(lineAt(10, ordinary)).toBeLessThan(lineAt(11, ordinary));
    expect(toughTarget(10, ordinary)).toBeCloseTo(lineAt(10, ordinary) + 15, 6);
  });
  it('aims a finale FINALE above its own chapter’s last ordinary level, not above the next chapter', () => {
    expect(finaleBase(30, ordinary)).toBeCloseTo(lineAt(29, ordinary) + 22, 6);
    expect(finaleBase(180, ordinary)).toBeCloseTo(LINE_END + 22, 6);
  });
});

describe('the finale guard', () => {
  it('raises the aim to the hardest picked tough level + 5 when that is higher', () => {
    const base = finaleBase(60, ordinary);
    expect(base).toBeCloseTo(lineAt(59, ordinary) + 22, 6);
    expect(finaleAim(60, ordinary, [30, 35]).target).toBeCloseTo(base, 6);
    expect(finaleAim(60, ordinary, [30, 70]).target).toBe(75);
  });
  it('never aims above the cap', () => {
    const aim = finaleAim(60, ordinary, [78]);
    expect(aim.target).toBe(CAP);
    expect(aim.wanted).toBe(83);
    expect(aim.capExceeded).toBe(true);
  });
});

const cand = (seed: number, score: number, extra: Partial<Candidate> = {}): Candidate => ({ seed, score, pairs: 0, blockers: 1, meaningful: 1, ...extra });
const pool = (...scores: number[]): Candidate[] => scores.map((s, i) => cand(i + 1, s));

describe('choosing a finale: the guard is a floor', () => {
  it('picks only among candidates at or above the guard, nearest the aim (level 30 of 2026-11-03)', () => {
    const aim = finaleAim(30, ordinary, [38]); // guard 43 is above the base aim, so it becomes the aim
    const c = chooseFinale(pool(33.3, 38.7, 60.7, 61.3, 74.7, 75.3), aim, [38]);
    expect(c.pick.score).toBe(60.7); // 38.7 is nearer the aim but under the guard
    expect(c.issues).toEqual([]);
  });
  it('applies the usual preferences among guard-passing candidates only', () => {
    const aim = finaleAim(60, ordinary, [38]);
    const c = chooseFinale([cand(1, 42, { blockers: 3 }), cand(2, 44, { blockers: 2 }), cand(3, 47, { blockers: 1 })], aim, [38]);
    expect(c.pick.seed).toBe(2); // seed 1 blocks most but is under the guard of 43
  });
  it('with no candidate at the guard, takes the one nearest the aim and reports it', () => {
    const aim = finaleAim(60, ordinary, [50]);
    const c = chooseFinale(pool(30, 35, 52), aim, [50]);
    expect(c.pick.score).toBe(52);
    expect(c.issues).toEqual(['below-guard']);
    expect(chooseFinale(pool(30, 35), aim, [50]).issues).toEqual(['below-guard', 'not-above-tough']);
  });
  it('with guard-passing candidates all over the cap, takes the lowest of them and reports it', () => {
    const aim = finaleAim(60, ordinary, [78]);
    const c = chooseFinale(pool(40, 90, 85), aim, [78]);
    expect(c.pick.score).toBe(85);
    expect(c.issues).toEqual(['cap-exceeded']);
  });
  it('reports both when the pick is under the guard and over the cap', () => {
    const aim = finaleAim(60, ordinary, [80]);
    expect(chooseFinale(pool(82), aim, [80]).issues).toEqual(['below-guard', 'cap-exceeded']);
  });
});

describe('choosing a candidate', () => {
  it('ranks on-target candidates by mechanics that matter, then blocking, then touching badges', () => {
    const pool = [cand(1, 50, { meaningful: 0.5, blockers: 2 }), cand(2, 53, { meaningful: 1, blockers: 1 }), cand(3, 47, { meaningful: 1, blockers: 1.5, pairs: 2 })];
    expect(choose(pool, 50).pick.seed).toBe(3); // seeds 2 and 3 tie on mechanics; 3 blocks more, badges come after
    const tie = [cand(1, 50, { pairs: 2 }), cand(2, 53, { pairs: 0 })];
    expect(choose(tie, 50).pick.seed).toBe(2); // equal mechanics and blocking: fewer touching badges
    const same = [cand(1, 52), cand(2, 49)];
    expect(choose(same, 50).pick.seed).toBe(2); // all equal: the nearer score
  });
  it('applies the preferences only within 5 points of the aim', () => {
    const c = choose([cand(1, 50, { meaningful: 0, blockers: 0.5, pairs: 3 }), cand(2, 56, { meaningful: 1, blockers: 3, pairs: 0 })], 50);
    expect(c.pick.seed).toBe(1);
    expect(c.onTarget).toBe(1);
    expect(c.preferenceApplied).toBe(false);
  });
  it('keeps the nearest candidate when none is within 5 points, however good another one looks', () => {
    const c = choose([cand(1, 60, { meaningful: 0 }), cand(2, 30, { meaningful: 1, blockers: 3 })], 50);
    expect(c.pick.seed).toBe(1);
    expect(c.onTarget).toBe(0);
    expect(c.preferenceApplied).toBe(false);
  });
  it('records when the preferences moved the pick away from the nearest candidate', () => {
    const c = choose([cand(1, 50, { blockers: 1 }), cand(2, 54, { blockers: 2 })], 50);
    expect(c.pick.seed).toBe(2);
    expect(c.nearest.seed).toBe(1);
    expect(c.preferenceApplied).toBe(true);
  });
});

describe('locks and sleepers that matter', () => {
  const base = { width: 5, height: 5 };
  it('counts a locked or sleeping animal when nothing but the mechanic stands in its way', () => {
    const level: Level = { ...base, pieces: [
      { id: 1, cells: [{ x: 2, y: 2 }], dir: 'up', lock: 1 },
      { id: 2, cells: [{ x: 4, y: 4 }], dir: 'down', key: 1 },
      { id: 3, cells: [{ x: 0, y: 2 }], dir: 'left', sleeping: true },
      { id: 4, cells: [{ x: 1, y: 3 }], dir: 'up' },
    ] };
    expect(meaningfulShare(level)).toBe(1);
  });
  it('does not count one that another animal blocks anyway', () => {
    const level: Level = { ...base, pieces: [
      { id: 1, cells: [{ x: 2, y: 2 }], dir: 'up', lock: 1 },
      { id: 2, cells: [{ x: 2, y: 0 }], dir: 'left', key: 1 },
    ] };
    expect(meaningfulShare(level)).toBe(0);
  });
  it('treats a level without locks or sleepers as fully meaningful, so it is never ranked down', () => {
    expect(meaningfulShare({ ...base, pieces: [{ id: 1, cells: [{ x: 0, y: 0 }], dir: 'up', fuse: 3 }] })).toBe(1);
  });
});

describe('candidates and badges', () => {
  it('draws twenty candidates at 400 runs for every tough and finale level, ten at the base runs elsewhere', () => {
    for (let c = 0; c < 6; c++) {
      for (const l of [10, 20, 30]) {
        expect(candidatesFor(c * 30 + l)).toBe(20);
        expect(runsFor(c * 30 + l, 150)).toBe(400);
      }
    }
    for (const n of [1, 5, 6, 29, 155, 179]) {
      expect(candidatesFor(n)).toBe(10);
      expect(runsFor(n, 150)).toBe(150);
    }
  });
  it('counts touching badge heads, diagonals included', () => {
    const level: Level = {
      width: 4, height: 4,
      pieces: [
        { id: 1, cells: [{ x: 0, y: 0 }], dir: 'up', lock: 1 },
        { id: 2, cells: [{ x: 1, y: 1 }], dir: 'up', key: 1 },
        { id: 3, cells: [{ x: 3, y: 3 }], dir: 'up', sleeping: true },
        { id: 4, cells: [{ x: 1, y: 0 }], dir: 'up' },
      ],
    };
    expect(badgePairs(level)).toBe(1);
  });
});

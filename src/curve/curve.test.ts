import { describe, expect, it } from 'vitest';
import { boardSize, buildGameLevel, CHAPTER_SHAPES, CHAPTER_THEMES, generateLevelFor, heartsFor, levelSpec, stageFor } from './curve';
import { winnable } from '../solver/plan';

describe('levelSpec', () => {
  it('assigns roles on a 30-level chapter', () => {
    expect(levelSpec(1).role).toBe('intro');
    expect(levelSpec(5).role).toBe('rest');
    expect(levelSpec(10).role).toBe('tough');
    expect(levelSpec(15).role).toBe('rest');
    expect(levelSpec(20).role).toBe('tough');
    expect(levelSpec(30).role).toBe('finale');
  });
  it('wraps to the next chapter and rejects level numbers below 1', () => {
    expect(levelSpec(31).role).toBe(levelSpec(1).role);
    expect(() => levelSpec(0)).toThrow();
  });
  it('gives every level a board that can hold its pieces and a non-empty target', () => {
    for (let n = 1; n <= 30; n++) {
      const { params, target } = levelSpec(n);
      expect(params.pieceCount).toBeLessThan(params.width * params.height);
      expect(target.rounds).toBeDefined();
    }
  });
  it('asks for deeper chains on tough levels than on intro levels', () => {
    expect(levelSpec(10).target.rounds![0]).toBeGreaterThan(levelSpec(1).target.rounds![1]);
  });
});

describe('generateLevelFor', () => {
  it('is deterministic and meets the level target', () => {
    for (const n of [1, 5, 12]) {
      const a = generateLevelFor(n, 7);
      const b = generateLevelFor(n, 7);
      expect(a).not.toBeNull();
      expect(a!.level).toEqual(b!.level);
      const [lo, hi] = levelSpec(n).target.rounds!;
      expect(a!.metrics.rounds).toBeGreaterThanOrEqual(lo);
      expect(a!.metrics.rounds).toBeLessThanOrEqual(hi);
    }
  });
  it('accepts parameter overrides such as obstacles and arrows', () => {
    const r = generateLevelFor(1, 1, { obstacleCount: 3, arrowCount: 2 });
    expect(r).not.toBeNull();
    expect(r!.level.obstacles).toHaveLength(3);
    expect(r!.level.arrows).toHaveLength(2);
  });
});

describe('fixtures and hearts on the curve', () => {
  const arrows = (n: number): number => levelSpec(n).params.arrowCount ?? 0;
  it('introduces direction arrows gradually and relieves them on rest levels', () => {
    for (const n of [1, 2, 3, 4, 5, 15, 25]) expect(arrows(n)).toBe(0);
    expect(arrows(6)).toBeGreaterThanOrEqual(1);
    expect(arrows(8)).toBeGreaterThan(arrows(6));
    expect(arrows(10)).toBeGreaterThanOrEqual(5);
    expect(arrows(30)).toBeGreaterThanOrEqual(5);
  });
  it('gives hearts from an easy ordinary level on (not the first tough one, not with the first arrows), never on rest levels', () => {
    for (const n of [1, 5, 6, 15, 25]) expect(levelSpec(n).hearts).toBeUndefined();
    for (const n of [7, 8, 9, 10, 12, 20, 29, 30]) expect(levelSpec(n).hearts).toBeGreaterThanOrEqual(3);
    for (const n of [7, 8, 9]) expect(levelSpec(n).hearts).toBe(5); // onboarding
  });
  it('scales hearts with the number of animals: 3 up to 20, 4 up to 25, 5 beyond', () => {
    expect([16, 20, 21, 25, 26, 28].map(heartsFor)).toEqual([3, 3, 4, 4, 5, 5]);
    for (let n = 1; n <= 180; n++) {
      const s = levelSpec(n);
      if (s.hearts !== undefined && !(n >= 7 && n <= 9)) expect(s.hearts, `level ${n}`).toBe(heartsFor(s.params.pieceCount));
    }
  });
  it('generated levels carry the requested number of arrow tiles', () => {
    const r = generateLevelFor(8, 1);
    expect(r).not.toBeNull();
    expect(r!.level.arrows).toHaveLength(levelSpec(8).params.arrowCount!);
  });
});

describe('chapters after the first introduce one mechanic each', () => {
  it('uses keys in chapter 3, sleepers in chapter 4 and bombs in chapter 5', () => {
    expect(levelSpec(61).params.lockCount).toBeGreaterThanOrEqual(1);
    expect(levelSpec(91).params.sleepCount).toBeGreaterThanOrEqual(1);
    expect(levelSpec(121).params.bombCount).toBeGreaterThanOrEqual(1);
    expect(levelSpec(35).params.lockCount ?? 0).toBe(0);
  });
  it('keeps rest levels free of mechanics and limits active elements to three', () => {
    for (const n of [65, 95, 125, 155]) {
      const p = levelSpec(n).params;
      expect((p.lockCount ?? 0) + (p.sleepCount ?? 0) + (p.bombCount ?? 0)).toBe(0);
    }
    for (let n = 1; n <= 180; n++) {
      const s = levelSpec(n);
      const p = s.params;
      const active = [(p.arrowCount ?? 0) > 0, s.hearts !== undefined, (p.lockCount ?? 0) > 0, (p.sleepCount ?? 0) > 0, (p.bombCount ?? 0) > 0].filter(Boolean).length;
      expect(active).toBeLessThanOrEqual(3);
    }
  });
});

describe('bomb levels as the game builds them', () => {
  it('every level with bombs in chapters 5 and 6 can be won', () => {
    const bad: number[] = [];
    let checked = 0;
    for (let n = 121; n <= 180; n++) {
      const built = buildGameLevel(n);
      if (!built || !built.level.pieces.some((p) => p.fuse !== undefined)) continue;
      checked++;
      if (winnable(built.level) !== true) bad.push(n);
    }
    expect(checked).toBeGreaterThan(20);
    expect(bad).toEqual([]);
  }, 120_000);
});

describe('board size, obstacles and stages', () => {
  it('the board grows through a chapter and never exceeds 8 x 12', () => {
    const area = (n: number): number => levelSpec(n).params.width * levelSpec(n).params.height;
    expect(area(1)).toBeLessThan(area(6));
    expect(area(6)).toBeLessThan(area(11));
    expect(area(11)).toBeLessThan(area(16));
    expect(boardSize(10, 'tough')).toEqual({ width: 8, height: 12 });
    for (let n = 1; n <= 180; n++) {
      expect(levelSpec(n).params.width).toBeLessThanOrEqual(8);
      expect(levelSpec(n).params.height).toBeLessThanOrEqual(12);
    }
  });
  it('animals are at most three cells long, as in the art reference size classes', () => {
    for (let n = 1; n <= 180; n++) expect(levelSpec(n).params.maxLength, `level ${n}`).toBeLessThanOrEqual(3);
  });
  it('obstacles start with chapter 1 stage 2, are chapter 2s new element, and never sit on rest levels', () => {
    for (let n = 1; n <= 10; n++) expect(levelSpec(n).params.obstacleCount ?? 0).toBe(0);
    expect(levelSpec(12).params.obstacleCount).toBeGreaterThanOrEqual(1);
    expect(levelSpec(31).params.obstacleCount).toBeGreaterThanOrEqual(1);
    expect(levelSpec(46).params.obstacleCount!).toBeGreaterThan(levelSpec(16).params.obstacleCount!);
    for (const n of [5, 15, 25, 35, 65, 155]) expect(levelSpec(n).params.obstacleCount ?? 0).toBe(0);
  });
  it('generated levels carry their obstacles', () => {
    const built = buildGameLevel(46)!;
    expect(built.level.obstacles?.length).toBe(levelSpec(46).params.obstacleCount);
  });
  it('splits each chapter into three stages of ten levels', () => {
    expect(stageFor(1)).toMatchObject({ chapter: 1, stage: 1, theme: 'village' });
    expect(stageFor(10).stage).toBe(1);
    expect(stageFor(11).stage).toBe(2);
    expect(stageFor(30)).toMatchObject({ chapter: 1, stage: 3 });
    expect(stageFor(31)).toMatchObject({ chapter: 2, stage: 1, theme: 'forest' });
    expect(stageFor(180)).toMatchObject({ chapter: 6, stage: 3, theme: 'winter' });
    const names = new Set(Array.from({ length: 180 }, (_, i) => stageFor(i + 1).name));
    expect(names.size).toBe(18);
  });
});

describe('chapter identity', () => {
  it('ordinary and rest levels take their outline from the chapter, so regions look different', () => {
    for (let n = 1; n <= 180; n++) {
      const s = levelSpec(n);
      if (s.role !== 'ordinary' && s.role !== 'rest') continue;
      expect(CHAPTER_SHAPES[CHAPTER_THEMES[s.chapter - 1]], `level ${n}`).toContain(s.params.shape);
    }
  });
});

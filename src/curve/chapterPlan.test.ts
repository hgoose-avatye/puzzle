import { describe, expect, it } from 'vitest';
import { shapeVoids } from '../core/shapes';
import { CHAPTER_SHAPES, CHAPTER_THEMES, levelSpec } from './curve';
import { averageLength, COMBINED_MIN_ANIMALS, occupancyTarget } from './chapterPlan';

const all = Array.from({ length: 180 }, (_, i) => levelSpec(i + 1));
const kinds = (n: number): number => {
  const p = levelSpec(n).params;
  return [p.lockCount ?? 0, p.sleepCount ?? 0, p.bombCount ?? 0].filter((c) => c > 0).length;
};

describe('chapter plan (2.5D redesign)', () => {
  it('never puts more than one lock on a level', () => {
    for (const s of all) expect(s.params.lockCount ?? 0, `level ${(s.chapter - 1) * 30 + s.level}`).toBeLessThanOrEqual(1);
  });
  it('leaves arrow tiles out wherever two mechanics are on, and never switches on all three on an ordinary level', () => {
    for (let n = 1; n <= 180; n++) {
      if (kinds(n) >= 2) expect(levelSpec(n).params.arrowCount ?? 0, `level ${n}`).toBe(0);
      if (levelSpec(n).role === 'ordinary') expect(kinds(n), `level ${n}`).toBeLessThanOrEqual(2);
    }
  });
  it('keeps intro and rest levels as they were: small boards and their own animal counts', () => {
    for (let n = 1; n <= 180; n++) {
      const s = levelSpec(n);
      if (s.role === 'intro') expect(s.params).toMatchObject({ width: 6, height: 9, pieceCount: 7 + s.level, maxLength: 2 });
      if (s.role === 'rest') expect(s.params).toMatchObject({ width: 7, height: 10, pieceCount: 12, maxLength: 2, arrowCount: 0 });
    }
  });
  it('uses hexagon, tee and plus in chapter 6 only on tough and finale levels', () => {
    for (let n = 151; n <= 180; n++) {
      const s = levelSpec(n);
      if (s.role === 'ordinary') expect(['rounded', 'ellipse', 'rect'], `level ${n}`).toContain(s.params.shape);
    }
    expect(CHAPTER_SHAPES[CHAPTER_THEMES[5]]).toEqual(['rounded', 'ellipse', 'rect']);
  });
  it('never uses an ellipse where it comes out the same as the octagon', () => {
    const key = (shape: 'ellipse' | 'octagon', w: number, h: number): string => shapeVoids(shape, w, h).map((c) => `${c.x},${c.y}`).sort().join(' ');
    for (let n = 1; n <= 180; n++) {
      const p = levelSpec(n).params;
      if (p.shape === 'ellipse') expect(key('ellipse', p.width, p.height), `level ${n}`).not.toBe(key('octagon', p.width, p.height));
    }
    for (const n of [36, 37, 38, 39, 66, 67, 68, 69, 155, 165, 175]) expect(levelSpec(n).params.shape, `level ${n}`).toBe('rounded');
  });
  it('chapter 5 carries dynamite on sixteen levels only: the first lesson, the stage tests and peaks, and every fifth between', () => {
    const withBombs = Array.from({ length: 30 }, (_, i) => 121 + i).filter((n) => (levelSpec(n).params.bombCount ?? 0) > 0).map((n) => n - 120);
    expect(withBombs).toEqual([1, 2, 4, 7, 9, 10, 12, 14, 17, 19, 20, 22, 24, 27, 29, 30]);
    for (const n of [123, 126, 128, 131, 133, 136, 138, 141, 143, 146, 148]) expect(levelSpec(n).params.bombCount).toBeUndefined();
  });

  it('tightens the bomb fuse on chapter 5 and 6 ordinary levels with bombs, the chapter 5 finale and level 140 only', () => {
    for (let n = 1; n <= 180; n++) {
      const s = levelSpec(n);
      const tight = (s.params.bombCount ?? 0) > 0
        && ((s.role === 'ordinary' && s.chapter >= 5) || (s.chapter === 5 && (s.role === 'finale' || n === 140)));
      expect(s.params.bombSlack, `level ${n}`).toBe(tight ? 2 : undefined);
    }
  });
  it('never puts crates next to sleepers on a plus board', () => {
    for (const s of all) if (s.params.shape === 'plus' && (s.params.sleepCount ?? 0) > 0) expect(s.params.crateCount ?? 0).toBe(0);
  });
  it('fills main levels by the effective cells of their board, with a floor for combined mechanics', () => {
    for (let n = 1; n <= 180; n++) {
      const s = levelSpec(n);
      if (s.role === 'intro' || s.role === 'rest') continue;
      const p = s.params;
      const cells = p.width * p.height - shapeVoids(p.shape ?? 'rect', p.width, p.height).length - (p.crateCount ?? 0) - (p.arrowCount ?? 0);
      const byOccupancy = Math.round((occupancyTarget(s.chapter, s.level, s.role) * cells) / averageLength(p.maxLength));
      const combined = kinds(n) + ((p.crateCount ?? 0) > 0 ? 1 : 0) >= 2;
      const roles = 2 * (p.lockCount ?? 0) + (p.sleepCount ?? 0) + (p.bombCount ?? 0) + 1;
      expect(p.pieceCount, `level ${n}`).toBe(Math.max(byOccupancy, combined ? COMBINED_MIN_ANIMALS : 0, roles));
    }
  });
});

describe('finales', () => {
  it('chapter 1: crates and arrows, no strict mode, the original initial-free range', () => {
    const s = levelSpec(30);
    expect(s.params).toMatchObject({ width: 8, height: 12, shape: 'rect', crateCount: 2, crateHits: 2, arrowCount: 3 });
    expect(s.params.teach).toBeUndefined();
    expect(s.target.initialFreeRatio).toEqual([0, 0.3]);
  });
  it('chapter 2: four two-crack crates on an ellipse, at most 27% free at the start', () => {
    const s = levelSpec(60);
    expect(s.params).toMatchObject({ shape: 'ellipse', crateCount: 4, crateHits: 2 });
    expect(s.params.teach).toBeUndefined();
    expect(s.target.initialFreeRatio).toEqual([0, 0.27]);
  });
  it('chapter 3: two crates on a hexagon and no lock (locks went 2026-11-06), at most 20% free at the start', () => {
    const s = levelSpec(90);
    expect(s.params).toMatchObject({ shape: 'hexagon', crateCount: 2 });
    expect(s.params.lockCount ?? 0).toBe(0);
    expect(s.target.initialFreeRatio).toEqual([0, 0.2]);
  });
  it('chapter 4: two sleepers on an 8 x 12 rect with two crates, no lock (one mechanic, so arrows stay)', () => {
    expect(levelSpec(120).params).toMatchObject({ width: 8, height: 12, shape: 'rect', sleepCount: 2, crateCount: 2 });
    expect(levelSpec(120).params.lockCount ?? 0).toBe(0);
  });
  it('chapter 5: two bombs on a tee, no lock, two crates, no strict mode', () => {
    const s = levelSpec(150);
    expect(s.params).toMatchObject({ shape: 'tee', bombCount: 2, crateCount: 2 });
    expect(s.params.lockCount ?? 0).toBe(0);
    expect(s.params.teach).toBeUndefined();
  });
  it('chapter 6: a sleeper and two dynamites on an 8 x 12 rect with two crates, no lock, no arrows', () => {
    const p = levelSpec(180).params;
    expect(p).toMatchObject({ width: 8, height: 12, shape: 'rect', sleepCount: 1, bombCount: 2, crateCount: 2, arrowCount: 0 });
    expect(p.lockCount ?? 0).toBe(0);
  });
  it('chapter 6 still uses sleepers on its ordinary and tough levels', () => {
    const sleepy = Array.from({ length: 29 }, (_, i) => levelSpec(151 + i)).filter((s) => (s.params.sleepCount ?? 0) > 0);
    expect(sleepy.some((s) => s.role === 'ordinary')).toBe(true);
    expect(sleepy.some((s) => s.role === 'tough')).toBe(true);
  });
});

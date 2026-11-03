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
  it('chapter 3: one lock and two crates on a hexagon, at most 20% free at the start', () => {
    const s = levelSpec(90);
    expect(s.params).toMatchObject({ shape: 'hexagon', lockCount: 1, crateCount: 2 });
    expect(s.target.initialFreeRatio).toEqual([0, 0.2]);
  });
  it('chapter 4: two sleepers and a lock on a plus, no arrows, no crates', () => {
    expect(levelSpec(120).params).toMatchObject({ shape: 'plus', sleepCount: 2, lockCount: 1, crateCount: 0, arrowCount: 0 });
  });
  it('chapter 5: two bombs and a lock on a tee, slack 2, no arrows, two crates, no strict mode', () => {
    const s = levelSpec(150);
    expect(s.params).toMatchObject({ shape: 'tee', bombCount: 2, lockCount: 1, bombSlack: 2, crateCount: 2, arrowCount: 0 });
    expect(s.params.teach).toBeUndefined();
  });
  it('chapter 6: a lock and a bomb on a hexagon, two crates, no sleepers, no arrows', () => {
    const p = levelSpec(180).params;
    expect(p).toMatchObject({ shape: 'hexagon', lockCount: 1, bombCount: 1, crateCount: 2, arrowCount: 0 });
    expect(p.sleepCount ?? 0).toBe(0);
  });
  it('chapter 6 still uses sleepers on its ordinary and tough levels', () => {
    const sleepy = Array.from({ length: 29 }, (_, i) => levelSpec(151 + i)).filter((s) => (s.params.sleepCount ?? 0) > 0);
    expect(sleepy.some((s) => s.role === 'ordinary')).toBe(true);
    expect(sleepy.some((s) => s.role === 'tough')).toBe(true);
  });
});

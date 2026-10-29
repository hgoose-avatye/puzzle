import { createRng } from '../core/rng';
import type { Level } from '../core/types';
import { generateMatching, type DifficultyTarget, type GenParams } from '../generator/generate';
import type { Metrics } from '../solver/metrics';

export type Role = 'intro' | 'rest' | 'ordinary' | 'tough' | 'finale';

export interface LevelSpec {
  /** 1-based number within the 30-level chapter. */
  level: number;
  role: Role;
  params: GenParams;
  target: DifficultyTarget;
}

export const CHAPTER_LENGTH = 30;

/**
 * Starting values for the chapter curve (spec 5.6). Every number here is a candidate to be tuned by playtests.
 * Known gap: the finale ("big release") cannot be filtered for with `surge` yet, because the generator front-loads
 * removals (large early rounds, small late rounds). A generator change is needed before the finale can be shaped.
 */
export function levelSpec(levelNumber: number): LevelSpec {
  if (!Number.isInteger(levelNumber) || levelNumber < 1) throw new Error(`invalid level number ${levelNumber}`);
  const level = ((levelNumber - 1) % CHAPTER_LENGTH) + 1;
  const small = { width: 7, height: 10, minLength: 1, maxLength: 2 };
  const full = { width: 8, height: 12, minLength: 1, maxLength: 3 };
  if (level === 30) {
    return { level, role: 'finale', params: { ...full, pieceCount: 28 }, target: { rounds: [11, 20], initialFreeRatio: [0, 0.3] } };
  }
  if (level === 10 || level === 20) {
    return { level, role: 'tough', params: { ...full, pieceCount: 26 }, target: { rounds: [10, 20], initialFreeRatio: [0, 0.34] } };
  }
  if (level % 5 === 0) {
    return { level, role: 'rest', params: { ...small, pieceCount: 12 }, target: { rounds: [2, 5], initialFreeRatio: [0.5, 1] } };
  }
  if (level < 5) {
    return { level, role: 'intro', params: { ...small, pieceCount: 7 + level }, target: { rounds: [2, 4], initialFreeRatio: [0.5, 1] } };
  }
  if (level < 15) {
    return { level, role: 'ordinary', params: { ...full, pieceCount: 16 + (level - 6) }, target: { rounds: [5, 8], initialFreeRatio: [0.35, 0.55] } };
  }
  return { level, role: 'ordinary', params: { ...full, pieceCount: 22 + Math.min(4, Math.floor((level - 16) / 3)) }, target: { rounds: [7, 11], initialFreeRatio: [0.25, 0.45] } };
}

/** Deterministic: the same (levelNumber, baseSeed) always yields the same level. */
export function generateLevelFor(
  levelNumber: number,
  baseSeed: number,
): { spec: LevelSpec; level: Level; metrics: Metrics } | null {
  const spec = levelSpec(levelNumber);
  const rng = createRng(baseSeed * 1000 + levelNumber);
  const result = generateMatching(spec.params, spec.target, rng, 300);
  return result ? { spec, ...result } : null;
}

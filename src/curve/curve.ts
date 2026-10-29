import { createRng } from '../core/rng';
import type { Level } from '../core/types';
import { generateMatching, type DifficultyTarget, type GenParams } from '../generator/generate';
import type { Metrics } from '../solver/metrics';
import pickedSeeds from './seeds.json';

export type Role = 'intro' | 'rest' | 'ordinary' | 'tough' | 'finale';

export interface LevelSpec {
  /** 1-based number within the 30-level chapter. */
  level: number;
  chapter: number;
  role: Role;
  params: GenParams;
  target: DifficultyTarget;
  /** Hearts for the level; undefined means unlimited mistakes. */
  hearts?: number;
}

export const CHAPTER_LENGTH = 30;

/**
 * Hearts scale with the number of animals: every animal is one more decision, and a fixed three hearts turned the
 * large late levels into near-certain failures in the simulated-player report (docs/sim). Candidate values.
 */
export function heartsFor(pieceCount: number): number {
  return 3 + Math.min(2, Math.floor(Math.max(0, pieceCount - 16) / 5));
}

/** First chapter-one level with hearts: an easy ordinary level, not the first tough one, and not level 6 (arrows arrive there). */
const FIRST_HEART_LEVEL = 7;
/** Generous hearts on the first heart levels (7-9) while players get used to losing them. */
const ONBOARDING_HEARTS = 5;

/**
 * Starting values for the chapter curve (spec 5.6). Every number here is a candidate to be tuned by playtests.
 * Known gap: the finale ("big release") cannot be filtered for with `surge` yet, because the generator front-loads
 * removals (large early rounds, small late rounds). A generator change is needed before the finale can be shaped.
 */
function chapterOneSpec(level: number): Omit<LevelSpec, 'chapter'> {
  const small = { width: 7, height: 10, minLength: 1, maxLength: 2 };
  const full = { width: 8, height: 12, minLength: 1, maxLength: 3 };
  if (level === 30) {
    return { level, role: 'finale', params: { ...full, pieceCount: 28, arrowCount: 6 }, target: { rounds: [11, 20], initialFreeRatio: [0, 0.3] }, hearts: heartsFor(28) };
  }
  if (level === 10 || level === 20) {
    return { level, role: 'tough', params: { ...full, pieceCount: 26, arrowCount: level === 10 ? 5 : 6 }, target: { rounds: [10, 20], initialFreeRatio: [0, 0.34] }, hearts: heartsFor(26) };
  }
  if (level % 5 === 0) {
    return { level, role: 'rest', params: { ...small, pieceCount: 12, arrowCount: 0 }, target: { rounds: [2, 5], initialFreeRatio: [0.5, 1] } };
  }
  if (level < 5) {
    return { level, role: 'intro', params: { ...small, pieceCount: 7 + level, arrowCount: 0 }, target: { rounds: [2, 4], initialFreeRatio: [0.5, 1] } };
  }
  if (level < 10) {
    const pieceCount = 16 + (level - 6);
    return { level, role: 'ordinary', params: { ...full, pieceCount, arrowCount: level < 8 ? 1 : 2 }, target: { rounds: [5, 8], initialFreeRatio: [0.35, 0.55] }, ...(level >= FIRST_HEART_LEVEL ? { hearts: ONBOARDING_HEARTS } : {}) };
  }
  if (level < 15) {
    const pieceCount = 16 + (level - 6);
    return { level, role: 'ordinary', params: { ...full, pieceCount, arrowCount: level < 13 ? 2 : 3 }, target: { rounds: [5, 8], initialFreeRatio: [0.35, 0.55] }, hearts: heartsFor(pieceCount) };
  }
  const arrowCount = level < 20 ? 3 + (level >= 18 ? 1 : 0) : level < 25 ? 3 + (level >= 23 ? 1 : 0) : 4 + (level >= 28 ? 1 : 0);
  const pieceCount = 22 + Math.min(4, Math.floor((level - 16) / 3));
  return { level, role: 'ordinary', params: { ...full, pieceCount, arrowCount }, target: { rounds: [7, 11], initialFreeRatio: [0.25, 0.45] }, hearts: heartsFor(pieceCount) };
}

/** Chapter 2 stretches animals, 3 adds keys, 4 sleepers, 5 bombs, 6 rotates through all three (spec 6.1). */
export function levelSpec(levelNumber: number): LevelSpec {
  if (!Number.isInteger(levelNumber) || levelNumber < 1) throw new Error(`invalid level number ${levelNumber}`);
  const chapter = Math.min(6, Math.floor((levelNumber - 1) / CHAPTER_LENGTH) + 1);
  const level = ((levelNumber - 1) % CHAPTER_LENGTH) + 1;
  const base = chapterOneSpec(level);
  if (chapter === 1) return { ...base, chapter };
  const params = { ...base.params };
  const { role } = base;
  const count = role === 'rest' ? 0 : role === 'intro' || level < 10 ? 1 : role === 'tough' || role === 'finale' ? 3 : 2;
  if (chapter === 2 && role !== 'rest') params.maxLength = role === 'intro' ? 3 : 4;
  const mechanic = chapter === 3 ? 'lock' : chapter === 4 ? 'sleep' : chapter === 5 ? 'bomb' : chapter === 6 ? (['lock', 'sleep', 'bomb'] as const)[level % 3] : null;
  if (mechanic === 'lock') params.lockCount = count;
  if (mechanic === 'sleep') params.sleepCount = count;
  if (mechanic === 'bomb') params.bombCount = count;
  const hearts = role !== 'rest' && level >= 4 ? heartsFor(params.pieceCount) : undefined;
  // Longer animals and extra mechanics make the tightest targets of chapter 1 unreachable, so loosen them a little.
  const target = role === 'tough' || role === 'finale' ? { rounds: [10, 20] as [number, number], initialFreeRatio: [0, 0.38] as [number, number] } : base.target;
  return { ...base, chapter, params, target, hearts };
}

/** Deterministic: the same (levelNumber, baseSeed) always yields the same level. */
export function generateLevelFor(
  levelNumber: number,
  baseSeed: number,
  overrides: Partial<GenParams> = {},
): { spec: LevelSpec; level: Level; metrics: Metrics } | null {
  const base = levelSpec(levelNumber);
  const spec = { ...base, params: { ...base.params, ...overrides } };
  const rng = createRng(baseSeed * 1000 + levelNumber);
  const result = generateMatching(spec.params, spec.target, rng, 300);
  return result ? { spec, ...result } : null;
}

/** Seed picked per level by scripts/pick-seeds.ts so difficulty climbs smoothly inside a chapter. */
const PICKED: Record<string, number> = pickedSeeds;

/**
 * The level the game plays as number `n`: the picked seed if there is one, else the first base seed that meets the
 * curve, else any solvable level.
 */
export function buildGameLevel(n: number): { level: Level; hearts?: number } | null {
  const picked = PICKED[n];
  if (picked !== undefined) {
    const r = generateLevelFor(n, picked);
    if (r) return { level: r.level, hearts: r.spec.hearts };
  }
  for (let seed = 1; seed <= 5; seed++) {
    const r = generateLevelFor(n, seed);
    if (r) return { level: r.level, hearts: r.spec.hearts };
  }
  const spec = levelSpec(n);
  const fallback = generateMatching(spec.params, {}, createRng(n), 50);
  return fallback ? { level: fallback.level, hearts: spec.hearts } : null;
}

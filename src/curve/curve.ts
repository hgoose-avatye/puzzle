import { createRng } from '../core/rng';
import type { Level } from '../core/types';
import { generateMatching, type DifficultyTarget, type GenParams } from '../generator/generate';
import type { Metrics } from '../solver/metrics';
import type { BoardShape } from '../core/shapes';
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

/**
 * The board grows through a chapter: small boards to learn on, the full 8 x 12 (the most a phone shows readably) for
 * the second half and the tough levels.
 */
export function boardSize(level: number, role: Role): { width: number; height: number } {
  if (role === 'intro') return { width: 6, height: 9 };
  if (role === 'rest') return { width: 7, height: 10 };
  if (role === 'tough' || role === 'finale' || level >= 16) return { width: 8, height: 12 };
  if (level < 10) return { width: 7, height: 11 };
  return { width: 8, height: 11 };
}

/**
 * Fixed obstacles (fences, crates, hay bales; the look comes from the stage). Chapter 1 brings them in with its second
 * stage, chapter 2 makes them its new element, later chapters keep a few. Never on intro or rest levels, except as
 * chapter 2's gentle introduction.
 */
export function obstaclesFor(chapter: number, level: number, role: Role): number {
  if (role === 'rest') return 0;
  const peak = role === 'tough' || role === 'finale';
  if (chapter === 1) return level <= 10 ? 0 : peak ? 2 : level > 20 ? 2 : 1;
  if (chapter === 2) return role === 'intro' ? 1 : peak ? 4 : level > 15 ? 3 : 2;
  return role === 'intro' ? 0 : peak ? 2 : 1;
}

/** Three stages of ten levels per chapter; each stage is a sub-theme of the chapter's region (spec 6.1). */
export const STAGE_LENGTH = 10;
export interface StageInfo { chapter: number; stage: number; theme: Theme; name: string }
const STAGE_NAMES: Record<Theme, [string, string, string]> = {
  village: ['동물 마을 · 꽃밭', '동물 마을 · 농장', '동물 마을 · 마을 광장'],
  forest: ['숲속 · 캠핑장', '숲속 · 강가', '숲속 · 깊은 숲'],
  pirate: ['해적섬 · 해변', '해적섬 · 항구', '해적섬 · 보물 동굴'],
  jungle: ['정글 · 밀림 입구', '정글 · 폭포', '정글 · 고대 유적'],
  haunted: ['유령 성 · 호박밭', '유령 성 · 묘지', '유령 성 · 성 마당'],
  winter: ['겨울 마을 · 눈 마을', '겨울 마을 · 얼음 호수', '겨울 마을 · 크리스마스 광장'],
};
export function stageFor(levelNumber: number): StageInfo {
  const chapter = Math.min(6, Math.floor((levelNumber - 1) / CHAPTER_LENGTH) + 1);
  const stage = Math.min(3, Math.floor((((levelNumber - 1) % CHAPTER_LENGTH)) / STAGE_LENGTH) + 1);
  const theme = CHAPTER_THEMES[chapter - 1];
  return { chapter, stage, theme, name: STAGE_NAMES[theme][stage - 1] };
}

/** Background theme per chapter (spec 6.1): animal village, forest, pirate island, jungle ruins, haunted castle, winter. */
export type Theme = 'village' | 'forest' | 'pirate' | 'jungle' | 'haunted' | 'winter';
export const CHAPTER_THEMES: Theme[] = ['village', 'forest', 'pirate', 'jungle', 'haunted', 'winter'];
export const themeFor = (levelNumber: number): Theme => CHAPTER_THEMES[Math.min(5, Math.floor((levelNumber - 1) / CHAPTER_LENGTH))];

/**
 * Outlines each region leans towards, so a chapter has a shape of its own: a tidy village square, round forest
 * clearings, island beaches, cross-shaped ruins, a crooked haunted yard, round snowy squares.
 */
export const CHAPTER_SHAPES: Record<Theme, [BoardShape, BoardShape, BoardShape]> = {
  village: ['rect', 'rounded', 'octagon'],
  forest: ['ellipse', 'rounded', 'octagon'],
  pirate: ['ellipse', 'hexagon', 'rounded'],
  jungle: ['plus', 'octagon', 'rect'],
  haunted: ['tee', 'octagon', 'plus'],
  winter: ['rounded', 'ellipse', 'rect'],
};
/** The biggest levels need the roomy outlines to fit 26-28 animals. */
const ROOMY: BoardShape[] = ['rect', 'rounded', 'octagon'];

export function shapeFor(level: number, role: Role, theme: Theme = 'village'): BoardShape {
  const own = CHAPTER_SHAPES[theme];
  if (role === 'intro') return level <= 2 ? 'rect' : 'rounded';
  if (role === 'rest') return own[1];
  if (role === 'tough' || role === 'finale') {
    const roomy = own.filter((s) => ROOMY.includes(s));
    return roomy.length ? roomy[level % roomy.length] : ROOMY[level % 3];
  }
  return own[level % 3];
}

/** Chapter 2 stretches animals, 3 adds keys, 4 sleepers, 5 bombs, 6 rotates through all three (spec 6.1). */
export function levelSpec(levelNumber: number): LevelSpec {
  if (!Number.isInteger(levelNumber) || levelNumber < 1) throw new Error(`invalid level number ${levelNumber}`);
  const chapter = Math.min(6, Math.floor((levelNumber - 1) / CHAPTER_LENGTH) + 1);
  const level = ((levelNumber - 1) % CHAPTER_LENGTH) + 1;
  const raw = chapterOneSpec(level);
  const base = { ...raw, params: { ...raw.params, ...boardSize(level, raw.role), shape: shapeFor(level, raw.role, CHAPTER_THEMES[chapter - 1]), obstacleCount: obstaclesFor(chapter, level, raw.role) } };
  if (chapter === 1) return { ...base, chapter };
  const params = { ...base.params };
  const { role } = base;
  const count = role === 'rest' ? 0 : role === 'intro' || level < 10 ? 1 : role === 'tough' || role === 'finale' ? 3 : 2;
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

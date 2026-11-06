import { createRng } from '../core/rng';
import { gradeKnot, type KnotGrade } from '../core/bump';
import type { Level } from '../core/types';
import { generateMatching, type DifficultyTarget, type GenParams } from '../generator/generate';
import { knotFrom } from '../generator/knot';
import type { Metrics } from '../solver/metrics';
import type { BoardShape } from '../core/shapes';
import { animalCount, arrowsAllowed, boardFor, bombSlackFor, cratesFor, finaleExtras, mechanicsFor, occupancyTarget, type Mechanics } from './chapterPlan';
import pickedSeeds from './seeds.json';
import bakedLevels from './levels.json';
import handLevels from './handLevels.json';

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
 * Difficulty knobs, applied on top of the chapter structure below (2026-10-29). Hearts are fixed at three on every
 * level that has them. Since the 2.5D redesign (2026-11-03) the animal count of ordinary, tough and finale levels
 * comes from the board's effective cells (chapterPlan.ts animalCount); change a number and rerun
 * scripts/pick-seeds.ts and scripts/build-levels.ts to retune.
 */
/**
 * No level has hearts since the bump rule (2026-11-06): a wrong tap moves an animal and can knot the board, which is
 * cost enough, and 되돌리기 takes it back. Kept as a constant so hearts can come back for an experiment.
 */
export const HEARTS: number | undefined = undefined;
/** scale of the depth (rounds) targets on ordinary, tough and finale levels, kept from when it also scaled the animal count */
export const DEPTH_SCALE = 0.6;
/** share of the base arrow count kept (at least one where any were planned) */
export const ARROW_SHARE = 0.5;

/** Hearts for a level that would have them: HEARTS. Kept as a function so the count can depend on the level again. */
export function heartsFor(_pieceCount: number): number | undefined {
  return HEARTS;
}

/** First chapter-one level with hearts: an easy ordinary level, not the first tough one, and not level 6 (arrows arrive there). */
const FIRST_HEART_LEVEL = 7;
/** Hearts on the first heart levels (7-9): the same as everywhere since hearts were fixed at three. */
const ONBOARDING_HEARTS = HEARTS;

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
 * Chapter 1's board for a level: small boards to learn on, the full 8 x 12 (the most a phone shows readably) for the
 * tough levels and the end of the chapter. Later chapters reach 8 x 12 sooner (chapterPlan.ts boardFor).
 */
export function boardSize(level: number, role: Role): { width: number; height: number } {
  const { width, height } = boardFor(1, level, role, CHAPTER_SHAPES.village);
  return { width, height };
}

/**
 * Breakable crates (fences, crates, hay bales; the look comes from the stage). Each sits on some animal's way out and
 * breaks after two of its neighbours have left, so it always matters (fixed obstacles never could: one on a path would
 * make the level unsolvable). Chapter 1 brings them in with its second
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
/** Only the mechanics a level switches on, so a level without bombs carries no bombCount at all. */
function mechanicParams(x: Mechanics): Partial<GenParams> {
  return {
    ...(x.lockCount > 0 ? { lockCount: x.lockCount } : {}),
    ...(x.sleepCount > 0 ? { sleepCount: x.sleepCount } : {}),
    ...(x.bombCount > 0 ? { bombCount: x.bombCount } : {}),
  };
}

/**
 * Main levels: depth targets scaled (DEPTH_SCALE), arrows thinned (ARROW_SHARE) and left out where two mechanics are on,
 * and the animal count taken from the board's effective cells. Intro and rest levels keep their own easy setup.
 */
function tune(spec: LevelSpec, mechanics: Mechanics): LevelSpec {
  if (spec.role === 'intro' || spec.role === 'rest') return spec;
  const p = spec.params;
  const scale = (r?: [number, number]): [number, number] | undefined => (r ? [Math.max(2, Math.round(r[0] * DEPTH_SCALE)), Math.max(3, Math.round(r[1] * DEPTH_SCALE))] : r);
  const planned = p.arrowCount ? Math.max(1, Math.round(p.arrowCount * ARROW_SHARE)) : 0;
  const arrowCount = arrowsAllowed(mechanics) ? planned : 0;
  const board = { width: p.width, height: p.height, shape: p.shape ?? 'rect' };
  const occupancy = occupancyTarget(spec.chapter, spec.level, spec.role);
  const { count } = animalCount(board, p.crateCount ?? 0, arrowCount, occupancy, p.maxLength, mechanics);
  return {
    ...spec,
    params: { ...p, pieceCount: count, arrowCount },
    target: { ...spec.target, rounds: scale(spec.target.rounds) },
  };
}

/** Chapter 2 deepens crates, 3 adds a key, 4 sleepers, 5 bombs, 6 pairs them up (chapterPlan.ts). */
export function levelSpec(levelNumber: number): LevelSpec {
  const { spec, mechanics } = baseLevelSpec(levelNumber);
  return tune(spec, mechanics);
}

/**
 * Difficulty curve under the bump rule (2026-11-06 playtest feedback): rising overall like a stock chart, easy and hard
 * mixed level by level. A knot level is one the player cannot clear by taking free animals out alone: somewhere a
 * blocked animal must be pushed to the right spot (generator/knot.ts). Its aim is the guessWin of core/bump.ts, the
 * chance that pushing at random still clears it: lower is harder. TREND falls over the game, WAVE moves each level of
 * a ten-level stage around it (easy first, a test at 4, a rest at 5, a bigger test at 9, the peak at 10). Intro and
 * rest levels have no knot: the first five levels teach the tap, each chapter's first levels teach their mechanic.
 */
const TREND: ReadonlyArray<[number, number]> = [[6, 0.75], [20, 0.45], [60, 0.2], [180, 0.12]];
const WAVE = [0.15, 0.05, 0, -0.1, 0, 0.1, 0, -0.05, -0.12, -0.18];
const AIM_MIN = 0.05;
const AIM_MAX = 0.9;

export function trendAt(n: number): number {
  const i = TREND.findIndex(([at]) => at >= n);
  if (i === 0) return TREND[0][1];
  if (i < 0) return TREND[TREND.length - 1][1];
  const [a, va] = TREND[i - 1];
  const [b, vb] = TREND[i];
  return va + ((vb - va) * (n - a)) / (b - a);
}

/** Levels designed by hand (the first-play lessons, scripts/build-levels.ts): they ship as written, knot or not. */
export const HAND_LEVELS = new Set(Object.keys(handLevels as Record<string, unknown>).map(Number));

/** Does level `n` need a push (a knot)? Intro, rest and hand-made levels never do. */
export function knotLevel(n: number): boolean {
  if (HAND_LEVELS.has(n)) return false;
  const role = levelSpec(n).role;
  return role !== 'intro' && role !== 'rest';
}

/** The guessWin level `n` aims at; 1 for a level without a knot. */
export function aimAt(n: number): number {
  if (!knotLevel(n)) return 1;
  const level = ((n - 1) % CHAPTER_LENGTH) + 1;
  return Math.min(AIM_MAX, Math.max(AIM_MIN, trendAt(n) + WAVE[(level - 1) % 10]));
}

/** Flip variants tried per generated board on a knot level; the one nearest the aim is kept (hard aims are rare). */
export const KNOT_TRIES = 30;

function baseLevelSpec(levelNumber: number): { spec: LevelSpec; mechanics: Mechanics } {
  if (!Number.isInteger(levelNumber) || levelNumber < 1) throw new Error(`invalid level number ${levelNumber}`);
  const chapter = Math.min(6, Math.floor((levelNumber - 1) / CHAPTER_LENGTH) + 1);
  const level = ((levelNumber - 1) % CHAPTER_LENGTH) + 1;
  const raw = chapterOneSpec(level);
  const { role } = raw;
  const board = boardFor(chapter, level, role, CHAPTER_SHAPES[CHAPTER_THEMES[chapter - 1]]);
  const mechanics = mechanicsFor(chapter, level, role);
  const crateCount = cratesFor(obstaclesFor(chapter, level, role), board, mechanics);
  const extras = role === 'finale' ? finaleExtras(chapter) : {};
  const bombSlack = bombSlackFor(chapter, level, role, mechanics);
  // crates are taught with a single crack on intro levels, two everywhere else
  const params: GenParams = {
    ...raw.params, ...board, crateCount, crateHits: role === 'intro' ? 1 : 2, ...mechanicParams(mechanics),
    ...(role === 'intro' ? { teach: true } : {}), ...(bombSlack !== undefined ? { bombSlack } : {}),
  };
  if (chapter === 1) return { spec: { ...raw, chapter, params }, mechanics };
  const hearts = role !== 'rest' && level >= 4 ? heartsFor(params.pieceCount) : undefined;
  // Longer animals and extra mechanics make the tightest targets of chapter 1 unreachable, so loosen them a little.
  // A crate that matters always adds a step (its neighbours, then the crate, then the animal behind it), so intro
  // levels that teach crates get a little more depth.
  const base = role === 'tough' || role === 'finale' ? { rounds: [10, 20] as [number, number], initialFreeRatio: [0, 0.38] as [number, number] }
    : role === 'intro' && crateCount > 0 ? { rounds: [2, 5] as [number, number], initialFreeRatio: [0.3, 1] as [number, number] }
    : raw.target;
  const target = extras.initialFreeRatio ? { ...base, initialFreeRatio: extras.initialFreeRatio } : base;
  return { spec: { ...raw, chapter, params, target, hearts }, mechanics };
}

/**
 * Deterministic: the same (levelNumber, baseSeed) always yields the same level. On a knot level the generated board is
 * knotted afterwards (knotFrom, the same rng) and comes with its grade; a board that takes no knot yields null.
 */
export function generateLevelFor(
  levelNumber: number,
  baseSeed: number,
  overrides: Partial<GenParams> = {},
): { spec: LevelSpec; level: Level; metrics: Metrics; grade: KnotGrade } | null {
  const base = levelSpec(levelNumber);
  const spec = { ...base, params: { ...base.params, ...overrides } };
  const rng = createRng(baseSeed * 1000 + levelNumber);
  const result = generateMatching(spec.params, spec.target, rng, 300);
  if (!result) return null;
  if (!knotLevel(levelNumber)) return { spec, ...result, grade: gradeKnot(result.level) };
  // the metrics stay those of the board before the knot: the peeling solver they come from cannot read a knot
  const knotted = knotFrom(result.level, rng, aimAt(levelNumber), KNOT_TRIES);
  return knotted ? { spec, level: knotted.level, metrics: result.metrics, grade: knotted.grade } : null;
}

/** Seed picked per level by scripts/pick-seeds.ts so difficulty climbs smoothly inside a chapter. */
const PICKED: Record<string, number> = pickedSeeds;

/** Levels baked by scripts/build-levels.ts: the game reads these instead of generating on the device. */
const BAKED = bakedLevels as unknown as Record<string, { level: Level; hearts?: number }>;

/** The level the game plays as number `n`: the baked one, or generated on the spot past the baked range. */
export function buildGameLevel(n: number): { level: Level; hearts?: number } | null {
  return BAKED[n] ?? generateGameLevel(n);
}

/**
 * Generate level `n` the way it is baked: the picked seed if there is one, else the first base seed that meets the
 * curve, else any solvable level.
 */
export function generateGameLevel(n: number): { level: Level; hearts?: number } | null {
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

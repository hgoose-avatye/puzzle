import { shapeVoids, type BoardShape } from '../core/shapes';
import type { Role } from './curve';

/**
 * Chapter plan for the 2.5D level redesign (2026-11-03): which board, which mechanics and how many animals each level
 * of a chapter gets. curve.ts keeps the roles, depth targets, arrows and hearts; this file decides what differs by
 * chapter. Background: docs/POLISH.md L10 (one lock per level) and the level polishing reports of 2026-11-03.
 */

export interface Board {
  width: number;
  height: number;
  shape: BoardShape;
}

export interface Mechanics {
  lockCount: number;
  sleepCount: number;
  bombCount: number;
}

/** A level's place in its chapter: stage one (6-9, tough 10), stage two (11-19, tough 20), stage three (21-29, finale 30). */
type Slot = 's1a' | 's1b' | 't10' | 's2a' | 's2b' | 't20' | 's3a' | 's3b' | 'fin';

function slotOf(level: number): Slot {
  if (level === 30) return 'fin';
  if (level === 20) return 't20';
  if (level === 10) return 't10';
  if (level < 8) return 's1a';
  if (level < 10) return 's1b';
  if (level < 15) return 's2a';
  if (level < 20) return 's2b';
  if (level < 25) return 's3a';
  return 's3b';
}

type BoardRow = Record<Slot, [number, number, BoardShape[]]>;

/**
 * Boards grow earlier in later chapters (8 x 12 on about 6 levels of chapter 1, 23 of chapter 6) and every stage
 * leans on an outline of its own. Ordinary levels only use the chapter's own outlines (CHAPTER_SHAPES); hexagon, tee
 * and plus also appear on tough and finale levels. Width never exceeds 8.
 */
const BOARDS: BoardRow[] = [
  // 1 village
  { s1a: [7, 10, ['rect', 'rounded']], s1b: [7, 11, ['rect', 'rounded']], t10: [8, 12, ['rect']], s2a: [7, 11, ['rounded']], s2b: [8, 11, ['rounded']], t20: [8, 12, ['rounded']], s3a: [8, 11, ['octagon']], s3b: [8, 12, ['octagon']], fin: [8, 12, ['rect']] },
  // 2 forest (7 x 11 and 8 x 11 ellipses come out exactly like the octagon, so stage one is rounded)
  { s1a: [7, 11, ['rounded']], s1b: [7, 11, ['rounded']], t10: [8, 12, ['rounded']], s2a: [8, 11, ['rounded']], s2b: [8, 12, ['ellipse']], t20: [8, 12, ['ellipse']], s3a: [8, 11, ['rounded']], s3b: [8, 12, ['ellipse', 'rounded']], fin: [8, 12, ['ellipse']] },
  // 3 pirate
  { s1a: [8, 11, ['rounded']], s1b: [8, 11, ['rounded']], t10: [8, 12, ['rounded']], s2a: [8, 11, ['rounded']], s2b: [8, 12, ['hexagon']], t20: [8, 12, ['hexagon']], s3a: [8, 12, ['rounded']], s3b: [8, 12, ['ellipse']], fin: [8, 12, ['hexagon']] },
  // 4 jungle
  { s1a: [8, 11, ['octagon']], s1b: [8, 11, ['octagon']], t10: [8, 12, ['octagon']], s2a: [8, 12, ['plus']], s2b: [8, 12, ['rect']], t20: [8, 12, ['octagon']], s3a: [8, 12, ['plus']], s3b: [8, 12, ['octagon']], fin: [8, 12, ['rect']] },
  // 5 haunted
  { s1a: [8, 11, ['tee']], s1b: [8, 11, ['tee']], t10: [8, 12, ['octagon']], s2a: [8, 12, ['octagon']], s2b: [8, 12, ['plus']], t20: [8, 12, ['tee']], s3a: [8, 12, ['plus']], s3b: [8, 12, ['tee']], fin: [8, 12, ['tee']] },
  // 6 winter
  { s1a: [8, 12, ['rounded']], s1b: [8, 12, ['rounded']], t10: [8, 12, ['octagon']], s2a: [8, 12, ['ellipse']], s2b: [8, 12, ['rect']], t20: [8, 12, ['tee']], s3a: [8, 12, ['rounded', 'ellipse']], s3b: [8, 12, ['rect', 'rounded']], fin: [8, 12, ['rect']] },
];
// Finales of chapters 4 and 6 sit on rect: on plus and hexagon (72 cells, 15 animals) no candidate was harder than
// the chapter's tough levels (2026-11-03 isolated experiment, 10 seeds per setup).

/** Intro levels learn on a small plain board; rest levels breathe on the chapter's second outline. */
export function boardFor(chapter: number, level: number, role: Role, own: readonly BoardShape[]): Board {
  if (role === 'intro') return { width: 6, height: 9, shape: level <= 2 ? 'rect' : 'rounded' };
  // a 7 x 10 ellipse comes out exactly like the octagon, so a rest level that would get one is rounded instead
  if (role === 'rest') return { width: 7, height: 10, shape: own[1] === 'ellipse' ? 'rounded' : own[1] };
  const [width, height, shapes] = BOARDS[chapter - 1][slotOf(level)];
  return { width, height, shape: shapes[level % shapes.length] };
}

const mech = (lockCount: number, sleepCount: number, bombCount: number): Mechanics => ({ lockCount, sleepCount, bombCount });
const NONE = mech(0, 0, 0);

/**
 * Locks, sleepers and bombs. At most one lock per level: the badges do not show which key opens which lock
 * (docs/POLISH.md L10). A new mechanic is first taught alone, then joins one learned before. Ordinary levels never
 * switch on all three; a level that has two of them gets no arrow tiles (see arrowsAllowed).
 */
export function mechanicsFor(chapter: number, level: number, role: Role): Mechanics {
  if (role === 'rest' || chapter === 1) return NONE;
  const slot = slotOf(level);
  // chapter 2's three peaks bring the first dynamite: a push budget on top of the knot (2026-11-06)
  if (chapter === 2) return slot === 't10' || slot === 't20' || slot === 'fin' ? mech(0, 0, 1) : NONE;
  const stageOne = role === 'intro' || slot === 's1a' || slot === 's1b';
  if (chapter === 3) return mech(1, 0, 0);
  if (chapter === 4) {
    if (stageOne) return mech(0, 1, 0);
    if (slot === 't10') return mech(0, 3, 0);
    if (slot === 's2a' || slot === 's2b') return mech(0, 2, 0);
    return mech(1, 2, 0); // tough 20, stage three and the finale: sleepers with a lock
  }
  if (chapter === 5) {
    if (stageOne) return mech(0, 0, 1);
    if (slot === 't10') return mech(0, 0, 3);
    if (slot === 's2a' || slot === 's2b') return mech(0, 0, 2);
    if (slot === 's3a' || slot === 's3b') return mech(1, 0, 1);
    return mech(1, 0, 2); // tough 20 and the finale: bombs with a lock
  }
  // chapter 6 brings the three back, two at a time
  if (role === 'intro') return [mech(1, 0, 0), mech(0, 1, 0), mech(0, 0, 1)][level % 3];
  if (slot === 's1a' || slot === 's1b' || slot === 't10') return mech(1, 1, 0);
  if (slot === 's2a' || slot === 't20') return mech(0, 1, 1);
  if (slot === 's2b') return mech(1, 0, 1);
  if (slot === 'fin') return mech(1, 1, 0);
  return [mech(1, 1, 0), mech(0, 1, 1), mech(1, 0, 1)][level % 3]; // stage three
}

/** Kinds among locks, sleepers and bombs that a level switches on. */
export const mechanicKinds = (x: Mechanics): number => [x.lockCount, x.sleepCount, x.bombCount].filter((c) => c > 0).length;

/**
 * Arrow tiles are an active element like hearts and each mechanic, and a level switches on at most three, hearts
 * included (generator design spec 2026-10-29). Hearts are on nearly every level, so a level with two mechanics leaves
 * arrows out.
 */
export const arrowsAllowed = (x: Mechanics): boolean => mechanicKinds(x) < 2;

/**
 * Crates are not counted as an active element (they block like any animal) but they cost room. Sleepers next to
 * crates on a plus board starve the generator (2026-11-03 probe: up to 98 builds a level), so such levels get none.
 */
export function cratesFor(base: number, board: Board, x: Mechanics): number {
  return board.shape === 'plus' && x.sleepCount > 0 ? 0 : base;
}

/**
 * Target share of the effective cells (playable cells minus crates and arrow tiles) that animals fill, by role.
 * Chapters 3-4 add 0.02 and 5-6 add 0.04, so boards fill up a little as the game goes on. Provisional values from the
 * 2026-11-03 measurements; intro and rest levels keep their own animal counts.
 */
const ORDINARY_OCCUPANCY = { early: 0.31, mid: 0.36, late: 0.35 } as const;
const PEAK_OCCUPANCY = { tough: 0.37, finale: 0.41 } as const;
const CHAPTER_OCCUPANCY_BONUS = [0, 0, 0.02, 0.02, 0.04, 0.04];

export function occupancyTarget(chapter: number, level: number, role: Role): number {
  const bonus = CHAPTER_OCCUPANCY_BONUS[chapter - 1];
  if (role === 'tough' || role === 'finale') return PEAK_OCCUPANCY[role] + bonus;
  const base = level < 10 ? ORDINARY_OCCUPANCY.early : level < 15 ? ORDINARY_OCCUPANCY.mid : ORDINARY_OCCUPANCY.late;
  return base + bonus;
}

/** Average cells per animal the generator ends up with (measured 1.92-2.11 at lengths 1-3, 1.46-1.55 at 1-2). */
export const averageLength = (maxLength: number): number => (maxLength >= 3 ? 2.05 : 1.5);

/** Floor for levels that combine two or more of crates, locks, sleepers and bombs: the fewest animals every tested combination generated with (2026-11-03). */
export const COMBINED_MIN_ANIMALS = 13;

/** Fewest animals the mechanics can be placed on: a lock takes two (the locked animal and its key carrier), plus one to spare. */
export function minAnimals(x: Mechanics, crates: number): number {
  const roles = 2 * x.lockCount + x.sleepCount + x.bombCount + 1;
  const combined = mechanicKinds(x) + (crates > 0 ? 1 : 0) >= 2;
  return combined ? Math.max(roles, COMBINED_MIN_ANIMALS) : roles;
}

export interface AnimalCount {
  playableCells: number;
  effectiveCells: number;
  count: number;
}

/** target animals = max(round(target occupancy x effective cells / average length), minimum for the mechanics) */
export function animalCount(board: Board, crates: number, arrows: number, occupancy: number, maxLength: number, x: Mechanics): AnimalCount {
  const playableCells = board.width * board.height - shapeVoids(board.shape, board.width, board.height).length;
  const effectiveCells = playableCells - crates - arrows;
  const count = Math.max(Math.round((occupancy * effectiveCells) / averageLength(maxLength)), minAnimals(x, crates));
  return { playableCells, effectiveCells, count };
}

/** Finale settings beyond its mechanics that make it the chapter's peak (all from the 2026-11-03 probes). */
export function finaleExtras(chapter: number): { initialFreeRatio?: [number, number] } {
  if (chapter === 2) return { initialFreeRatio: [0, 0.27] };
  if (chapter === 3) return { initialFreeRatio: [0, 0.2] };
  return {};
}

/** Tighter bomb fuse (the generator's default slack is 3) where bombs were too forgiving to reach the curve. */
export const TIGHT_BOMB_SLACK = 2;

/**
 * The chapter 5 finale and the ordinary levels of chapters 5 and 6 that carry bombs get TIGHT_BOMB_SLACK: in the
 * 2026-11-03 isolated experiment it lifted those ordinary levels by 10-14 fail points without changing their structure.
 * Tough 20 of chapter 5 (level 140) gets it too: with the default slack no candidate reached its target and it sat
 * barely above its stage (D2, 2026-11-05 experiment). Tough 10 of chapter 5 and the chapter 6 tough levels keep 3.
 */
export function bombSlackFor(chapter: number, level: number, role: Role, x: Mechanics): number | undefined {
  if (x.bombCount === 0) return undefined;
  if (role === 'finale' && chapter === 5) return TIGHT_BOMB_SLACK;
  if (role === 'tough' && chapter === 5 && level === 20) return TIGHT_BOMB_SLACK;
  if (role === 'ordinary' && chapter >= 5) return TIGHT_BOMB_SLACK;
  return undefined;
}

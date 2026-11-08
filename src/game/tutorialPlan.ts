import { peel, pickPush } from '../core/bump';
import { blockersOf, canExit, crateCracks, cratesInWay, isAsleep, lockedBy, piecesAround, traceExit } from '../core/rules';
import { nextTapToward } from '../solver/plan';
import type { Level, Piece } from '../core/types';
import { pickHint } from './hint';

/**
 * Which first-time tutorial a moment of play may show, and which animal it points at. Pure: main.ts asks, draws the
 * chick and lights the animal up, and records the id (in the old tip list's save key, same ids) only once the player did the
 * thing or skipped it. At most one tutorial per level.
 *
 * Start tutorials show as the level opens, on an animal that can leave right away: the first rule, the key, the
 * sleeper's neighbour, the way clear for a bomb. The one exception is the blocked animal (level 2, no hearts): it points
 * at an animal that cannot leave, so its tap shows the shake, and then lights up the animal in its way. The arrow
 * tutorial waits for its moment: an animal whose way out bends on an arrow becomes free. A tutorial with no animal it can point at is not forced: it waits for the next level where
 * it can. Hearts and crates teach themselves in play (the heart that pops, the crate that cracks).
 */
export type TutorialId = 'basic' | 'blocked' | 'arrow' | 'bump' | 'key' | 'sleep' | 'bomb' | 'crate' | 'crate2';
/**
 * Start tutorials, in the order a level is checked for them. The crate lessons (2026-11-07 playtest: "why did it
 * break?") hang on the first level with a one-crack crate (crate: the neighbour leaves, the crate goes) and the first
 * with a two-crack crate (crate2, 2026-11-08: the chick shows the crate and its neighbour cells, then the player plays
 * freely; an exit from a neighbour cell takes a dot, one from elsewhere changes nothing, and the lesson is learnt when
 * the crate breaks — main.ts runs that, crateLessonAt names the crate).
 */
export const START_TUTORIALS: readonly TutorialId[] = ['basic', 'blocked', 'crate', 'crate2', 'key', 'sleep', 'bomb'];
/** The level that teaches the blocked animal: hand-made with no hearts, so the shake costs nothing. */
export const BLOCKED_LEVEL = 2;

const key = (c: { x: number; y: number }): string => `${c.x},${c.y}`;
const free = (level: Level, alive: ReadonlySet<number>): number[] =>
  level.pieces.filter((p) => alive.has(p.id) && canExit(level, p.id, alive)).map((p) => p.id).sort((a, b) => a - b);

/** The ids of the pieces next to a piece, by shared cell edge. */
function neighbours(level: Level, piece: Piece): Set<number> {
  const at = new Map<string, number>();
  for (const p of level.pieces) for (const c of p.cells) at.set(key(c), p.id);
  const found = new Set<number>();
  for (const c of piece.cells) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const id = at.get(key({ x: c.x + dx, y: c.y + dy }));
      if (id !== undefined && id !== piece.id) found.add(id);
    }
  }
  return found;
}

/** The dynamite animals, the one closest to going off first. */
const bombsByFuse = (level: Level, alive: ReadonlySet<number>, fuses: Readonly<Record<number, number>>): Piece[] =>
  level.pieces.filter((p) => alive.has(p.id) && p.fuse !== undefined).sort((a, b) => (fuses[a.id] ?? a.fuse!) - (fuses[b.id] ?? b.fuse!) || a.id - b.id);

/** The dynamite the bomb lesson talks about when no tap leads to it: the one closest to going off. */
export function bombToWatch(level: Level, alive: ReadonlySet<number>, fuses: Readonly<Record<number, number>> = {}): number | null {
  return bombsByFuse(level, alive, fuses)[0]?.id ?? null;
}

/** Does this rule show up on the level at all? */
export function usesRule(level: Level, id: TutorialId): boolean {
  switch (id) {
    case 'basic': return true;
    case 'blocked': return true;
    case 'arrow': return (level.arrows?.length ?? 0) > 0;
    case 'bump': return peel(level, new Set(level.pieces.map((p) => p.id))).size > 0;
    case 'key': return level.pieces.some((p) => p.key !== undefined);
    case 'sleep': return level.pieces.some((p) => p.sleeping);
    case 'bomb': return level.pieces.some((p) => p.fuse !== undefined);
    case 'crate': return (level.crates ?? []).some((k) => k.hits === 1);
    case 'crate2': return (level.crates ?? []).some((k) => k.hits >= 2);
  }
}

/** Free animals standing next to a crate that `fits` (its cracks so far given), the crate's own order. */
function crateNeighbours(level: Level, alive: ReadonlySet<number>, fits: (hits: number, cracks: number) => boolean): number[] {
  const out: number[] = [];
  for (const k of level.crates ?? []) {
    if (!fits(k.hits, crateCracks(level, k, alive))) continue;
    for (const id of piecesAround(level, k.x, k.y)) if (alive.has(id) && canExit(level, id, alive) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** The crate the crate2 lesson is about: the first whole two-crack crate on the level, or null. */
export function crateLessonAt(level: Level, alive: ReadonlySet<number>): { x: number; y: number; hits: number } | null {
  const k = (level.crates ?? []).find((c) => c.hits >= 2 && crateCracks(level, c, alive) === 0);
  return k ? { x: k.x, y: k.y, hits: k.hits } : null;
}

/**
 * Animals a start tutorial may point at, most helpful first; every one can leave right now (the blocked tutorial's
 * cannot, by design). Empty when the rule is on the level but no such animal is there (the tutorial then waits for
 * another level).
 */
export function startTargets(level: Level, alive: ReadonlySet<number>, id: TutorialId, fuses: Readonly<Record<number, number>> = {}): number[] {
  const open = free(level, alive);
  const first = (ids: Iterable<number>): number[] => [...new Set(ids)].filter((i) => open.includes(i));
  switch (id) {
    case 'basic': {
      const best = pickHint(level, alive, fuses);
      return first([...(best === null ? [] : [best]), ...open]);
    }
    case 'blocked':
      // held only by animals, every one of which can leave now: the tap shakes it, and the one in front is the answer
      return level.pieces.filter((p) => {
        if (!alive.has(p.id) || open.includes(p.id) || !traceExit(level, p).reachesEdge) return false;
        if (lockedBy(level, p, alive) !== undefined || isAsleep(level, p, alive) || cratesInWay(level, p, alive).length) return false;
        return blockersOf(level, p, alive).every((b) => open.includes(b));
      }).map((p) => p.id);
    case 'key':
      // the key carrier goes first; a carrier that is blocked itself cannot be shown yet
      return first(level.pieces.filter((p) => alive.has(p.id) && p.key !== undefined && level.pieces.some((q) => alive.has(q.id) && q.lock === p.key)).map((p) => p.id));
    case 'sleep':
      // a free neighbour of a sleeper: its leaving wakes it
      return first(level.pieces.filter((p) => alive.has(p.id) && p.sleeping).flatMap((p) => [...neighbours(level, p)].filter((n) => alive.has(n))));
    case 'crate':
      // a free neighbour of a one-crack crate: its leaving breaks the crate
      return crateNeighbours(level, alive, (hits, cracks) => hits === 1 && cracks === 0);
    case 'crate2':
      return []; // no animal to point at: the lesson is on the crate (crateLessonAt), the player chooses
    case 'bomb':
      // the tap that gets the dynamite closest to going off nearer to leaving (the first free animal in its chain of
      // blockers); empty where the dynamite sits inside a knot with no such chain (level 40): main.ts then shows the
      // lesson on the dynamite itself with no tap to make (bombToWatch)
      return first(bombsByFuse(level, alive, fuses).map((b) => nextTapToward(level, alive, b.id)).filter((t): t is number => t !== null));
    default:
      return [];
  }
}

/**
 * The bump tutorial's moment: no animal can leave, and pushing this one (the first push of the best winning line)
 * untangles the knot. Empty while a free animal is left or the board is knotted for good.
 */
export function bumpTargets(level: Level, alive: ReadonlySet<number>, fuses: Readonly<Record<number, number>> = {}): number[] {
  if (alive.size === 0 || free(level, alive).length > 0) return [];
  const id = pickPush(level, alive, fuses);
  return id === null ? [] : [id];
}

/** Animals that can leave now and whose way out bends on an arrow tile (the arrow tutorial's moment). */
export function arrowTargets(level: Level, alive: ReadonlySet<number>): number[] {
  const arrows = new Set((level.arrows ?? []).map(key));
  if (!arrows.size) return [];
  return free(level, alive).filter((id) => traceExit(level, level.pieces.find((p) => p.id === id)!).cells.some((c) => arrows.has(key(c))));
}

/**
 * The start tutorial a level opens with, if any: the first start rule that is on the level and not learnt yet. The
 * first rule only teaches a newcomer: on level 1, or on any level for a save that has learnt nothing. The blocked
 * animal is taught on BLOCKED_LEVEL only: anywhere else a blocked tap may cost a heart.
 */
export function startTutorial(level: Level, seen: readonly string[], levelNumber: number): TutorialId | null {
  for (const id of START_TUTORIALS) {
    if (seen.includes(id) || !usesRule(level, id)) continue;
    if (id === 'basic' && levelNumber !== 1 && seen.length > 0) continue;
    if (id === 'blocked' && levelNumber !== BLOCKED_LEVEL) continue;
    return id;
  }
  return null;
}

/**
 * The animals a start tutorial's tap changes, for the moment after it: the locked animal the key opens, the sleeper
 * next to the tapped animal (it wakes), the bomb closest to going off (its way was cleared), the animals in the way of
 * the blocked one (what it shook against). Empty for other tutorials.
 */
export function resultSubjects(level: Level, id: TutorialId, target: number): number[] {
  const tapped = level.pieces.find((p) => p.id === target);
  if (!tapped) return [];
  if (id === 'blocked') return blockersOf(level, tapped, new Set(level.pieces.map((p) => p.id)));
  if (id === 'key') return level.pieces.filter((p) => p.lock !== undefined && p.lock === tapped.key).map((p) => p.id);
  if (id === 'sleep') return level.pieces.filter((p) => p.sleeping && neighbours(level, p).has(target)).map((p) => p.id);
  if (id === 'bomb') return level.pieces.filter((p) => p.fuse !== undefined && p.id !== target).sort((a, b) => a.fuse! - b.fuse! || a.id - b.id).slice(0, 1).map((p) => p.id);
  // the crate lesson: the animal the broken crate was holding
  if (id === 'crate') {
    const all = new Set(level.pieces.map((p) => p.id));
    const crates = (level.crates ?? []).filter((k) => piecesAround(level, k.x, k.y).includes(target));
    return level.pieces.filter((p) => p.id !== target && cratesInWay(level, p, all).some((k) => crates.includes(k))).map((p) => p.id);
  }
  return [];
}

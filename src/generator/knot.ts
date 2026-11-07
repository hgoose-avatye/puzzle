import { BOMB_PUSH_SLACK, bumpResult, gradeKnot, peel, type KnotGrade } from '../core/bump';
import type { Direction, Level, Piece } from '../core/types';

/**
 * Knots for the bump rule (core/bump.ts). The generator's reverse placement makes boards that peel: taking free animals
 * out one after another always clears them, so no push is ever needed. A knot leaves some animals blocking each other
 * once every free animal is out, so one of them must be pushed to the right spot. knotSearch.ts makes them (by
 * mutation and search, 2026-11-07); this file keeps what it builds on: the turned animal, the knot size and where a
 * dynamite goes.
 */

const FLIP: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** The piece facing the other way: a one-cell piece flips its direction, a longer one swaps head and tail. */
export const turned = (p: Piece): Piece => (p.cells.length > 1 ? { ...p, cells: [...p.cells].reverse() } : { ...p, dir: FLIP[p.dir!] });

/** Animals that must still be on the board once every free one is out, for the board to count as knotted. */
export const MIN_KNOT = 3;

/**
 * Where a dynamite earns its place (docs/rules.md 12): on a knotted 2-3 cell animal that wrong pushes run into while
 * the winning line leaves it alone. Along the line, at every decision, each possible push is read for the animal it
 * collides with (pushed or stopped against); a candidate scores the collisions of pushes that are not the line's (two
 * where that push knots the board for good, one otherwise), minus three for each collision the line itself makes. The fuse is the line's collisions plus BOMB_PUSH_SLACK.
 * Null when no knotted 2-3 cell animal is there.
 */
export function placeBombs(level: Level, grade: KnotGrade, count: number): Level | null {
  if (!grade.line) return null;
  const all = new Set(level.pieces.map((p) => p.id));
  const candidates = new Set(peel(level, all));
  for (const p of level.pieces) if (p.cells.length < 2 || p.sleeping || p.lock !== undefined || p.key !== undefined) candidates.delete(p.id);
  if (candidates.size < count) return null;
  const trap = new Map<number, number>();
  const onLine = new Map<number, number>();
  let lv = level;
  let al: ReadonlySet<number> = all;
  for (const m of grade.line) {
    if (m.kind === 'exit') { const next = new Set(al); next.delete(m.id); al = next; continue; }
    const rest = peel(lv, al);
    let chosen: ReturnType<typeof bumpResult> = null;
    for (const p of lv.pieces) {
      if (!rest.has(p.id)) continue;
      const b = bumpResult(lv, p, rest);
      if (!b) continue;
      const hits = [p.id, b.stopper].filter((id): id is number => id !== undefined && candidates.has(id));
      if (p.id === m.id) { chosen = b; for (const id of hits) onLine.set(id, (onLine.get(id) ?? 0) + 1); continue; }
      // a push off the line: worth two where it knots the board for good (the mistake the dynamite punishes), one otherwise
      const weight = gradeKnot(b.level, rest).guessWin === 0 ? 2 : 1;
      for (const id of hits) trap.set(id, (trap.get(id) ?? 0) + weight);
    }
    if (!chosen) return null;
    lv = chosen.level;
    al = rest;
  }
  const ranked = [...candidates].map((id) => ({ id, score: (trap.get(id) ?? 0) - 3 * (onLine.get(id) ?? 0) })).sort((a, b) => b.score - a.score || a.id - b.id);
  if (ranked[0].score <= 0) return null; // no wrong push would ever touch it: a dynamite there is only something more to read
  const chosen = new Map(ranked.slice(0, count).map(({ id }) => [id, (onLine.get(id) ?? 0) + BOMB_PUSH_SLACK]));
  return { ...level, pieces: level.pieces.map((p) => (chosen.has(p.id) ? { ...p, fuse: chosen.get(p.id) } : p)) };
}

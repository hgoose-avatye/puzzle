import { gradeKnot, type KnotGrade } from '../core/bump';
import type { Rng } from '../core/rng';
import { traceExit, validateLevel } from '../core/rules';
import type { Direction, Level, Piece } from '../core/types';
import { withoutIdleArrows } from './generate';

/**
 * Knots for the bump rule (core/bump.ts). The generator's reverse placement makes boards that peel: taking free animals
 * out one after another always clears them, so no push is ever needed. A knot turns a few animals around so that,
 * once every free animal is out, some are left blocking each other and one of them must be pushed to the right spot.
 * curve.ts asks for the variant nearest its aim (guessWin: the chance that pushing at random still clears the board).
 */

const FLIP: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** The piece facing the other way: a one-cell piece flips its direction, a longer one swaps head and tail. */
export const turned = (p: Piece): Piece => (p.cells.length > 1 ? { ...p, cells: [...p.cells].reverse() } : { ...p, dir: FLIP[p.dir!] });

/** Animals that must still be on the board once every free one is out, for the board to count as knotted. */
export const MIN_KNOT = 3;
/** Animals turned around per variant: one to three. */
const MAX_FLIPS = 3;

/**
 * Bomb fuses after a knot: a bomb counts pushes (core/game.ts), so its fuse is the pushes made before it leaves on the
 * grade's winning line, plus slack. The generator's slack (bombSlack, written for exits: 3, or 2 on tight levels)
 * becomes one push less: a push is a bigger decision than an exit. Null when a bomb never leaves on that line.
 */
function refuse(level: Level, grade: KnotGrade, slack: number): Level | null {
  const bombs = level.pieces.filter((p) => p.fuse !== undefined);
  if (!bombs.length) return level;
  if (!grade.line) return null;
  const fuses = new Map<number, number>();
  const pushSlack = Math.max(1, slack - 1);
  let pushes = 0;
  for (const m of grade.line) {
    if (m.kind === 'push') { pushes++; continue; }
    if (bombs.some((b) => b.id === m.id)) fuses.set(m.id, pushes + pushSlack);
  }
  if (fuses.size < bombs.length) return null;
  return { ...level, pieces: level.pieces.map((p) => (fuses.has(p.id) ? { ...p, fuse: fuses.get(p.id) } : p)) };
}

/**
 * Up to `tries` variants of `level` with one to three animals turned around; among those that are valid, knotted
 * (MIN_KNOT) and solvable, the one whose guessWin is nearest `aim`. Null when no variant qualifies.
 */
export function knotFrom(level: Level, rng: Rng, aim: number, tries: number, bombSlack = 3): { level: Level; grade: KnotGrade } | null {
  let best: { level: Level; grade: KnotGrade } | null = null;
  for (let t = 0; t < tries; t++) {
    const flips = 1 + rng.int(0, MAX_FLIPS - 1);
    const ids = new Set<number>();
    while (ids.size < Math.min(flips, level.pieces.length)) ids.add(level.pieces[rng.int(0, level.pieces.length - 1)].id);
    const variant: Level = { ...level, pieces: level.pieces.map((p) => (ids.has(p.id) ? turned(p) : p)) };
    if (validateLevel(variant).length) continue;
    // a crate must still stand on somebody's way out, or it is only something more to read
    const onPaths = new Set(variant.pieces.flatMap((p) => traceExit(variant, p).cells.map((c) => `${c.x},${c.y}`)));
    if ((variant.crates ?? []).some((k) => !onPaths.has(`${k.x},${k.y}`))) continue;
    const grade = gradeKnot(variant);
    if (grade.knot < MIN_KNOT || grade.solvable !== true) continue;
    const fused = refuse(variant, grade, bombSlack);
    if (!fused) continue;
    if (!best || Math.abs(grade.guessWin - aim) < Math.abs(best.grade.guessWin - aim)) best = { level: fused, grade };
  }
  // turned animals may leave an arrow tile that turns no one; dropping it changes no path, so the grade holds
  return best && { ...best, level: withoutIdleArrows(best.level) };
}

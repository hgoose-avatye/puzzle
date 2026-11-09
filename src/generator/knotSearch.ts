import { bumpResult, gradeKnot, peel, type KnotGrade } from '../core/bump';
import type { Rng } from '../core/rng';
import { canExit, directionVector, onBoard, traceExit, validateLevel } from '../core/rules';
import type { Cell, Direction, Level, Piece } from '../core/types';
import { withoutIdleArrows } from './generate';
import { MIN_KNOT, placeBombs, turned } from './knot';

/**
 * Knots by search (2026-11-06, replaces the random flips of knot.ts knotFrom). Random flips knot a board only rarely
 * (4-7 % of variants) and almost never deeply: in 400 variants of a chapter 5 board, none to two had two forced pushes.
 * So this file climbs: starting from the generator's board (which peels), it mutates one animal at a time (turn it
 * around, slide it, turn a one-cell animal, place it anew, lengthen or shorten it), grades every valid result and keeps
 * what comes nearer the shape the curve asks for (curve.ts shapeAt).
 *
 * The shape is structural, not the guessWin of before: that number never matched felt difficulty, because a player
 * with undo tries pushes instead of guessing once. What makes a board hard to a player who tries things:
 * - forced pushes (KnotGrade.keyMoves): decisions where one push out of three or more is the only good one;
 * - few winning lines (answers): a board with thirty answers clears by accident;
 * - hidden traps: a wrong push that leaves the board physically stuck at once is seen and undone for free; one after
 *   which animals still move costs the player moves and undos before it shows.
 */

export interface KnotShape {
  /** forced pushes the winning line should have */
  keyMoves: number;
  /** most winning push sequences */
  answersMax: number;
  /** fewest animals in the knot */
  knotMin: number;
  /** least chance that random pushes clear the board (rest levels: a knot that hardly fails) */
  guessWinMin?: number;
  /** true: a wrong push that leaves the board stuck at once is not held against the board (hidden traps earn nothing) */
  fairTraps?: boolean;
}

export interface KnotCandidate {
  level: Level;
  grade: KnotGrade;
  /** 0 when the shape is met; the distance from it otherwise */
  score: number;
  /** wrong pushes on the line's decisions that leave the board physically stuck at once, and wrong pushes in all */
  openTraps: number;
  traps: number;
}

/** Search budget of gradeKnot per candidate: enough for every shipped board, small enough to grade hundreds. */
const SEARCH_BUDGET = 8_000;
const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];
const key = (c: Cell): string => `${c.x},${c.y}`;

function fixtureKeys(level: Level): Set<string> {
  return new Set([...(level.obstacles ?? []), ...(level.arrows ?? []), ...(level.crates ?? [])].map(key));
}

function occupiedBy(level: Level, except: number): Set<string> {
  const taken = new Set<string>();
  for (const p of level.pieces) if (p.id !== except) for (const c of p.cells) taken.add(key(c));
  return taken;
}

/** The piece moved one cell in `dir`, or null where that leaves the board or lands on something. */
function slid(level: Level, piece: Piece, dir: Direction): Piece | null {
  const v = directionVector(dir);
  const cells = piece.cells.map((c) => ({ x: c.x + v.x, y: c.y + v.y }));
  const taken = occupiedBy(level, piece.id);
  const fixed = fixtureKeys(level);
  if (cells.some((c) => !onBoard(level, c.x, c.y) || taken.has(key(c)) || fixed.has(key(c)))) return null;
  return { ...piece, cells };
}

/** A fresh straight piece of 1-3 cells somewhere free, with the same id and badges; null after 30 misses. */
function placedAnew(level: Level, piece: Piece, rng: Rng, minLength: number, maxLength: number): Piece | null {
  const taken = occupiedBy(level, piece.id);
  const fixed = fixtureKeys(level);
  for (let t = 0; t < 30; t++) {
    const dir = DIRECTIONS[rng.int(0, 3)];
    const v = directionVector(dir);
    const length = rng.int(minLength, maxLength);
    const head = { x: rng.int(0, level.width - 1), y: rng.int(0, level.height - 1) };
    const cells: Cell[] = [];
    for (let k = 0; k < length; k++) cells.push({ x: head.x - v.x * k, y: head.y - v.y * k });
    if (cells.some((c) => !onBoard(level, c.x, c.y) || taken.has(key(c)) || fixed.has(key(c)))) continue;
    const { dir: _d, ...rest } = piece;
    return length === 1 ? { ...rest, cells, dir } : { ...rest, cells };
  }
  return null;
}

/** The piece one cell longer at the tail, or one shorter; null where that is not possible. */
function resized(level: Level, piece: Piece, longer: boolean, minLength: number, maxLength: number): Piece | null {
  const cells = piece.cells;
  if (longer) {
    if (cells.length >= maxLength) return null;
    const tail = cells[cells.length - 1];
    const prev = cells.length > 1 ? cells[cells.length - 2] : { x: tail.x + directionVector(piece.dir!).x, y: tail.y + directionVector(piece.dir!).y };
    const next = { x: tail.x + (tail.x - prev.x), y: tail.y + (tail.y - prev.y) };
    if (!onBoard(level, next.x, next.y) || occupiedBy(level, piece.id).has(key(next)) || fixtureKeys(level).has(key(next))) return null;
    const { dir: _d, ...rest } = piece;
    return { ...rest, cells: [...cells, next] };
  }
  if (cells.length <= Math.max(1, minLength)) return null;
  const shorter = cells.slice(0, -1);
  if (shorter.length === 1) {
    const dx = cells[0].x - cells[1].x;
    const dy = cells[0].y - cells[1].y;
    const dir: Direction = dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up';
    return { ...piece, cells: shorter, dir };
  }
  return { ...piece, cells: shorter };
}

/** One random change to one random animal; null when the draw made nothing. */
function mutated(level: Level, rng: Rng, minLength: number, maxLength: number): Level | null {
  const piece = level.pieces[rng.int(0, level.pieces.length - 1)];
  const roll = rng.int(0, 9);
  let next: Piece | null = null;
  if (roll < 3) next = turned(piece);
  else if (roll < 6) next = slid(level, piece, DIRECTIONS[rng.int(0, 3)]);
  else if (roll < 7 && piece.cells.length === 1) next = { ...piece, dir: DIRECTIONS[rng.int(0, 3)] };
  else if (roll < 9) next = placedAnew(level, piece, rng, minLength, maxLength);
  else next = resized(level, piece, rng.next() < 0.5, minLength, maxLength);
  if (!next) return null;
  return { ...level, pieces: level.pieces.map((p) => (p.id === piece.id ? next : p)) };
}

/** Valid, every crate on somebody's way out, every sleeper part of the knot; the knot itself. */
function knotOf(level: Level): Set<number> | null {
  if (validateLevel(level).length) return null;
  const onPaths = new Set(level.pieces.flatMap((p) => traceExit(level, p).cells.map(key)));
  if ((level.crates ?? []).some((k) => !onPaths.has(key(k)))) return null;
  const rest = peel(level, new Set(level.pieces.map((p) => p.id)));
  if (level.pieces.some((p) => p.sleeping && !rest.has(p.id))) return null;
  return rest;
}

/** Is the board physically stuck: animals are still on it, and none can leave or move? (An empty board is cleared, not stuck.) */
export function stuckAtOnce(level: Level, alive: ReadonlySet<number>): boolean {
  if (alive.size === 0) return false;
  for (const p of level.pieces) {
    if (!alive.has(p.id)) continue;
    if (canExit(level, p.id, alive)) return false;
    if (bumpResult(level, p, alive)) return false;
  }
  return true;
}

/**
 * Along the winning line, at every decision, the wrong pushes (those not on the line) and how many of them leave the
 * board physically stuck at once. A wrong push the player can see is a cheap one.
 */
export function countTraps(level: Level, grade: KnotGrade): { traps: number; openTraps: number } {
  let traps = 0;
  let openTraps = 0;
  if (!grade.line) return { traps, openTraps };
  let lv = level;
  let al: ReadonlySet<number> = new Set(level.pieces.map((p) => p.id));
  for (const m of grade.line) {
    if (m.kind === 'exit') { const next = new Set(al); next.delete(m.id); al = next; continue; }
    const rest = peel(lv, al);
    let chosen: Level | null = null;
    for (const p of lv.pieces) {
      if (!rest.has(p.id)) continue;
      const b = bumpResult(lv, p, rest);
      if (!b) continue;
      if (p.id === m.id) { chosen = b.level; continue; }
      traps++;
      if (stuckAtOnce(b.level, rest)) openTraps++;
    }
    if (!chosen) break;
    lv = chosen;
    al = rest;
  }
  return { traps, openTraps };
}

/** Distance of a graded board from the shape; 0 when it meets it. */
export function shapeScore(grade: KnotGrade, shape: KnotShape, openTraps: number, traps: number): number {
  if (grade.solvable !== true) return 1_000_000;
  let d = 0;
  d += 100 * Math.max(0, shape.keyMoves - grade.keyMoves);
  d += 30 * Math.max(0, grade.keyMoves - shape.keyMoves - 1);
  d += Math.max(0, grade.answers - shape.answersMax);
  d += 20 * Math.max(0, shape.knotMin - grade.knot);
  if (shape.guessWinMin !== undefined) d += Math.round(200 * Math.max(0, shape.guessWinMin - grade.guessWin));
  // a trap in plain sight is half a trap, unless the shape asks for fair traps (experiments/knot-small)
  if (!shape.fairTraps) d += traps ? Math.round((10 * openTraps) / traps) : 0;
  // the slope between two forced pushes: every decision on the line that is not yet forced counts its spare good
  // pushes and, more, its missing options (a knot with one answer and two options is a dead end for the climb), and a
  // line shorter than the forced pushes it needs counts its missing pushes
  if (shape.keyMoves > 0) {
    for (const { good, options } of grade.decisions) d += 4 * Math.max(0, good - 1) + 10 * Math.max(0, 3 - options);
    d += 15 * Math.max(0, shape.keyMoves + 1 - (grade.pushes?.length ?? 0));
  }
  return d;
}

/** A board on the climb: its score, and its candidate once it is a solvable knot. */
interface Step { level: Level; score: number; found?: KnotCandidate }

/**
 * A board that peels scores by how far it is from knotting (one or two animals left: nearly there). An unsolvable knot
 * scores worst of all: most knots are unsolvable (a cycle nobody can leave), and a walk among them rarely finds a way
 * out, so the climb stays on boards that peel or knots that can be solved.
 */
const PEELS = 20_000;
const UNSOLVABLE = 30_000;
/** added to the score of a knot whose dynamite could not be placed */
const UNARMED = 50;

function graded(level: Level, shape: KnotShape, budget: number): Step | null {
  const rest = knotOf(level);
  if (!rest) return null;
  if (rest.size < MIN_KNOT) return { level, score: PEELS + 100 * (MIN_KNOT - rest.size) };
  const grade = gradeKnot(level, undefined, budget);
  if (grade.solvable !== true) return { level, score: UNSOLVABLE };
  const { traps, openTraps } = countTraps(level, grade);
  return { level, score: shapeScore(grade, shape, openTraps, traps), found: { level, grade, score: shapeScore(grade, shape, openTraps, traps), traps, openTraps } };
}

export interface SearchOptions {
  /** graded candidates at most (invalid mutations do not count) */
  evals: number;
  minLength: number;
  maxLength: number;
  /** dynamite to place on the result (knot.ts placeBombs) */
  bombs?: number;
  /** what the climb went through, for tuning scripts */
  onStats?: (stats: Record<string, number>) => void;
}

/**
 * Climb from `base` towards `shape`: mutate the current board, keep a graded result that scores no worse, go back to
 * the best after a while without progress, stop at a score of 0. The best board gets its dynamite placed (the fuse
 * then counts the line's collisions) and is graded once more with the full budget. Null when no valid knot was found.
 */
export function searchKnot(base: Level, rng: Rng, shape: KnotShape, options: SearchOptions): KnotCandidate | null {
  const { evals, minLength, maxLength, bombs = 0 } = options;
  const origin: Step = graded(base, shape, SEARCH_BUDGET) ?? { level: base, score: Number.POSITIVE_INFINITY };
  let current: Step = origin;
  let best: Step = origin;
  let since = 0;
  const PATIENCE = 40;
  const stats = { draws: 0, nullMutation: 0, invalid: 0, peels: 0, unsolvable: 0, knots: 0, improved: 0 };
  // graded knots count towards `evals`; boards that peel are cheap and count a tenth
  for (let n = 0, draws = 0; n < evals && draws < evals * 50; draws++) {
    if (best.found && best.score === 0) break;
    stats.draws++;
    // a while without progress: back to the best solvable knot, or to the start when none was found yet (a walk among
    // unsolvable knots rarely finds a way out), with a bigger jump
    const kick = since >= PATIENCE;
    if (kick) { current = best.found ? best : origin; since = 0; }
    let next: Level | null = current.level;
    for (let k = 0, steps = kick ? 3 : 1 + rng.int(0, 1); k < steps && next; k++) next = mutated(next, rng, minLength, maxLength);
    if (!next) { stats.nullMutation++; continue; }
    const c = graded(next, shape, SEARCH_BUDGET);
    if (!c) { stats.invalid++; continue; }
    if (c.score >= UNSOLVABLE) stats.unsolvable++; else if (c.score >= PEELS) stats.peels++; else stats.knots++;
    if (c.score < best.score) stats.improved++;
    n += c.score >= UNSOLVABLE ? 0.5 : c.score >= PEELS ? 0.1 : 1;
    // annealed: a somewhat worse solvable knot is taken now and then, less so as the budget runs out
    const heat = 30 * (1 - n / evals) + 2;
    const worse = c.score - current.score;
    const take = worse <= 0 || (c.found !== undefined && current.found !== undefined && rng.next() < Math.exp(-worse / heat));
    if (take) { since = worse < 0 ? 0 : since + 1; current = c; }
    else since++;
    if (c.score < best.score) { best = c; since = 0; }
  }
  options.onStats?.({ ...stats, best: best.score });
  if (!best.found) return null;
  let level = withoutIdleArrows(best.level);
  // no knotted 2-3 cell animal that wrong pushes run into: the knot ships without its dynamite, and the pick script
  // prefers a seed that carries it (UNARMED)
  let unarmed = 0;
  if (bombs > 0) {
    const armed = placeBombs(level, best.found.grade, bombs);
    if (armed) level = armed;
    else unarmed = UNARMED;
  }
  const grade = gradeKnot(level);
  if (grade.solvable !== true) return null;
  const { traps, openTraps } = countTraps(level, grade);
  return { level, grade, score: shapeScore(grade, shape, openTraps, traps) + unarmed, traps, openTraps };
}

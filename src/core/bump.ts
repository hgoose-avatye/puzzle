import { canExit, crateCracks, crateStanding, isAsleep, lockedBy, traceExit } from './rules';
import type { Direction, Level, Piece } from './types';

/**
 * The bump rule (docs/rules.md 2, 2026-11-06): a blocked animal runs along its way out until the cell before whatever
 * stops it and stays there. The board changes, so the order of taps matters and a wrong push can knot the board.
 * Locked and sleeping animals do not move. Exits never hurt: taking a free animal out only opens ways.
 *
 * This file is pure: the rules state (game.ts) applies pushes, the generator (generator/knot.ts) grades boards and
 * the game (game/main.ts) asks whether a board can still be cleared.
 */

const key = (c: { x: number; y: number }): string => `${c.x},${c.y}`;

/**
 * Spare collisions on a dynamite's number (docs/rules.md 5): the collisions its level's winning line makes with it,
 * plus one. So a dynamite the line never touches shows 1 ("don't touch"); one the line bumps twice shows 3. With two
 * spare the dynamite hardly changed a level (2026-11-06: guessWin 0.62 -> 0.57); with one it does (0.37).
 */
export const BOMB_PUSH_SLACK = 1;

/** How many cells a blocked piece runs before it is stopped; 0 when it cannot move at all. */
export function bumpAdvance(level: Level, piece: Piece, alive: ReadonlySet<number>): number {
  if (lockedBy(level, piece, alive) !== undefined || isAsleep(level, piece, alive)) return 0;
  const taken = new Set<string>();
  for (const other of level.pieces) if (other.id !== piece.id && alive.has(other.id)) for (const c of other.cells) taken.add(key(c));
  for (const k of level.crates ?? []) if (crateStanding(level, k, alive)) taken.add(key(k));
  const ray = traceExit(level, piece).cells;
  let k = 0;
  while (k < ray.length && !taken.has(key(ray[k]))) k++;
  return k;
}

function stepDir(a: { x: number; y: number }, b: { x: number; y: number }): Direction {
  if (b.x > a.x) return 'right';
  if (b.x < a.x) return 'left';
  return b.y > a.y ? 'down' : 'up';
}

/** The piece moved `k` cells along its way out; the body follows the head's path. */
export function advancePiece(level: Level, piece: Piece, k: number): Piece {
  const chain = [...piece.cells].reverse().concat(traceExit(level, piece).cells);
  const head = piece.cells.length - 1 + k;
  const cells = [];
  for (let i = 0; i < piece.cells.length; i++) cells.push({ ...chain[head - i] });
  const tile = (level.arrows ?? []).find((a) => a.x === chain[head].x && a.y === chain[head].y);
  const dir = tile ? tile.dir : stepDir(chain[head - 1], chain[head]);
  return { ...piece, cells, dir };
}

/** The level with one piece replaced. */
export function withPiece(level: Level, piece: Piece): Level {
  return { ...level, pieces: level.pieces.map((p) => (p.id === piece.id ? piece : p)) };
}

/**
 * A blocked tap: the piece runs as far as it can. `stopper` is the animal it stops against (undefined for a crate, a
 * wall or an arrow it cannot take). Null when it does not move (locked, asleep, or stopped at once).
 */
export function bumpResult(level: Level, piece: Piece, alive: ReadonlySet<number>): { level: Level; moved: number; stopper?: number } | null {
  const moved = bumpAdvance(level, piece, alive);
  if (moved === 0) return null;
  const after = withPiece(level, advancePiece(level, piece, moved));
  const next = traceExit(after, after.pieces.find((p) => p.id === piece.id)!).cells[0];
  const stopper = next ? level.pieces.find((p) => p.id !== piece.id && alive.has(p.id) && p.cells.some((c) => c.x === next.x && c.y === next.y))?.id : undefined;
  return { level: after, moved, ...(stopper !== undefined ? { stopper } : {}) };
}

/**
 * The dynamite (docs/rules.md 5): a push burns a bomb's fuse when that bomb is in the collision, as the animal pushed
 * or as the one it stops against. Returns the fuses after the push and whether one went off.
 */
export function burnOnCollision(fuses: Readonly<Record<number, number>>, alive: ReadonlySet<number>, pushed: number, stopper: number | undefined): { fuses: Record<number, number>; exploded: boolean } {
  const next: Record<number, number> = { ...fuses };
  let exploded = false;
  for (const id of [pushed, stopper]) {
    if (id === undefined || next[id] === undefined || !alive.has(id)) continue;
    next[id] -= 1;
    if (next[id] <= 0) exploded = true;
  }
  return { fuses: next, exploded };
}

/**
 * Free animals out, one after another, until none can go: `order` is a tap order that works (each one can go when its
 * turn comes), `rest` what is left, the knot.
 */
export function peelSteps(level: Level, alive: ReadonlySet<number>): { rest: Set<number>; order: number[] } {
  const rest = new Set(alive);
  const order: number[] = [];
  for (let changed = true; changed;) {
    changed = false;
    for (const id of [...rest]) if (canExit(level, id, rest)) { rest.delete(id); order.push(id); changed = true; }
  }
  return { rest, order };
}

/** What is left once every free animal is out: the knot. */
export const peel = (level: Level, alive: ReadonlySet<number>): Set<number> => peelSteps(level, alive).rest;

/**
 * Where the animals still on the board stand, plus how cracked each crate is: two states that agree on both play out
 * the same from here, whichever animals left to get there (a crate's cracks come from which neighbours have left).
 */
const stateKey = (level: Level, alive: ReadonlySet<number>, fuses: Readonly<Record<number, number>> = {}): string =>
  level.pieces.filter((p) => alive.has(p.id)).map((p) => `${p.id}:${p.cells.map(key).join(';')}`).join('|')
  + '#' + (level.crates ?? []).map((k) => crateCracks(level, k, alive)).join(',')
  + '#' + Object.entries(fuses).filter(([id]) => alive.has(Number(id))).map(([id, f]) => `${id}=${f}`).join(',');

/** The fuses a level starts with (its bombs' numbers). */
export const startFuses = (level: Level): Record<number, number> => Object.fromEntries(level.pieces.filter((p) => p.fuse !== undefined).map((p) => [p.id, p.fuse!]));

export type BumpMove = { kind: 'exit' | 'push'; id: number };

/** How a board reads as a puzzle, from one search over the pushes a player can make after taking every free animal out. */
export interface KnotGrade {
  /** animals left once every free one is out at the start: 0 means the board peels with no push at all */
  knot: number;
  /** null: the search ran out of budget before it found a way */
  solvable: boolean | null;
  /** chance that a player who picks a push at random at every decision still clears the board (1 with no knot) */
  guessWin: number;
  /** winning push sequences, capped at ANSWER_CAP */
  answers: number;
  /** at the first decision: pushes that keep the board solvable, and pushes possible at all */
  firstGood: number;
  firstOptions: number;
  /** decisions on the best winning line where exactly one push out of three or more is right */
  keyMoves: number;
  /** one winning line, free exits included, in play order */
  line: BumpMove[] | null;
  /** the pushes of that line alone */
  pushes: number[] | null;
  /** at every decision of that line: pushes that keep the board solvable, and pushes possible at all */
  decisions: Decision[];
  nodes: number;
}

export interface Decision { good: number; options: number }

export const ANSWER_CAP = 200;
const GRADE_BUDGET = 40_000;

/** A state's search result; `pushes` is the best winning push sequence from here (exits are implied: peel first). */
interface Node { guessWin: number; answers: number; keyMoves: number; pushes: number[] | null; decisions: Decision[] }

/**
 * The full line for a push sequence from a state: the exits that peel at each step (in a tap order that works), then
 * the push, until the board is clear. Exits are rebuilt here rather than stored, because a memoised state can be
 * reached from different sets of animals already out.
 */
export function lineFor(level: Level, alive: ReadonlySet<number>, pushes: readonly number[]): BumpMove[] | null {
  const line: BumpMove[] = [];
  let lv = level;
  let al: ReadonlySet<number> = alive;
  for (let i = 0; ; i++) {
    const { rest, order } = peelSteps(lv, al);
    line.push(...order.map((id): BumpMove => ({ kind: 'exit', id })));
    if (rest.size === 0) return line;
    if (i >= pushes.length) return null;
    const piece = lv.pieces.find((p) => p.id === pushes[i]);
    const b = piece && bumpResult(lv, piece, rest);
    if (!b) return null;
    line.push({ kind: 'push', id: pushes[i] });
    lv = b.level;
    al = rest;
  }
}

/**
 * Grade a board: the player takes every free animal out (that never hurts), then must push one of the knotted
 * animals; each push is tried, states are memoised, and guessWin averages over every possible push (a push into a
 * dead end counts 0). Peel-first is the natural way to play and the line it finds is what the hint follows.
 */
export function gradeKnot(level: Level, alive: ReadonlySet<number> = new Set(level.pieces.map((p) => p.id)), budget = GRADE_BUDGET, fuses: Readonly<Record<number, number>> = startFuses(level)): KnotGrade {
  const memo = new Map<string, Node>();
  let nodes = 0;
  let over = false;
  let first: { good: number; options: number } | null = null;
  const go = (lv: Level, al: ReadonlySet<number>, fz: Readonly<Record<number, number>>, depth: number): Node => {
    const rest = peel(lv, al);
    if (rest.size === 0) return { guessWin: 1, answers: 1, keyMoves: 0, pushes: [], decisions: [] };
    const k = stateKey(lv, rest, fz);
    const seen = memo.get(k);
    if (seen) return seen;
    if (++nodes > budget) { over = true; return { guessWin: 0, answers: 0, keyMoves: 0, pushes: null, decisions: [] }; }
    // the memo entry goes in first so a loop back to this state reads as a dead end, not as endless recursion
    memo.set(k, { guessWin: 0, answers: 0, keyMoves: 0, pushes: null, decisions: [] });
    // every push a player could make; one that sets a bomb off is a dead end (it still counts as a choice)
    const options: Array<{ id: number; level: Level; fuses: Readonly<Record<number, number>>; dead: boolean }> = [];
    for (const p of lv.pieces) {
      if (!rest.has(p.id)) continue;
      const b = bumpResult(lv, p, rest);
      if (!b) continue;
      const burnt = burnOnCollision(fz, rest, p.id, b.stopper);
      options.push({ id: p.id, level: b.level, fuses: burnt.fuses, dead: burnt.exploded });
    }
    let sum = 0;
    let answers = 0;
    let good = 0;
    let best: { node: Node; id: number } | null = null;
    for (const o of options) {
      const child = o.dead ? { guessWin: 0, answers: 0, keyMoves: 0, pushes: null, decisions: [] } : go(o.level, rest, o.fuses, depth + 1);
      if (over) break;
      if (child.guessWin > 0) {
        good++;
        sum += child.guessWin;
        answers = Math.min(ANSWER_CAP, answers + child.answers);
        if (!best || child.keyMoves > best.node.keyMoves || (child.keyMoves === best.node.keyMoves && child.guessWin > best.node.guessWin)) best = { node: child, id: o.id };
      }
    }
    // a push that sets a dynamite off is no choice to a player who reads the number: forced pushes and decisions
    // count the live options only (guessWin keeps every option: it models pushing at random)
    const live = options.filter((o) => !o.dead).length;
    if (depth === 0) first = { good, options: live };
    const keyHere = good === 1 && live >= 3 ? 1 : 0;
    const node: Node = {
      guessWin: options.length ? sum / options.length : 0,
      answers,
      keyMoves: best ? best.node.keyMoves + keyHere : 0,
      pushes: best ? [best.id, ...(best.node.pushes ?? [])] : null,
      decisions: best ? [{ good, options: live }, ...best.node.decisions] : [],
    };
    memo.set(k, node);
    return node;
  };
  const root = go(level, alive, fuses, 0);
  const f = first ?? { good: 0, options: 0 };
  return {
    knot: peel(level, alive).size,
    solvable: root.guessWin > 0 ? true : over ? null : false,
    guessWin: root.guessWin,
    answers: root.answers,
    firstGood: f.good,
    firstOptions: f.options,
    keyMoves: root.keyMoves,
    line: root.pushes ? lineFor(level, alive, root.pushes) : null,
    pushes: root.pushes,
    decisions: root.decisions,
    nodes,
  };
}

const STUCK_BUDGET = 30_000;

/**
 * Can the board still be cleared from here? Unlike gradeKnot this also tries pushes before free animals are out (an
 * animal still on the board can be the stopper a push needs), so a "no" is final. Null when the search ran out.
 */
export function solvableBump(level: Level, alive: ReadonlySet<number>, budget = STUCK_BUDGET, fuses: Readonly<Record<number, number>> = startFuses(level)): boolean | null {
  // the natural line first: it is cheap and nearly always decides
  if (gradeKnot(level, alive, budget, fuses).solvable === true) return true;
  const memo = new Set<string>();
  let nodes = 0;
  const go = (lv: Level, al: ReadonlySet<number>, fz: Readonly<Record<number, number>>): boolean | null => {
    if (al.size === 0) return true;
    const k = stateKey(lv, al, fz);
    if (memo.has(k)) return false;
    memo.add(k);
    if (++nodes > budget) return null;
    let unknown = false;
    for (const id of al) {
      if (!canExit(lv, id, al)) continue;
      const next = new Set(al);
      next.delete(id);
      const r = go(lv, next, fz);
      if (r) return true;
      if (r === null) unknown = true;
    }
    for (const p of lv.pieces) {
      if (!al.has(p.id) || canExit(lv, p.id, al)) continue;
      const b = bumpResult(lv, p, al);
      if (!b) continue;
      const burnt = burnOnCollision(fz, al, p.id, b.stopper);
      if (burnt.exploded) continue;
      const r = go(b.level, al, burnt.fuses);
      if (r) return true;
      if (r === null) unknown = true;
    }
    return unknown ? null : false;
  };
  return go(level, alive, fuses);
}

/**
 * The push to suggest when no animal can go: the first push of the best winning line, or null when the board is
 * knotted for good (or too big to search).
 */
export function pickPush(level: Level, alive: ReadonlySet<number>, fuses: Readonly<Record<number, number>> = startFuses(level)): number | null {
  const push = gradeKnot(level, alive, GRADE_BUDGET, fuses).line?.find((m) => m.kind === 'push');
  return push ? push.id : null;
}

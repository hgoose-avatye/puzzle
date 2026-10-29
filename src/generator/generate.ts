import type { Rng } from '../core/rng';
import { directionVector, traceExit } from '../core/rules';
import type { ArrowTile, Cell, Direction, Level, Piece } from '../core/types';
import { computeMetrics, type Metrics } from '../solver/metrics';
import { tapsToExit } from '../solver/plan';

export interface GenParams {
  width: number;
  height: number;
  pieceCount: number;
  minLength: number;
  maxLength: number;
  /** Cells nothing can pass through (default 0). */
  obstacleCount?: number;
  /** Direction tiles that bend exit paths (default 0). */
  arrowCount?: number;
  /** Locked pieces; each gets a key carrier that leaves earlier (default 0). */
  lockCount?: number;
  /** Sleeping pieces; each has an adjacent piece that leaves earlier (default 0). */
  sleepCount?: number;
  /** Bomb pieces; fuse = taps needed to free them + slack (default 0). */
  bombCount?: number;
  /** Extra taps added to each bomb's fuse (default 3). */
  bombSlack?: number;
}

export interface DifficultyTarget {
  rounds?: [number, number];
  initialFreeRatio?: [number, number];
  avgBlockers?: [number, number];
  surge?: [number, number];
}

const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];
const SAMPLES = 40;
const DRAWS_PER_PIECE = 400;
const key = (c: Cell): string => `${c.x},${c.y}`;

/**
 * Reverse placement: pieces are placed in reverse exit order. A new piece's exit ray must not touch any
 * piece already placed, so every dependency points from an earlier-placed piece to a later-placed one
 * and the level is solvable by construction.
 */
function buildOnce(params: GenParams, rng: Rng): Level | null {
  const fixed = new Set<string>();
  const obstacles: Cell[] = [];
  const arrows: ArrowTile[] = [];
  const pickFree = (): Cell | null => {
    for (let t = 0; t < 50; t++) {
      const cell = { x: rng.int(0, params.width - 1), y: rng.int(0, params.height - 1) };
      if (!fixed.has(key(cell))) { fixed.add(key(cell)); return cell; }
    }
    return null;
  };
  for (let i = 0; i < (params.obstacleCount ?? 0); i++) {
    const cell = pickFree();
    if (!cell) return null;
    obstacles.push(cell);
  }
  for (let i = 0; i < (params.arrowCount ?? 0); i++) {
    const cell = pickFree();
    if (!cell) return null;
    arrows.push({ ...cell, dir: DIRECTIONS[rng.int(0, 3)] });
  }
  const arrowKeys = new Set(arrows.map((a) => key(a)));
  const board: Level = { width: params.width, height: params.height, pieces: [], obstacles, arrows };
  const occupied = new Set<string>();
  const rays: Set<string>[] = [];
  for (let i = 0; i < params.pieceCount; i++) {
    let best: { piece: Piece; ray: Set<string>; score: number } | null = null;
    let valid = 0;
    for (let draw = 0; draw < DRAWS_PER_PIECE && valid < SAMPLES; draw++) {
      const dir = DIRECTIONS[rng.int(0, 3)];
      const v = directionVector(dir);
      const length = rng.int(params.minLength, params.maxLength);
      const head: Cell = { x: rng.int(0, params.width - 1), y: rng.int(0, params.height - 1) };
      const cells: Cell[] = [];
      for (let k = 0; k < length; k++) cells.push({ x: head.x - v.x * k, y: head.y - v.y * k });
      if (cells.some((c) => c.x < 0 || c.y < 0 || c.x >= params.width || c.y >= params.height)) continue;
      if (cells.some((c) => occupied.has(key(c)) || fixed.has(key(c)))) continue;
      const piece: Piece = length === 1 ? { id: i + 1, cells, dir } : { id: i + 1, cells };
      const trace = traceExit(board, piece);
      if (!trace.reachesEdge) continue;
      const ray = new Set(trace.cells.map(key));
      if ([...ray].some((k) => occupied.has(k))) continue;
      valid++;
      const hitsLast = rays.length > 0 && cells.some((c) => rays[rays.length - 1].has(key(c)));
      const bends = trace.cells.some((c) => arrowKeys.has(key(c)));
      const score = (hitsLast ? 100 : 0) + (bends ? 50 : 0) + rays.filter((r) => cells.some((c) => r.has(key(c)))).length;
      if (!best || score > best.score) best = { piece, ray, score };
    }
    if (!best) return null;
    board.pieces.push(best.piece);
    rays.push(best.ray);
    for (const c of best.piece.cells) occupied.add(key(c));
  }
  // Roles are only given along placement order (earlier-placed pieces leave later), so every new
  // dependency points the same way as the blocking dependencies and the level stays solvable.
  const list = board.pieces;
  const n = list.length;
  const used = new Set<number>();
  const take = (candidates: number[]): number | null => {
    const free = candidates.filter((i) => !used.has(i));
    if (free.length === 0) return null;
    const pick = free[rng.int(0, free.length - 1)];
    used.add(pick);
    return pick;
  };
  const indexAt = new Map<string, number>();
  list.forEach((p, i) => p.cells.forEach((c) => indexAt.set(key(c), i)));
  const adjacentTo = (i: number): number[] => {
    const found = new Set<number>();
    for (const c of list[i].cells) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = indexAt.get(key({ x: c.x + dx, y: c.y + dy }));
        if (j !== undefined && j !== i) found.add(j);
      }
    }
    return [...found];
  };
  const all = list.map((_, i) => i);
  for (let t = 0; t < (params.lockCount ?? 0); t++) {
    const locked = take(all.filter((i) => i < n - 1));
    if (locked === null) return null;
    const keyer = take(all.filter((j) => j > locked));
    if (keyer === null) return null;
    list[locked] = { ...list[locked], lock: t + 1 };
    list[keyer] = { ...list[keyer], key: t + 1 };
  }
  for (let t = 0; t < (params.sleepCount ?? 0); t++) {
    const sleeper = take(all.filter((i) => adjacentTo(i).some((j) => j > i)));
    if (sleeper === null) return null;
    list[sleeper] = { ...list[sleeper], sleeping: true };
  }
  // Hide placement order: shuffle array order and reassign ids randomly.
  const ids = board.pieces.map((_, idx) => idx + 1);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const pieces = board.pieces.map((p, idx) => ({ ...p, id: ids[idx] }));
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  const level: Level = {
    width: params.width,
    height: params.height,
    pieces,
    ...(obstacles.length > 0 ? { obstacles } : {}),
    ...(arrows.length > 0 ? { arrows } : {}),
  };
  const bombCount = params.bombCount ?? 0;
  if (bombCount > 0) {
    const pool = level.pieces.filter((p) => p.lock === undefined && p.key === undefined && !p.sleeping).map((p) => p.id);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    if (pool.length < bombCount) return null;
    const chosen = new Set(pool.slice(0, bombCount));
    const fuses = new Map<number, number>();
    for (const id of chosen) {
      const taps = tapsToExit(level, id);
      if (taps === null) return null;
      fuses.set(id, taps + (params.bombSlack ?? 3));
    }
    level.pieces = level.pieces.map((p) => (fuses.has(p.id) ? { ...p, fuse: fuses.get(p.id) } : p));
  }
  return level;
}

export function generateLevel(params: GenParams, rng: Rng, maxAttempts = 200): Level | null {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const level = buildOnce(params, rng);
    if (level) return level;
  }
  return null;
}

const within = (value: number, range?: [number, number]): boolean =>
  range === undefined || (value >= range[0] && value <= range[1]);

export function generateMatching(
  params: GenParams,
  target: DifficultyTarget,
  rng: Rng,
  maxCandidates = 200,
): { level: Level; metrics: Metrics } | null {
  for (let i = 0; i < maxCandidates; i++) {
    const level = generateLevel(params, rng);
    if (!level) return null;
    const metrics = computeMetrics(level);
    if (
      within(metrics.rounds, target.rounds) &&
      within(metrics.initialFreeRatio, target.initialFreeRatio) &&
      within(metrics.avgBlockers, target.avgBlockers) &&
      within(metrics.surge, target.surge)
    ) {
      return { level, metrics };
    }
  }
  return null;
}

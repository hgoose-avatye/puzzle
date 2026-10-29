import type { Rng } from '../core/rng';
import { directionVector, exitRay } from '../core/rules';
import type { Cell, Direction, Level, Piece } from '../core/types';
import { computeMetrics, type Metrics } from '../solver/metrics';

export interface GenParams {
  width: number;
  height: number;
  pieceCount: number;
  minLength: number;
  maxLength: number;
}

export interface DifficultyTarget {
  rounds?: [number, number];
  initialFreeRatio?: [number, number];
  avgBlockers?: [number, number];
  surge?: [number, number];
}

const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];
const SAMPLES = 8;
const DRAWS_PER_PIECE = 60;
const key = (c: Cell): string => `${c.x},${c.y}`;

/**
 * Reverse placement: pieces are placed in reverse exit order. A new piece's exit ray must not touch any
 * piece already placed, so every dependency points from an earlier-placed piece to a later-placed one
 * and the level is solvable by construction.
 */
function buildOnce(params: GenParams, rng: Rng): Level | null {
  const board: Level = { width: params.width, height: params.height, pieces: [] };
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
      if (cells.some((c) => occupied.has(key(c)))) continue;
      const piece: Piece = { id: i + 1, cells };
      const ray = new Set(exitRay(board, piece).map(key));
      if ([...ray].some((k) => occupied.has(k))) continue;
      valid++;
      const score = rays.filter((r) => cells.some((c) => r.has(key(c)))).length;
      if (!best || score > best.score) best = { piece, ray, score };
    }
    if (!best) return null;
    board.pieces.push(best.piece);
    rays.push(best.ray);
    for (const c of best.piece.cells) occupied.add(key(c));
  }
  // Hide placement order: shuffle array order and reassign ids randomly.
  const ids = board.pieces.map((_, idx) => idx + 1);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const pieces = board.pieces.map((p, idx) => ({ id: ids[idx], cells: p.cells }));
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  return { width: params.width, height: params.height, pieces };
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

/**
 * The game's escape rules and run track, re-implemented for this experiment (the game itself is read-only here).
 * Same behaviour as src/core/rules.ts (traceExit, blockersOf, canExit, tap), src/game/path.ts (exitPath) and
 * src/game/smooth.ts (smoothPath, trackAt); tools/rules.compare.ts checks this against the originals on generated levels.
 * Out of scope for this experiment (no such fixtures in its scenes): crates, keys and locks, sleeping animals, bombs.
 */
export type Direction = 'up' | 'down' | 'left' | 'right';
export interface Cell { x: number; y: number }
export interface Piece { id: number; cells: Cell[]; dir?: Direction }
export interface ArrowTile { x: number; y: number; dir: Direction }
export interface Level { width: number; height: number; pieces: Piece[]; voids?: Cell[]; obstacles?: Cell[]; arrows?: ArrowTile[] }

export const VECTORS: Record<Direction, Cell> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const key = (x: number, y: number): string => `${x},${y}`;

/** cells[0] is the head; it faces away from cells[1]. A one-cell piece carries `dir`. */
export function headDirection(piece: Piece): Direction {
  if (piece.cells.length === 1) {
    if (!piece.dir) throw new Error(`piece ${piece.id}: a one-cell piece needs dir`);
    return piece.dir;
  }
  const dx = piece.cells[0].x - piece.cells[1].x;
  const dy = piece.cells[0].y - piece.cells[1].y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) throw new Error(`piece ${piece.id}: head and next cell are not adjacent`);
  if (dx === 1) return 'right';
  if (dx === -1) return 'left';
  return dy === 1 ? 'down' : 'up';
}

export const onBoard = (level: Level, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < level.width && y < level.height && !(level.voids ?? []).some((c) => c.x === x && c.y === y);

export interface ExitTrace {
  /** Cells passed after the head, in order, up to the edge (or the wall that stops it). */
  cells: Cell[];
  endDir: Direction;
  /** False when an obstacle, a facing arrow or an arrow loop stops the piece for good. */
  reachesEdge: boolean;
}

export function traceExit(level: Level, piece: Piece): ExitTrace {
  const obstacles = new Set((level.obstacles ?? []).map((c) => key(c.x, c.y)));
  const arrows = new Map((level.arrows ?? []).map((a) => [key(a.x, a.y), a.dir] as const));
  let dir = headDirection(piece);
  let { x, y } = piece.cells[0];
  const cells: Cell[] = [];
  const seen = new Set<string>();
  for (;;) {
    x += VECTORS[dir].x;
    y += VECTORS[dir].y;
    if (!onBoard(level, x, y)) return { cells, endDir: dir, reachesEdge: true };
    if (obstacles.has(key(x, y))) return { cells, endDir: dir, reachesEdge: false };
    const tile = arrows.get(key(x, y));
    if (tile) {
      if (tile === OPPOSITE[dir]) return { cells, endDir: dir, reachesEdge: false };
      dir = tile;
    }
    const state = `${key(x, y)},${dir}`;
    if (seen.has(state)) return { cells, endDir: dir, reachesEdge: false };
    seen.add(state);
    cells.push({ x, y });
  }
}

/** Other animals still on the board that stand on this piece's way out. */
export function blockersOf(level: Level, piece: Piece, alive: ReadonlySet<number>): number[] {
  const owner = new Map<string, number>();
  for (const other of level.pieces) {
    if (other.id === piece.id || !alive.has(other.id)) continue;
    for (const c of other.cells) owner.set(key(c.x, c.y), other.id);
  }
  const found = new Set<number>();
  for (const c of traceExit(level, piece).cells) {
    const id = owner.get(key(c.x, c.y));
    if (id !== undefined) found.add(id);
  }
  return [...found].sort((a, b) => a - b);
}

export const canExit = (level: Level, id: number, alive: ReadonlySet<number>): boolean => {
  const piece = level.pieces.find((q) => q.id === id);
  return piece !== undefined && traceExit(level, piece).reachesEdge && blockersOf(level, piece, alive).length === 0;
};

export interface GameState { level: Level; alive: Set<number>; hearts: number; taps: number }
export type TapEvent = { type: 'exited'; id: number } | { type: 'blocked'; id: number; blockers: number[]; wall: boolean } | { type: 'ignored'; id: number };

/** One tap, decided at once (core/game.ts tap): out if the way is clear, otherwise a blocked tap that costs a heart. */
export function tap(state: GameState, id: number): { state: GameState; event: TapEvent } {
  const piece = state.level.pieces.find((p) => p.id === id);
  if (!piece || !state.alive.has(id) || state.hearts <= 0) return { state, event: { type: 'ignored', id } };
  if (!canExit(state.level, id, state.alive)) {
    const blockers = blockersOf(state.level, piece, state.alive);
    return {
      state: { ...state, taps: state.taps + 1, hearts: state.hearts - 1 },
      event: { type: 'blocked', id, blockers, wall: !traceExit(state.level, piece).reachesEdge },
    };
  }
  const alive = new Set(state.alive);
  alive.delete(id);
  return { state: { ...state, alive, taps: state.taps + 1 }, event: { type: 'exited', id } };
}

// ---------------------------------------------------------------- run track (game/path.ts, game/smooth.ts, game/flow.ts)

export interface Pt { x: number; y: number }
export interface Track { pts: Pt[]; cum: number[]; length: number; vertexU: number[] }

/** Body tail to head, then the traced way out, then `extra` cells past the edge so the whole body can leave. */
export function exitPath(level: Level, piece: Piece, extra = piece.cells.length + 2): Pt[] {
  const trace = traceExit(level, piece);
  const pts: Pt[] = [...piece.cells].reverse().map((c) => ({ x: c.x, y: c.y }));
  pts.push(...trace.cells.map((c) => ({ x: c.x, y: c.y })));
  const v = VECTORS[trace.endDir];
  const last = pts[pts.length - 1];
  for (let k = 1; k <= extra; k++) pts.push({ x: last.x + v.x * k, y: last.y + v.y * k });
  return pts;
}

const ARC_STEPS = 10;
/** Radius of the bend where a run turns on an arrow tile, in cells (game/flow.ts CORNER_RADIUS). */
export const CORNER_RADIUS = 0.3;

/** Rounds every 90° corner with a quarter circle; positions are arc lengths of the rounded path. */
export function smoothPath(path: Pt[], radius = CORNER_RADIUS): Track {
  const pts: Pt[] = [{ ...path[0] }];
  const vertexPoint: number[] = [0];
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1], p = path[i], b = path[i + 1];
    const inX = Math.sign(p.x - a.x), inY = Math.sign(p.y - a.y);
    const outX = Math.sign(b.x - p.x), outY = Math.sign(b.y - p.y);
    if (inX * outX + inY * outY !== 0) {
      pts.push({ ...p });
      vertexPoint.push(pts.length - 1);
      continue;
    }
    const r = Math.min(radius, Math.hypot(p.x - a.x, p.y - a.y) / 2, Math.hypot(b.x - p.x, b.y - p.y) / 2);
    const entry = { x: p.x - inX * r, y: p.y - inY * r };
    const exit = { x: p.x + outX * r, y: p.y + outY * r };
    const centre = { x: entry.x + outX * r, y: entry.y + outY * r };
    const a0 = Math.atan2(entry.y - centre.y, entry.x - centre.x);
    let delta = Math.atan2(exit.y - centre.y, exit.x - centre.x) - a0;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    const first = pts.length;
    for (let k = 0; k <= ARC_STEPS; k++) {
      const t = a0 + (delta * k) / ARC_STEPS;
      pts.push({ x: centre.x + Math.cos(t) * r, y: centre.y + Math.sin(t) * r });
    }
    vertexPoint.push(first + ARC_STEPS / 2);
  }
  pts.push({ ...path[path.length - 1] });
  vertexPoint.push(pts.length - 1);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, cum, length: cum[cum.length - 1], vertexU: vertexPoint.map((i) => cum[i]) };
}

/** Position and heading (angle = atan2(dx, dy): 0 = down the screen, π/2 = right) at arc length u; straight past both ends. */
export function trackAt(track: Track, u: number): Pt & { angle: number } {
  const { pts, cum } = track;
  const clamped = Math.max(0, Math.min(track.length, u));
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= clamped) lo = mid;
    else hi = mid;
  }
  const a = pts[lo], b = pts[lo + 1];
  const seg = cum[lo + 1] - cum[lo] || 1;
  const over = u - clamped;
  const t = (clamped - cum[lo]) / seg;
  return { x: a.x + (b.x - a.x) * t + ((b.x - a.x) / seg) * over, y: a.y + (b.y - a.y) * t + ((b.y - a.y) / seg) * over, angle: Math.atan2(b.x - a.x, b.y - a.y) };
}

/** The run line of a piece and where its head starts on it (game/flow.ts routeOf). */
export function routeOf(level: Level, piece: Piece): { track: Track; headStart: number } {
  const track = smoothPath(exitPath(level, piece));
  return { track, headStart: track.vertexU[piece.cells.length - 1] };
}

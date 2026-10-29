import type { GameState } from '../src/core/game';
import { blockersOf, directionVector, exitCell, exitDirection, headDirection, lockedBy } from '../src/core/rules';
import type { Direction, Piece } from '../src/core/types';

export type Style = 'arrows' | 'blocks';

export interface Flash {
  id: number;
  kind: 'blocked' | 'exited';
}

export const pieceColor = (id: number): string => `hsl(${(id * 47) % 360} 70% 55%)`;

const marginFor = (cell: number): number => Math.round(cell * 0.6);

/** Largest cell (24..56px) that lets the board plus its gate margins fit `available` px. */
export function computeCell(boardWidth: number, available: number): number {
  return Math.max(24, Math.min(56, Math.floor(available / (boardWidth + 1.2))));
}

export function canvasSize(state: GameState, cell: number): { width: number; height: number } {
  const m = marginFor(cell);
  return { width: state.level.width * cell + m * 2, height: state.level.height * cell + m * 2 };
}

const center = (cell: number, x: number, y: number): { x: number; y: number } => {
  const m = marginFor(cell);
  return { x: m + x * cell + cell / 2, y: m + y * cell + cell / 2 };
};

/** Id of the nearest alive piece within a forgiving radius of the pointer, if any. */
export function hitTest(state: GameState, px: number, py: number, cell: number): number | undefined {
  let best: { id: number; d: number } | undefined;
  for (const piece of state.level.pieces) {
    if (!state.alive.has(piece.id)) continue;
    const pts = piece.cells.map((c) => center(cell, c.x, c.y));
    let d = Infinity;
    for (let i = 0; i < pts.length; i++) {
      d = Math.min(d, i === 0 ? dist(px, py, pts[0]) : segDist(px, py, pts[i - 1], pts[i]));
    }
    if (d <= cell * 0.75 && (!best || d < best.d)) best = { id: piece.id, d };
  }
  return best?.id;
}

const dist = (px: number, py: number, a: { x: number; y: number }): number => Math.hypot(px - a.x, py - a.y);
function segDist(px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

export function render(canvas: HTMLCanvasElement, state: GameState, cell: number, style: Style, flash?: Flash): void {
  const { width, height } = canvasSize(state, cell);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { level } = state;
  const m = marginFor(cell);
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#e4ded3';
  for (let x = 0; x <= level.width; x++) line(ctx, m + x * cell, m, m + x * cell, m + level.height * cell);
  for (let y = 0; y <= level.height; y++) line(ctx, m, m + y * cell, m + level.width * cell, m + y * cell);

  for (const o of level.obstacles ?? []) drawObstacle(ctx, o.x, o.y, cell);
  for (const a of level.arrows ?? []) drawArrowTile(ctx, a.x, a.y, a.dir, cell);

  const highlighted = new Set<number>();
  if (flash?.kind === 'blocked') {
    const piece = level.pieces.find((p) => p.id === flash.id);
    if (piece) {
      highlighted.add(piece.id);
      for (const id of blockersOf(level, piece, state.alive)) highlighted.add(id);
      const key = lockedBy(level, piece, state.alive);
      if (key !== undefined) highlighted.add(key);
    }
  }

  for (const piece of level.pieces) {
    if (!state.alive.has(piece.id)) continue;
    const color = pieceColor(piece.id);
    drawGate(ctx, state, piece, color, cell);
    if (style === 'arrows') drawArrow(ctx, piece, color, cell, highlighted.has(piece.id));
    else drawBlocks(ctx, piece, color, cell, highlighted.has(piece.id));
    drawBadges(ctx, state, piece, cell);
  }
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawArrow(ctx: CanvasRenderingContext2D, piece: Piece, color: string, cell: number, hot: boolean): void {
  const pts = piece.cells.map((c) => center(cell, c.x, c.y));
  const trace = (): void => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pts.length > 1) {
    if (hot) { ctx.strokeStyle = '#d22'; ctx.lineWidth = cell * 0.62; trace(); ctx.stroke(); }
    ctx.strokeStyle = color;
    ctx.lineWidth = cell * 0.46;
    trace();
    ctx.stroke();
  }
  const v = directionVector(headDirection(piece));
  const h = pts[0];
  const tip = { x: h.x + v.x * cell * 0.52, y: h.y + v.y * cell * 0.52 };
  const back = { x: h.x - v.x * cell * 0.12, y: h.y - v.y * cell * 0.12 };
  const w = cell * 0.4;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(back.x + v.y * w, back.y - v.x * w);
  ctx.lineTo(back.x - v.y * w, back.y + v.x * w);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = hot ? 3 : 1.5;
  ctx.strokeStyle = hot ? '#d22' : 'rgba(0,0,0,0.35)';
  ctx.stroke();
  ctx.lineWidth = 1;
}

function drawBlocks(ctx: CanvasRenderingContext2D, piece: Piece, color: string, cell: number, hot: boolean): void {
  const m = marginFor(cell);
  ctx.fillStyle = color;
  for (const c of piece.cells) ctx.fillRect(m + c.x * cell + 3, m + c.y * cell + 3, cell - 6, cell - 6);
  const v = directionVector(headDirection(piece));
  const h = center(cell, piece.cells[0].x, piece.cells[0].y);
  const r = cell * 0.28;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(h.x + v.x * r, h.y + v.y * r);
  ctx.lineTo(h.x - v.x * r + v.y * r, h.y - v.y * r + v.x * r);
  ctx.lineTo(h.x - v.x * r - v.y * r, h.y - v.y * r - v.x * r);
  ctx.closePath();
  ctx.fill();
  if (hot) {
    ctx.strokeStyle = '#d22';
    ctx.lineWidth = 3;
    for (const c of piece.cells) ctx.strokeRect(m + c.x * cell + 1.5, m + c.y * cell + 1.5, cell - 3, cell - 3);
    ctx.lineWidth = 1;
  }
}

function drawBadges(ctx: CanvasRenderingContext2D, state: GameState, piece: Piece, cell: number): void {
  const badges: string[] = [];
  if (piece.key !== undefined) badges.push('🔑');
  if (piece.lock !== undefined) badges.push('🔒');
  if (piece.sleeping) badges.push('💤');
  if (piece.fuse !== undefined) badges.push('💣');
  if (badges.length === 0) return;
  const mid = piece.cells[Math.floor((piece.cells.length - 1) / 2)];
  const c = center(cell, mid.x, mid.y);
  ctx.font = `${Math.round(cell * 0.5)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  badges.forEach((b, i) => ctx.fillText(b, c.x + (i - (badges.length - 1) / 2) * cell * 0.45, c.y));
  if (piece.fuse !== undefined) {
    const left = state.fuses[piece.id] ?? piece.fuse;
    ctx.font = `bold ${Math.round(cell * 0.42)}px system-ui, sans-serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = left <= 2 ? '#d22' : '#222';
    ctx.strokeText(String(left), c.x, c.y + cell * 0.38);
    ctx.fillText(String(left), c.x, c.y + cell * 0.38);
    ctx.lineWidth = 1;
  }
}

function drawObstacle(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number): void {
  const c = center(cell, x, y);
  ctx.fillStyle = '#6d8f5a';
  ctx.beginPath();
  ctx.roundRect(c.x - cell * 0.42, c.y - cell * 0.42, cell * 0.84, cell * 0.84, cell * 0.2);
  ctx.fill();
  ctx.fillStyle = '#8fb374';
  ctx.beginPath();
  ctx.arc(c.x - cell * 0.12, c.y - cell * 0.1, cell * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawArrowTile(ctx: CanvasRenderingContext2D, x: number, y: number, dir: Direction, cell: number): void {
  const c = center(cell, x, y);
  ctx.fillStyle = '#ece4cf';
  ctx.fillRect(c.x - cell * 0.45, c.y - cell * 0.45, cell * 0.9, cell * 0.9);
  const v = directionVector(dir);
  const r = cell * 0.3;
  ctx.fillStyle = '#8a7a52';
  ctx.beginPath();
  ctx.moveTo(c.x + v.x * r, c.y + v.y * r);
  ctx.lineTo(c.x - v.x * r + v.y * r, c.y - v.y * r + v.x * r);
  ctx.lineTo(c.x - v.x * r - v.y * r, c.y - v.y * r - v.x * r);
  ctx.closePath();
  ctx.fill();
}

function drawGate(ctx: CanvasRenderingContext2D, state: GameState, piece: Piece, color: string, cell: number): void {
  const v = directionVector(exitDirection(state.level, piece));
  const g = exitCell(state.level, piece);
  const c = center(cell, g.x, g.y);
  const cx = c.x + v.x * cell * 0.75;
  const cy = c.y + v.y * cell * 0.75;
  ctx.fillStyle = color;
  if (v.x !== 0) ctx.fillRect(cx - 5, cy - cell * 0.35, 10, cell * 0.7);
  else ctx.fillRect(cx - cell * 0.35, cy - 5, cell * 0.7, 10);
}

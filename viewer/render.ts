import type { GameState } from '../src/core/game';
import { blockersOf, directionVector, exitCell, headDirection } from '../src/core/rules';
import type { Piece } from '../src/core/types';

export const CELL = 40;
export const MARGIN = CELL;

export interface Flash {
  id: number;
  kind: 'blocked' | 'exited';
}

export const pieceColor = (id: number): string => `hsl(${(id * 47) % 360} 70% 55%)`;

export function canvasSize(state: GameState): { width: number; height: number } {
  return { width: state.level.width * CELL + MARGIN * 2, height: state.level.height * CELL + MARGIN * 2 };
}

export function render(canvas: HTMLCanvasElement, state: GameState, flash?: Flash): void {
  const { width, height } = canvasSize(state);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { level } = state;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#e4ded3';
  for (let x = 0; x <= level.width; x++) line(ctx, MARGIN + x * CELL, MARGIN, MARGIN + x * CELL, MARGIN + level.height * CELL);
  for (let y = 0; y <= level.height; y++) line(ctx, MARGIN, MARGIN + y * CELL, MARGIN + level.width * CELL, MARGIN + y * CELL);

  const highlighted = new Set<number>();
  if (flash?.kind === 'blocked') {
    const piece = level.pieces.find((p) => p.id === flash.id);
    if (piece) {
      highlighted.add(piece.id);
      for (const id of blockersOf(level, piece, state.alive)) highlighted.add(id);
    }
  }

  for (const piece of level.pieces) {
    if (!state.alive.has(piece.id)) continue;
    const color = pieceColor(piece.id);
    drawGate(ctx, state, piece, color);
    ctx.fillStyle = color;
    for (const c of piece.cells) ctx.fillRect(MARGIN + c.x * CELL + 3, MARGIN + c.y * CELL + 3, CELL - 6, CELL - 6);
    drawHead(ctx, piece);
    if (highlighted.has(piece.id)) {
      ctx.strokeStyle = '#d22';
      ctx.lineWidth = 3;
      for (const c of piece.cells) ctx.strokeRect(MARGIN + c.x * CELL + 1.5, MARGIN + c.y * CELL + 1.5, CELL - 3, CELL - 3);
      ctx.lineWidth = 1;
    }
  }
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawHead(ctx: CanvasRenderingContext2D, piece: Piece): void {
  const v = directionVector(headDirection(piece));
  const cx = MARGIN + piece.cells[0].x * CELL + CELL / 2;
  const cy = MARGIN + piece.cells[0].y * CELL + CELL / 2;
  const r = CELL * 0.28;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(cx + v.x * r, cy + v.y * r);
  ctx.lineTo(cx - v.x * r + v.y * r, cy - v.y * r + v.x * r);
  ctx.lineTo(cx - v.x * r - v.y * r, cy - v.y * r - v.x * r);
  ctx.closePath();
  ctx.fill();
}

function drawGate(ctx: CanvasRenderingContext2D, state: GameState, piece: Piece, color: string): void {
  const v = directionVector(headDirection(piece));
  const g = exitCell(state.level, piece);
  const cx = MARGIN + g.x * CELL + CELL / 2 + v.x * CELL * 0.75;
  const cy = MARGIN + g.y * CELL + CELL / 2 + v.y * CELL * 0.75;
  ctx.fillStyle = color;
  if (v.x !== 0) ctx.fillRect(cx - 5, cy - CELL * 0.35, 10, CELL * 0.7);
  else ctx.fillRect(cx - CELL * 0.35, cy - 5, CELL * 0.7, 10);
}

import { createRng } from '../src/core/rng';
import { createGame, isCleared, tap, type GameState } from '../src/core/game';
import { generateMatching } from '../src/generator/generate';
import type { Metrics } from '../src/solver/metrics';
import { CELL, MARGIN, render, type Flash } from './render';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const num = (id: string): number => Number($<HTMLInputElement>(id).value);
const canvas = $<HTMLCanvasElement>('board');
let state: GameState | null = null;
let metrics: Metrics | null = null;
let flashTimer: number | undefined;

function show(flash?: Flash): void {
  if (!state) return;
  render(canvas, state, flash);
  const m = metrics;
  $('metrics').textContent = m
    ? [
        `pieces            ${m.pieceCount}`,
        `rounds            ${m.rounds}`,
        `round sizes       ${m.roundSizes.join(', ')}`,
        `initial free      ${m.initialFreeRatio.toFixed(2)}`,
        `avg blockers      ${m.avgBlockers.toFixed(2)}`,
        `surge             ${m.surge.toFixed(2)}`,
        ``,
        `taps              ${state.taps}`,
        `blocked taps      ${state.blockedTaps}`,
      ].join('\n')
    : '';
  $('status').textContent = isCleared(state) ? 'Cleared!' : '';
}

function generate(): void {
  const result = generateMatching(
    { width: num('width'), height: num('height'), pieceCount: num('count'), minLength: num('minLen'), maxLength: num('maxLen') },
    {},
    createRng(num('seed')),
  );
  if (!result) {
    state = null;
    metrics = null;
    canvas.width = canvas.height = 0;
    $('metrics').textContent = '';
    $('status').textContent = 'Generation failed (parameters too tight?)';
    return;
  }
  state = createGame(result.level);
  metrics = result.metrics;
  show();
}

canvas.addEventListener('click', (e) => {
  if (!state || isCleared(state)) return;
  const rect = canvas.getBoundingClientRect();
  const cx = Math.floor((e.clientX - rect.left - MARGIN) / CELL);
  const cy = Math.floor((e.clientY - rect.top - MARGIN) / CELL);
  const piece = state.level.pieces.find((p) => state!.alive.has(p.id) && p.cells.some((c) => c.x === cx && c.y === cy));
  if (!piece) return;
  const result = tap(state, piece.id);
  state = result.state;
  if (result.event.type === 'ignored') return;
  const flash: Flash = { id: piece.id, kind: result.event.type === 'blocked' ? 'blocked' : 'exited' };
  show(flash.kind === 'blocked' ? flash : undefined);
  window.clearTimeout(flashTimer);
  if (flash.kind === 'blocked') flashTimer = window.setTimeout(() => show(), 500);
});

$('generate').addEventListener('click', generate);
generate();

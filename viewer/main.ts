import { createRng } from '../src/core/rng';
import { createGame, isCleared, tap, type GameState } from '../src/core/game';
import { generateMatching } from '../src/generator/generate';
import type { Metrics } from '../src/solver/metrics';
import { computeCell, hitTest, render, type Flash, type Style } from './render';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const num = (id: string): number => Number($<HTMLInputElement>(id).value);
const canvas = $<HTMLCanvasElement>('board');
let state: GameState | null = null;
let metrics: Metrics | null = null;
let flashTimer: number | undefined;

const PRESETS: Record<string, [number, number, number]> = { '7x10': [7, 10, 14], '8x12': [8, 12, 22], '10x10': [10, 10, 12] };

const cellSize = (): number => computeCell(state?.level.width ?? num('width'), Math.min(window.innerWidth - 32, 520));
const style = (): Style => ($<HTMLSelectElement>('style').value === 'blocks' ? 'blocks' : 'arrows');

function show(flash?: Flash): void {
  if (!state) return;
  render(canvas, state, cellSize(), style(), flash);
  const m = metrics;
  $('metrics').textContent = m
    ? [
        `pieces            ${m.pieceCount}`,
        `occupied cells    ${state.level.pieces.reduce((a, p) => a + p.cells.length, 0)} / ${state.level.width * state.level.height}`,
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
  const id = hitTest(state, (e.clientX - rect.left) * (canvas.width / rect.width), (e.clientY - rect.top) * (canvas.height / rect.height), cellSize());
  if (id === undefined) return;
  const result = tap(state, id);
  state = result.state;
  if (result.event.type === 'ignored') return;
  const blocked = result.event.type === 'blocked';
  show(blocked ? { id, kind: 'blocked' } : undefined);
  window.clearTimeout(flashTimer);
  if (blocked) flashTimer = window.setTimeout(() => show(), 500);
});

$('preset').addEventListener('change', () => {
  const p = PRESETS[$<HTMLSelectElement>('preset').value];
  if (!p) return;
  $<HTMLInputElement>('width').value = String(p[0]);
  $<HTMLInputElement>('height').value = String(p[1]);
  $<HTMLInputElement>('count').value = String(p[2]);
  generate();
});
$('style').addEventListener('change', () => show());
window.addEventListener('resize', () => show());
$('generate').addEventListener('click', generate);
generate();

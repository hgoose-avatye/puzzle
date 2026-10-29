import { createRng } from '../src/core/rng';
import { createGame, isCleared, isFailed, tap, type GameState } from '../src/core/game';
import { generateMatching } from '../src/generator/generate';
import { generateLevelFor, levelSpec } from '../src/curve/curve';
import type { Metrics } from '../src/solver/metrics';
import { computeCell, hitTest, render, type Flash, type Style } from './render';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const num = (id: string): number => Number($<HTMLInputElement>(id).value);
const heartsOn = (): boolean => $<HTMLInputElement>('hearts').checked;
const newGame = (level: Parameters<typeof createGame>[0]): GameState => createGame(level, heartsOn() ? { hearts: 3 } : {});
const canvas = $<HTMLCanvasElement>('board');
let state: GameState | null = null;
let metrics: Metrics | null = null;
let flashTimer: number | undefined;

interface LogEntry { level: number; role: string; taps: number; blockedTaps: number; cleared: boolean; failed: boolean; hearts: boolean; obstacles: number; arrows: number; ms: number; at: string; viewportWidth: number; style: string }
const LOG_KEY = 'puzzle-test-log';
let attempt: { level: number; role: string; startedAt: number } | null = null;
const readLog = (): LogEntry[] => { try { return JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]'); } catch { return []; } };
const writeLog = (entries: LogEntry[]): void => { try { localStorage.setItem(LOG_KEY, JSON.stringify(entries)); } catch { /* storage unavailable */ } };
const refreshLogInfo = (): void => { $('logInfo').textContent = `log: ${readLog().length} attempts`; };

function closeAttempt(cleared: boolean): void {
  if (!attempt || !state || (!cleared && state.taps === 0)) { attempt = null; return; }
  writeLog([...readLog(), { level: attempt.level, role: attempt.role, taps: state.taps, blockedTaps: state.blockedTaps, cleared, failed: isFailed(state), hearts: state.hearts !== undefined, obstacles: state.level.obstacles?.length ?? 0, arrows: state.level.arrows?.length ?? 0, ms: Date.now() - attempt.startedAt, at: new Date().toISOString(), viewportWidth: window.innerWidth, style: style() }]);
  attempt = null;
  refreshLogInfo();
}

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
        `hearts            ${state.hearts === undefined ? '-' : '♥'.repeat(Math.max(0, state.hearts)) || '0'}`,
        `taps              ${state.taps}`,
        `blocked taps      ${state.blockedTaps}`,
      ].join('\n')
    : '';
  $('status').textContent = isCleared(state) ? 'Cleared!' : isFailed(state) ? 'Failed - no hearts left (Retry level)' : '';
}

function generate(): void {
  closeAttempt(false);
  $('roleInfo').textContent = '';
  const result = generateMatching(
    { width: num('width'), height: num('height'), pieceCount: num('count'), minLength: num('minLen'), maxLength: num('maxLen'), obstacleCount: num('obstacles'), arrowCount: num('arrows') },
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
  state = newGame(result.level);
  metrics = result.metrics;
  show();
}

canvas.addEventListener('click', (e) => {
  if (!state || isCleared(state) || isFailed(state)) return;
  const rect = canvas.getBoundingClientRect();
  const id = hitTest(state, (e.clientX - rect.left) * (canvas.width / rect.width), (e.clientY - rect.top) * (canvas.height / rect.height), cellSize());
  if (id === undefined) return;
  const result = tap(state, id);
  state = result.state;
  if (result.event.type === 'ignored') return;
  const blocked = result.event.type === 'blocked';
  if (isCleared(state)) closeAttempt(true);
  else if (isFailed(state)) closeAttempt(false);
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
function playLevel(): void {
  closeAttempt(false);
  const n = Math.max(1, Math.floor(num('level')));
  let result = null;
  const fixtures = { obstacleCount: num('obstacles'), arrowCount: num('arrows') };
  for (let seedTry = 1; seedTry <= 5 && !result; seedTry++) result = generateLevelFor(n, seedTry, fixtures);
  if (!result) {
    // Fixtures can make the curve's difficulty target unreachable; fall back to an unfiltered level.
    const spec = levelSpec(n);
    const fallback = generateMatching({ ...spec.params, ...fixtures }, {}, createRng(n), 50);
    if (fallback) result = { spec, ...fallback };
  }
  if (!result) {
    state = null;
    metrics = null;
    canvas.width = canvas.height = 0;
    $('status').textContent = `Could not generate level ${n}`;
    return;
  }
  state = newGame(result.level);
  metrics = result.metrics;
  attempt = { level: n, role: result.spec.role, startedAt: Date.now() };
  $('roleInfo').textContent = `Level ${result.spec.level} (${result.spec.role}) - ${result.spec.params.width}x${result.spec.params.height}`;
  show();
}

$('playLevel').addEventListener('click', playLevel);
$('retry').addEventListener('click', () => {
  if (!state) return;
  closeAttempt(isCleared(state));
  state = newGame(state.level);
  if (attempt === null && $('roleInfo').textContent) attempt = { level: Math.max(1, Math.floor(num('level'))), role: 'retry', startedAt: Date.now() };
  show();
});
$('nextLevel').addEventListener('click', () => {
  $<HTMLInputElement>('level').value = String(num('level') + 1);
  playLevel();
});
$('copyLog').addEventListener('click', async () => {
  const text = JSON.stringify(readLog(), null, 1);
  try { await navigator.clipboard.writeText(text); $('logInfo').textContent = 'log copied'; } catch { window.prompt('Copy the log:', text); }
});
$('clearLog').addEventListener('click', () => { writeLog([]); refreshLogInfo(); });
$('generate').addEventListener('click', generate);
refreshLogInfo();
playLevel();

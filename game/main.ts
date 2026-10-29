import { createRng } from '../src/core/rng';
import { createGame, isCleared, isFailed, tap, type GameState } from '../src/core/game';
import { generateLevelFor, levelSpec } from '../src/curve/curve';
import { generateMatching } from '../src/generator/generate';
import { canExit, isAsleep, lockedBy } from '../src/core/rules';
import { distanceToPolyline } from '../src/game/path';
import type { Level } from '../src/core/types';
import { PieceView, loadSpecies, speciesFor } from './animals';
import { Stage } from './stage';
import * as THREE from 'three';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const stage = new Stage($('app'));
let state: GameState | null = null;
let views = new Map<number, PieceView>();
let levelNumber = 1;
let loadToken = 0;
let pressed: number | null = null;
const PROGRESS_KEY = 'animal-rescue-progress';

const readProgress = (): number => { try { return Math.max(1, Number(localStorage.getItem(PROGRESS_KEY) ?? 1)); } catch { return 1; } };
const writeProgress = (n: number): void => { try { localStorage.setItem(PROGRESS_KEY, String(n)); } catch { /* ignore */ } };

function buildLevel(n: number): { level: Level; hearts?: number } | null {
  for (let seed = 1; seed <= 5; seed++) {
    const r = generateLevelFor(n, seed);
    if (r) return { level: r.level, hearts: r.spec.hearts };
  }
  const spec = levelSpec(n);
  const fallback = generateMatching(spec.params, {}, createRng(n), 50);
  return fallback ? { level: fallback.level, hearts: spec.hearts } : null;
}

function refreshHud(): void {
  if (!state) return;
  const spec = levelSpec(levelNumber);
  $('levelLabel').textContent = `레벨 ${levelNumber}`;
  $('hearts').textContent = state.hearts === undefined ? '' : '♥'.repeat(Math.max(0, state.hearts)) + '♡'.repeat(Math.max(0, 3 - Math.max(0, state.hearts)));
  void spec;
  for (const [id, v] of views) {
    const piece = state.level.pieces.find((p) => p.id === id)!;
    if (!state.alive.has(id)) continue;
    const items: string[] = [];
    if (piece.key !== undefined) items.push('🔑');
    if (lockedBy(state.level, piece, state.alive) !== undefined) items.push('🔒');
    v.setAsleep(isAsleep(state.level, piece, state.alive));
    if (piece.fuse !== undefined) items.push('💣');
    v.setBadges(items, piece.fuse !== undefined ? state.fuses[id] : undefined);
  }
}

async function loadLevel(n: number): Promise<void> {
  const token = ++loadToken;
  levelNumber = n;
  $('popup').hidden = true;
  $('msg').textContent = '';
  const built = buildLevel(n);
  if (!built) { $('msg').textContent = '레벨을 만들 수 없어요'; return; }
  for (const v of views.values()) stage.scene.remove(v.group);
  views = new Map();
  stage.setBoard(built.level);
  const names = [...new Set(built.level.pieces.map(speciesFor))];
  const gltfs = new Map(await Promise.all(names.map(async (s) => [s, await loadSpecies(s)] as const)));
  if (token !== loadToken) return;
  state = createGame(built.level, built.hearts === undefined ? {} : { hearts: built.hearts });
  for (const piece of built.level.pieces) {
    const view = new PieceView(built.level, piece, gltfs.get(speciesFor(piece))!, (x, y) => stage.worldOf(built.level, x, y));
    views.set(piece.id, view);
    stage.scene.add(view.group);
  }
  refreshHud();
  showIntro(built.level, built.hearts !== undefined);
}

function pick(clientX: number, clientY: number): number | null {
  if (!state) return null;
  const g = stage.screenToGrid(clientX, clientY);
  if (!g) return null;
  let best: { id: number; d: number } | null = null;
  for (const piece of state.level.pieces) {
    if (!state.alive.has(piece.id)) continue;
    const d = distanceToPolyline(piece.cells.map((c) => ({ x: c.x, y: c.y })), g.x, g.y);
    if (d <= 0.75 && (!best || d < best.d)) best = { id: piece.id, d };
  }
  return best?.id ?? null;
}

function onTap(id: number): void {
  if (!state || isCleared(state) || isFailed(state)) return;
  const result = tap(state, id);
  state = result.state;
  const ev = result.event;
  const view = views.get(id);
  if (ev.type === 'exited' && view) {
    view.runOut(() => { if (state && isCleared(state)) showEnd(true); });
    $('msg').textContent = '';
  } else if (ev.type === 'blocked' && view) {
    view.bump();
    for (const b of ev.blockers) views.get(b)?.pulse();
    if (ev.lockedBy !== undefined) views.get(ev.lockedBy)?.pulse();
    $('msg').textContent = ev.asleep ? '쿨쿨 자고 있어요. 옆 친구가 나가면 깨어나요' : ev.lockedBy !== undefined ? '잠겨 있어요. 열쇠를 가진 친구가 먼저예요' : '앞이 막혔어요';
  }
  refreshHud();
  if (isFailed(state)) showEnd(false);
}

const SEEN_KEY = 'animal-rescue-seen';
const readSeen = (): string[] => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'); } catch { return []; } };
const writeSeen = (a: string[]): void => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(a)); } catch { /* ignore */ } };

const TIPS: Array<[string, string, string, (l: Level, hearts: boolean) => boolean]> = [
  ['basic', '👆', '친구를 누르면 문 쪽으로 달려가요. 길이 막혀 있으면 못 나가요. 꾹 누르면 가는 길이 보여요.', () => true],
  ['arrow', '➡️', '바닥의 화살표 칸을 지나면 그 방향으로 꺾여요. 화살표를 마주 보면 막혀요.', (l) => (l.arrows?.length ?? 0) > 0],
  ['obstacle', '🪵', '장애물이 있는 칸은 지나갈 수 없어요.', (l) => (l.obstacles?.length ?? 0) > 0],
  ['long', '🐛', '몸이 긴 친구는 몸 전체가 지나갈 길이 비어 있어야 해요.', (l) => l.pieces.some((p) => p.cells.length >= 3)],
  ['hearts', '♥', '막힌 친구를 누르면 하트가 줄어요. 하트가 모두 없어지면 다시 시작해요.', (_l, h) => h],
  ['key', '🔑', '🔒 잠긴 친구는 🔑 열쇠를 가진 친구가 먼저 나가야 움직일 수 있어요.', (l) => l.pieces.some((p) => p.key !== undefined)],
  ['sleep', '💤', 'Zzz 자는 친구는 옆 친구가 나가면 깨어나요. 깨어나기 전에는 움직이지 못해요.', (l) => l.pieces.some((p) => p.sleeping)],
  ['bomb', '💣', '💣 폭탄 친구는 숫자만큼 누르고 나면 터져요. 그 전에 먼저 구해 주세요!', (l) => l.pieces.some((p) => p.fuse !== undefined)],
];

function showIntro(level: Level, hearts: boolean): void {
  const seen = readSeen();
  const fresh = TIPS.filter(([id, , , test]) => test(level, hearts) && !seen.includes(id) && (id !== 'basic' || levelNumber === 1 || !seen.length));
  if (fresh.length === 0) return;
  writeSeen([...seen, ...fresh.map(([id]) => id)]);
  $('popup').hidden = false;
  $('popupTitle').textContent = `레벨 ${levelNumber}`;
  const sub = $('popupSub');
  sub.innerHTML = '';
  for (const [, icon, text] of fresh) {
    const row = document.createElement('div');
    row.className = 'tip';
    row.textContent = `${icon}  ${text}`;
    sub.appendChild(row);
  }
  $('popupBtn').textContent = '시작!';
  $('popupBtn').onclick = () => { $('popup').hidden = true; };
}

function showEnd(won: boolean): void {
  if (!state) return;
  $('popup').hidden = false;
  $('popupTitle').textContent = won ? '구출 성공!' : state.exploded ? '펑! 폭탄이 터졌어요' : '하트가 모두 떨어졌어요';
  $('popupSub').textContent = won ? '모든 친구를 구했어요' : '다시 도전해 볼까요?';
  $('popupBtn').textContent = won ? '다음 레벨' : '다시 하기';
  $('popupBtn').onclick = () => { if (won) { writeProgress(levelNumber + 1); void loadLevel(levelNumber + 1); } else void loadLevel(levelNumber); };
}

const canvas = stage.renderer.domElement;
canvas.addEventListener('pointerdown', (e) => {
  pressed = pick(e.clientX, e.clientY);
  if (pressed !== null) views.get(pressed)?.showPath(true);
});
canvas.addEventListener('pointerup', (e) => {
  const id = pick(e.clientX, e.clientY);
  if (pressed !== null) views.get(pressed)?.showPath(false);
  if (id !== null && id === pressed) onTap(id);
  pressed = null;
});
canvas.addEventListener('pointercancel', () => {
  if (pressed !== null) views.get(pressed)?.showPath(false);
  pressed = null;
});
$('retry').addEventListener('click', () => void loadLevel(levelNumber));
$('next').addEventListener('click', () => void loadLevel(levelNumber + 1));

const clock = new THREE.Clock();
(function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  for (const v of views.values()) v.update(dt);
  stage.render();
  requestAnimationFrame(loop);
})();

const fromUrl = Number(new URLSearchParams(location.search).get('level'));
void loadLevel(Number.isInteger(fromUrl) && fromUrl >= 1 ? fromUrl : readProgress());

/** Test hook used by automated browser checks. */
(window as unknown as { __game: unknown }).__game = {
  tap: (id: number) => onTap(id),
  free: () => (state ? state.level.pieces.filter((p) => state!.alive.has(p.id) && canExit(state!.level, p.id, state!.alive)).map((p) => p.id) : []),
  ids: () => (state ? state.level.pieces.filter((p) => state!.alive.has(p.id)).map((p) => p.id) : []),
  screenOf: (id: number) => {
    const p = state?.level.pieces.find((q) => q.id === id);
    return p && state ? stage.gridToScreen(state.level, p.cells[0].x, p.cells[0].y) : null;
  },
  state: () => state && { taps: state.taps, blocked: state.blockedTaps, hearts: state.hearts, cleared: isCleared(state), failed: isFailed(state) },
};

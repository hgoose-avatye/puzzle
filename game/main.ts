import { createRng } from '../src/core/rng';
import { createGame, isCleared, isFailed, tap, type GameState } from '../src/core/game';
import { demoLevel, SHEET_SPECIES, sheetLevel, turnLevel } from './demo';
import { generateLevelFor, levelSpec } from '../src/curve/curve';
import { generateMatching } from '../src/generator/generate';
import { canExit, isAsleep, lockedBy } from '../src/core/rules';
import { distanceToPolyline } from '../src/game/path';
import type { Direction, Level } from '../src/core/types';
import { PieceView, speciesOverride } from './animals';
import { Stage } from './stage';
import { Fx } from './fx';
import { sound } from './sound';
import * as THREE from 'three';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const stage = new Stage($('app'));
const fx = new Fx(stage.scene);
let state: GameState | null = null;
let views = new Map<number, PieceView>();
let levelNumber = 1;
let loadToken = 0;
let pressed: number | null = null;
/** One-shot guards so a result sound plays once per level, even if the end is detected more than once. */
/** Animals that were sent out and have not crossed their gate yet. */
const pendingExits = new Set<number>();
let clearPlayed = false;
let failPlayed = false;
const PROGRESS_KEY = 'animal-rescue-progress';

const readProgress = (): number => { try { return Math.max(1, Number(localStorage.getItem(PROGRESS_KEY) ?? 1)); } catch { return 1; } };
const writeProgress = (n: number): void => { try { localStorage.setItem(PROGRESS_KEY, String(n)); } catch { /* ignore */ } };

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');

function buildLevel(n: number): { level: Level; hearts?: number } | null {
  if (params.get('demo') === 'sheet') {
    const names = params.get('species')?.split(',') ?? SHEET_SPECIES.slice(0, 6);
    const dirs = params.get('dirs')?.split(',') as Direction[] | undefined;
    const sheet = sheetLevel(names, Number(params.get('len') ?? 1), dirs);
    speciesOverride.clear();
    for (const [id, name] of sheet.species) speciesOverride.set(id, name);
    return { level: sheet.level };
  }
  if (params.get('demo') === 'turn') {
    const dir = (k: string, d: Direction): Direction => (params.get(k) as Direction | null) ?? d;
    return { level: turnLevel(dir('from', 'up'), dir('to', 'right'), Number(params.get('len') ?? 2), Number(params.get('id') ?? 2)), hearts: 3 };
  }
  if (DEMO) return { level: demoLevel(), hearts: 3 };
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
  fx.clear();
  sound.stopAll();
  clearPlayed = false;
  failPlayed = false;
  pendingExits.clear();
  const built = buildLevel(n);
  if (!built) { $('msg').textContent = '레벨을 만들 수 없어요'; return; }
  for (const v of views.values()) { stage.scene.remove(v.group); v.dispose(); }
  views = new Map();
  stage.setBoard(built.level);
  if (token !== loadToken) return;
  state = createGame(built.level, built.hearts === undefined ? {} : { hearts: built.hearts });
  for (const piece of built.level.pieces) {
    const view = new PieceView(built.level, piece, (x, y) => stage.worldOf(built.level, x, y));
    views.set(piece.id, view);
    if (params.has('raw')) view.hideMarkers();
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

/** The logic state is cleared as soon as the last animal is tapped; the win only shows once every animal has left the board. */
const anyRunning = (): boolean => [...views.values()].some((v) => v.running);

function onTap(id: number): void {
  if (!state || isCleared(state) || isFailed(state)) return;
  const result = tap(state, id);
  state = result.state;
  const ev = result.event;
  const view = views.get(id);
  if (ev.type === 'exited' && view) {
    sound.play('move');
    pendingExits.add(id);
    view.runOut(() => { if (state && isCleared(state) && !anyRunning()) showEnd(true); }, () => {
      pendingExits.delete(id);
      // the last animal's exit is covered by the clear sound
      if (!(state && isCleared(state) && pendingExits.size === 0)) sound.play('rescued');
      fx.burst(view.gateWorld(), view.color);
    });
    $('msg').textContent = '';
  } else if (ev.type === 'blocked' && view) {
    view.bump();
    fx.stars(view.headWorld());
    for (const b of ev.blockers) views.get(b)?.pulse();
    if (ev.lockedBy !== undefined) views.get(ev.lockedBy)?.pulse();
    $('msg').textContent = ev.asleep ? '쿨쿨 자고 있어요. 옆 친구가 나가면 깨어나요' : ev.lockedBy !== undefined ? '잠겨 있어요. 열쇠를 가진 친구가 먼저예요' : '앞이 막혔어요';
  }
  refreshHud();
  if (isFailed(state)) {
    if (!failPlayed) { failPlayed = true; sound.play('gameover'); }
    showEnd(false);
  }
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
  if (DEMO) return;
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
  if (won) {
    if (!clearPlayed) { clearPlayed = true; sound.play('clear'); }
    fx.confetti(new THREE.Vector3(0, 0, 0), 8);
  }
  $('popup').hidden = false;
  $('popupTitle').textContent = won ? '구출 성공!' : state.exploded ? '펑! 폭탄이 터졌어요' : '하트가 모두 떨어졌어요';
  $('popupSub').textContent = won ? '모든 친구를 구했어요' : '다시 도전해 볼까요?';
  $('popupBtn').textContent = won ? '다음 레벨' : '다시 하기';
  $('popupBtn').onclick = () => { if (won) { writeProgress(levelNumber + 1); void loadLevel(levelNumber + 1); } else void loadLevel(levelNumber); };
}

const canvas = stage.renderer.domElement;
canvas.addEventListener('pointerdown', (e) => {
  sound.unlock();
  pressed = pick(e.clientX, e.clientY);
  if (pressed !== null) { views.get(pressed)?.showPath(true); sound.play('select'); }
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
$('retry').addEventListener('click', () => { sound.unlock(); void loadLevel(levelNumber); });
$('next').addEventListener('click', () => void loadLevel(levelNumber + 1));

let dustT = 0;
const clock = new THREE.Clock();
(function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  dustT += dt;
  const dust = dustT > 0.07;
  if (dust) dustT = 0;
  for (const v of views.values()) {
    v.update(dt);
    if (dust && v.running) fx.dust(v.headWorld());
  }
  fx.update(dt);
  stage.render();
  requestAnimationFrame(loop);
})();

const muteBtn = $('mute');
const paintMute = (): void => { muteBtn.textContent = sound.muted ? '🔇' : '🔊'; };
paintMute();
muteBtn.addEventListener('click', () => { sound.unlock(); sound.setMuted(!sound.muted); paintMute(); });

const fromUrl = Number(new URLSearchParams(location.search).get('level'));
void loadLevel(Number.isInteger(fromUrl) && fromUrl >= 1 ? fromUrl : readProgress());

/** Test hook used by automated browser checks. */
(window as unknown as { __game: unknown }).__game = {
  tap: (id: number) => onTap(id),
  free: () => (state ? state.level.pieces.filter((p) => state!.alive.has(p.id) && canExit(state!.level, p.id, state!.alive)).map((p) => p.id) : []),
  views: () => views,
  scene: () => stage.scene,
  sound,
  ids: () => (state ? state.level.pieces.filter((p) => state!.alive.has(p.id)).map((p) => p.id) : []),
  screenOf: (id: number) => {
    const p = state?.level.pieces.find((q) => q.id === id);
    return p && state ? stage.gridToScreen(state.level, p.cells[0].x, p.cells[0].y) : null;
  },
  state: () => state && { taps: state.taps, blocked: state.blockedTaps, hearts: state.hearts, cleared: isCleared(state), failed: isFailed(state) },
};

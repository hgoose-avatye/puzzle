import { createGame, isCleared, isFailed, tap, type GameState } from '../src/core/game';
import { crossLevel, demoLevel, SHEET_SPECIES, sheetLevel, turnLevel } from './demo';
import { buildGameLevel, levelSpec, stageFor, type Theme } from '../src/curve/curve';
import { canExit, isAsleep, lockedBy } from '../src/core/rules';
import { distanceToPolyline } from '../src/game/path';
import type { Direction, Level } from '../src/core/types';
import { PieceView, runSpeed, speciesOverride } from './animals';
import { Traffic } from '../src/game/traffic';
import { pickHint } from '../src/game/hint';
import { interludesAfter, LAST_LEVEL, splitName, stageIcon, stageStep, startsStage, type Interlude } from '../src/game/journey';
import { PALETTES } from './scenery';
import { Stage } from './stage';
import { Fx } from './fx';
import { sound } from './sound';
import * as THREE from 'three';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const stage = new Stage($('app'));
const fx = new Fx(stage.scene);
let state: GameState | null = null;
let views = new Map<number, PieceView>();
/** Animals on their way out: who may move how far this frame (first come, first served; later ones wait). */
const traffic = new Traffic();
let levelNumber = 1;
/** Hearts the level started with, for the empty-heart outlines in the HUD. */
let maxHearts = 0;
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
  if (params.get('demo') === 'cross') return { level: crossLevel(), hearts: 3 };
  if (DEMO) return { level: demoLevel(), hearts: 3 };
  return buildGameLevel(n);
}

function refreshHud(): void {
  if (!state) return;
  const spec = levelSpec(levelNumber);
  $('levelLabel').textContent = `레벨 ${levelNumber}`;
  $('hearts').textContent = state.hearts === undefined ? '' : '♥'.repeat(Math.max(0, state.hearts)) + '♡'.repeat(Math.max(0, maxHearts - Math.max(0, state.hearts)));
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
  lastHit.clear();
  traffic.clear();
  window.clearTimeout(hintTimer);
  const built = buildLevel(n);
  if (!built) { $('msg').textContent = '레벨을 만들 수 없어요'; return; }
  for (const v of views.values()) { stage.scene.remove(v.group); v.dispose(); }
  views = new Map();
  const st = stageFor(n);
  stage.setBoard(built.level, DEMO ? ((params.get('theme') as Theme | null) ?? 'village') : st.theme, n, DEMO ? Number(params.get('stage') ?? 1) : st.stage);
  $('stageLabel').textContent = DEMO ? '' : st.name;
  paintStageDots(n);
  if (!DEMO && startsStage(n)) showBanner(n);
  if (token !== loadToken) return;
  maxHearts = built.hearts ?? 0;
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

const lastHit = new Map<number, number>();
/** Same animal, repeated input: react at most once per 200 ms. */
function cooled(id: number): boolean {
  const now = performance.now();
  if (now - (lastHit.get(id) ?? -Infinity) < 200) return false;
  lastHit.set(id, now);
  return true;
}

/** Hit another animal (standing or running): punch sound, flinch and a "!" on the animal that was tapped. */
function collide(id: number, view: PieceView): void {
  if (!cooled(id)) return;
  view.collide();
  sound.play('collision');
}

function onTap(id: number): void {
  if (!state || isCleared(state) || isFailed(state)) return;
  const result = tap(state, id);
  const ev = result.event;
  const view = views.get(id);
  state = result.state;
  if (ev.type === 'exited' && view) {
    // The logic treats it as gone right away; on the board it runs out through traffic and may wait behind earlier runners.
    traffic.add(id, view.track, view.bodyLen, view.headStart);
    fx.launch(view.headWorld());
    sound.play('move');
    pendingExits.add(id);
    view.runOut(() => { if (state && isCleared(state) && !anyRunning()) showEnd(true); }, () => {
      pendingExits.delete(id);
      // the last animal's exit is covered by the clear sound
      if (!(state && isCleared(state) && pendingExits.size === 0)) sound.play('rescued');
      fx.burst(view.gateWorld(), view.color);
      fx.sparkle(view.gateWorld(), view.color);
    });
    $('msg').textContent = '';
  } else if (ev.type === 'blocked' && view) {
    view.bump();
    fx.stars(view.headWorld());
    if (ev.blockers.length > 0) collide(id, view);
    else if (cooled(id)) sound.play('wall');
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

const RESCUED_KEY = 'animal-rescue-rescued';
const readRescued = (): number => { try { return Number(localStorage.getItem(RESCUED_KEY) ?? 0) || 0; } catch { return 0; } };
const addRescued = (k: number): void => { try { localStorage.setItem(RESCUED_KEY, String(readRescued() + k)); } catch { /* ignore */ } };

/** Ten dots under the stage name: cleared levels green, the current one amber. */
function paintStageDots(n: number): void {
  const box = $('stageDots');
  box.innerHTML = '';
  if (DEMO) return;
  const { step, of } = stageStep(n);
  for (let i = 1; i <= of; i++) {
    const d = document.createElement('i');
    if (i < step) d.className = 'done';
    else if (i === step) d.className = 'now';
    box.appendChild(d);
  }
}

/** Name card when a new stage begins; it fades by itself and never blocks a tap. */
function showBanner(n: number): void {
  const st = stageFor(n);
  $('bannerIcon').textContent = stageIcon(st);
  $('bannerText').textContent = splitName(st).place;
  const b = $('banner');
  b.hidden = true;
  void b.offsetWidth; // restart the animation
  b.hidden = false;
  window.setTimeout(() => { b.hidden = true; }, 1950);
}

/** Full-screen cards between stages and chapters, one after another; resolves when the last is dismissed. */
async function playInterludes(list: Interlude[]): Promise<void> {
  for (const it of list) {
    await new Promise<void>((done) => {
      const theme = it.kind === 'chapter-intro' ? it.next.theme : it.kind === 'journey-done' ? 'winter' : it.done.theme;
      const pal = PALETTES[theme];
      const box = $('interlude');
      box.style.background = `linear-gradient(180deg, #${new THREE.Color(pal.sky).getHexString()} 0%, #${new THREE.Color(pal.ground).getHexString()} 100%)`;
      const set = (icon: string, kicker: string, title: string, sub: string, btn: string): void => {
        $('ilIcon').textContent = icon;
        $('ilKicker').textContent = kicker;
        $('ilTitle').textContent = title;
        $('ilSub').textContent = sub;
        $('ilBtn').textContent = btn;
      };
      const saved = `지금까지 구한 친구 ${readRescued()}마리`;
      if (it.kind === 'stage-done') {
        const d = splitName(it.done);
        const nx = splitName(it.next);
        set(stageIcon(it.done), `${d.region}`, `${d.place} 완료!`, `${saved}\n다음은 ${stageIcon(it.next)} ${nx.place}`, '다음 스테이지');
      } else if (it.kind === 'chapter-done') {
        set('🏅', '여행 기록', `${splitName(it.done).region} 여행 완료!`, `${saved}\n이 지역의 친구들을 모두 구했어요`, '계속');
      } else if (it.kind === 'chapter-intro') {
        const nx = splitName(it.next);
        set(stageIcon(it.next), `챕터 ${it.next.chapter}`, `${nx.region}에 도착했어요!`, `첫 번째 장소는 ${nx.place}\n새로운 친구들이 기다리고 있어요`, '출발!');
      } else {
        set('🎉', '세계 일주 완료', '모든 친구를 구했어요!', `${saved}\n함께해 주셔서 고마워요`, '처음부터 다시');
      }
      sound.play('clear');
      box.hidden = false;
      $('ilBtn').onclick = () => { box.hidden = true; done(); };
    });
  }
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
  $('popupBtn').onclick = () => {
    if (!won) { void loadLevel(levelNumber); return; }
    const n = levelNumber;
    const next = n >= LAST_LEVEL ? 1 : n + 1; // after the whole journey, start over
    writeProgress(next);
    $('popup').hidden = true;
    void playInterludes(interludesAfter(n)).then(() => loadLevel(next));
  };
  if (won) addRescued(state.level.pieces.length);
}

// Decode the sounds now; unlock on any gesture the browser counts as user activation (touch pointerdown may not count on iOS).
sound.prepare();
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, () => sound.unlock(), { capture: true, passive: true });

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
// skipping levels without clearing them is a testing aid only
$('next').hidden = !params.has('dev');

let hintTimer: number | undefined;
/** Light up the most helpful animal and its way out for a moment. Free for now; ads may gate it later. */
function showHint(): void {
  if (!state || isCleared(state) || isFailed(state)) return;
  const id = pickHint(state.level, state.alive, state.fuses);
  const view = id === null ? undefined : views.get(id);
  if (!view) { $('msg').textContent = '지금은 움직일 수 있는 친구가 없어요'; return; }
  sound.play('select');
  view.showPath(true);
  window.clearTimeout(hintTimer);
  // three pulses so the eye finds it, then the path fades
  let n = 0;
  const beat = (): void => {
    if (n++ < 3) { view.pulse(); hintTimer = window.setTimeout(beat, 450); return; }
    if (pressed !== id) view.showPath(false);
  };
  beat();
}
$('hint').addEventListener('click', () => { sound.unlock(); showHint(); });

let dustT = 0;
let printTick = 0;
const clock = new THREE.Clock();
(function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  dustT += dt;
  const dust = dustT > 0.07;
  if (dust) dustT = 0;
  for (const e of traffic.step(dt, runSpeed())) {
    const v = views.get(e.id);
    if (e.type === 'wait' && !e.quiet && v) collide(e.id, v);
  }
  for (const r of traffic.runners) views.get(r.id)?.setRun(r.s, r.state === 'waiting');
  for (const v of views.values()) {
    if (v.running && !traffic.get(v.piece.id)) v.setRun(v.track.length, false); // stepped past the end this frame
    v.update(dt);
    if (dust && v.running && !v.isWaiting) {
      fx.dust(v.headWorld());
      fx.streak(v.headWorld(), v.heading);
      if (++printTick % 2 === 0) fx.print(v.tailWorld(), v.color);
    }
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
  runSpeed: () => runSpeed(),
  traffic,
  scene: () => stage.scene,
  sound,
  ids: () => (state ? state.level.pieces.filter((p) => state!.alive.has(p.id)).map((p) => p.id) : []),
  screenOf: (id: number) => {
    const p = state?.level.pieces.find((q) => q.id === id);
    return p && state ? stage.gridToScreen(state.level, p.cells[0].x, p.cells[0].y) : null;
  },
  state: () => state && { taps: state.taps, blocked: state.blockedTaps, hearts: state.hearts, cleared: isCleared(state), failed: isFailed(state) },
};

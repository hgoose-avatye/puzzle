import { isCleared, isFailed, type GameState } from '../src/core/game';
import { bombLevel, crossLevel, demoLevel, dirsLevel, quizLevel, SHEET_SPECIES, sheetLevel, turnLevel } from './demo';
import { buildGameLevel, levelSpec, stageFor, type Theme } from '../src/curve/curve';
import { canExit, headDirection, isAsleep, lockedBy } from '../src/core/rules';
import { distanceToPolyline } from '../src/game/path';
import type { Direction, Level } from '../src/core/types';
import { PieceView, runSpeed, setMarkStyle, speciesOverride, type MarkStyle } from './animals';
import { setCrown, setLook, setOneCellBase, type Look } from './blocks';
import { PlayFlow } from '../src/game/flow';
import { hasSavedProgress, progressAfterClear } from '../src/game/progress';
import { TitleScreen, titleBoard } from './screens';
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
/** The level in play: rules, animals running out, touch input. Null while a level loads. */
// the cast keeps TypeScript from narrowing this to null inside the render loop that starts right away
let flow = null as PlayFlow | null;
const current = (): GameState | null => flow?.state ?? null;
let views = new Map<number, PieceView>();
let levelNumber = 1;
/** Hearts the level started with, for the empty-heart outlines in the HUD. */
let maxHearts = 0;
let loadToken = 0;
/** One-shot guards so a result sound plays once per level, even if the end is detected more than once. */
/** Animals that were sent out and have not crossed their gate yet. */
const pendingExits = new Set<number>();
let clearPlayed = false;
let failPlayed = false;
const PROGRESS_KEY = 'animal-rescue-progress';

const readProgress = (): number => { try { return Math.max(1, Number(localStorage.getItem(PROGRESS_KEY) ?? 1)); } catch { return 1; } };
const writeProgress = (n: number): void => { try { localStorage.setItem(PROGRESS_KEY, String(n)); } catch { /* ignore */ } };

/**
 * Test and development entry points (?demo, ?level, ?dev, ?raw, ?theme, ?stage and the window.__game hook) work only on the
 * Vite dev server. A production build sees no parameters, and the bundler drops the code behind import.meta.env.DEV.
 */
const params = import.meta.env.DEV ? new URLSearchParams(location.search) : new URLSearchParams();
/** ?touchdebug on the dev server: every touch on screen with what it hit and what became of it (game/touchdebug.ts). */
let touchDebug: import('./touchdebug').TouchDebug | null = null;
/** ?look=A|D|E|AD on the dev server: direction-reading mockups (game/blocks.ts Look). */
if (['A', 'D', 'E', 'AD'].includes(params.get('look') ?? '')) setLook(params.get('look') as Look);
/** ?one=base keeps the shipped one-cell animals under another look; ?mark=v|v2|edge picks their floor cue (dev server). */
setOneCellBase(params.get('one') === 'base');
setCrown(params.get('crown') === '1');
if (['v', 'v2', 'edge'].includes(params.get('mark') ?? '')) setMarkStyle(params.get('mark') as MarkStyle);
/** ?cam=<degrees> on the dev server: camera elevation comparisons; &camzoom=keep keeps the 58 degree distance. */
if (params.has('cam')) {
  stage.elevation = Math.min(85, Math.max(20, Number(params.get('cam')) || 58));
  stage.keepZoom = params.get('camzoom') === 'keep';
}
if (import.meta.env.DEV && params.has('touchdebug')) void import('./touchdebug').then((m) => { touchDebug = new m.TouchDebug(); });
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
  if (params.get('demo') === 'bomb') return { level: bombLevel(), hearts: 3 };
  if (params.get('demo') === 'dirs' || params.get('demo') === 'quiz') {
    const board = params.get('demo') === 'dirs' ? dirsLevel() : quizLevel();
    speciesOverride.clear();
    for (const [id, name] of board.species) speciesOverride.set(id, name);
    return { level: board.level };
  }
  if (DEMO) return { level: demoLevel(), hearts: 3 };
  return buildGameLevel(n);
}

/** While a bomb is on the board, a bar under the HUD says how many taps are left for the closest one. */
function paintBombBar(): void {
  const bar = $('bombBar');
  const state = current();
  if (!state) { bar.hidden = true; return; }
  const left = [...state.alive].map((id) => state.fuses[id]).filter((f): f is number => f !== undefined);
  if (!left.length || isFailed(state)) { bar.hidden = true; return; }
  const n = Math.min(...left);
  bar.hidden = false;
  bar.className = n <= 1 ? 'danger' : n <= 2 ? 'warn' : '';
  bar.textContent = n <= 1 ? '💣 다른 친구가 한 번 더 나가면 터져요! 폭탄 친구를 먼저!' : `💣 ${n}번 남았어요 · 폭탄 친구를 먼저 구해 주세요`;
}

function refreshHud(): void {
  const state = current();
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
  paintBombBar();
}

/**
 * Drop whatever is on the board: the level in play, its animals (so no run that is still under way can call back with
 * a result), popups, timers and sounds. Returns the new load token. Shared by starting a level and going home.
 */
function clearBoard(): number {
  const token = ++loadToken;
  $('popup').hidden = true;
  $('banner').hidden = true;
  $('msg').textContent = '';
  fx.clear();
  sound.stopAll();
  clearPlayed = false;
  failPlayed = false;
  pendingExits.clear();
  lastHit.clear();
  flow = null;
  window.clearTimeout(hintTimer);
  for (const v of views.values()) { stage.scene.remove(v.group); v.dispose(); }
  views = new Map();
  return token;
}

function addViews(level: Level): void {
  for (const piece of level.pieces) {
    const view = new PieceView(level, piece, (x, y) => stage.worldOf(level, x, y));
    views.set(piece.id, view);
    if (params.has('raw')) view.hideMarkers();
    stage.scene.add(view.group);
  }
}

async function loadLevel(n: number): Promise<void> {
  const token = clearBoard();
  levelNumber = n;
  // the title board pins species to its ids; game levels choose their own
  speciesOverride.clear();
  const built = buildLevel(n);
  if (!built) { $('msg').textContent = '레벨을 만들 수 없어요'; return; }
  const st = stageFor(n);
  stage.setBoard(built.level, DEMO ? ((params.get('theme') as Theme | null) ?? 'village') : st.theme, n, DEMO ? Number(params.get('stage') ?? 1) : st.stage);
  $('stageLabel').textContent = DEMO ? '' : st.name;
  paintStageDots(n);
  if (!DEMO && startsStage(n)) showBanner(n);
  if (token !== loadToken) return;
  maxHearts = built.hearts ?? 0;
  flow = new PlayFlow(built.level, built.hearts);
  addViews(built.level);
  refreshHud();
  showIntro(built.level, built.hearts !== undefined);
}

/** True when the object and all its parents are drawn (the raycaster also hits hidden objects). */
const drawn = (o: THREE.Object3D | null): boolean => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

/** The animal whose body, plate or badge is drawn under a screen point, standing or running; null if none. */
function animalAt(clientX: number, clientY: number): number | null {
  const owner = new Map<THREE.Object3D, number>();
  for (const [id, v] of views) if (v.group.visible) for (const t of v.tapTargets()) owner.set(t, id);
  const hit = stage.rayAt(clientX, clientY).intersectObjects([...owner.keys()], true).find((h) => drawn(h.object));
  for (let o: THREE.Object3D | null = hit?.object ?? null; o; o = o.parent) if (owner.has(o)) return owner.get(o)!;
  return null;
}

/**
 * The animal a finger means. First the one drawn under it: a tap on the top of an animal hits the floor about half a
 * cell behind it (the camera looks down at 58 degrees), so picking by the floor alone chose the animal behind or
 * nothing. Only when no animal is drawn there, the closest standing animal within 0.75 cell of the floor point.
 */
function pick(clientX: number, clientY: number): number | null {
  const state = current();
  if (!state) return null;
  const seen = animalAt(clientX, clientY);
  if (seen !== null) return seen;
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

/** Crates next to an animal that just left crack; a crate that breaks bursts and opens the way. */
function crackCrates(): void {
  const state = current();
  if (!state) return;
  for (const c of stage.updateCrates(state.level, state.alive)) {
    if (c.broke) { fx.burst(c.pos, 0xc08a52); sound.play('collision'); }
    else { fx.dust(c.pos); sound.play('arrive'); }
  }
}

/** What became of a tap, for the touch diagnostics (?touchdebug). */
type TapOutcome = 'exited' | 'blocked' | 'repeat (R1)' | 'ignored: running' | 'ignored: waiting' | 'ignored: gone' | 'level over' | 'no level';

function onTap(id: number): TapOutcome {
  if (!flow) return 'no level';
  if (isCleared(flow.state) || flow.lost) return 'level over';
  // null: a repeat on an animal still shaking from its blocked tap, the same tap (no second heart)
  const ev = flow.tap(id, performance.now());
  if (!ev) return 'repeat (R1)';
  if (ev.type === 'ignored') {
    const runner = flow.traffic.get(id)?.state;
    return runner === 'waiting' ? 'ignored: waiting' : runner ? 'ignored: running' : 'ignored: gone';
  }
  const view = views.get(id);
  if (ev.type === 'exited' && view) {
    // The rules treat it as gone right away; on the board it runs out through traffic and may wait behind earlier runners.
    fx.launch(view.headWorld());
    sound.play('move');
    pendingExits.add(id);
    view.runOut(() => { if (flow?.won && !anyRunning()) showEnd(true); }, () => {
      pendingExits.delete(id);
      // the last animal's exit is covered by the clear sound
      if (!(flow && isCleared(flow.state) && pendingExits.size === 0)) sound.play('rescued');
      fx.burst(view.gateWorld(), view.color);
      fx.sparkle(view.gateWorld(), view.color);
    });
    $('msg').textContent = '';
    crackCrates();
  } else if (ev.type === 'blocked' && view) {
    view.bump();
    fx.stars(view.headWorld());
    if (ev.blockers.length > 0) collide(id, view);
    else if (cooled(id)) sound.play('wall');
    for (const b of ev.blockers) views.get(b)?.pulse();
    if (ev.lockedBy !== undefined) views.get(ev.lockedBy)?.pulse();
    $('msg').textContent = ev.asleep ? '쿨쿨 자고 있어요. 옆 친구가 나가면 깨어나요' : ev.lockedBy !== undefined ? '잠겨 있어요. 열쇠를 가진 친구가 먼저예요' : ev.blockers.length === 0 && ev.crates ? '상자가 막고 있어요. 옆 친구가 나가면 부서져요' : '앞이 막혔어요';
  }
  refreshHud();
  if (flow.lost) {
    if (!failPlayed) { failPlayed = true; sound.play('gameover'); }
    showEnd(false);
  }
  return ev.type;
}

const SEEN_KEY = 'animal-rescue-seen';
const readSeen = (): string[] => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'); } catch { return []; } };
const writeSeen = (a: string[]): void => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(a)); } catch { /* ignore */ } };

const TIPS: Array<[string, string, string, (l: Level, hearts: boolean) => boolean]> = [
  ['basic', '👆', '친구를 누르면 문 쪽으로 달려가요. 길이 막혀 있으면 못 나가요. 꾹 누르면 가는 길이 보여요.', () => true],
  ['arrow', '➡️', '바닥의 화살표 칸을 지나면 그 방향으로 꺾여요. 화살표를 마주 보면 막혀요.', (l) => (l.arrows?.length ?? 0) > 0],
  ['obstacle', '🪵', '장애물이 있는 칸은 지나갈 수 없어요.', (l) => (l.obstacles?.length ?? 0) > 0],
  ['crate', '📦', '상자나 건초더미가 길을 막고 있어요. 옆에 붙은 친구가 나갈 때마다 금이 가고, 다 깨지면 길이 열려요.', (l) => (l.crates?.length ?? 0) > 0],
  ['long', '🐛', '몸이 긴 친구는 몸 전체가 지나갈 길이 비어 있어야 해요.', (l) => l.pieces.some((p) => p.cells.length >= 3)],
  ['hearts', '♥', '막힌 친구를 누르면 하트가 줄어요. 하트가 모두 없어지면 다시 시작해요.', (_l, h) => h],
  ['key', '🔑', '🔒 잠긴 친구는 🔑 열쇠를 가진 친구가 먼저 나가야 움직일 수 있어요.', (l) => l.pieces.some((p) => p.key !== undefined)],
  ['sleep', '💤', 'Zzz 자는 친구는 옆 친구가 나가면 깨어나요. 깨어나기 전에는 움직이지 못해요.', (l) => l.pieces.some((p) => p.sleeping)],
  ['bomb', '💣', '💣 폭탄 친구 머리 위 숫자는 남은 횟수예요. 다른 친구가 나갈 때마다 1씩 줄고, 0이 되면 터져요. 폭탄 친구 앞을 먼저 비워서 구해 주세요!', (l) => l.pieces.some((p) => p.fuse !== undefined)],
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
  $('popupHome').hidden = true;
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
  const state = current();
  if (!state) return;
  if (won) {
    if (!clearPlayed) { clearPlayed = true; sound.play('clear'); }
    fx.confetti(new THREE.Vector3(0, 0, 0), 8);
  }
  $('popup').hidden = false;
  $('popupTitle').textContent = won ? '구출 성공!' : state.exploded ? '펑! 폭탄이 터졌어요' : '하트가 모두 떨어졌어요';
  $('popupSub').textContent = won ? '모든 친구를 구했어요' : '다시 도전해 볼까요?';
  $('popupBtn').textContent = won ? '다음 레벨' : '다시 하기';
  $('popupHome').hidden = false;
  $('popupHome').onclick = goHome;
  if (won) writeProgress(progressAfterClear(readProgress(), levelNumber, LAST_LEVEL));
  $('popupBtn').onclick = () => {
    if (!won) { void loadLevel(levelNumber); return; }
    const n = levelNumber;
    const next = n >= LAST_LEVEL ? 1 : n + 1; // after the whole journey, start over
    $('popup').hidden = true;
    void playInterludes(interludesAfter(n)).then(() => loadLevel(next));
  };
  if (won) addRescued(state.level.pieces.length);
}

// Decode the sounds now; unlock on any gesture the browser counts as user activation (touch pointerdown may not count on iOS).
sound.prepare();
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, () => sound.unlock(), { capture: true, passive: true });

const canvas = stage.renderer.domElement;
/** Hide the path of an animal once no finger is on it any more. */
const release = (id: number | null): void => {
  if (id !== null && !flow?.input.isPressed(id)) views.get(id)?.showPath(false);
};
canvas.addEventListener('pointerdown', (e) => {
  sound.unlock();
  const id = pick(e.clientX, e.clientY);
  touchDebug?.log({ kind: 'down', e, picked: id, result: id === null ? 'nothing under the finger' : current()?.alive.has(id) ? 'pressed' : 'pressed a running animal' });
  // a running or waiting animal is pressed too (its tap is then ignored, rule R2) but shows no path
  if (id !== null && flow?.input.down(e.pointerId, id) && current()?.alive.has(id)) { views.get(id)?.showPath(true); sound.play('select'); }
});
canvas.addEventListener('pointerup', (e) => {
  if (!flow) return;
  const over = pick(e.clientX, e.clientY);
  const { released, tap: id } = flow.input.up(e.pointerId, over);
  release(released);
  const result = id !== null ? onTap(id) : released === null ? 'no press to finish' : `moved off ${released}`;
  touchDebug?.log({ kind: 'up', e, picked: over, result });
});
canvas.addEventListener('pointercancel', (e) => {
  const released = flow?.input.cancel(e.pointerId) ?? null;
  release(released);
  touchDebug?.log({ kind: 'cancel', e, picked: released, result: 'cancelled by the browser' });
});
$('retry').addEventListener('click', () => { sound.unlock(); void loadLevel(levelNumber); });
$('next').addEventListener('click', () => void loadLevel(levelNumber + 1));
// skipping levels without clearing them is a testing aid only
$('next').hidden = !params.has('dev');

let hintTimer: number | undefined;
/** Light up the most helpful animal and its way out for a moment. Free for now; ads may gate it later. */
function showHint(): void {
  const state = current();
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
    if (!flow?.input.isPressed(view.piece.id)) view.showPath(false);
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
  for (const e of flow?.step(dt, runSpeed()) ?? []) {
    const v = views.get(e.id);
    if (e.type === 'wait' && !e.quiet && v) collide(e.id, v);
  }
  for (const r of flow?.traffic.runners ?? []) views.get(r.id)?.setRun(r.s, r.state === 'waiting');
  for (const v of views.values()) {
    if (v.running && !flow?.traffic.get(v.piece.id)) v.setRun(v.track.length, false); // stepped past the end this frame
    v.update(dt);
    if (dust && v.running && !v.isWaiting) {
      fx.dust(v.headWorld());
      fx.streak(v.headWorld(), v.heading);
      if (++printTick % 2 === 0) fx.print(v.tailWorld(), v.color);
    }
  }
  fx.update(dt);
  stage.update(dt);
  stage.render();
  requestAnimationFrame(loop);
})();

const muteBtn = $('mute');
const paintMute = (): void => { muteBtn.textContent = sound.muted ? '🔇' : '🔊'; };
paintMute();
muteBtn.addEventListener('click', () => { sound.unlock(); sound.setMuted(!sound.muted); paintMute(); });

/** Home: the title over a small board of the game's animals facing the camera. Leaves the saved progress alone. */
function goHome(): void {
  clearBoard();
  speciesOverride.clear();
  const board = titleBoard();
  for (const [id, name] of board.species) speciesOverride.set(id, name);
  stage.setBoard(board.level, 'village', 1, 1);
  addViews(board.level);
  // the title shows the animals themselves, without the play aids (colour plates, gates)
  for (const v of views.values()) v.hideMarkers();
  const saved = readProgress();
  title.show(hasSavedProgress(saved) ? { level: saved, place: stageFor(saved).name } : null);
}

function startLevel(n: number): void {
  title.hide();
  void loadLevel(n);
}

const title = new TitleScreen(
  { start: () => startLevel(1), resume: () => startLevel(readProgress()), restart: () => startLevel(1) },
  // now and then one animal on the title board gives a little hop
  () => { const all = [...views.values()]; all[Math.floor(Math.random() * all.length)]?.pulse(); },
);
$('home').addEventListener('click', goHome);

// dev entry points (?level, ?demo) go straight into play; a build has no parameters and always opens on the title
const fromUrl = Number(params.get('level'));
if (params.has('demo') || (Number.isInteger(fromUrl) && fromUrl >= 1)) void loadLevel(Number.isInteger(fromUrl) && fromUrl >= 1 ? fromUrl : readProgress());
else goHome();

/** Test hook used by automated browser checks (tests/e2e); dev server only. */
if (import.meta.env.DEV) (window as unknown as { __game: unknown }).__game = {
  tap: (id: number) => onTap(id),
  free: () => { const s = current(); return s ? s.level.pieces.filter((p) => s.alive.has(p.id) && canExit(s.level, p.id, s.alive)).map((p) => p.id) : []; },
  views: () => views,
  runSpeed: () => runSpeed(),
  get traffic() { return flow?.traffic; },
  scene: () => stage.scene,
  sound,
  ids: () => { const s = current(); return s ? s.level.pieces.filter((p) => s.alive.has(p.id)).map((p) => p.id) : []; },
  /** A screen point where a finger would get this animal: the top of its head, or the closest such point around it. */
  screenOf: (id: number) => {
    const v = views.get(id);
    if (!v) return null;
    const box = new THREE.Box3().setFromObject(v.tapTargets()[0]);
    const top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2).project(stage.camera);
    const rect = stage.renderer.domElement.getBoundingClientRect();
    const x0 = rect.left + ((top.x + 1) / 2) * rect.width;
    const y0 = rect.top + ((1 - top.y) / 2) * rect.height;
    for (let r = 0; r <= 40; r += 2) for (let a = 0; a < 16; a++) {
      const x = x0 + r * Math.cos((a * Math.PI) / 8), y = y0 + r * Math.sin((a * Math.PI) / 8);
      if (pick(x, y) === id) return { x, y };
      if (r === 0) break;
    }
    return null;
  },
  /** How far each animal's drawn body reaches past half a cell from its block centres, per animal (look checks). */
  overhang: () => [...views.entries()].map(([id, v]) => {
    let worst = 0;
    for (const seg of v.tapTargets().slice(0, v.bodyLen)) {
      const box = new THREE.Box3().setFromObject(seg);
      const c = seg.getWorldPosition(new THREE.Vector3());
      worst = Math.max(worst, box.max.x - c.x, c.x - box.min.x, box.max.z - c.z, c.z - box.min.z);
    }
    return { id, reach: +(worst).toFixed(3) };
  }),
  /**
   * Camera comparison stats on a screen grid: per standing animal, points where it is drawn in front, points where it is
   * hidden behind another animal, and points showing its eyes; plus where the board lies on screen.
   */
  viewStats: (step = 4) => {
    const s = current();
    if (!s) return null;
    const owner = new Map<THREE.Object3D, number>();
    for (const [id, v] of views) if (v.group.visible && s.alive.has(id)) for (const t of v.tapTargets()) owner.set(t, id);
    const idOf = (o: THREE.Object3D | null): number | null => { for (; o; o = o.parent) if (owner.has(o)) return owner.get(o)!; return null; };
    const isEye = (o: THREE.Object3D | null): boolean => { for (; o; o = o.parent) if (o.userData.eye) return true; return false; };
    const per: Record<number, { visible: number; hidden: number; eyes: number }> = {};
    for (const id of owner.values()) per[id] ??= { visible: 0, hidden: 0, eyes: 0 };
    for (let y = 1; y < innerHeight; y += step) for (let x = 1; x < innerWidth; x += step) {
      const hits = stage.rayAt(x, y).intersectObjects([...owner.keys()], true).filter((h) => drawn(h.object));
      const seen: number[] = [];
      for (const h of hits) { const id = idOf(h.object); if (id !== null && !seen.includes(id)) seen.push(id); }
      if (!seen.length) continue;
      per[seen[0]].visible++;
      if (isEye(hits[0].object)) per[seen[0]].eyes++;
      for (const id of seen.slice(1)) per[id].hidden++;
    }
    const { width: w, height: h } = s.level;
    const rect = stage.renderer.domElement.getBoundingClientRect();
    const corners = [[-0.5, -0.5], [w - 0.5, -0.5], [-0.5, h - 0.5], [w - 0.5, h - 0.5]].map(([gx, gy]) => {
      const p = stage.worldOf(s.level, gx, gy).project(stage.camera);
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
    });
    const bar = document.getElementById('retry')!.getBoundingClientRect().top;
    const hud = Math.max(document.getElementById('hud')!.getBoundingClientRect().bottom, document.getElementById('mute')!.getBoundingClientRect().bottom);
    const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y);
    return {
      animals: s.level.pieces.map((p) => ({ id: p.id, len: p.cells.length, dir: headDirection(p), ...per[p.id] })),
      board: { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys), screenW: innerWidth, screenH: innerHeight, barTop: bar, hudBottom: hud },
    };
  },
  /**
   * One-cell floor cues: for each cue, screen points where it is drawn on top and where an animal covers it, sampled every
   * pixel over the cue's own screen box.
   */
  markStats: () => {
    const targets = new Map<THREE.Object3D, { id: number; mark: boolean }>();
    for (const [id, v] of views) if (v.group.visible) {
      for (const t of v.tapTargets()) targets.set(t, { id, mark: false });
      for (const t of v.markParts()) targets.set(t, { id, mark: true });
    }
    const whose = (o: THREE.Object3D | null): { id: number; mark: boolean } | null => { for (; o; o = o.parent) if (targets.has(o)) return targets.get(o)!; return null; };
    const rect = stage.renderer.domElement.getBoundingClientRect();
    const out: Array<{ id: number; dir: string; visible: number; covered: number }> = [];
    for (const [id, v] of views) {
      const parts = v.markParts();
      if (!parts.length || !v.group.visible) continue;
      const box = new THREE.Box3();
      for (const m of parts) box.expandByObject(m);
      const xs: number[] = [], ys: number[] = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(x, y, z).project(stage.camera);
        xs.push(rect.left + ((p.x + 1) / 2) * rect.width); ys.push(rect.top + ((1 - p.y) / 2) * rect.height);
      }
      let visible = 0, covered = 0;
      for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        const hits = stage.rayAt(x, y).intersectObjects([...targets.keys()], true).filter((h) => drawn(h.object));
        const i = hits.findIndex((h) => { const w = whose(h.object); return w?.mark === true && w.id === id; });
        if (i === 0) visible++;
        else if (i > 0) covered++;
      }
      out.push({ id, dir: headDirection(v.piece), visible, covered });
    }
    return out;
  },
  /** Head-top features (userData.crown) of each animal's head: screen points where they are drawn on top or covered. */
  crownStats: (step = 1) => {
    const targets = new Map<THREE.Object3D, number>();
    for (const [id, v] of views) if (v.group.visible) for (const t of v.tapTargets()) targets.set(t, id);
    const owner = (o: THREE.Object3D | null): number | null => { for (; o; o = o.parent) if (targets.has(o)) return targets.get(o)!; return null; };
    const isCrown = (o: THREE.Object3D | null): boolean => { for (; o; o = o.parent) if (o.userData.crown) return true; return false; };
    const rect = stage.renderer.domElement.getBoundingClientRect();
    const out: Array<{ id: number; len: number; dir: string; visible: number; covered: number }> = [];
    for (const [id, v] of views) {
      const parts: THREE.Object3D[] = [];
      v.tapTargets()[0].traverse((o) => { if (o.userData.crown) parts.push(o); });
      if (!parts.length) { out.push({ id, len: v.bodyLen, dir: headDirection(v.piece), visible: 0, covered: 0 }); continue; }
      const box = new THREE.Box3();
      for (const m of parts) box.expandByObject(m);
      const xs: number[] = [], ys: number[] = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(x, y, z).project(stage.camera);
        xs.push(rect.left + ((p.x + 1) / 2) * rect.width); ys.push(rect.top + ((1 - p.y) / 2) * rect.height);
      }
      let visible = 0, covered = 0;
      for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y += step) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x += step) {
        const hits = stage.rayAt(x, y).intersectObjects([...targets.keys()], true).filter((h) => drawn(h.object));
        const i = hits.findIndex((h) => owner(h.object) === id && isCrown(h.object));
        if (i === 0) visible++;
        else if (i > 0 && owner(hits[0].object) !== id) covered++;
      }
      out.push({ id, len: v.bodyLen, dir: headDirection(v.piece), visible, covered });
    }
    return out;
  },
  /** Touch probe at a screen point: the animal whose model is drawn there, the one pick() chooses, and the element on top. */
  probe: (clientX: number, clientY: number) => {
    const rect = stage.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1)), stage.camera);
    let seen: number | null = null;
    const s = current();
    const groups = [...views.entries()].filter(([id, v]) => v.group.visible && s?.alive.has(id));
    // the raycaster also hits hidden objects (path chevrons, badges): only count what is drawn
    const drawn = (o: THREE.Object3D | null): boolean => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
    const hit = ray.intersectObjects(groups.map(([, v]) => v.group), true).find((h) => drawn(h.object));
    if (hit) seen = groups.find(([, v]) => { let o: THREE.Object3D | null = hit.object; while (o && o !== v.group) o = o.parent; return o === v.group; })?.[0] ?? null;
    // which part was hit: tapTargets() lists the body blocks, then one plate per block, then the badge
    let part: 'body' | 'plate' | 'badge' | 'other' | null = null;
    if (hit && seen !== null) {
      const v = views.get(seen)!;
      const targets = v.tapTargets();
      part = 'other';
      for (let o: THREE.Object3D | null = hit.object; o && o !== v.group; o = o.parent) {
        const i = targets.indexOf(o);
        if (i >= 0) { part = i < v.bodyLen ? 'body' : i < 2 * v.bodyLen ? 'plate' : 'badge'; break; }
      }
    }
    const top = document.elementFromPoint(clientX, clientY);
    return { seen, part, hitY: hit ? +hit.point.y.toFixed(2) : null, picked: pick(clientX, clientY), grid: stage.screenToGrid(clientX, clientY), top: top === stage.renderer.domElement ? 'canvas' : (top?.id || top?.tagName || null) };
  },
  state: () => { const s = current(); return s && { taps: s.taps, blocked: s.blockedTaps, hearts: s.hearts, fuses: { ...s.fuses }, alive: [...s.alive], cleared: isCleared(s), failed: isFailed(s) }; },
};

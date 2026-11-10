import { isCleared, isFailed, type GameState } from '../src/core/game';
import { bombLevel, crossLevel, demoLevel, dirsLevel, quizLevel, SHEET_SPECIES, sheetLevel, turnLevel } from './demo';
import { LEVELS as EXP_LEVELS } from '../experiments/knot-small/levels';
import { PlayLog } from '../src/game/playlog';
import { decideHint, extendStreak, type BlockCause, type Streak } from '../src/game/blockedHint';
import { buildGameLevel, levelSpec, STAGE_LENGTH, stageFor, type Theme } from '../src/curve/curve';
import { canExit, crateStanding, cratesInWay, headDirection, isAsleep, lockedBy, piecesAround, traceExit } from '../src/core/rules';
import { bumpAdvance, bumpResult, burnOnCollision, pickPush } from '../src/core/bump';
import { stuckAtOnce } from '../src/generator/knotSearch';
import { distanceToPolyline } from '../src/game/path';
import type { Direction, Level } from '../src/core/types';
import { PieceView, runSpeed, speciesOverride } from './animals';
import { setStatusPixelScale } from './statusIcons';
import { PlayFlow } from '../src/game/flow';
import { hasSavedProgress, parseProgress, parseSeen, progressAfterClear } from '../src/game/progress';
import { picturesSettled } from './loading';
import { lostHeartSlots } from '../src/game/hearts';
import { TitleScreen, titleBoard, type BoardBand } from './screens';
import { dialogButton, Modal, para } from './modal';
import { items, lives, onEconomyChange } from './economy';
import { LivesUi, toast } from './livesUi';
import { haptics, music, setupSettings } from './settings';
import { platform } from './platform';
import { arrowTargets, bombToWatch, bumpTargets, crateLessonAt, lessonsBefore, resultSubjects, startTargets, startTutorial, type TutorialId } from '../src/game/tutorialPlan';
import { Tutorial, type TutorialSpot } from './tutorial';
import { pickHint } from '../src/game/hint';
import { interludesAfter, LAST_LEVEL, splitName, stageStep, startsStage, type Interlude } from '../src/game/journey';
import { PALETTES } from './scenery';
import { loadBackground, Stage, stageBackground } from './stage';
import { Fx } from './fx';
import { sound } from './sound';
import * as THREE from 'three';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const stage = new Stage($('app'));
const fx = new Fx(stage.scene);
const modal = new Modal();
/** 하트 (lives) and coins, the 사천팝 rules (game/economy.ts): the pills in the top row, the hearts popup, the shop. */
const livesUi = new LivesUi(modal);
/** The level in play: rules, animals running out, touch input. Null while a level loads. */
// the cast keeps TypeScript from narrowing this to null inside the render loop that starts right away
let flow = null as PlayFlow | null;
const current = (): GameState | null => flow?.state ?? null;
let views = new Map<number, PieceView>();
let levelNumber = 1;
/**
 * Undos per level (2026-11-07): with undo free, a knot was solved by trying pushes rather than reading them (ten levels
 * of chapter 5 in under five minutes, playtest 2026-11-06). Each undo takes back the last push and what came after it;
 * with none left, a board that is physically stuck is lost and the level starts over.
 */
const UNDO_PER_LEVEL = 3;
let undosLeft = UNDO_PER_LEVEL;
/**
 * The push hint shows once per level number: for a knot it is the answer. Kept across retries (a retry and a hint
 * would otherwise give the next push of the answer for free, as many times as wanted) until the level is cleared.
 */
const hintPushUsed = new Set<number>();
/** The board is physically stuck with no undo left: the level is over (showEnd), taps are ignored. */
let stuckOut = false;
/** Hearts the level started with, for the empty-heart outlines in the HUD. */
let maxHearts = 0;
let loadToken = 0;
/** Running speed for the board in view when it is not the game's own (the title's slow runner); null: the game's. */
let loopSpeed: number | null = null;
/** One-shot guards so a result sound plays once per level, even if the end is detected more than once. */
/** Animals that were sent out and have not crossed the board edge yet. */
const pendingExits = new Set<number>();
let clearPlayed = false;
let failPlayed = false;
/** Which code and level data this is (tools/build-info.ts via the vite configs); 'unknown' outside those configs. */
const BUILD = typeof __BUILD_INFO__ === 'object' && __BUILD_INFO__ ? __BUILD_INFO__ : { commit: 'unknown', branch: 'unknown', dirty: false, levels: 'unknown', builtAt: '' };
// which build this is, in the corner, for playtests on the dev server only
/** Playtest record (E3, test builds only): its own storage key, never read by the game. Null in a production build. */
const playlog = import.meta.env.DEV ? new PlayLog((() => { try { return localStorage; } catch { return null; } })(), { commit: BUILD.commit, branch: BUILD.branch, dirty: BUILD.dirty, levels: BUILD.levels }) : null;

const PROGRESS_KEY = 'animal-rescue-progress';

const readProgress = (): number => { try { return parseProgress(localStorage.getItem(PROGRESS_KEY), LAST_LEVEL); } catch { return 1; } };
const writeProgress = (n: number): void => { try { localStorage.setItem(PROGRESS_KEY, String(n)); } catch { /* ignore */ } };

/**
 * Test and development entry points (?demo, ?level, ?dev, ?raw, ?theme, ?stage and the window.__game hook) work only on the
 * Vite dev server. A production build sees no parameters, and the bundler drops the code behind import.meta.env.DEV.
 */
const params = import.meta.env.DEV ? new URLSearchParams(location.search) : new URLSearchParams();
/** ?touchdebug on the dev server: every touch on screen with what it hit and what became of it (game/touchdebug.ts). */
let touchDebug: import('./touchdebug').TouchDebug | null = null;
/** ?cam=<degrees> on the dev server: camera elevation comparisons; &camzoom=keep keeps the 58 degree distance. */
if (params.has('cam')) {
  stage.elevation = Math.min(85, Math.max(20, Number(params.get('cam')) || 58));
  stage.keepZoom = params.get('camzoom') === 'keep';
}
if (import.meta.env.DEV && params.has('touchdebug')) void import('./touchdebug').then((m) => { touchDebug = new m.TouchDebug(); });
const DEMO = params.has('demo');
/**
 * The bump rule (docs/rules.md 2): a blocked animal runs up to what stops it and stays there (src/core/bump.ts). No
 * hearts; "되돌리기" takes back the last tap, and the game says when the board can no longer be cleared. ?rule=classic on
 * the dev server plays the old rule (a blocked animal stays put, three hearts) for comparisons.
 */
const BUMP = params.get('rule') !== 'classic';

function buildLevel(n: number): { level: Level; hearts?: number } | null {
  if (params.get('demo') === 'sheet') {
    const names = params.get('species')?.split(',') ?? SHEET_SPECIES.slice(0, 6);
    const dirs = params.get('dirs')?.split(',') as Direction[] | undefined;
    const sheet = sheetLevel(names, params.has('len') ? Number(params.get('len')) : undefined, dirs);
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
  // ?exp=<name>: a level of the small whole-knot experiment (experiments/knot-small), dev only
  const exp = params.get('exp');
  if (import.meta.env.DEV && exp && EXP_LEVELS[exp]) return { level: EXP_LEVELS[exp] };
  return buildGameLevel(n);
}

/** Heart icons for the HUD and the result card: the hearts left bright, the ones used dark. Fixed markup only. */
/** Hearts as the HUD last showed them, so a heart just lost can pop. */
let shownHearts = 0;
const heartsMarkup = (left: number, max: number): string =>
  '<i class="heart full"></i>'.repeat(Math.max(0, left)) + '<i class="heart empty"></i>'.repeat(Math.max(0, max - Math.max(0, left)));

/** How long a lost heart takes to shrink and break (heartBreak in index.html); the hearts-out card waits for it. */
const HEART_BREAK_MS = 350;
/** How long a count bomb at zero takes to go off in 2.5D (icon swell, then the burst) before the bomb card shows. */
const BOMB_BLAST_MS = 400;
let failTimer: number | undefined;

const playGameover = (): void => { if (!failPlayed) { failPlayed = true; sound.play('gameover'); } };

/** How long the 2.5D board celebrates (clear sound) before the rescue card shows. */
const CLEAR_CELEBRATE_MS = 1200;
let winTimer: number | undefined;

/**
 * The last animal has left the board: the clear sound, and the clear is saved, all at once. 2.5D shows the
 * rescue card CLEAR_CELEBRATE_MS later with the buttons still usable (home, a level change or a retry go through
 * clearBoard, which drops the card still waiting); reduced motion (or no animal views) shows it at once.
 */
function winLevel(): void {
  const state = current();
  if (!state || clearPlayed) return;
  clearPlayed = true;
  sound.play('clear');
  haptics.buzz([30, 50, 30]);
  writeProgress(progressAfterClear(readProgress(), levelNumber, LAST_LEVEL));
  addRescued(state.level.pieces.length);
  if (reducedMotion() || views.size === 0) { showEnd(true); return; }
  winTimer = window.setTimeout(() => { winTimer = undefined; showEnd(true); }, CLEAR_CELEBRATE_MS);
}

/** Show the lost card after `ms`; meanwhile the buttons wait as well (clearBoard drops a card still waiting). */
function showLostAfter(ms: number, then?: () => void): void {
  document.body.classList.add('heart-wait');
  failTimer = window.setTimeout(() => { document.body.classList.remove('heart-wait'); then?.(); showEnd(false); }, ms);
}

/**
 * A count bomb reached zero. Every bomb at zero swells its icon away and bursts (orange and grey bits, a dust ring),
 * one punch sound, and the bomb card with its sound after BOMB_BLAST_MS. Reduced motion (or no bomb icon shown): the
 * card and sound at once. No hearts are taken.
 */
function blowUp(state: GameState): void {
  const bombs = state.level.pieces.filter((p) => p.fuse !== undefined && state.alive.has(p.id) && state.fuses[p.id] <= 0);
  const blasts = reducedMotion() ? [] : bombs.map((p) => views.get(p.id)).filter((v): v is PieceView => !!v && v.explode());
  if (!blasts.length) { playGameover(); showEnd(false); return; }
  for (const v of blasts) {
    fx.burst(v.headWorld(), 0xf07b3f);
    fx.burst(v.headWorld(), 0x8c8c8c);
    fx.launch(v.headWorld());
  }
  sound.play('collision');
  haptics.buzz([60, 40, 140]);
  showLostAfter(BOMB_BLAST_MS, playGameover);
}
const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** The shared heart-loss feedback: the heart shrinks and breaks in two over the empty heart left behind. */
function breakHeart(heart: Element): void {
  heart.classList.remove('pop');
  void (heart as HTMLElement).offsetWidth; // restart the animation if this heart is still breaking
  heart.classList.add('pop');
  heart.addEventListener('animationend', () => heart.classList.remove('pop'), { once: true });
}

/**
 * Show `left` of the level's hearts. The heart elements stay and only the ones that changed flip, so a heart still
 * breaking keeps animating when the next blocked tap redraws the HUD; a new level (other heart count) builds them anew.
 */
function syncHearts(left: number | undefined): void {
  const box = $('hearts');
  if (left === undefined) { box.innerHTML = ''; return; }
  if (box.children.length !== maxHearts) { box.innerHTML = heartsMarkup(left, maxHearts); shownHearts = left; return; }
  [...box.children].forEach((heart, i) => { heart.classList.toggle('full', i < left); heart.classList.toggle('empty', i >= left); });
  for (const i of lostHeartSlots(shownHearts, left)) breakHeart(box.children[i]);
  shownHearts = left;
}

function refreshHud(): void {
  const state = current();
  if (!state) return;
  const spec = levelSpec(levelNumber);
  // reads as "레벨 7" (textContent), drawn as a small label and a big number
  $('levelLabel').innerHTML = `<span class="lvK">Lv.</span><span class="lvN">${levelNumber}</span>`;
  $('levelLabel').setAttribute('aria-label', `레벨 ${levelNumber}`);
  // a heart just lost breaks once (plain feedback on the blocked tap)
  syncHearts(state.hearts);
  $('hearts').setAttribute('aria-label', state.hearts === undefined ? '' : `하트 ${Math.max(0, state.hearts)}개 남음`);
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

/** Blocked-tap words (src/game/blockedHint.ts): the streak of taps on one stuck animal, and the 2 s timer of the line shown. */
let blockStreak: Streak | null = null;
let blockMsgTimer: number | undefined;
const BLOCK_MSG_MS = 2000;
const HINT_COUNT_KEY = 'animal-rescue-hint-count';
const readHintCount = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(HINT_COUNT_KEY) ?? '{}') ?? {}; } catch { return {}; } };
const bumpHintCount = (cause: BlockCause): void => { try { const c = readHintCount(); c[cause] = (c[cause] ?? 0) + 1; localStorage.setItem(HINT_COUNT_KEY, JSON.stringify(c)); } catch { /* ignore */ } };
/** A blocked-tap line goes away after BLOCK_MSG_MS, but only if it is still the one on screen (a lesson's words stay). */
function sayBlocked(text: string): void {
  const msg = $('msg');
  msg.textContent = text;
  window.clearTimeout(blockMsgTimer);
  blockMsgTimer = window.setTimeout(() => { if (msg.textContent === text) msg.textContent = ''; }, BLOCK_MSG_MS);
}

/**
 * Drop whatever is on the board: the level in play, its animals (so no run that is still under way can call back with
 * a result), popups, timers and sounds. Returns the new load token. Shared by starting a level and going home.
 */
function clearBoard(): number {
  const token = ++loadToken;
  $('popup').hidden = true;
  $('banner').hidden = true;
  loopSpeed = null;
  $('msg').textContent = '';
  window.clearTimeout(blockMsgTimer);
  blockStreak = null;
  fx.clear();
  sound.stopAll();
  stopTutorials();
  clearPlayed = false;
  failPlayed = false;
  pendingExits.clear();
  notYetMoved.clear();
  lastHit.clear();
  flow = null;
  window.clearTimeout(hintTimer);
  // a hearts-out card still waiting belongs to the board being thrown away
  window.clearTimeout(failTimer);
  window.clearTimeout(winTimer);
  winTimer = undefined;
  document.body.classList.remove('heart-wait');
  $('hearts').innerHTML = '';
  $('undo').classList.remove('nudge');
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

/** The platform round (Apps in Toss: SDK round start/end, missions, leaderboard; web: nothing). */
let roundAt = 0;
function endRound(): void {
  if (!roundAt) return;
  platform.roundEnd(levelNumber, Date.now() - roundAt);
  roundAt = 0;
}

async function loadLevel(n: number): Promise<void> {
  const token = clearBoard();
  endRound();
  roundAt = Date.now();
  platform.setIdle(false);
  platform.roundStart(n);
  const before = playlog?.current;
  playlog?.begin(n, params.get('exp') ?? params.get('demo') ?? undefined, before && before.level !== n ? 'skip' : 'retry');
  levelNumber = n;
  // the title board pins species to its ids; game levels choose their own
  speciesOverride.clear();
  const built = buildLevel(n);
  if (!built) { $('msg').textContent = '레벨을 만들 수 없어요'; return; }
  const st = stageFor(n);
  stage.setBoard(built.level, DEMO ? ((params.get('theme') as Theme | null) ?? 'village') : st.theme, n, DEMO ? Number(params.get('stage') ?? 1) : st.stage);
  // fetch the next stage's painted background now, so it shows at once when that stage starts
  { const next = stageFor(Math.ceil(n / STAGE_LENGTH) * STAGE_LENGTH + 1); const url = stageBackground(next.theme, next.stage); if (url) loadBackground(url); }
  if (!DEMO && startsStage(n)) showBanner(n);
  if (token !== loadToken) return;
  // no hearts under the bump rule; the old rule (and the ?demo fixtures the browser checks drive) keep three
  const hearts = BUMP && !DEMO ? undefined : built.hearts ?? (levelSpec(n).role === 'rest' || levelSpec(n).role === 'intro' ? undefined : 3);
  maxHearts = hearts ?? 0;
  flow = new PlayFlow(built.level, hearts, BUMP);
  undosLeft = UNDO_PER_LEVEL;
  stuckOut = false;
  paintUndo();
  addViews(built.level);
  refreshHud();
  shownHearts = hearts ?? 0;
  // the animal cards ask for their pictures as they are first drawn: draw once, and start the level (its tutorial
  // first of all) only when they are here
  stage.render();
  await waitForPictures(token);
  if (token !== loadToken) return;
  beginTutorials(built.level);
}

/** Longest wait for a level's pictures; after it the level starts anyway and late pictures appear when they come. */
const PICTURES_LIMIT_MS = 12000;
/** A wait shorter than this shows nothing (the usual case once the pictures are in the browser's cache). */
const PICTURES_QUIET_MS = 250;

/**
 * Hold the screen (touches included) until the pictures asked for so far are here, for at most PICTURES_LIMIT_MS. If
 * some could not be loaded, say so and offer to load again or to play as it is; it never waits for ever.
 */
async function waitForPictures(token: number): Promise<void> {
  const box = $('loading');
  const shown = window.setTimeout(() => {
    if (token !== loadToken) return;
    $('ldText').textContent = '친구들을 부르고 있어요';
    $('ldBtns').hidden = true;
    box.classList.remove('failed');
    box.hidden = false;
  }, PICTURES_QUIET_MS);
  const outcome = await picturesSettled(PICTURES_LIMIT_MS);
  window.clearTimeout(shown);
  if (outcome === 'failed' && token === loadToken) {
    $('ldText').textContent = '그림을 다 불러오지 못했어요.\n인터넷 연결을 확인해 주세요.';
    $('ldBtns').hidden = false;
    box.classList.add('failed');
    box.hidden = false;
    await new Promise<void>((resolve) => {
      $('ldGo').onclick = () => resolve();
      $('ldRetry').onclick = () => location.reload();
    });
  }
  box.hidden = true;
}

/** The undo button shows how many are left this level. */
function paintUndo(): void {
  // the level's own undos plus the ones kept as items (선물 상자, 상점)
  const total = undosLeft + items.get('undo');
  const label = $('undo').querySelector('span');
  if (label) label.textContent = `되돌리기 ${total}`;
  $('undo').classList.toggle('spent', total === 0);
  const hint = $('hint').querySelector('span');
  if (hint) hint.textContent = `힌트 ${items.get('hint')}`;
}
onEconomyChange(paintUndo);

/**
 * Bump rule: take back the last push and every tap after it (exits never hurt, so there is nothing to take back before
 * a push). The level is built afresh and the earlier taps replayed at once, so moved animals, cracked crates and
 * animals already out come back exactly as they were. Costs one of the level's undos.
 */
function undoTap(): void {
  if (!flow || !flow.pushes.length || anyRunning() || stuckOut) return;
  if (undosLeft <= 0) {
    // the level's three are gone: one kept as an item, or none left (the box or the shop then)
    if (!items.add('undo', -1)) { $('msg').textContent = '되돌리기를 다 썼어요'; livesUi.outOf('undo'); paintUndo(); return; }
  } else undosLeft--;
  playlog?.undo();
  const log = flow.log.slice(0, flow.pushes[flow.pushes.length - 1]);
  const n = levelNumber;
  clearBoard();
  const built = buildLevel(n);
  if (!built) return;
  const st = stageFor(n);
  stage.setBoard(built.level, st.theme, n, st.stage);
  const replay = PlayFlow.replay(built.level, log);
  flow = replay;
  addViews(built.level);
  for (const [id, v] of views) {
    if (replay.state.alive.has(id)) v.setHead(replay.headAt(id));
    else { stage.scene.remove(v.group); v.dispose(); views.delete(id); }
  }
  // the crates take their state at once: their cracks and breaks already played before the undo
  stage.updateCrates(replay.state.level, replay.state.alive, true);
  paintUndo();
  refreshHud();
}

/**
 * Bump rule: after a tap, say so when nothing on the board can leave or move any more. Only what the player can see
 * counts (2026-11-07): the game no longer tells whether a push knotted the board for good, because that answer made
 * every wrong push free to take back. With no undo left, a stuck board is a lost level.
 */
function checkStuck(): void {
  const s = current();
  if (!BUMP || !s || isCleared(s) || isFailed(s) || stuckOut) return;
  if (!stuckAtOnce(s.level, s.alive)) { $('undo').classList.remove('nudge'); return; }
  if (undosLeft > 0) {
    $('msg').textContent = `길이 막혔어요. 되돌리기 ${undosLeft}번 남았어요`;
    $('undo').classList.add('nudge');
    return;
  }
  stuckOut = true;
  playGameover();
  showEnd(false);
}

$('undo').addEventListener('click', () => { sound.unlock(); undoTap(); checkStuck(); });
if (!BUMP) $('undo').hidden = true;

/** True when the object and all its parents are drawn (the raycaster also hits hidden objects). */
const drawn = (o: THREE.Object3D | null): boolean => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

/** The animal whose body, plate or badge is drawn under a screen point, standing or running; null if none. */
function animalAt(clientX: number, clientY: number): number | null {
  const owner = new Map<THREE.Object3D, number>();
  for (const [id, v] of views) if (v.group.visible) for (const t of v.touchTargets()) owner.set(t, id);
  const hit = stage.rayAt(clientX, clientY).intersectObjects([...owner.keys()], true).find((h) => drawn(h.object));
  for (let o: THREE.Object3D | null = hit?.object ?? null; o; o = o.parent) if (owner.has(o)) return owner.get(o)!;
  return null;
}

/**
 * The animal a finger sees under it (animals are drawn as picture cards): the nearest opaque card pixel, which is the
 * one the depth test keeps on screen. The status icons are left out: drawn over everything, they covered the animal
 * behind and took its taps (2026-11-05). Null when no animal is shown there; pick() then goes on with the tap targets.
 */
function cardAnimalAt(clientX: number, clientY: number): number | null {
  const shown = [...views.entries()].filter(([, v]) => v.group.visible);
  if (!shown.length) return null;
  const ray = stage.rayAt(clientX, clientY);
  const nearest = (distance: (v: PieceView) => number | null): number | null => {
    let best: { id: number; d: number } | null = null;
    for (const [id, v] of shown) {
      const d = distance(v);
      if (d !== null && (!best || d < best.d)) best = { id, d };
    }
    return best?.id ?? null;
  };
  return nearest((v) => v.cardHitDistance(ray));
}

/**
 * The animal a finger means. First the one drawn under it: a tap on the top of an animal hits the floor about half a
 * cell behind it (the camera looks down at 58 degrees), so picking by the floor alone chose the animal behind or
 * nothing. When no animal is drawn there: a press right on a count bomb's icon (an opaque pixel) picks its animal, so
 * the bomb itself can be pressed; only then the closest standing animal within 0.75 cell of the floor point.
 */
function pick(clientX: number, clientY: number): number | null {
  const state = current();
  if (!state) return null;
  const shown = cardAnimalAt(clientX, clientY);
  if (shown !== null) return shown;
  const seen = animalAt(clientX, clientY);
  if (seen !== null) return seen;
  const ray = stage.rayAt(clientX, clientY);
  for (const [id, v] of views) if (state.alive.has(id) && v.bombIconHit(ray)) return id;
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

/**
 * Hit another animal (standing or running): punch sound, flinch and a "!" on the animal that was tapped. `alert` false:
 * the sound only (a 2.5D blocked tap, whose head shake already says it).
 */
function collide(id: number, view: PieceView, alert = true): void {
  if (!cooled(id)) return;
  if (alert) view.collide();
  sound.play('collision');
  haptics.buzz(25);
}

/** Crates next to an animal that just left crack; a crate that breaks bursts and opens the way. */
/**
 * Animals sent out that have not yet stepped off their spot (head arc length when sent). The rules count a neighbour
 * as gone from the tap, but on the board a crate only cracks once that neighbour really sets off: one held up behind
 * an earlier runner still stands beside the crate, so the crate holds until it moves.
 */
const notYetMoved = new Map<number, number>();
/** How far (cells) a runner's head goes before it has left its spot. */
const SET_OFF = 0.05;

function crackCrates(): void {
  const state = current();
  if (!state) return;
  let shown: ReadonlySet<number> = notYetMoved.size ? new Set([...state.alive, ...notYetMoved.keys()]) : state.alive;
  // but a runner already under way whose path goes through such a crate must not run through it standing: the rules
  // have it broken, so it breaks now
  if (shown !== state.alive) {
    const held = (state.level.crates ?? []).filter((k) => crateStanding(state.level, k, shown) && !crateStanding(state.level, k, state.alive));
    const crossed = held.some((k) => (flow?.traffic.runners ?? []).some((r) => !notYetMoved.has(r.id)
      && r.samples.some((p) => Math.abs(p.x - k.x) < 0.6 && Math.abs(p.y - k.y) < 0.6)));
    if (crossed) shown = state.alive;
  }
  for (const c of stage.updateCrates(state.level, shown)) {
    if (c.broke) { fx.burst(c.pos, 0xc08a52); sound.play('collision'); crateLessonBroke(c.x, c.y); cratePushBroke(c.x, c.y); }
    else {
      fx.dust(c.pos); sound.play('arrive');
    }
  }
}

/** What became of a tap, for the touch diagnostics (?touchdebug). */
type TapOutcome = 'exited' | 'blocked' | 'repeat (R1)' | 'ignored: running' | 'ignored: waiting' | 'ignored: gone' | 'level over' | 'no level';

function onTap(id: number): TapOutcome {
  if (!flow) return 'no level';
  if (isCleared(flow.state) || flow.lost || stuckOut) return 'level over';
  if (blockStreak && blockStreak.id !== id) blockStreak = null;
  // null: a repeat on an animal still shaking from its blocked tap, the same tap (no second heart)
  const ev = flow.tap(id, performance.now());
  if (!ev) {
    // a push while an animal still runs waits for the board to settle (flow.ts); a repeat blocked tap is the same tap
    if (anyRunning()) $('msg').textContent = '친구가 지나간 다음에 눌러요';
    playlog?.tap('ignored');
    return 'repeat (R1)';
  }
  // the record tells a free animal's exit from a push (a blocked tap that moved) and a bump that moved nothing
  playlog?.tap(ev.type === 'exited' ? 'exit' : ev.type === 'blocked' ? (ev.moved ? 'push' : 'bump') : 'ignored');
  if (ev.type === 'ignored') {
    const runner = flow.traffic.get(id)?.state;
    return runner === 'waiting' ? 'ignored: waiting' : runner ? 'ignored: running' : 'ignored: gone';
  }
  const view = views.get(id);
  if (ev.type === 'exited' && view) {
    // a tap tutorial is done once its animal really leaves
    if (tutorialShown?.target === id && !tutorialInfo) tutorialTapped();
    tutorialCheck = true;
    // The rules treat it as gone right away; on the board it runs out through traffic and may wait behind earlier runners.
    fx.launch(view.headWorld());
    sound.play('move');
    view.setHalo(false);
    pendingExits.add(id);
    view.runOut(() => { if (flow?.won && !anyRunning()) winLevel(); }, () => {
      pendingExits.delete(id);
      // the last animal's exit is covered by the clear sound
      if (!(flow && isCleared(flow.state) && pendingExits.size === 0)) sound.play('rescued');
      fx.escape(view.gateWorld(), view.color);
    });
    $('msg').textContent = '';
    blockStreak = null;
    crateLessonExit(id); // the lesson's line (crackCrates may replace it with the break's)
    // its crate cracks once it sets off (the frame loop), not at the tap
    const runner = flow.traffic.get(id);
    if (runner) notYetMoved.set(id, runner.s);
    crackCrates();
  } else if (ev.type === 'blocked' && view) {
    const feedback = (): void => {
      // the head shake alone (no stars, no "!")
      view.bump();
      if (ev.blockers.length > 0) collide(id, view, false);
      else if (cooled(id)) { sound.play('wall'); haptics.buzz(20); }
      for (const b of ev.blockers) views.get(b)?.pulse();
      if (ev.lockedBy !== undefined) views.get(ev.lockedBy)?.pulse();
    };
    // bump rule: it runs up to what stops it first, and the bump comes on arrival
    const pushLesson = !!ev.moved && (tutorialShown?.id === 'bump' || tutorialShown?.id === 'cratePush') && tutorialShown.target === id && !tutorialInfo;
    if (ev.moved) {
      if (pushLesson) tutorialPushed(id);
      else if (tutorialShown?.target === id && !tutorialInfo) tutorialTapped();
      tutorialCheck = true;
      sound.play('move');
      view.slideTo(flow.headAt(id), () => { feedback(); if (pushLesson) tutorialArrived(id); });
    } else feedback();
    // the words follow the rules exactly (2026-11-07 audit): a crate cracks per neighbour that leaves, as many times as
    // its dots show; a sleeper's neighbours are whoever stands next to it now
    const cause: BlockCause = ev.asleep ? 'sleep' : ev.lockedBy !== undefined ? 'key' : ev.blockers.length === 0 && ev.crates ? 'crate' : 'plain';
    if (pushLesson) {
      blockStreak = null;
      $('msg').textContent = tutorialShown?.id === 'cratePush' ? '' : BUMP_LESSON_MSG;
    } else {
      // a push changed the board; a tap that moved nothing extends the streak on this animal
      blockStreak = ev.moved ? null : extendStreak(blockStreak, id);
      const seen = readSeen();
      const text = cause === 'sleep' ? '쿨쿨 자고 있어요. 지금 옆에 있는 친구가 나가면 깨어나요'
        : cause === 'key' ? '잠겨 있어요. 열쇠를 가진 친구가 먼저예요'
        : cause === 'crate' ? '상자가 막고 있어요. 바로 옆에서 친구가 나갈 때마다 금이 가고, 표시된 만큼 금이 가면 부서져요'
        : ev.moved ? PUSHED_MSG : '앞이 막혔어요';
      const lesson = cause === 'plain' ? undefined : cause === 'sleep' ? 'sleep' : cause === 'key' ? 'key' : 'crate';
      if (ev.moved && cause === 'plain') { if (!seen.includes('bump')) sayBlocked(text); }
      else {
        const streak = blockStreak ?? { id, n: 1, said: false };
        const d = decideHint(cause, streak, lesson ? seen.includes(lesson) : true, readHintCount()[cause] ?? 0);
        if (d.say) {
          sayBlocked(text);
          if (d.count) bumpHintCount(cause);
          if (blockStreak) blockStreak = { ...blockStreak, said: true };
        }
      }
    }
  }
  refreshHud();
  checkStuck();
  // the level is lost at once (taps on the board stop now); the card waits for the last heart to break or the bomb to go off
  if (flow.lost && flow.state.exploded) blowUp(flow.state);
  else if (flow.lost) {
    playGameover();
    if (reducedMotion()) showEnd(false);
    else showLostAfter(HEART_BREAK_MS);
  }
  return ev.type;
}

const SEEN_KEY = 'animal-rescue-seen';
const readSeen = (): string[] => { try { return parseSeen(localStorage.getItem(SEEN_KEY)); } catch { return []; } };
const writeSeen = (a: string[]): void => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(a)); } catch { /* ignore */ } };

/**
 * The chick's first-time tutorials (tutorial.ts draws the chick and the finger, src/game/tutorialPlan.ts decides). Six,
 * each one tap on an animal: the first rule (level 1), the blocked animal that only shakes (level 2), the arrow tile
 * (once an animal whose way bends on one can leave), the key, the sleeper's neighbour, the way clear for a bomb. At most
 * one per level; nothing shows while an animal runs or once the level is over; a tutorial with no animal on screen to
 * point at is not forced and waits for another level. The scene darkens with only that animal lit and breathing
 * (stage.ts setFocus, PieceView.setBreathe). The rule is learnt when the animal really leaves on that tap (shakes, for
 * the blocked one), or on 건너뛰기. After the blocked, key, sleep and bomb taps the animal that stood in the way or
 * changed is lit for a moment (RESULT_MS) and play goes on by itself.
 */
const tutorial = new Tutorial('/assets/ui/result/chick.png');
/** The chick's words: one or two short lines, broken by hand where the phrase breaks (\n). */
const TUTORIAL_TEXT: Record<TutorialId, string> = {
  basic: '이 친구를 눌러봐!',
  blocked: '앞이 막힌 친구를\n눌러봐!',
  arrow: '화살표에서\n꺾이는 걸 봐!',
  key: '열쇠 친구를\n먼저 보내봐!',
  sleep: '옆 친구를 보내서\n깨워봐!',
  bomb: '부딪힐 때마다 숫자가 줄어요!\n0이 되면 펑!',
  bump: '막힌 친구도 눌러봐!\n앞까지 가서 멈춰',
  crate: '옆 친구가 나가면\n상자가 부서져!',
  crate2: '상자 옆 친구가 나가면\n점이 하나 줄어!',
  cratePush: '막힌 친구를 밀어서\n상자 옆에 세워봐!',
};
/**
 * The tap's round target around the animal, in board cells on screen; never under SPOT_MIN (the finger's target stays
 * well over 44 px across) nor over SPOT_MAX CSS pixels.
 */
const SPOT_CELLS = 0.8;
const SPOT_MIN = 30;
const SPOT_MAX = 48;
/** How often the tap's spot checks it still sits on its animal (ms): the 2.5D pictures may still be loading. */
const SPOT_RECHECK = 300;
/**
 * How long a tutorial's result shows (ms), by what it has to say (2026-11-08, docs/ui/UI_SYSTEM.md "튜토리얼"):
 * RESULT_MS when the change is seen (the animal a tap unlocked, woke or freed stays lit, no words); BUMP_RESULT_MS when
 * a line of words is needed to read the rule (the bump lesson: where the animal stopped and why). An info lesson has
 * no timer: it stays until its bubble is touched.
 */
const RESULT_MS = 800;
/**
 * The bump lesson's result (level 8, 2026-11-08): once the pushed animal has run up to the one in its way, both stay
 * lit, the chick says why it stopped and the line under the board states the rule; longer than RESULT_MS, there are
 * words to read. The line stays until the next tap.
 */
const BUMP_RESULT_MS = 1600;
const BUMP_RESULT_TEXT = '부딪혀서\n여기서 멈췄어!';
const BUMP_LESSON_MSG = '막힌 친구는 부딪히는 자리까지 가서 멈춰요';
/**
 * The push-beside-a-crate lesson (level 13, 2026-11-08 playtest: "fun, but never taught"): once the pushed animal stops
 * beside the crate, it and the crate stay lit and the chick says what leaving from there will do; when it does and the
 * crate breaks, the animal the crate held lights up and the lesson is learnt (or on 건너뛰기, like every lesson).
 */
const CRATE_PUSH_RESULT_MS = 2000;
const CRATE_PUSH_RESULT_TEXT = '여기서 나가면\n상자가 부서져!';
const CRATE_PUSH_MSG = '상자 옆에서 나가면 상자에 금이 가요';
/**
 * The crate lessons say what happened (2026-11-08 playtest: 11 and 12 only gave their first line, 13 explained the
 * result too). Level 11: when the neighbour's exit breaks the crate, the chick says so beside the animal it held.
 * Level 12: the first exit from beside the crate gets a line on the crate, the break a line beside the freed animal.
 */
const CRATE_RESULT_MS = 2000;
const CRATE_RESULT_TEXT = '상자가 부서져서\n길이 열렸어!';
/** The blocked lesson (level 2): the animal in front is lit, and the chick says what it means (2026-11-08, shown CRATE_RESULT_MS). */
const BLOCKED_RESULT_TEXT = '앞 친구가\n먼저 나가야 해!';
/** Under the board after a push that moved (2026-11-08): it ran up to what stopped it; '앞이 막혔어요' stays for a tap that moved nothing. */
const PUSHED_MSG = '부딪힐 때까지 갔어요';
const CRATE2_SAY_MS = 1800;
const CRATE2_CRACK_TEXT = '점이 하나 줄었어!\n옆 친구 하나 더!';
const CRATE2_BREAK_TEXT = '두 번 금이 가서\n부서졌어!';
/** After the lesson's push arrived: the crates it now stands beside, and the animals those crates hold. */
let cratePushWatch: { crates: string[]; held: number[] } | null = null;
/** Tutorials whose tap changes another animal, shown for RESULT_MS. */
const WITH_RESULT: readonly TutorialId[] = ['blocked', 'key', 'sleep', 'bomb', 'crate'];
/** This level's one tutorial is taken (shown, or the level's own start rule is waiting for its animal). */
let tutorialUsed = true;
/** Look for the arrow tutorial on the next frame where nothing runs. */
let tutorialCheck = false;
/** The tutorial on screen: its rule and the animal to tap. */
let tutorialShown: { id: TutorialId; target: number } | null = null;
/** The lesson on screen has nothing to tap (showInfoTutorial): a board tap on its animal is not its tap. */
let tutorialInfo = false;
let resultTimer: number | undefined;
/** An info lesson's animal pulses every so often while the words are up. */
let infoPulse: number | undefined;
const INFO_PULSE_MS = 1400;
/** After the arrow tutorial's tap: the tile it turns on, bounced when the animal's head reaches it. */
let arrowWatch: { id: number; x: number; y: number; at: THREE.Vector3 } | null = null;

const learn = (id: TutorialId): void => { const seen = readSeen(); if (!seen.includes(id)) writeSeen([...seen, id]); };
/** Close the tutorial and put everything back: no veil, no breathing, taps reach the board again. */
function endTutorial(learnt?: TutorialId): void {
  if (learnt) learn(learnt);
  window.clearTimeout(resultTimer);
  window.clearInterval(infoPulse);
  if (tutorialShown) views.get(tutorialShown.target)?.setBreathe(false);
  stage.setFocus([]);
  tutorial.hide();
  tutorialShown = null;
  tutorialInfo = false;
}
/** Close any tutorial; nothing more this level (a new level starts afresh). */
function stopTutorials(): void {
  cratePushWatch = null;
  endTutorial();
  crateLesson = null;
  arrowWatch = null;
  tutorialCheck = false;
  tutorialUsed = true;
}

/** A world point on screen, in CSS pixels. */
function screenAt(p: THREE.Vector3): { x: number; y: number } {
  const v = p.clone().project(stage.camera);
  const rect = stage.renderer.domElement.getBoundingClientRect();
  return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
}

/**
 * A screen point where a finger gets this animal (the game's own pick says so): the top of its head, or the closest
 * such point around it. Null when no point near it picks it (hidden behind another animal).
 */
function screenPointOf(id: number): { x: number; y: number } | null {
  const v = views.get(id);
  if (!v) return null;
  const box = new THREE.Box3().setFromObject(v.tapTargets()[0]);
  const { x: x0, y: y0 } = screenAt(new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2));
  for (let r = 0; r <= 40; r += 2) for (let a = 0; a < 16; a++) {
    const x = x0 + r * Math.cos((a * Math.PI) / 8), y = y0 + r * Math.sin((a * Math.PI) / 8);
    if (pick(x, y) === id) return { x, y };
    if (r === 0) break;
  }
  return null;
}

/** One board cell's width on screen (CSS pixels), at the board's middle. */
function cellPx(): number {
  const s = current();
  if (!s) return 45;
  const a = screenAt(stage.worldOf(s.level, 0, 0)), b = screenAt(stage.worldOf(s.level, 1, 0));
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * The tap's spot on an animal: the middle of its head when a finger there gets it (the game's own pick), otherwise
 * screenPointOf's point; about one animal wide. Null when no point picks it.
 */
function spotOf(id: number): TutorialSpot | null {
  const v = views.get(id);
  if (!v) return null;
  const box = new THREE.Box3().setFromObject(v.tapTargets()[0]);
  const mid = screenAt(box.getCenter(new THREE.Vector3()));
  const at = pick(mid.x, mid.y) === id ? mid : screenPointOf(id);
  if (!at) return null;
  return { x: at.x, y: at.y, r: Math.max(SPOT_MIN, Math.min(SPOT_MAX, SPOT_CELLS * cellPx())) };
}

/**
 * Light up the first of these animals that a finger can get on screen and wait for its tap; a tap there is the game's
 * tap on that animal. False when none can be shown (the tutorial waits for another level).
 */
function showTapTutorial(id: TutorialId, candidates: number[]): boolean {
  for (const target of candidates) {
    let spot = spotOf(target);
    const view = views.get(target);
    if (!spot || !view) continue;
    let checked = performance.now();
    const follow = (): TutorialSpot => {
      if (performance.now() - checked > SPOT_RECHECK) {
        checked = performance.now();
        spot = spotOf(target) ?? spot;
      }
      return spot!;
    };
    tutorialShown = { id, target };
    tutorialUsed = true;
    stage.setFocus([view.group]);
    view.setBreathe(true);
    tutorial.show({
      text: TUTORIAL_TEXT[id],
      spot: follow,
      room: boardRoom,
      onAction: () => {
        const s = current();
        // the blocked tutorial's tap is the shake itself (its level has no hearts), then the animal in its way lights up
        if (id === 'blocked') {
          if (s && s.hearts === undefined && s.alive.has(target) && onTap(target) === 'blocked') tutorialTapped();
          else endTutorial();
          return;
        }
        // only the tap the tutorial shows: the animal leaving, or (bump) running up to what stops it; never another animal
        const piece = s?.level.pieces.find((p) => p.id === target);
        const does = s && piece && s.alive.has(target) && (id === 'bump' || id === 'cratePush' ? bumpAdvance(s.level, piece, s.alive) > 0 : canExit(s.level, target, s.alive));
        if (does) onTap(target);
        else endTutorial();
      },
      onSkip: () => endTutorial(id),
    });
    return true;
  }
  return false;
}

/**
 * The two-crack crate lesson (crate2, 2026-11-08): the chick's words over the crate, the crate lit, and nothing to tap.
 * No cell is marked on the board (the orange neighbour tiles are gone, 2026-11-08 request). The player then plays
 * freely; onTap tells an exit from beside the crate (a dot goes) from one elsewhere (said once: the crate stays), and
 * the lesson is learnt when the crate breaks. Learnt on the break
 * only, so a touch that closes the words does not count, and no order of exits can leave the lesson hanging.
 */
let crateLesson: { x: number; y: number; held: number[]; toldElsewhere: boolean } | null = null;
/** A short line from the chick during play (the crate lessons' reactions): these lit, the words by `spot`, then gone. */
function chickSays(spot: () => TutorialSpot | null, text: string, ms: number, lit: THREE.Object3D[]): void {
  window.clearTimeout(resultTimer);
  stage.setFocus(lit);
  // shown straight into its result moment (chick and words only, touches held, no ›): it goes by itself
  tutorial.show({ text, spot: () => spot() ?? { x: innerWidth / 2, y: innerHeight / 2, r: SPOT_MIN }, room: boardRoom, onAction: () => {}, onSkip: () => {} });
  tutorial.result(spot, text);
  resultTimer = window.setTimeout(() => { tutorial.hide(); stage.setFocus([]); }, ms);
}
/** Where the chick points at a crate (CSS px), or null when the crate is not drawn. */
function crateSpot(x: number, y: number): TutorialSpot | null {
  const obj = stage.crateObjectAt(x, y);
  if (!obj) return null;
  const at = screenAt(obj.position.clone().setY(obj.position.y + 0.6));
  return { x: at.x, y: at.y, r: Math.max(SPOT_MIN, Math.min(SPOT_MAX, SPOT_CELLS * cellPx())) };
}
function showCrateLesson(level: Level): void {
  const s = current();
  const k = s && crateLessonAt(level, s.alive);
  const obj = k && stage.crateObjectAt(k.x, k.y);
  if (!s || !k || !obj) return;
  const held = level.pieces.filter((p) => s.alive.has(p.id) && cratesInWay(level, p, s.alive).some((c) => c.x === k.x && c.y === k.y)).map((p) => p.id);
  crateLesson = { x: k.x, y: k.y, held, toldElsewhere: false };
  tutorialShown = { id: 'crate2', target: 0 };
  tutorialInfo = true;
  tutorialUsed = true;
  stage.setFocus([obj]);
  const spot = (): TutorialSpot => { const at = screenAt(obj.position.clone().setY(obj.position.y + 0.6)); return { x: at.x, y: at.y, r: Math.max(SPOT_MIN, Math.min(SPOT_MAX, SPOT_CELLS * cellPx())) }; };
  // a discovery lesson (2026-11-08): no finger (no animal is the answer), the words sit above the board and close on a
  // touch of the bubble; closing them does not learn the lesson (the break does)
  tutorial.show({ text: TUTORIAL_TEXT.crate2, spot, room: boardRoom, info: true, onAction: () => endTutorial(), onSkip: () => endTutorial() });
}

/** An animal left while the crate lesson is on: say what it did to the crate (the crack itself is drawn by crackCrates). */
function crateLessonExit(id: number): void {
  const s = current();
  if (!crateLesson || !s) return;
  const piece = s.level.pieces.find((p) => p.id === id);
  if (!piece) return;
  const cell = piece.cells.find((c) => Math.abs(c.x - crateLesson!.x) + Math.abs(c.y - crateLesson!.y) === 1);
  if (cell) {
    $('msg').textContent = '옆 친구가 나가서 점이 하나 줄었어요';
    // the crate still stands: the chick says one dot went and one more neighbour will do (the break has its own line)
    const k = (s.level.crates ?? []).find((c) => c.x === crateLesson!.x && c.y === crateLesson!.y);
    const obj = stage.crateObjectAt(crateLesson.x, crateLesson.y);
    if (k && obj && crateStanding(s.level, k, s.alive)) { const { x, y } = crateLesson; chickSays(() => crateSpot(x, y), CRATE2_CRACK_TEXT, CRATE2_SAY_MS, [obj]); }
  } else if (!crateLesson.toldElsewhere) {
    crateLesson.toldElsewhere = true;
    $('msg').textContent = '옆이 아니라서 상자는 그대로예요';
  }
}

/** The lesson's crate broke: learnt; the animal it held lights up for a moment. */
function crateLessonBroke(x: number, y: number): void {
  if (!crateLesson || crateLesson.x !== x || crateLesson.y !== y) return;
  const s = current();
  const held = crateLesson.held.filter((id) => s?.alive.has(id) && views.has(id));
  crateLesson = null;
  learn('crate2');
  if (tutorialShown?.id === 'crate2') endTutorial(); // the words still up (the dev hook can tap past them): gone with the crate
  $('msg').textContent = '옆 친구 둘이 나가서 상자가 부서졌어요!';
  if (!held.length) return;
  for (const id of held) views.get(id)!.pulse();
  chickSays(() => spotOf(held[0]), CRATE2_BREAK_TEXT, CRATE2_SAY_MS, held.map((id) => views.get(id)!.group));
}

/** The free band on screen between the HUD and the board's top edge (CSS px), where an info lesson's words go. */
function boardRoom(): { top: number; bottom: number } | null {
  const s = current();
  if (!s) return null;
  const { width: w } = s.level;
  const bottom = Math.min(...[-0.5, w - 0.5].map((gx) => screenAt(stage.worldOf(s.level, gx, -0.5)).y));
  const top = Math.max($('hud').getBoundingClientRect().bottom, $('settings').getBoundingClientRect().bottom);
  return { top, bottom };
}

/**
 * A lesson with nothing to tap: the chick's words in the band above the board, no finger, every touch on the board held,
 * closed (and learnt) by a touch on the bubble. The animal it is about stays lit alone and pulses while the words are
 * up; the board does not change, and no touch lands on the animal once the words are gone (2026-11-08: a finger over
 * the dynamite invited a tap, and the next one was a real push that burnt its number).
 */
function showInfoTutorial(id: TutorialId, target: number): boolean {
  const spot = spotOf(target);
  const view = views.get(target);
  if (!spot || !view) return false;
  tutorialShown = { id, target };
  tutorialInfo = true;
  tutorialUsed = true;
  stage.setFocus([view.group]);
  view.setBreathe(true);
  view.pulse();
  infoPulse = window.setInterval(() => view.pulse(), INFO_PULSE_MS);
  tutorial.show({ text: TUTORIAL_TEXT[id], spot: () => spotOf(target) ?? spot, room: boardRoom, info: true, onAction: () => endTutorial(id), onSkip: () => endTutorial(id) });
  return true;
}

/**
 * The tutorial's animal has left on its tap (or, for the blocked tutorial, shook): the rule is learnt. The blocked, key,
 * sleep and bomb tutorials light up the animal that changed (or stood in the way) for a moment; the arrow tutorial watches for the tile; then play goes on.
 */
function tutorialTapped(): void {
  const shown = tutorialShown;
  const s = current();
  if (!shown || !s) return;
  learn(shown.id);
  views.get(shown.target)?.setBreathe(false);
  if (shown.id === 'arrow') {
    const piece = s.level.pieces.find((p) => p.id === shown.target)!;
    const arrows = new Set((s.level.arrows ?? []).map((a) => `${a.x},${a.y}`));
    const tile = traceExit(s.level, piece).cells.find((c) => arrows.has(`${c.x},${c.y}`));
    if (tile) arrowWatch = { id: shown.target, x: tile.x, y: tile.y, at: stage.worldOf(s.level, tile.x, tile.y) };
  }
  const changed = WITH_RESULT.includes(shown.id) ? resultSubjects(s.level, shown.id, shown.target).filter((id) => s.alive.has(id) && views.has(id)) : [];
  if (!changed.length) { endTutorial(); return; }
  stage.setFocus(changed.map((id) => views.get(id)!.group));
  for (const id of changed) views.get(id)!.pulse();
  const first = changed[0];
  // the one-crack crate lesson says why the held animal is free now, the blocked lesson who goes first; the others show the change alone
  const words = shown.id === 'crate' ? CRATE_RESULT_TEXT : shown.id === 'blocked' ? BLOCKED_RESULT_TEXT : undefined;
  tutorial.result(() => spotOf(first), words);
  resultTimer = window.setTimeout(() => endTutorial(), words ? CRATE_RESULT_MS : RESULT_MS);
}

/** The bump lesson's push is made: learnt; the words and finger go while the chick follows the running animal. */
function tutorialPushed(id: number): void {
  // the bump lesson is learnt on its push; the crate push lesson only when its crate breaks
  if (tutorialShown?.id === 'bump') learn('bump');
  views.get(id)?.setBreathe(false);
  tutorial.result(() => spotOf(id));
}

/**
 * The pushed animal has run up to what stops it: it and the animal it bumped into stay lit, that one pulses, the chick
 * says why it stopped and the line under the board gives the rule; then play goes on by itself.
 */
function tutorialArrived(id: number): void {
  const s = current();
  if (s && tutorialShown?.id === 'cratePush' && tutorialShown.target === id) { cratePushArrived(id); return; }
  if (!s || tutorialShown?.id !== 'bump' || tutorialShown.target !== id) return;
  const piece = s.level.pieces.find((p) => p.id === id);
  const next = piece ? traceExit(s.level, piece).cells[0] : undefined;
  const stopper = next ? s.level.pieces.find((p) => p.id !== id && s.alive.has(p.id) && p.cells.some((c) => c.x === next.x && c.y === next.y)) : undefined;
  const lit = [id, ...(stopper ? [stopper.id] : [])].filter((i) => views.has(i));
  stage.setFocus(lit.map((i) => views.get(i)!.group));
  if (stopper) views.get(stopper.id)?.pulse();
  tutorial.result(() => spotOf(stopper?.id ?? id), BUMP_RESULT_TEXT);
  $('msg').textContent = BUMP_LESSON_MSG;
  window.clearTimeout(resultTimer);
  resultTimer = window.setTimeout(() => endTutorial(), BUMP_RESULT_MS);
}

/** The crate push lesson's animal stands beside the crate: it and the crate stay lit, the chick says what comes next. */
function cratePushArrived(id: number): void {
  const s = current();
  const piece = s?.level.pieces.find((p) => p.id === id);
  if (!s || !piece) return;
  const crates = (s.level.crates ?? []).filter((k) => crateStanding(s.level, k, s.alive) && piecesAround(s.level, k.x, k.y).includes(id));
  const held = s.level.pieces.filter((p) => p.id !== id && s.alive.has(p.id) && cratesInWay(s.level, p, s.alive).some((k) => crates.includes(k))).map((p) => p.id);
  cratePushWatch = { crates: crates.map((k) => `${k.x},${k.y}`), held };
  const objects = crates.map((k) => stage.crateObjectAt(k.x, k.y)).filter((o): o is NonNullable<typeof o> => !!o);
  const view = views.get(id);
  stage.setFocus([...(view ? [view.group] : []), ...objects]);
  view?.pulse();
  tutorial.result(() => spotOf(id), CRATE_PUSH_RESULT_TEXT);
  $('msg').textContent = CRATE_PUSH_MSG;
  window.clearTimeout(resultTimer);
  resultTimer = window.setTimeout(() => endTutorial(), CRATE_PUSH_RESULT_MS);
}

/** A crate broke: if it is the one the crate push lesson set an animal beside, the lesson is learnt and its animal lights up. */
function cratePushBroke(x: number, y: number): void {
  const watch = cratePushWatch;
  if (!watch || !watch.crates.includes(`${x},${y}`)) return;
  cratePushWatch = null;
  learn('cratePush');
  if (tutorialShown?.id === 'cratePush') endTutorial();
  const s = current();
  const held = watch.held.filter((id) => s?.alive.has(id) && views.has(id));
  $('msg').textContent = '옆에서 나가서 상자가 부서졌어요!';
  if (!held.length) return;
  stage.setFocus(held.map((id) => views.get(id)!.group));
  for (const id of held) views.get(id)!.pulse();
  window.clearTimeout(resultTimer);
  resultTimer = window.setTimeout(() => stage.setFocus([]), RESULT_MS);
}

/** A new level: its start tutorial if it has one, otherwise watch for the arrow tutorial. */
function beginTutorials(level: Level): void {
  stopTutorials();
  if (DEMO) return;
  tutorialUsed = false;
  const start = startTutorial(level, readSeen(), levelNumber);
  if (start) {
    // the level's own start rule takes the level, even when its animal cannot be shown (then it waits)
    tutorialUsed = true;
    const s = current();
    if (!s) return;
    if (start === 'crate2') { showCrateLesson(level); return; }
    if (showTapTutorial(start, startTargets(level, s.alive, start, s.fuses))) return;
    // the dynamite lesson where no tap leads to the dynamite (it sits inside the knot, level 40): the words on the
    // dynamite itself, closed by a touch, no tap made
    if (start === 'bomb') { const b = bombToWatch(level, s.alive, s.fuses); if (b !== null) showInfoTutorial('bomb', b); }
    return;
  }
  tutorialCheck = true; // an arrow animal may be free from the start
}

/** Called every frame while a check is due: show the arrow tutorial once the board is still and its animal can leave. */
function situationalTutorial(): void {
  if (!flow || tutorialUsed || isCleared(flow.state) || flow.lost) { tutorialCheck = false; return; }
  // wait while an animal runs, a result or the modal is up, or a tutorial is on screen
  if (anyRunning() || tutorial.visible || !$('popup').hidden || !$('modal').hidden) return;
  tutorialCheck = false;
  const s = flow.state;
  if (!readSeen().includes('arrow') && showTapTutorial('arrow', arrowTargets(s.level, s.alive))) return;
  // the first knot: nothing can leave, so the chick shows the push that untangles it
  if (BUMP && !readSeen().includes('bump')) showTapTutorial('bump', bumpTargets(s.level, s.alive, s.fuses));
}

/** After the arrow tutorial's tap: bounce the tile once the animal's head reaches it. */
function watchArrow(): void {
  if (!arrowWatch) return;
  const v = views.get(arrowWatch.id);
  if (!v?.running) { arrowWatch = null; return; }
  const head = v.headWorld();
  if (Math.hypot(head.x - arrowWatch.at.x, head.z - arrowWatch.at.z) < 0.35) {
    stage.bounceArrow(arrowWatch.x, arrowWatch.y);
    arrowWatch = null;
  }
}

const RESCUED_KEY = 'animal-rescue-rescued';
const readRescued = (): number => { try { return Number(localStorage.getItem(RESCUED_KEY) ?? 0) || 0; } catch { return 0; } };
const addRescued = (k: number): void => { try { localStorage.setItem(RESCUED_KEY, String(readRescued() + k)); } catch { /* ignore */ } };

/** The result card's stage step: the place, "+1 step / of" and a bar where this level's cell has just filled. */
function stageProgressMarkup(n: number): string {
  if (DEMO) return '';
  const { step, of } = stageStep(n);
  const cells = Array.from({ length: of }, (_, i) => `<i class="${i + 1 < step ? 'done' : i + 1 === step ? 'new' : ''}"></i>`).join('');
  return `<div class="stTop"><span>${splitName(stageFor(n)).place}</span><span class="stFrac"><span class="stPlus">+1</span>${step} / ${of}</span></div><div class="stBar">${cells}</div>`;
}

/** A picture from the Figma icon pack (game/public/assets/ui/theme/) in place of the old emoji. */
function packIcon(file: string): HTMLImageElement {
  const img = document.createElement('img');
  img.src = `/assets/ui/theme/${file}`;
  img.alt = '';
  return img;
}

/** Name card when a new stage begins; it fades by itself and never blocks a tap. */
function showBanner(n: number): void {
  const st = stageFor(n);
  // the place name alone, no picture in front (2026-11-09)
  $('bannerIcon').replaceChildren();
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
      const sky = `linear-gradient(180deg, #${new THREE.Color(pal.sky).getHexString()} 0%, #${new THREE.Color(pal.ground).getHexString()} 100%)`;
      // behind the card, the place's own painted background (the one just done; the new region's first place for a
      // chapter start; the last place at the very end), dimmed a little so the card reads; the sky gradient without one
      const place = it.kind === 'chapter-intro' ? it.next : it.kind === 'journey-done' ? stageFor(LAST_LEVEL) : it.done;
      const pic = stageBackground(place.theme, place.stage);
      box.style.background = pic ? `linear-gradient(rgba(40,26,14,.28), rgba(40,26,14,.28)), url("${pic}") center / cover no-repeat, ${sky}` : sky;
      // one short line under the title; the friends saved go in their own small tray (empty: no tray)
      const set = (icon: string, kicker: string, title: string, sub: string, stat: string, btn: string): void => {
        $('ilIcon').replaceChildren(packIcon(icon));
        $('ilKicker').textContent = kicker;
        $('ilTitle').textContent = title;
        $('ilSub').textContent = sub;
        $('ilStat').textContent = stat;
        $('ilBtn').textContent = btn;
      };
      const saved = `구한 친구 ${readRescued()}마리`;
      if (it.kind === 'stage-done') {
        const d = splitName(it.done);
        set('ic-star.webp', d.region, `${d.place} 완료!`, `다음은 ${splitName(it.next).place}`, saved, '다음 스테이지');
      } else if (it.kind === 'chapter-done') {
        set('ic-medal.webp', '여행 기록', `${splitName(it.done).region}\n여행 완료!`, '이 지역 친구들을 모두 구했어요', saved, '계속');
      } else if (it.kind === 'chapter-intro') {
        const nx = splitName(it.next);
        set('ic-map.webp', `챕터 ${it.next.chapter}`, `${nx.region}에 도착!`, `첫 장소는 ${nx.place}`, '', '출발!');
      } else {
        set('ic-trophy.webp', '세계 일주 완료', '모든 친구를\n구했어요!', '함께해 주셔서 고마워요', saved, '처음부터 다시');
      }
      sound.play('clear');
      box.hidden = false;
      $('ilBtn').onclick = () => { box.hidden = true; done(); };
    });
  }
}

/**
 * The tap that ends a level (the last friend out, the blocked tap that takes the last heart, the one that sets a bomb
 * off) opens the result card during that same touch, and the touch's click then lands on whatever button now sits under
 * the finger. A click from the touch that opened the card is dropped; a new touch, a key or a scripted click goes through.
 */
let touches = 0;
let cardTouch = -1;
window.addEventListener('pointerdown', () => { touches++; }, { capture: true, passive: true });
$('popup').addEventListener('click', (e) => { if (e.detail > 0 && touches === cardTouch) e.stopPropagation(); }, true);

function showEnd(won: boolean): void {
  const state = current();
  if (!state) return;
  endRound();
  // the result comes first: a tutorial on screen or waiting is dropped, not learnt
  stopTutorials();
  cardTouch = touches;
  $('popup').hidden = false;
  $('msg').textContent = '';
  playlog?.end(won ? 'clear' : state.exploded ? 'lost-bomb' : 'lost-stuck');
  $('popup').dataset.kind = won ? 'win' : state.exploded ? 'bomb' : 'hearts';
  $('popupTitle').textContent = won ? '구출 성공!' : state.exploded ? '펑! 폭탄이 터졌어요' : stuckOut ? '길이 막혔어요' : '하트가 모두 떨어졌어요';
  // the rescue card celebrates the friends saved and the stage step it filled; hearts left are not a score, so only a
  // lost level shows them (and a bomb ends the level whatever the hearts are, so the bomb card shows none)
  $('popupRescue').innerHTML = won ? `친구<b>${state.level.pieces.length}</b>마리를 구했어요` : '';
  $('popupStage').innerHTML = won ? stageProgressMarkup(levelNumber) : '';
  $('popupHearts').innerHTML = won || state.hearts === undefined || state.exploded || stuckOut ? '' : heartsMarkup(state.hearts, maxHearts);
  // the level is over: a retry question still open is moot
  if (modal.kind === 'retry') modal.close();
  $('popupBtn').className = dialogButton(won ? 'primary' : 'retry');
  // a lost level takes a heart (사천팝: giving up a level costs one)
  const left = won ? null : lives.spend().hearts;
  $('popupSub').textContent = won ? '' : `하트 1개를 잃었어요 (남은 하트 ${left})`;
  $('popupBtn').textContent = won ? '다음 레벨' : '다시 하기';
  $('popupHome').hidden = false;
  $('popupHome').onclick = goHome;
  // the header's red close is the same way home
  $('popupX').onclick = goHome;
  $('popupBtn').onclick = () => {
    // every level start takes a heart in hand (사천팝): with none left the hearts popup opens instead
    if (!livesUi.canPlay()) return;
    if (!won) { void loadLevel(levelNumber); return; }
    const n = levelNumber;
    const next = n >= LAST_LEVEL ? 1 : n + 1; // after the whole journey, start over
    $('popup').hidden = true;
    void playInterludes(interludesAfter(n)).then(() => loadLevel(next));
  };
}

// Decode the sounds now; unlock on any gesture the browser counts as user activation (touch pointerdown may not count on iOS).
sound.prepare();
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, () => { sound.unlock(); music.unlock(); }, { capture: true, passive: true });

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
/**
 * Retry from the bottom bar. Once something has been tapped it first asks, so a slip of the finger next to the hint
 * button does not throw the board away; "취소" leaves the level exactly as it was. Nothing tapped yet: retry at once.
 */
$('retry').addEventListener('click', () => {
  sound.unlock();
  const state = current();
  if (!state || state.taps === 0) { void loadLevel(levelNumber); return; }
  modal.open('retry', '다시 할까요?', [para('처음부터 다시 하면 하트 1개를 써요')], [
    { id: 'retryYes', label: '다시 하기', kind: 'retry', onClick: () => {
      modal.close();
      // giving up a started level takes a heart (사천팝 abandonRound); with none left it goes home to the hearts popup
      if (lives.spend().hearts <= 0) { goHome(); livesUi.openHearts(); return; }
      toast('하트 -1');
      void loadLevel(levelNumber);
    } },
    { id: 'retryNo', label: '취소', kind: 'secondary', onClick: () => modal.close() },
  ]);
});
$('next').addEventListener('click', () => void loadLevel(levelNumber + 1));
// skipping levels without clearing them is a testing aid only
$('next').hidden = !params.has('dev');

let hintTimer: number | undefined;
/** How long the hint's halo and path stay (ms), from the button (2026-11-07: the old 1 s pulse was not noticed). */
const HINT_MS = 3000;
let hintView: PieceView | null = null;
/**
 * Light up the most helpful animal and its way out for a moment. A free animal is shown any time; the push that
 * untangles a knot is the level's answer, so it shows once per level.
 */
/**
 * The hint button once the level's push hint is spent (2026-11-08): the undo instead of a plain refusal. Said on any
 * board, stuck or not, so it never tells whether the knot can still be untangled (docs/rules.md 6).
 */
const UNDO_TIP = '막히면 되돌리기로 마지막 밀기를 무를 수 있어요';
/** The undo would do something now: a push to take back and an undo left. */
const undoUsable = (): boolean => !!flow && flow.pushes.length > 0 && undosLeft + items.get('undo') > 0;

function showHint(): void {
  const state = current();
  if (!state || isCleared(state) || isFailed(state) || stuckOut) return;
  // a hint is an item now (사천팝): none left -> the box or the shop
  if (items.get('hint') <= 0) { livesUi.outOf('hint'); return; }
  let id = pickHint(state.level, state.alive, state.fuses);
  if (id === null && BUMP) {
    if (hintPushUsed.has(levelNumber)) { $('msg').textContent = undoUsable() ? UNDO_TIP : '밀기 힌트는 한 판에 한 번이에요'; return; }
    id = pickPush(state.level, state.alive, state.fuses);
    if (id !== null) hintPushUsed.add(levelNumber);
  }
  const view = id === null ? undefined : views.get(id);
  if (!view) { $('msg').textContent = BUMP ? (undoUsable() ? '길이 막혔어요. 되돌리기를 눌러요' : '지금은 알려 줄 힌트가 없어요') : '지금은 움직일 수 있는 친구가 없어요'; return; }
  items.add('hint', -1);
  playlog?.hint();
  sound.play('select');
  // the halo and the path stay HINT_MS from the button, whatever the finger does; three pulses draw the eye first
  window.clearTimeout(hintTimer);
  if (hintView && hintView !== view) { hintView.setHalo(false); if (!flow?.input.isPressed(hintView.piece.id)) hintView.showPath(false); }
  hintView = view;
  view.setHalo(true);
  view.showPath(true);
  let n = 0;
  const beat = (): void => { if (n++ < 3) { view.pulse(); window.setTimeout(beat, 450); } };
  beat();
  hintTimer = window.setTimeout(() => {
    view.setHalo(false);
    if (!flow?.input.isPressed(view.piece.id)) view.showPath(false);
    if (hintView === view) hintView = null;
  }, HINT_MS);
}
$('hint').addEventListener('click', () => { sound.unlock(); showHint(); });

let dustT = 0;
const clock = new THREE.Clock();
(function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  // 2.5D status icons keep a fixed size on the screen: sprite scale per css px for this camera and canvas
  setStatusPixelScale(2 / (stage.camera.projectionMatrix.elements[5] * (stage.renderer.domElement.clientHeight || 1)));
  dustT += dt;
  const dust = dustT > 0.07;
  if (dust) dustT = 0;
  for (const e of flow?.step(dt, loopSpeed ?? runSpeed()) ?? []) {
    const v = views.get(e.id);
    if (e.type === 'wait' && !e.quiet && v) collide(e.id, v);
    // 2.5D: a runner held up behind another sets off again with its own step sound
    if (e.type === 'resume' && v) sound.play('move');
  }
  for (const r of flow?.traffic.runners ?? []) views.get(r.id)?.setRun(r.s, r.state === 'waiting');
  if (notYetMoved.size) {
    let setOff = false;
    for (const [id, s0] of notYetMoved) {
      const r = flow?.traffic.get(id);
      if (!r || r.s > s0 + SET_OFF) { notYetMoved.delete(id); setOff = true; }
    }
    if (setOff) crackCrates();
  }
  for (const v of views.values()) {
    if (v.running && !flow?.traffic.get(v.piece.id)) v.setRun(v.track.length, false); // stepped past the end this frame
    v.update(dt);
    if (dust && v.running && !v.isWaiting) {
      fx.dust(v.headWorld());
    }
  }
  if (tutorialCheck) situationalTutorial();
  watchArrow();
  fx.update(dt);
  stage.update(dt);
  stage.render();
  requestAnimationFrame(loop);
})();

/** Settings (top right on the title and in play): game/settings.ts. */
const openSettings = setupSettings(modal, sound);
$('settings').addEventListener('click', openSettings);

/** Home: the title over a small board where the front animal runs out on a loop. Leaves the saved progress alone. */
function goHome(): void {
  playlog?.end('home');
  endRound();
  platform.setIdle(true);
  const token = clearBoard();
  speciesOverride.clear();
  const board = titleBoard();
  for (const [id, name] of board.species) speciesOverride.set(id, name);
  stage.setBoard(board.level, 'village', 1, 1);
  const saved = readProgress();
  title.show(hasSavedProgress(saved) ? { level: saved, place: stageFor(saved).name } : null);
  layoutTitle(board.level);
  titleRun(board.level, board.runner, token);
  stage.render();
  // no "친구들을 부르고 있어요" card here: the title's board sits under the intro clip and its backdrop, and the card would
  // cover the clip on a first visit (a level still waits for its pictures in loadLevel)
}

/** Screen band of a board: from above its back row's animals down to just past its front edge (CSS pixels). */
function boardBand(level: Level): BoardBand {
  const rect = stage.renderer.domElement.getBoundingClientRect();
  const y = (p: THREE.Vector3): number => rect.top + ((1 - p.project(stage.camera).y) / 2) * rect.height;
  const h = level.height / 2;
  return { top: y(new THREE.Vector3(0, 0.9, -h)), bottom: y(new THREE.Vector3(0, 0, h + 0.7)) };
}

/** Height of the title's two-button block (64 px 이어하기 + 14 px gap + 56 px 처음부터). */
const TITLE_BUTTONS = 134;
/** Room kept free above the logo and below the buttons. */
const TITLE_MARGIN = 16;
/** Gaps between the logo and the board, and between the board and the buttons (as in the title's CSS). */
const TITLE_GAPS = 4 + 16;

/**
 * Hang the logo above the board and the buttons below it, and frame the board so that whole block sits in the middle
 * of the screen: smaller when the screen is too short for it (a landscape window), never larger than fitted. Room for
 * both buttons (이어하기 + 처음부터) is kept even when only 게임 시작 shows, so the logo and board never move between the two.
 */
function layoutTitle(level: Level): void {
  stage.frame(1, 0);
  title.layout(boardBand(level));
  const head = document.querySelector('#title .tHead')!.getBoundingClientRect().height;
  const buttons = Math.max(document.querySelector('#title .tButtons')!.getBoundingClientRect().height, TITLE_BUTTONS);
  const fitted = boardBand(level);
  // the Apps in Toss bar covers the top: the title block sits in the screen below it
  const tossTop = Math.max(0, (document.getElementById('topSpace')?.offsetHeight ?? 64) - 64);
  // and below the hearts and coins row when it shows on the title, so the logo never runs under it
  const hud = document.getElementById('lives')?.getBoundingClientRect();
  const topUi = hud && hud.height > 0 ? Math.max(tossTop, hud.bottom) : tossTop;
  const room = innerHeight - topUi - 2 * TITLE_MARGIN - head - buttons - TITLE_GAPS;
  const zoom = Math.max(0.4, Math.min(1, room / (fitted.bottom - fitted.top)));
  stage.frame(zoom, 0);
  const band = boardBand(level);
  const top = band.top - 4 - head;
  const bottom = band.bottom + 16 + buttons;
  stage.frame(zoom, Math.round((innerHeight + topUi - top - bottom) / 2));
  title.layout(boardBand(level));
}

/** The title loop, in ms from a fresh board: the runner's hop and path, the run, then the board again. */
const TITLE_RUN = { mark: 700, go: 1300, again: 3800 };
/** The title's runner goes at about a third of the game's pace, so its way off the board can be followed. */
const TITLE_RUN_SPEED = 2.4;

/**
 * One round of the title loop: a fresh board, the runner hops and shows its way, runs off the board edge, then the
 * same again. Quiet (no sounds). Stops by itself once anything else loads (the token moves on).
 */
function titleRun(level: Level, runner: number, token: number): void {
  const live = (): boolean => token === loadToken;
  for (const v of views.values()) { stage.scene.remove(v.group); v.dispose(); }
  views = new Map();
  addViews(level);
  // the plates stay
  for (const v of views.values()) for (const m of v.markParts()) m.visible = false;
  flow = new PlayFlow(level);
  loopSpeed = TITLE_RUN_SPEED;
  window.setTimeout(() => {
    const view = views.get(runner);
    if (!live() || !view) return;
    view.pulse();
    view.showPath(true);
  }, TITLE_RUN.mark);
  window.setTimeout(() => {
    const view = views.get(runner);
    if (!live() || !view || flow?.tap(runner, performance.now())?.type !== 'exited') return;
    view.showPath(false);
    fx.launch(view.headWorld());
    view.runOut(() => {}, () => fx.escape(view.gateWorld(), view.color));
  }, TITLE_RUN.go);
  window.setTimeout(() => { if (live()) titleRun(level, runner, token); }, TITLE_RUN.again);
}
window.addEventListener('resize', () => { if (title.visible && flow) layoutTitle(flow.level); });

function startLevel(n: number): void {
  if (!livesUi.canPlay()) return;
  title.hide();
  void loadLevel(n);
}

const title = new TitleScreen({ start: () => startLevel(1), resume: () => startLevel(readProgress()), restart: () => startLevel(1) });
// home from a level already started (something tapped, not over yet) gives it up: one heart (사천팝 abandonRound)
$('home').addEventListener('click', () => {
  const state = current();
  if (state && state.taps > 0 && $("popup").hidden && !isCleared(state) && !isFailed(state) && !flow?.lost && !stuckOut) { lives.spend(); toast('하트 -1'); }
  goHome();
});

// dev entry points (?level, ?demo) go straight into play; a build has no parameters and always opens on the title
const fromUrl = Number(params.get('level'));
// dev only: ?level=n opened on an empty save (a private window, a new tester) counts the lessons of the levels before n
// as learnt, so that level opens on its own lesson, as for a player who came from level 1 (2026-11-08 playtest: level
// 11 opened on "이 친구를 눌러봐!" instead of its crate lesson). A save that has learnt anything is left alone.
if (import.meta.env.DEV && Number.isInteger(fromUrl) && fromUrl > 1 && !params.has('demo') && !params.has('exp') && readSeen().length === 0) {
  writeSeen(lessonsBefore(fromUrl, (k) => buildGameLevel(k)?.level ?? null));
}
if (params.has('demo') || (Number.isInteger(fromUrl) && fromUrl >= 1)) void loadLevel(Number.isInteger(fromUrl) && fromUrl >= 1 ? fromUrl : readProgress());
else goHome();

/** Test hook used by automated browser checks (tests/e2e); dev server only. */
if (import.meta.env.DEV) (window as unknown as { __game: unknown }).__game = {
  tap: (id: number) => onTap(id),
  build: () => BUILD,
  /** the crate lesson in progress: its crate, the animal it holds, whether the "elsewhere" line was said */
  crateLesson: () => crateLesson && { ...crateLesson },
  /** every animal's dynamite as drawn: its number and whether it shows red (at 1) */
  dynamite: () => { const s = current(); return [...views.entries()].filter(([id, v]) => v.dynamite && s?.alive.has(id)).map(([id, v]) => ({ id, ...v.dynamite! })); },
  playlog: () => playlog?.all ?? [],
  /** The animal the hint button would light up (bombs first). */
  // the hint button's pick: a free animal, or (nothing free) the push that untangles the knot
  hint: () => { const s = current(); return s ? pickHint(s.level, s.alive, s.fuses) ?? (BUMP ? pickPush(s.level, s.alive, s.fuses) : null) : null; },
  // animals whose push right now collides with a dynamite (the browser checks set one off with these)
  bombTouches: () => { const s = current(); if (!s) return []; return s.level.pieces.filter((p) => s.alive.has(p.id) && !canExit(s.level, p.id, s.alive)).filter((p) => { const b = bumpResult(s.level, p, s.alive); return !!b && burnOnCollision(s.fuses, s.alive, p.id, b.stopper).exploded; }).map((p) => p.id); },
  free: () => { const s = current(); return s ? s.level.pieces.filter((p) => s.alive.has(p.id) && canExit(s.level, p.id, s.alive)).map((p) => p.id) : []; },
  /** nothing can leave or move (what checkStuck reads), and the undos left this level */
  stuck: () => { const s = current(); return s ? stuckAtOnce(s.level, s.alive) : false; },
  undos: () => undosLeft,
  views: () => views,
  runSpeed: () => runSpeed(),
  get traffic() { return flow?.traffic; },
  scene: () => stage.scene,
  sound,
  ids: () => { const s = current(); return s ? s.level.pieces.filter((p) => s.alive.has(p.id)).map((p) => p.id) : []; },
  /** A screen point where a finger would get this animal: the top of its head, or the closest such point around it. */
  screenOf: (id: number) => screenPointOf(id),
  /** The tutorial on screen (its rule, the animal to tap, the spotlight) or null. */
  tutorial: () => (tutorialShown ? { ...tutorialShown, spot: tutorial.spotNow(), phase: tutorial.phase } : null),
  /** Objects the tutorial focus lights now (0: off) and arrow tile bounces played. */
  focus: () => stage.focusCount,
  arrowBounces: () => stage.arrowBounces,
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
    const hud = Math.max(document.getElementById('hud')!.getBoundingClientRect().bottom, document.getElementById('settings')!.getBoundingClientRect().bottom);
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
    const groups = [...views.entries()].filter(([id, v]) => v.group.visible && (!s || s.alive.has(id)));
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
  state: () => {
    const s = current();
    // cells: where every animal stands by the rules (pushes move them)
    return s && { taps: s.taps, blocked: s.blockedTaps, hearts: s.hearts, fuses: { ...s.fuses }, alive: [...s.alive], cleared: isCleared(s), failed: isFailed(s), cells: Object.fromEntries(s.level.pieces.map((p) => [p.id, p.cells])) };
  },
};

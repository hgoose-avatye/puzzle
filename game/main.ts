import { isCleared, isFailed, type GameState } from '../src/core/game';
import { bombLevel, crossLevel, demoLevel, dirsLevel, quizLevel, SHEET_SPECIES, sheetLevel, turnLevel } from './demo';
import { buildGameLevel, levelSpec, stageFor, type Theme } from '../src/curve/curve';
import { canExit, headDirection, isAsleep, lockedBy, traceExit } from '../src/core/rules';
import { bumpAdvance, bumpResult, burnOnCollision, pickPush, solvableBump } from '../src/core/bump';
import { distanceToPolyline } from '../src/game/path';
import type { Direction, Level } from '../src/core/types';
import { PieceView, runSpeed, speciesOverride } from './animals';
import { setStatusPixelScale } from './statusIcons';
import { PlayFlow } from '../src/game/flow';
import { hasSavedProgress, progressAfterClear } from '../src/game/progress';
import { lostHeartSlots } from '../src/game/hearts';
import { TitleScreen, titleBoard, type BoardBand } from './screens';
import { dialogButton, Modal, para } from './modal';
import { arrowTargets, bumpTargets, resultSubjects, startTargets, startTutorial, type TutorialId } from '../src/game/tutorialPlan';
import { Tutorial, type TutorialSpot } from './tutorial';
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
const modal = new Modal();
/** The level in play: rules, animals running out, touch input. Null while a level loads. */
// the cast keeps TypeScript from narrowing this to null inside the render loop that starts right away
let flow = null as PlayFlow | null;
const current = (): GameState | null => flow?.state ?? null;
let views = new Map<number, PieceView>();
let levelNumber = 1;
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

/**
 * While a bomb is on the board, a chip at the top shows the closest bomb's number: that many more pushes before it goes
 * off. At 1 the chip turns red and a warning shows just above the buttons.
 */
const BOMB_ICON = '<img class="statusIcon" src="/assets/status/bomb.png" alt="">';
function paintBombBar(): void {
  const chip = $('bombChip');
  const warn = $('bombBar');
  const state = current();
  const left = state ? [...state.alive].map((id) => state.fuses[id]).filter((f): f is number => f !== undefined) : [];
  if (!state || !left.length || isFailed(state)) { chip.hidden = true; warn.hidden = true; return; }
  const n = Math.min(...left);
  chip.hidden = false;
  chip.className = n <= 1 ? 'danger' : n <= 2 ? 'warn' : '';
  chip.setAttribute('aria-label', `폭탄: ${n}번 더 부딪히면 터져요`);
  warn.hidden = n > 1;
  // 2.5D: the same clay bomb as over the animals (status UI 2026-11-05); Classic 3D keeps its emoji
  if ([...views.values()].some((v) => v.cards)) {
    chip.innerHTML = `${BOMB_ICON}${n}`;
    warn.innerHTML = `${BOMB_ICON}한 번 더 부딪히면 펑!`;
  } else {
    chip.textContent = `💣 ${n}`;
    warn.textContent = '💣 한 번 더 부딪히면 펑!';
  }
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

/** How long the 2.5D board celebrates (confetti, clear sound) before the rescue card shows. */
const CLEAR_CELEBRATE_MS = 1200;
let winTimer: number | undefined;

/**
 * The last animal has left the board: confetti and the clear sound, and the clear is saved, all at once. 2.5D shows the
 * rescue card CLEAR_CELEBRATE_MS later with the buttons still usable (home, a level change or a retry go through
 * clearBoard, which drops the card still waiting); Classic 3D and reduced motion show it at once, as before.
 */
function winLevel(): void {
  const state = current();
  if (!state || clearPlayed) return;
  clearPlayed = true;
  sound.play('clear');
  fx.confetti(new THREE.Vector3(0, 0, 0), 8);
  writeProgress(progressAfterClear(readProgress(), levelNumber, LAST_LEVEL));
  addRescued(state.level.pieces.length);
  if (reducedMotion() || ![...views.values()].some((v) => v.cards)) { showEnd(true); return; }
  winTimer = window.setTimeout(() => { winTimer = undefined; showEnd(true); }, CLEAR_CELEBRATE_MS);
}

/** Show the lost card after `ms`; meanwhile the buttons wait as well (clearBoard drops a card still waiting). */
function showLostAfter(ms: number, then?: () => void): void {
  document.body.classList.add('heart-wait');
  failTimer = window.setTimeout(() => { document.body.classList.remove('heart-wait'); then?.(); showEnd(false); }, ms);
}

/**
 * A count bomb reached zero. 2.5D: every bomb at zero swells its icon away and bursts (orange and grey bits, a dust
 * ring), one punch sound, and the bomb card with its sound after BOMB_BLAST_MS. Classic 3D and reduced motion: the
 * card and sound at once, as before. No hearts are taken.
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
  $('levelLabel').innerHTML = `<span class="lvK">레벨</span> <span class="lvN">${levelNumber}</span>`;
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
  loopSpeed = null;
  $('msg').textContent = '';
  fx.clear();
  sound.stopAll();
  stopTutorials();
  clearPlayed = false;
  failPlayed = false;
  pendingExits.clear();
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

async function loadLevel(n: number): Promise<void> {
  const token = clearBoard();
  levelNumber = n;
  // the title board pins species to its ids; game levels choose their own
  speciesOverride.clear();
  const built = buildLevel(n);
  if (!built) { $('msg').textContent = '레벨을 만들 수 없어요'; return; }
  const st = stageFor(n);
  stage.setBoard(built.level, DEMO ? ((params.get('theme') as Theme | null) ?? 'village') : st.theme, n, DEMO ? Number(params.get('stage') ?? 1) : st.stage);
  if (!DEMO && startsStage(n)) showBanner(n);
  if (token !== loadToken) return;
  // no hearts under the bump rule; the old rule (and the ?demo fixtures the browser checks drive) keep three
  const hearts = BUMP && !DEMO ? undefined : built.hearts ?? (levelSpec(n).role === 'rest' || levelSpec(n).role === 'intro' ? undefined : 3);
  maxHearts = hearts ?? 0;
  flow = new PlayFlow(built.level, hearts, BUMP);
  addViews(built.level);
  refreshHud();
  shownHearts = hearts ?? 0;
  beginTutorials(built.level);
}

/**
 * Bump rule: take back the last tap. The level is built afresh and every earlier tap replayed at once, so moved
 * animals, cracked crates and animals already out come back exactly as they were.
 */
function undoTap(): void {
  if (!flow || !flow.log.length || anyRunning()) return;
  const log = flow.log.slice(0, -1);
  const n = levelNumber;
  clearBoard();
  const built = buildLevel(n);
  if (!built) return;
  const st = stageFor(n);
  stage.setBoard(built.level, st.theme, n, st.stage);
  const replay = new PlayFlow(built.level, undefined, true);
  log.forEach((id, i) => replay.tap(id, i * 1000));
  replay.traffic.clear();
  flow = replay;
  addViews(built.level);
  for (const [id, v] of views) {
    if (replay.state.alive.has(id)) v.setHead(replay.headAt(id));
    else { stage.scene.remove(v.group); v.dispose(); views.delete(id); }
  }
  stage.updateCrates(replay.state.level, replay.state.alive);
  refreshHud();
}

/** Bump rule: after a tap, say so when no order of taps can clear the board any more. */
function checkStuck(): void {
  const s = current();
  if (!BUMP || !s || isCleared(s)) return;
  if (solvableBump(s.level, s.alive, undefined, s.fuses) === false) {
    $('msg').textContent = '길이 꼬였어요. 되돌리기를 눌러요';
    $('undo').classList.add('nudge');
  } else $('undo').classList.remove('nudge');
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
 * 2.5D only (animals drawn as picture cards): the animal a finger sees under it, the nearest opaque card pixel, which
 * is the one the depth test keeps on screen. The status icons are left out: drawn over everything, they covered the
 * animal behind and took its taps (2026-11-05). Null when no card animal is shown there, or in Classic 3D, where
 * pick() goes on with the tap targets exactly as before.
 */
function cardAnimalAt(clientX: number, clientY: number): number | null {
  const shown = [...views.entries()].filter(([, v]) => v.cards && v.group.visible);
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
}

/** Crates next to an animal that just left crack; a crate that breaks bursts and opens the way. */
function crackCrates(): void {
  const state = current();
  if (!state) return;
  for (const c of stage.updateCrates(state.level, state.alive)) {
    if (c.broke) { fx.burst(c.pos, 0xc08a52); sound.play('collision'); }
    else {
      fx.dust(c.pos); sound.play('arrive');
    }
  }
}

/** What became of a tap, for the touch diagnostics (?touchdebug). */
type TapOutcome = 'exited' | 'blocked' | 'repeat (R1)' | 'ignored: running' | 'ignored: waiting' | 'ignored: gone' | 'level over' | 'no level';

function onTap(id: number): TapOutcome {
  if (!flow) return 'no level';
  if (isCleared(flow.state) || flow.lost) return 'level over';
  // null: a repeat on an animal still shaking from its blocked tap, the same tap (no second heart)
  const ev = flow.tap(id, performance.now());
  if (!ev) {
    // a push while an animal still runs waits for the board to settle (flow.ts); a repeat blocked tap is the same tap
    if (anyRunning()) $('msg').textContent = '친구가 지나간 다음에 눌러요';
    return 'repeat (R1)';
  }
  if (ev.type === 'ignored') {
    const runner = flow.traffic.get(id)?.state;
    return runner === 'waiting' ? 'ignored: waiting' : runner ? 'ignored: running' : 'ignored: gone';
  }
  const view = views.get(id);
  if (ev.type === 'exited' && view) {
    // a tap tutorial is done once its animal really leaves
    if (tutorialShown?.target === id) tutorialTapped();
    tutorialCheck = true;
    // The rules treat it as gone right away; on the board it runs out through traffic and may wait behind earlier runners.
    fx.launch(view.headWorld());
    sound.play('move');
    pendingExits.add(id);
    view.runOut(() => { if (flow?.won && !anyRunning()) winLevel(); }, () => {
      pendingExits.delete(id);
      // the last animal's exit is covered by the clear sound
      if (!(flow && isCleared(flow.state) && pendingExits.size === 0)) sound.play('rescued');
      fx.burst(view.gateWorld(), view.color);
      fx.sparkle(view.gateWorld(), view.color);
    });
    $('msg').textContent = '';
    crackCrates();
  } else if (ev.type === 'blocked' && view) {
    const feedback = (): void => {
      // 2.5D: the head shake alone (no stars, no "!"); Classic 3D as before
      view.bump();
      if (!view.cards) fx.stars(view.headWorld());
      if (ev.blockers.length > 0) collide(id, view, !view.cards);
      else if (cooled(id)) sound.play('wall');
      for (const b of ev.blockers) views.get(b)?.pulse();
      if (ev.lockedBy !== undefined) views.get(ev.lockedBy)?.pulse();
    };
    // bump rule: it runs up to what stops it first, and the bump comes on arrival
    if (ev.moved) {
      if (tutorialShown?.target === id) tutorialTapped();
      tutorialCheck = true;
      sound.play('move');
      view.slideTo(flow.headAt(id), feedback);
    } else feedback();
    $('msg').textContent = ev.asleep ? '쿨쿨 자고 있어요. 옆 친구가 나가면 깨어나요' : ev.lockedBy !== undefined ? '잠겨 있어요. 열쇠를 가진 친구가 먼저예요' : ev.blockers.length === 0 && ev.crates ? '상자가 막고 있어요. 옆 친구가 나가면 부서져요' : '앞이 막혔어요';
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
const readSeen = (): string[] => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'); } catch { return []; } };
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
  bomb: '폭탄 친구가 부딪히기 전에\n길을 비워줘!',
  bump: '막힌 친구도 눌러봐!\n앞까지 가서 멈춰',
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
/** How long the animal a tap changed (unlocked, woken, its way cleared) stays lit after the tap (ms). */
const RESULT_MS = 800;
/** Tutorials whose tap changes another animal, shown for RESULT_MS. */
const WITH_RESULT: readonly TutorialId[] = ['blocked', 'key', 'sleep', 'bomb'];
/** This level's one tutorial is taken (shown, or the level's own start rule is waiting for its animal). */
let tutorialUsed = true;
/** Look for the arrow tutorial on the next frame where nothing runs. */
let tutorialCheck = false;
/** The tutorial on screen: its rule and the animal to tap. */
let tutorialShown: { id: TutorialId; target: number } | null = null;
let resultTimer: number | undefined;
/** After the arrow tutorial's tap: the tile it turns on, bounced when the animal's head reaches it. */
let arrowWatch: { id: number; x: number; y: number; at: THREE.Vector3 } | null = null;

const learn = (id: TutorialId): void => { const seen = readSeen(); if (!seen.includes(id)) writeSeen([...seen, id]); };
/** Close the tutorial and put everything back: no veil, no breathing, taps reach the board again. */
function endTutorial(learnt?: TutorialId): void {
  if (learnt) learn(learnt);
  window.clearTimeout(resultTimer);
  if (tutorialShown) views.get(tutorialShown.target)?.setBreathe(false);
  stage.setFocus([]);
  tutorial.hide();
  tutorialShown = null;
}
/** Close any tutorial; nothing more this level (a new level starts afresh). */
function stopTutorials(): void {
  endTutorial();
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
        const does = s && piece && s.alive.has(target) && (id === 'bump' ? bumpAdvance(s.level, piece, s.alive) > 0 : canExit(s.level, target, s.alive));
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
  tutorial.result(() => spotOf(first));
  resultTimer = window.setTimeout(() => endTutorial(), RESULT_MS);
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
    if (s) showTapTutorial(start, startTargets(level, s.alive, start, s.fuses));
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
      // one short line under the title; the friends saved go in their own small tray (empty: no tray)
      const set = (icon: string, kicker: string, title: string, sub: string, stat: string, btn: string): void => {
        $('ilIcon').textContent = icon;
        $('ilKicker').textContent = kicker;
        $('ilTitle').textContent = title;
        $('ilSub').textContent = sub;
        $('ilStat').textContent = stat;
        $('ilBtn').textContent = btn;
      };
      const saved = `구한 친구 ${readRescued()}마리`;
      if (it.kind === 'stage-done') {
        const d = splitName(it.done);
        set(stageIcon(it.done), d.region, `${d.place} 완료!`, `다음은 ${splitName(it.next).place}`, saved, '다음 스테이지');
      } else if (it.kind === 'chapter-done') {
        set('🏅', '여행 기록', `${splitName(it.done).region}\n여행 완료!`, '이 지역 친구들을 모두 구했어요', saved, '계속');
      } else if (it.kind === 'chapter-intro') {
        const nx = splitName(it.next);
        set(stageIcon(it.next), `챕터 ${it.next.chapter}`, `${nx.region}에 도착!`, `첫 장소는 ${nx.place}`, '', '출발!');
      } else {
        set('🎉', '세계 일주 완료', '모든 친구를\n구했어요!', '함께해 주셔서 고마워요', saved, '처음부터 다시');
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
  // the result comes first: a tutorial on screen or waiting is dropped, not learnt
  stopTutorials();
  cardTouch = touches;
  $('popup').hidden = false;
  $('msg').textContent = '';
  $('popup').dataset.kind = won ? 'win' : state.exploded ? 'bomb' : 'hearts';
  $('popupTitle').textContent = won ? '구출 성공!' : state.exploded ? '펑! 폭탄이 터졌어요' : '하트가 모두 떨어졌어요';
  // the rescue card celebrates the friends saved and the stage step it filled; hearts left are not a score, so only a
  // lost level shows them (and a bomb ends the level whatever the hearts are, so the bomb card shows none)
  $('popupRescue').innerHTML = won ? `친구<b>${state.level.pieces.length}</b>마리를 구했어요` : '';
  $('popupStage').innerHTML = won ? stageProgressMarkup(levelNumber) : '';
  $('popupHearts').innerHTML = won || state.hearts === undefined || state.exploded ? '' : heartsMarkup(state.hearts, maxHearts);
  // the level is over: a retry question still open is moot
  if (modal.kind === 'retry') modal.close();
  $('popupBtn').className = dialogButton(won ? 'primary' : 'retry');
  $('popupSub').textContent = won ? '' : '다시 도전해 볼까요?';
  $('popupBtn').textContent = won ? '다음 레벨' : '다시 하기';
  $('popupHome').hidden = false;
  $('popupHome').onclick = goHome;
  $('popupBtn').onclick = () => {
    if (!won) { void loadLevel(levelNumber); return; }
    const n = levelNumber;
    const next = n >= LAST_LEVEL ? 1 : n + 1; // after the whole journey, start over
    $('popup').hidden = true;
    void playInterludes(interludesAfter(n)).then(() => loadLevel(next));
  };
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
/**
 * Retry from the bottom bar. Once something has been tapped it first asks, so a slip of the finger next to the hint
 * button does not throw the board away; "취소" leaves the level exactly as it was. Nothing tapped yet: retry at once.
 */
$('retry').addEventListener('click', () => {
  sound.unlock();
  const state = current();
  if (!state || state.taps === 0) { void loadLevel(levelNumber); return; }
  modal.open('retry', '다시 할까요?', [para('지금까지 푼 것이 처음 상태로 돌아가요.')], [
    { id: 'retryYes', label: '다시 하기', kind: 'retry', onClick: () => { modal.close(); void loadLevel(levelNumber); } },
    { id: 'retryNo', label: '취소', kind: 'secondary', onClick: () => modal.close() },
  ]);
});
$('next').addEventListener('click', () => void loadLevel(levelNumber + 1));
// skipping levels without clearing them is a testing aid only
$('next').hidden = !params.has('dev');

let hintTimer: number | undefined;
/** Light up the most helpful animal and its way out for a moment. Free for now; ads may gate it later. */
function showHint(): void {
  const state = current();
  if (!state || isCleared(state) || isFailed(state)) return;
  // nothing can leave: the push that untangles the knot, if there is one
  const id = pickHint(state.level, state.alive, state.fuses) ?? (BUMP ? pickPush(state.level, state.alive, state.fuses) : null);
  const view = id === null ? undefined : views.get(id);
  if (!view) { $('msg').textContent = BUMP ? '길이 꼬였어요. 되돌리기를 눌러요' : '지금은 움직일 수 있는 친구가 없어요'; return; }
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
  // 2.5D status icons keep a fixed size on the screen: sprite scale per css px for this camera and canvas
  setStatusPixelScale(2 / (stage.camera.projectionMatrix.elements[5] * (stage.renderer.domElement.clientHeight || 1)));
  dustT += dt;
  const dust = dustT > 0.07;
  if (dust) dustT = 0;
  for (const e of flow?.step(dt, loopSpeed ?? runSpeed()) ?? []) {
    const v = views.get(e.id);
    if (e.type === 'wait' && !e.quiet && v) collide(e.id, v);
    // 2.5D: a runner held up behind another sets off again with its own step sound
    if (e.type === 'resume' && v?.cards) sound.play('move');
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
  if (tutorialCheck) situationalTutorial();
  watchArrow();
  fx.update(dt);
  stage.update(dt);
  stage.render();
  requestAnimationFrame(loop);
})();

// the result card's three friends: copies of the approved 2.5D front pictures (game/public/assets/ui/result, UI v0.2)
for (const src of ['/assets/ui/result/penguin.png', '/assets/ui/result/chick.png', '/assets/ui/result/parrot.png']) {
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  document.querySelector('#popup .peek')!.appendChild(img);
}

/**
 * Settings (top right on the title and in play): for now one switch, the sound. The switch keeps the old sound
 * button's id and its `muted` class, so the saved setting and the checks read it as before.
 */
const SOUND_ICONS = '<svg class="on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>'
  + '<svg class="off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/></svg>';
const muteBtn = document.createElement('button');
muteBtn.id = 'mute';
muteBtn.className = 'toggle';
muteBtn.setAttribute('role', 'switch');
muteBtn.innerHTML = `<span class="tName">${SOUND_ICONS}소리</span><span class="tWord"></span><span class="tTrack"><span class="tKnob"></span></span>`;
const paintMute = (): void => {
  muteBtn.classList.toggle('muted', sound.muted);
  muteBtn.setAttribute('aria-checked', String(!sound.muted));
  muteBtn.setAttribute('aria-label', sound.muted ? '소리 꺼짐, 누르면 켜져요' : '소리 켜짐, 누르면 꺼져요');
  muteBtn.querySelector('.tWord')!.textContent = sound.muted ? '꺼짐' : '켜짐';
};
paintMute();
muteBtn.addEventListener('click', () => { sound.unlock(); sound.setMuted(!sound.muted); paintMute(); });
$('settings').addEventListener('click', () => {
  sound.unlock();
  modal.open('settings', '설정', [muteBtn], [{ id: 'settingsClose', label: '닫기', kind: 'secondary', onClick: () => modal.close() }]);
});

/** Home: the title over a small board where the front animal runs out on a loop. Leaves the saved progress alone. */
function goHome(): void {
  const token = clearBoard();
  speciesOverride.clear();
  const board = titleBoard();
  for (const [id, name] of board.species) speciesOverride.set(id, name);
  stage.setBoard(board.level, 'village', 1, 1);
  const saved = readProgress();
  title.show(hasSavedProgress(saved) ? { level: saved, place: stageFor(saved).name } : null);
  layoutTitle(board.level);
  titleRun(board.level, board.runner, token);
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
  const room = innerHeight - 2 * TITLE_MARGIN - head - buttons - TITLE_GAPS;
  const zoom = Math.max(0.4, Math.min(1, room / (fitted.bottom - fitted.top)));
  stage.frame(zoom, 0);
  const band = boardBand(level);
  const top = band.top - 4 - head;
  const bottom = band.bottom + 16 + buttons;
  stage.frame(zoom, Math.round((innerHeight - top - bottom) / 2));
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
    view.runOut(() => {}, () => { fx.burst(view.gateWorld(), view.color); fx.sparkle(view.gateWorld(), view.color); });
  }, TITLE_RUN.go);
  window.setTimeout(() => { if (live()) titleRun(level, runner, token); }, TITLE_RUN.again);
}
window.addEventListener('resize', () => { if (title.visible && flow) layoutTitle(flow.level); });

function startLevel(n: number): void {
  title.hide();
  void loadLevel(n);
}

const title = new TitleScreen({ start: () => startLevel(1), resume: () => startLevel(readProgress()), restart: () => startLevel(1) });
$('home').addEventListener('click', goHome);

// dev entry points (?level, ?demo) go straight into play; a build has no parameters and always opens on the title
const fromUrl = Number(params.get('level'));
if (params.has('demo') || (Number.isInteger(fromUrl) && fromUrl >= 1)) void loadLevel(Number.isInteger(fromUrl) && fromUrl >= 1 ? fromUrl : readProgress());
else goHome();

/** Test hook used by automated browser checks (tests/e2e); dev server only. */
if (import.meta.env.DEV) (window as unknown as { __game: unknown }).__game = {
  tap: (id: number) => onTap(id),
  /** The animal the hint button would light up (bombs first). */
  // the hint button's pick: a free animal, or (nothing free) the push that untangles the knot
  hint: () => { const s = current(); return s ? pickHint(s.level, s.alive, s.fuses) ?? (BUMP ? pickPush(s.level, s.alive, s.fuses) : null) : null; },
  // animals whose push right now collides with a dynamite (the browser checks set one off with these)
  bombTouches: () => { const s = current(); if (!s) return []; return s.level.pieces.filter((p) => s.alive.has(p.id) && !canExit(s.level, p.id, s.alive)).filter((p) => { const b = bumpResult(s.level, p, s.alive); return !!b && burnOnCollision(s.fuses, s.alive, p.id, b.stopper).exploded; }).map((p) => p.id); },
  free: () => { const s = current(); return s ? s.level.pieces.filter((p) => s.alive.has(p.id) && canExit(s.level, p.id, s.alive)).map((p) => p.id) : []; },
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

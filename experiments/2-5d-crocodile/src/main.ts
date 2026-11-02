/**
 * 2.5D crocodile: the game's escape rules (rules.ts) and run tracks, drawn with Canvas 2D and PNG sprites only.
 * Tap an animal: the rules decide at once; one that can leave runs along its rounded track (head first, each block one
 * cell behind on the same track, game/animals.ts place); a blocked one shakes in place and costs a heart.
 * Each block picks the sprite frame nearest its own track heading, so in a bend the head, middle and tail can each
 * face a different way. Frames per turn (8 / 16 / 32) and cross-fading between frames are switchable for comparison.
 */
import { type GameState, type Level, type Piece, onBoard, routeOf, tap, traceExit, type Track, trackAt } from './rules';
import { SCENES } from './scenes';
import { drawPose, loadSpecies, posesOf, type Species } from './spriteRender';
import { drawOrder } from './sprites';
import { Traffic } from './traffic';

/** ?render=legacy draws with the original per-part strips (kept for comparison); default: shared sprites + manifests. */
const RENDER = new URLSearchParams(location.search).get('render') === 'legacy' ? 'legacy' : 'sprites';
const species = new Map<string, Species>();
/** the experiment's scenes: one-cell pieces are chicks, two-cell ones the compatibility test animal, longer crocodiles */
const speciesOf = (cells: number): string => (cells === 1 ? 'chick' : cells === 2 ? 'two-cell-test' : 'crocodile');
let missingPictures = 0;

const RUN_SPEED = 7.5; // cells/s, game/animals.ts RUN_SPEED
const GATE_FADE = 0.8; // past the gate a block shrinks away within this many cells
const SHAKE_TIME = 0.4;
const HEARTS = 3;
const PITCH = (58 * Math.PI) / 180;
const CAM_DIST = 18;
const CHICK_W = 1.02;

const canvas = document.getElementById('board') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const $ = (id: string): HTMLElement => document.getElementById(id)!;

// ---------------------------------------------------------------- projection (58° pitch pinhole, no yaw)

interface Vec { x: number; y: number; z: number }
const cam = { x: 0, y: CAM_DIST * Math.sin(PITCH), z: CAM_DIST * Math.cos(PITCH) };
const fwd = { x: 0, y: -Math.sin(PITCH), z: -Math.cos(PITCH) };
const up = { x: 0, y: Math.cos(PITCH), z: -Math.sin(PITCH) };
let focal = 1;
let centre = { x: 0, y: 0 };
let level: Level = SCENES.straight.level;

function project(p: Vec): { x: number; y: number } {
  const v = { x: p.x - cam.x, y: p.y - cam.y, z: p.z - cam.z };
  const depth = v.x * fwd.x + v.y * fwd.y + v.z * fwd.z;
  const sy = v.x * up.x + v.y * up.y + v.z * up.z;
  return { x: centre.x + (focal * v.x) / depth, y: centre.y - (focal * sy) / depth };
}
/** Grid (x right, y down the screen) to world (x right, y up, z towards the camera). */
const world = (gx: number, gy: number, h = 0): Vec => ({ x: gx - (level.width - 1) / 2, y: h, z: gy - (level.height - 1) / 2 });
/** Screen pixels per world unit at a grid point. */
const pxPerUnit = (gx: number, gy: number): number => project(world(gx + 0.5, gy)).x - project(world(gx - 0.5, gy)).x;

function poly(points: Vec[], fill: string, stroke?: string): void {
  ctx.beginPath();
  points.forEach((p, i) => { const s = project(p); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

/** Screen point to the grid cell under it (ray onto the plane at height h). */
function cellAt(sx: number, sy: number, h = 0): { x: number; y: number } {
  const dx = (sx - centre.x) / focal, dy = -(sy - centre.y) / focal;
  const dir = { x: dx, y: fwd.y + up.y * dy, z: fwd.z + up.z * dy };
  const t = (h - cam.y) / dir.y;
  const p = { x: cam.x + dir.x * t, z: cam.z + dir.z * t };
  return { x: Math.round(p.x + (level.width - 1) / 2), y: Math.round(p.z + (level.height - 1) / 2) };
}

function fit(): void {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const top = $('hud').getBoundingClientRect().bottom + 30;
  const bottom = $('panel').getBoundingClientRect().top - 12;
  const box = [world(-0.7, -0.7), world(level.width - 0.3, -0.7), world(-0.7, level.height - 0.3, -0.3), world(level.width - 0.3, level.height - 0.3, -0.3), world(-0.7, -0.7, 1)];
  const extent = (): number[] => { const s = box.map(project); return [Math.min(...s.map((p) => p.x)), Math.max(...s.map((p) => p.x)), Math.min(...s.map((p) => p.y)), Math.max(...s.map((p) => p.y))]; };
  focal = 1;
  centre = { x: 0, y: 0 };
  const [a0, a1, b0, b1] = extent();
  focal = Math.min((innerWidth - 20) / (a1 - a0), (bottom - top) / (b1 - b0));
  const [c0, c1, d0, d1] = extent();
  centre = { x: innerWidth / 2 - (c0 + c1) / 2, y: (top + bottom) / 2 - (d0 + d1) / 2 };
}

// ---------------------------------------------------------------- sprites

interface Strip { img: HTMLImageElement; frames: number; frame: number; ppu: number; anchor: [number, number] }
const strips = new Map<string, Strip>();
const chick = new Map<string, { img: HTMLImageElement; w: number; h: number; footX: number }>();
async function loadImage(src: string): Promise<HTMLImageElement> { const img = new Image(); img.src = src; await img.decode(); return img; }
async function loadSprites(): Promise<void> {
  const meta = await (await fetch('sprites/crocodile.json')).json() as Omit<Strip, 'img'>;
  for (const part of ['head', 'body', 'tail']) strips.set(part, { ...meta, img: await loadImage(`sprites/crocodile_${part}.png`) });
  const cm = await (await fetch('sprites/chick/chick_sprites.json')).json() as Record<string, { w: number; h: number; footX: number }>;
  for (const v of ['front', 'back', 'side_right']) chick.set(v, { ...cm[v], img: await loadImage(`sprites/chick/chick_${v}.png`) });
}

// ---------------------------------------------------------------- play state

interface View { piece: Piece; track: Track; headStart: number; s: number; running: boolean; gone: boolean; shake: number }
const opts = { dirs: 8, blend: false, speed: 1 };
let state: GameState;
let views = new Map<number, View>();
let traffic = new Traffic();
let sceneKey = 'straight';

function load(key: string): void {
  sceneKey = key;
  level = SCENES[key].level;
  state = { level, alive: new Set(level.pieces.map((p) => p.id)), hearts: HEARTS, taps: 0 };
  views = new Map(level.pieces.map((p) => { const r = routeOf(level, p); return [p.id, { piece: p, track: r.track, headStart: r.headStart, s: r.headStart, running: false, gone: false, shake: 0 }]; }));
  traffic = new Traffic();
  $('note').textContent = SCENES[key].note;
  $('msg').textContent = '동물을 눌러 보세요';
  document.querySelectorAll<HTMLButtonElement>('#scenes button').forEach((b) => b.classList.toggle('on', b.dataset.k === key));
  hud();
  fit();
}

function hud(): void {
  $('hearts').textContent = '♥'.repeat(Math.max(0, state.hearts)) + '♡'.repeat(Math.max(0, HEARTS - state.hearts));
}

function onTap(id: number): string {
  const r = tap(state, id);
  state = r.state;
  const v = views.get(id)!;
  if (r.event.type === 'exited') {
    v.running = true;
    traffic.add(id, v.track, v.piece.cells.length, v.headStart);
    $('msg').textContent = id === 1 ? '악어가 달려 나가요' : '병아리가 달려 나가요';
  } else if (r.event.type === 'blocked') {
    v.shake = SHAKE_TIME;
    $('msg').textContent = r.event.blockers.length ? '앞에 친구가 있어요' : '앞이 막혔어요';
  }
  hud();
  if (state.hearts <= 0 && state.alive.size) $('msg').textContent = '하트가 모두 떨어졌어요';
  return r.event.type;
}

function step(dt: number): void {
  for (const id of traffic.step(dt, RUN_SPEED * opts.speed)) { const v = views.get(id)!; v.gone = true; v.running = false; }
  for (const r of traffic.runners) views.get(r.id)!.s = r.s;
  for (const v of views.values()) v.shake = Math.max(0, v.shake - dt);
  if (state.alive.size === 0 && [...views.values()].every((v) => v.gone)) $('msg').textContent = '탈출 성공!';
}

// ---------------------------------------------------------------- drawing

function drawBoard(): void {
  const { width: w, height: h } = level;
  poly([world(-0.62, h - 0.38), world(w - 0.38, h - 0.38), world(w - 0.38, h - 0.38, -0.28), world(-0.62, h - 0.38, -0.28)], '#8f7a5f');
  poly([world(-0.62, -0.62), world(w - 0.38, -0.62), world(w - 0.38, h - 0.38), world(-0.62, h - 0.38)], '#b7a07c');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!onBoard(level, x, y)) continue;
    const g = 0.46;
    poly([world(x - g, y - g), world(x + g, y - g), world(x + g, y + g), world(x - g, y + g)], (x + y) % 2 ? '#efe2c6' : '#e6d6b5', 'rgba(120,96,64,.25)');
  }
  for (const a of level.arrows ?? []) {
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[a.dir];
    const n = [-d[1], d[0]];
    const at = (f: number, s: number): Vec => world(a.x + d[0] * f + n[0] * s, a.y + d[1] * f + n[1] * s);
    poly([world(a.x - 0.44, a.y - 0.44), world(a.x + 0.44, a.y - 0.44), world(a.x + 0.44, a.y + 0.44), world(a.x - 0.44, a.y + 0.44)], '#f6c14b');
    poly([at(0.34, 0), at(0.02, 0.3), at(0.02, 0.12), at(-0.32, 0.12), at(-0.32, -0.12), at(0.02, -0.12), at(0.02, -0.3)], '#fff');
  }
}

/** Faint dots along each standing animal's way out (the game shows chevrons); red when it cannot get out. */
function drawPaths(): void {
  for (const v of views.values()) {
    if (v.running || v.gone) continue;
    const t = traceExit(level, v.piece);
    for (const c of t.cells) {
      const p = project(world(c.x, c.y));
      ctx.fillStyle = t.reachesEdge ? 'rgba(80,170,70,.55)' : 'rgba(210,70,60,.55)';
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2.5, pxPerUnit(c.x, c.y) * 0.06), 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawRock(c: { x: number; y: number }): void {
  const g = 0.4, hgt = 0.55;
  const sx = world(c.x, c.y).x;
  if (sx > 0.01) poly([world(c.x - g, c.y - g), world(c.x - g, c.y + g), world(c.x - g, c.y + g, hgt), world(c.x - g, c.y - g, hgt)], '#7d7f86');
  if (sx < -0.01) poly([world(c.x + g, c.y - g), world(c.x + g, c.y + g), world(c.x + g, c.y + g, hgt), world(c.x + g, c.y - g, hgt)], '#7d7f86');
  poly([world(c.x - g, c.y + g), world(c.x + g, c.y + g), world(c.x + g, c.y + g, hgt), world(c.x - g, c.y + g, hgt)], '#90939b');
  poly([world(c.x - g, c.y - g, hgt), world(c.x + g, c.y - g, hgt), world(c.x + g, c.y + g, hgt), world(c.x - g, c.y + g, hgt)], '#b4b7be', 'rgba(60,60,70,.5)');
}

/** Strip frames for a heading: the nearest of `dirs` headings, or the two around it with a blend weight. */
function frames(angle: number, total: number): Array<[number, number]> {
  const per = (Math.PI * 2) / opts.dirs;
  const f = (((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / per;
  const toStrip = (k: number): number => ((k % opts.dirs) * total) / opts.dirs;
  if (!opts.blend) return [[toStrip(Math.round(f)), 1]];
  const lo = Math.floor(f);
  return [[toStrip(lo), 1], [toStrip(lo + 1), f - lo]];
}

interface Block { gx: number; gy: number; angle: number; part: string; k: number; shakeX: number }

function blocksOf(v: View): Block[] {
  const n = v.piece.cells.length;
  const gateU = v.track.length - (n + 2) + 0.62;
  const sh = v.shake > 0 ? Math.sin((1 - v.shake / SHAKE_TIME) * Math.PI * 6) * 0.07 * (v.shake / SHAKE_TIME) : 0;
  return v.piece.cells.map((_, i) => {
    const q = trackAt(v.track, v.s - i);
    const k = v.running ? Math.max(0, Math.min(1, 1 - (v.s - i - gateU) / GATE_FADE)) : 1;
    return { gx: q.x, gy: q.y, angle: q.angle, part: n === 1 ? 'chick' : i === 0 ? 'head' : i === n - 1 ? 'tail' : 'body', k, shakeX: sh };
  });
}

function drawBlock(b: Block): void {
  if (b.k <= 0.02) return;
  // sideways shake, across the heading
  const gx = b.gx + Math.cos(b.angle) * b.shakeX, gy = b.gy - Math.sin(b.angle) * b.shakeX;
  const foot = project(world(gx, gy));
  const ppx = pxPerUnit(gx, gy) * b.k;
  ctx.save(); ctx.filter = 'blur(2px)'; ctx.fillStyle = 'rgba(60,40,20,.22)';
  ctx.beginPath(); ctx.ellipse(foot.x, foot.y, ppx * 0.46, ppx * 0.46 * Math.sin(PITCH) * 0.85, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  if (b.part === 'chick') { drawChick(b, foot, ppx); return; }
  const s = strips.get(b.part)!;
  const scale = ppx / s.ppu;
  for (const [idx, alpha] of frames(b.angle, s.frames)) {
    if (alpha <= 0.001) continue;
    ctx.globalAlpha = alpha;
    ctx.drawImage(s.img, idx * s.frame, 0, s.frame, s.frame, foot.x - s.anchor[0] * scale, foot.y - s.anchor[1] * scale, s.frame * scale, s.frame * scale);
  }
  ctx.globalAlpha = 1;
}

function drawChick(b: Block, foot: { x: number; y: number }, ppx: number): void {
  // four facings from the concept sheet; right is the left-facing side view mirrored
  const a = ((b.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const q = Math.round(a / (Math.PI / 2)) % 4; // 0 down, 1 right, 2 up, 3 left
  const s = chick.get(['front', 'side_right', 'back', 'side_right'][q])!, front = chick.get('front')!;
  const k = (ppx * CHICK_W) / front.w;
  const w = s.w * k, h = s.h * k;
  const mirror = q === 1;
  const fx = (mirror ? s.w - s.footX : s.footX) * k;
  const y = foot.y + ppx * 0.3 * Math.sin(PITCH) - h;
  ctx.save();
  if (mirror) { ctx.translate(foot.x - fx + w, y); ctx.scale(-1, 1); ctx.drawImage(s.img, 0, 0, w, h); }
  else ctx.drawImage(s.img, foot.x - fx, y, w, h);
  ctx.restore();
}

function draw(): void {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  drawBoard();
  drawPaths();
  // painter's order on the floor: further up the screen first; rocks and every animal block share one list
  if (RENDER === 'sprites') { drawWithSprites(); return; }
  const items: Array<{ z: number; draw: () => void }> = (level.obstacles ?? []).map((c) => ({ z: c.y, draw: () => drawRock(c) }));
  for (const v of views.values()) if (!v.gone) for (const b of blocksOf(v)) items.push({ z: b.gy, draw: () => drawBlock(b) });
  items.sort((a, b) => a.z - b.z).forEach((i) => i.draw());
}

/** The shared renderer: tucked poses from the track, pictures from the manifests, everything in screen-depth order. */
function drawWithSprites(): void {
  const env = { ctx, floor: (gx: number, gy: number) => project(world(gx, gy)), pxPerUnit, pitch: PITCH };
  const items: Array<{ y: number; draw: () => void }> = (level.obstacles ?? []).map((c) => ({ y: c.y, draw: () => drawRock(c) }));
  for (const v of views.values()) {
    if (v.gone) continue;
    const sp = species.get(speciesOf(v.piece.cells.length))!;
    for (const p of posesOf({ cells: v.piece.cells.length, track: v.track, s: v.s, running: v.running, shake: v.shake }, SHAKE_TIME, GATE_FADE)) {
      items.push({ y: p.gy, draw: () => { if (!drawPose(env, sp, p)) missingPictures++; } });
    }
  }
  drawOrder(items).forEach((i) => i.draw());
}

// ---------------------------------------------------------------- loop and input

let paused = false;
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) step(dt);
  draw();
  requestAnimationFrame(frame);
}

canvas.addEventListener('pointerdown', (e) => {
  // the floor cell under the finger, or the cell under the animal's back when the finger is on its body
  for (const h of [0, 0.35]) {
    const c = cellAt(e.clientX, e.clientY, h);
    const p = level.pieces.find((q) => state.alive.has(q.id) && q.cells.some((k) => k.x === c.x && k.y === c.y));
    if (p) { onTap(p.id); return; }
  }
});

for (const [k, sc] of Object.entries(SCENES)) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = sc.title; b.dataset.k = k;
  b.addEventListener('click', () => load(k));
  $('scenes').append(b);
}
($('dirs') as HTMLSelectElement).addEventListener('change', (e) => { opts.dirs = Number((e.target as HTMLSelectElement).value); });
($('blend') as HTMLInputElement).addEventListener('change', (e) => { opts.blend = (e.target as HTMLInputElement).checked; });
($('slow') as HTMLInputElement).addEventListener('change', (e) => { opts.speed = (e.target as HTMLInputElement).checked ? 0.25 : 1; });
$('reset').addEventListener('click', () => load(sceneKey));
addEventListener('resize', fit);

// hooks for the screenshot / GIF script: a paused, frame-exact clock
(window as unknown as { __exp: unknown }).__exp = {
  load, tap: onTap, set: (o: Partial<typeof opts>) => Object.assign(opts, o),
  pause: (p: boolean) => { paused = p; },
  advance: (dt: number, n = 1) => { for (let i = 0; i < n; i++) step(dt); draw(); },
  render: RENDER,
  missingPictures: () => missingPictures,
  info: () => ({
    hearts: state.hearts, alive: [...state.alive], msg: $('msg').textContent,
    views: [...views.values()].map((v) => ({ id: v.piece.id, s: v.s, running: v.running, gone: v.gone, blocks: v.gone ? [] : blocksOf(v).map((b) => ({ x: +b.gx.toFixed(3), y: +b.gy.toFixed(3), deg: Math.round((b.angle * 180) / Math.PI), part: b.part, k: +b.k.toFixed(2) })) })),
  }),
  screenOf: (gx: number, gy: number) => project(world(gx, gy, 0.3)),
  ready: false,
};

await loadSprites();
if (RENDER === 'sprites') {
  species.set('crocodile', await loadSpecies('assets/crocodile/crocodile.sprites.json'));
  species.set('chick', await loadSpecies('sprites/chick/chick.sprites.json'));
  species.set('two-cell-test', await loadSpecies('assets/crocodile/two-cell-test.sprites.json'));
}
load(new URLSearchParams(location.search).get('scene') ?? 'straight');
requestAnimationFrame(frame);
(window as unknown as { __exp: { ready: boolean } }).__exp.ready = true;

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { VerticalTiltShiftShader } from 'three/examples/jsm/shaders/VerticalTiltShiftShader.js';
import type { Crate, Level } from '../src/core/types';
import { crateCracks, directionVector, exitCell, exitDirection, onBoard } from '../src/core/rules';
import { createRng } from '../src/core/rng';
import type { Theme } from '../src/curve/curve';
import { buildScenery, obstacleFor, PALETTES } from './scenery';
import { composeScene } from './scenes';
import { buildPlaza } from './plaza';

/** Soft lighter and darker patches over the base colour, so the grass is not one flat colour. Repeats across the plane. */
function groundTexture(color: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const base = new THREE.Color(color);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const r = 10 + rnd() * 34;
    const tone = base.clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.08);
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `#${tone.getHexString()}`);
    grd.addColorStop(1, `#${tone.getHexString()}00`);
    ctx.fillStyle = grd;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  return tex;
}

/** Cream pill with one brown dot per hit a crate has left. */
/** Bubble size on the board (cells): wide enough for its dots, 1.5 x the first size (2026-11-07). */
const PIP_W = (left: number): number => 0.5 + 0.27 * left;
const PIP_H = 0.5;

function pipTexture(left: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  const w = 64 + 34 * left;
  c.width = w;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff8e8';
  ctx.strokeStyle = '#8a6a45';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(3, 3, w - 6, 58, 29);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#8a5a3b';
  for (let i = 0; i < left; i++) {
    ctx.beginPath();
    ctx.arc(w / 2 + (i - (left - 1) / 2) * 34, 32, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const CRACK_GEO = new THREE.BoxGeometry(0.5, 0.03, 0.07);
const CRACK_MAT = new THREE.MeshBasicMaterial({ color: 0x1e1208 });
/** How long a crack's pip pop and a breaking crate's fall take (s); the shards fly for SHARD_LIFE. */
const CRACK_POP = 0.3;
const BREAK_FALL = 0.3;
const SHARD_LIFE = 0.55;
const SHARD_GEO = new THREE.BoxGeometry(0.22, 0.14, 0.22);
const SHARD_MAT = new THREE.MeshStandardMaterial({ color: 0xc08a52, roughness: 0.9 });

/** Free what a board group created for itself; scenery meshes share cached geometry and materials and are skipped. */
function disposeOwned(root: THREE.Object3D): void {
  root.traverse((o) => {
    const sp = o as THREE.Sprite;
    if (sp.isSprite) { sp.material.map?.dispose(); sp.material.dispose(); return; }
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.shared) return;
    // merged scenery (scenes.ts mergeProp): its own geometry, the shared cached materials
    if (m.userData.ownGeometry) { m.geometry.dispose(); return; }
    if (!m.userData.sharedGeometry) m.geometry.dispose();
    for (const mt of Array.isArray(m.material) ? m.material : [m.material]) {
      (mt as THREE.MeshStandardMaterial).map?.dispose();
      mt.dispose();
    }
  });
}

/** World position of a (possibly fractional) grid point. Cell centers sit on integer grid coordinates. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  /** Camera elevation above the board plane in degrees (90 = straight down). Only dev comparisons (?cam) change it. */
  elevation = 58;
  /** Dev comparisons (?camzoom=keep): stay at the distance the 58 degree camera would use, so only the angle changes. */
  keepZoom = false;
  private board = new THREE.Group();
  private level: Level | null = null;
  private readonly ray = new THREE.Raycaster();
  private readonly hemi = new THREE.HemisphereLight(0xffffff, 0xb9c9a4, 1.05);
  private crates: Array<{ crate: Crate; obj: THREE.Object3D; crack: THREE.Object3D; pips: THREE.Sprite; cracks: number; shakeT: number; popT: number; breakT: number }> = [];
  /** Pieces of a breaking crate flying off, each with its velocity (per second) and time left. */
  private shards: Array<{ mesh: THREE.Mesh; v: THREE.Vector3; t: number }> = [];
  /** Miniature look of the reference: the board stays sharp, the scenery above and below softens. */
  private composer!: EffectComposer;
  /** The chick tutorial's focus: off unless a tutorial lights an animal up (setFocus). */
  private focusPass!: FocusPass;
  private focused: THREE.Object3D[] = [];
  /** Arrow tiles by cell, with the time left of their bounce (bounceArrow). */
  private arrowTiles = new Map<string, { obj: THREE.Object3D; t: number }>();
  /** How many arrow bounces were played (for checks). */
  arrowBounces = 0;
  private tilt!: ShaderPass;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // neutral tone mapping (applied in the OutputPass) keeps the brighter animal colours from clipping
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xcfe8f3);
    this.scene.add(this.hemi);
    this.hemi.layers.enable(FOCUS_LAYER);
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(4, 10, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    sun.layers.enable(FOCUS_LAYER);
    this.scene.add(sun);
    this.scene.add(this.board);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.focusPass = new FocusPass(this.scene, this.camera);
    this.composer.addPass(this.focusPass);
    this.tilt = new ShaderPass(VerticalTiltShiftShader);
    this.composer.addPass(this.tilt);
    this.composer.addPass(new OutputPass());
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  worldOf(level: Level, x: number, y: number): THREE.Vector3 {
    return new THREE.Vector3(x - (level.width - 1) / 2, 0, y - (level.height - 1) / 2);
  }

  /**
   * Board island for this level (only the cells of its outline) inside the chapter's surroundings. `seed` keeps the
   * scenery the same every time the same level is opened.
   */
  setBoard(level: Level, theme: Theme = 'village', seed = 1, stage = 1): void {
    this.level = level;
    this.scene.remove(this.board);
    disposeOwned(this.board);
    this.board = new THREE.Group();
    this.scene.add(this.board);
    const { width: w, height: h } = level;
    const pal = PALETTES[theme];
    this.scene.background = new THREE.Color(pal.sky);
    this.hemi.color.setHex(pal.hemiSky);
    this.hemi.groundColor.setHex(pal.hemiGround);

    const cells: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (onBoard(level, x, y)) cells.push({ x, y });
    const rng = createRng(seed * 7 + 3);

    // grass (or sea, snow...) all around, level with the plaza
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: groundTexture(pal.ground), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.08;
    ground.receiveShadow = true;
    this.board.add(ground);

    this.board.add(buildPlaza(level, cells, theme, (x, y) => this.worldOf(level, x, y), rng));

    const gates = level.pieces.map((p) => {
      const c = exitCell(level, p);
      const v = directionVector(exitDirection(level, p));
      return { p: this.worldOf(level, c.x + v.x * 0.6, c.y + v.y * 0.6), v: new THREE.Vector3(v.x, 0, v.y) };
    });
    const composed = composeScene(theme, stage, { hw: w / 2, hz: h / 2, gates }, rng);
    if (composed) this.board.add(composed);
    else {
      // generic scatter for stages without a composed scene yet
      const near = (x: number, y: number): boolean => cells.some((c) => Math.max(Math.abs(c.x - x), Math.abs(c.y - y)) < 1.6);
      const inLane = (x: number, y: number): boolean => gates.some(({ p, v }) => {
        const q = this.worldOf(level, x, y).sub(p);
        return q.dot(v) > -0.5 && q.dot(v) < 2 && Math.abs(q.x * v.z - q.z * v.x) < 1.1;
      });
      this.board.add(buildScenery(theme, stage, {
        minX: -6, maxX: w + 5, minY: -8, maxY: h + 6,
        blocked: (x, y) => near(x, y) || inLane(x, y),
        world: (x, y) => this.worldOf(level, x, y),
      }, rng));
    }

    const orng = createRng(seed * 13 + 5);
    for (const o of level.obstacles ?? []) {
      const ob = obstacleFor(theme, stage, orng);
      ob.position.copy(this.worldOf(level, o.x, o.y));
      this.board.add(ob);
    }
    // crates take the stage's obstacle look, plus crack lines that show once they are hit
    for (const sh of this.shards) this.board.remove(sh.mesh);
    this.shards = [];
    this.crates = [];
    for (const k of level.crates ?? []) {
      const obj = obstacleFor(theme, stage, orng);
      obj.position.copy(this.worldOf(level, k.x, k.y));
      const crack = new THREE.Group();
      for (const [x, z, r] of [[-0.1, 0.05, 0.6], [0.12, -0.08, -0.5], [0.02, 0.18, 1.4]] as const) {
        const line = new THREE.Mesh(CRACK_GEO, CRACK_MAT);
        line.position.set(x, 0.72, z);
        line.rotation.y = r;
        crack.add(line);
      }
      crack.visible = false;
      obj.add(crack);
      // a bubble with one dot per hit left, so any crate look (hay, rock, log) reads as "this breaks"; big enough to
      // tell two dots from one on a phone (2026-11-07 playtest: the change was not seen at the old size)
      const pips = new THREE.Sprite(new THREE.SpriteMaterial({ map: pipTexture(k.hits), transparent: true, depthTest: false }));
      pips.scale.set(PIP_W(k.hits), PIP_H, 1);
      pips.position.set(0, 1.25, 0);
      pips.renderOrder = 9;
      obj.add(pips);
      this.board.add(obj);
      this.crates.push({ crate: k, obj, crack, pips, cracks: 0, shakeT: 0, popT: 0, breakT: 0 });
    }
    this.arrowTiles.clear();
    for (const a of level.arrows ?? []) {
      const obj = this.arrowTile(level, a.x, a.y, a.dir);
      this.arrowTiles.set(`${a.x},${a.y}`, { obj, t: 0 });
      this.board.add(obj);
    }
    this.fit();
  }

  private arrowTile(level: Level, x: number, y: number, dir: 'up' | 'down' | 'left' | 'right'): THREE.Object3D {
    const g = new THREE.Group();
    const tile = new THREE.Mesh(new RoundedBoxGeometry(0.92, 0.08, 0.92, 2, 0.03), new THREE.MeshStandardMaterial({ color: 0xede4ce }));
    tile.position.y = 0.05;
    tile.receiveShadow = true;
    g.add(tile);
    const mark = new THREE.MeshStandardMaterial({ color: ARROW_MARK.color });
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(arrowTileFrame(), { depth: ARROW_MARK.frameDepth, bevelEnabled: false }), mark);
    frame.rotation.x = Math.PI / 2;
    frame.position.y = ARROW_MARK.tileTop + ARROW_MARK.frameDepth;
    g.add(frame);
    const arrow = new THREE.Mesh(new THREE.ExtrudeGeometry(arrowShape(), { depth: ARROW_MARK.arrowDepth, bevelEnabled: false }), mark);
    arrow.rotation.x = Math.PI / 2;
    arrow.position.y = ARROW_MARK.tileTop + ARROW_MARK.arrowDepth;
    const holder = new THREE.Group();
    holder.add(arrow);
    const v = directionVector(dir);
    holder.rotation.y = Math.atan2(v.x, v.y);
    g.add(holder);
    g.position.copy(this.worldOf(level, x, y));
    return g;
  }

  /** Move the camera back until the whole board fits the viewport. Drops any frame(), which is fitted afresh. */
  fit(): void {
    if (!this.level) return;
    this.camera.clearViewOffset();
    const d = this.fitDistance(this.keepZoom ? 58 : this.elevation);
    this.place(this.elevation, d);
  }

  /**
   * Title framing: draw the fitted picture `zoom` times its size (below 1 it shrinks, around the screen's centre) and
   * `shift` CSS pixels lower, so the title's logo, board and buttons fit as one block. Picking follows, as it goes
   * through the same camera. The next fit() (a new board, a resize) clears it.
   */
  frame(zoom: number, shift: number): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (zoom === 1 && shift === 0) this.camera.clearViewOffset();
    else this.camera.setViewOffset(w, h, (w - w / zoom) / 2, (h - h / zoom) / 2 - shift / zoom, w / zoom, h / zoom);
    this.camera.updateProjectionMatrix();
  }

  private place(elevationDeg: number, d: number): void {
    const elev = (elevationDeg * Math.PI) / 180;
    this.camera.position.set(0, d * Math.sin(elev), d * Math.cos(elev));
    this.camera.lookAt(0, 0, 0.4);
    this.camera.updateMatrixWorld();
    this.camera.updateProjectionMatrix();
  }

  /** The nearest camera distance at this elevation that shows the whole board with its margins. */
  private fitDistance(elevationDeg: number): number {
    const { width: w, height: h } = this.level!;
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => new THREE.Vector3(sx * (w / 2 + 0.45), 0, sz * (h / 2 + 0.8)));
    let d = 6;
    for (; d < 90; d += 0.4) {
      this.place(elevationDeg, d);
      const fits = corners.every((c) => {
        const p = c.clone().project(this.camera);
        return Math.abs(p.x) < 0.97 && p.y > -0.8 && p.y < 0.86;
      });
      if (fits) break;
    }
    return d;
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.tilt.uniforms.v.value = 1.3 / h;
    this.tilt.uniforms.r.value = 0.5;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fit();
  }

  /** The camera ray through a screen point (client pixels), shared by floor and model picking. */
  rayAt(clientX: number, clientY: number): THREE.Raycaster {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    this.ray.setFromCamera(ndc, this.camera);
    return this.ray;
  }

  /** Grid coordinates (cell centers on integers) under a screen point, or null if the ray misses the floor. */
  screenToGrid(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.level) return null;
    this.rayAt(clientX, clientY);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    return { x: hit.x + (this.level.width - 1) / 2, y: hit.z + (this.level.height - 1) / 2 };
  }

  gridToScreen(level: Level, x: number, y: number): { x: number; y: number } {
    const p = this.worldOf(level, x, y).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  }

  /**
   * Bring the crates in line with who has left: a new crack shows the crack lines and shakes the crate, a broken one
   * disappears. Returns what changed so the caller can play sounds and effects.
   */
  updateCrates(level: Level, alive: ReadonlySet<number>): Array<{ pos: THREE.Vector3; broke: boolean; x: number; y: number }> {
    const out: Array<{ pos: THREE.Vector3; broke: boolean; x: number; y: number }> = [];
    for (const c of this.crates) {
      const cracks = crateCracks(level, c.crate, alive);
      if (cracks <= c.cracks) continue;
      c.cracks = cracks;
      const broke = cracks >= c.crate.hits;
      if (broke) {
        // the crate falls in for BREAK_FALL while its pieces fly off, then it is gone
        c.breakT = BREAK_FALL;
        c.pips.visible = false;
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          const mesh = new THREE.Mesh(SHARD_GEO, SHARD_MAT);
          mesh.position.copy(c.obj.position).add(new THREE.Vector3(dx * 0.18, 0.5, dz * 0.18));
          this.board.add(mesh);
          this.shards.push({ mesh, v: new THREE.Vector3(dx * 1.6, 2.6, dz * 1.6), t: SHARD_LIFE });
        }
      } else {
        // a crack: the lines show, the crate shakes and the bubble pops as one dot goes
        c.crack.visible = true;
        c.shakeT = 0.35;
        c.popT = CRACK_POP;
        const m = c.pips.material;
        m.map?.dispose();
        m.map = pipTexture(c.crate.hits - cracks);
        m.needsUpdate = true;
        c.pips.scale.x = PIP_W(c.crate.hits - cracks);
      }
      out.push({ pos: c.obj.position.clone(), broke, x: c.crate.x, y: c.crate.y });
    }
    return out;
  }

  update(dt: number): void {
    for (const c of this.crates) {
      if (c.breakT > 0) {
        c.breakT = Math.max(0, c.breakT - dt);
        const k = c.breakT / BREAK_FALL;
        c.obj.scale.set(0.3 + 0.7 * k, 0.1 + 0.9 * k * k, 0.3 + 0.7 * k);
        if (c.breakT === 0) c.obj.visible = false;
        continue;
      }
      if (c.popT > 0) {
        c.popT = Math.max(0, c.popT - dt);
        const k = 1 + 0.5 * Math.sin((1 - c.popT / CRACK_POP) * Math.PI);
        c.pips.scale.set(PIP_W(c.crate.hits - c.cracks) * k, PIP_H * k, 1);
      }
      if (c.shakeT <= 0) continue;
      c.shakeT = Math.max(0, c.shakeT - dt);
      c.obj.rotation.z = Math.sin(c.shakeT * 50) * 0.08 * (c.shakeT / 0.35);
      c.obj.scale.setScalar(1 - 0.06 * Math.sin((c.shakeT / 0.35) * Math.PI));
    }
    for (const sh of this.shards) {
      sh.t -= dt;
      sh.v.y -= 9 * dt;
      sh.mesh.position.addScaledVector(sh.v, dt);
      sh.mesh.rotation.x += 6 * dt;
      sh.mesh.rotation.z += 4 * dt;
      sh.mesh.scale.setScalar(Math.max(0.01, sh.t / SHARD_LIFE));
      if (sh.t <= 0) this.board.remove(sh.mesh);
    }
    this.shards = this.shards.filter((sh) => sh.t > 0);
    for (const a of this.arrowTiles.values()) {
      if (a.t <= 0) continue;
      a.t = Math.max(0, a.t - dt);
      const k = Math.sin((1 - a.t / ARROW_BOUNCE) * Math.PI);
      a.obj.scale.set(1 + 0.12 * k, 1 + 0.6 * k, 1 + 0.12 * k);
    }
  }

  /** The crate drawn at a cell (the chick tutorial lights it up), if one stands there. */
  crateObjectAt(x: number, y: number): THREE.Object3D | null {
    return this.crates.find((c) => c.crate.x === x && c.crate.y === y && c.obj.visible)?.obj ?? null;
  }

  /** A short bounce of the arrow tile at a cell (the chick tutorial: the moment an animal turns on it). */
  bounceArrow(x: number, y: number): void {
    const a = this.arrowTiles.get(`${x},${y}`);
    if (!a) return;
    a.t = ARROW_BOUNCE;
    this.arrowBounces++;
  }

  /**
   * Light these objects up over a dark veil (the chick tutorial): they are drawn again on top at full brightness.
   * An empty list turns the veil off and leaves the scene and its rendering exactly as before.
   */
  setFocus(objects: THREE.Object3D[]): void {
    for (const o of this.focused) o.traverse((c) => c.layers.disable(FOCUS_LAYER));
    this.focused = objects;
    for (const o of objects) o.traverse((c) => c.layers.enable(FOCUS_LAYER));
    this.focusPass.enabled = objects.length > 0;
  }

  /** How many objects the tutorial focus lights up now (0: off). */
  get focusCount(): number {
    return this.focused.length;
  }

  render(): void {
    this.composer.render();
  }
}

/** Layer of what the tutorial focus draws over its veil. */
const FOCUS_LAYER = 1;
/** The focus veil, blended in linear light before tone mapping: 0.9 reads about as dark as the approved 0.6 DOM veil. */
const FOCUS_VEIL = { color: 0x000000, opacity: 0.9 };
/** Seconds of an arrow tile's bounce. */
const ARROW_BOUNCE = 0.35;

/**
 * The chick tutorial's focus, right after the scene is drawn: a dark veil over it, then only the focused objects drawn
 * again on top (depth cleared, so the whole animal shows, in front of any neighbour). Disabled unless a tutorial asks,
 * and every renderer and scene setting it touches is put back after each frame.
 */
class FocusPass extends Pass {
  private readonly veil = new FullScreenQuad(new THREE.MeshBasicMaterial({ color: FOCUS_VEIL.color, transparent: true, opacity: FOCUS_VEIL.opacity, depthTest: false, depthWrite: false }));

  constructor(private readonly scene: THREE.Scene, private readonly camera: THREE.Camera) {
    super();
    this.needsSwap = false;
    this.enabled = false;
  }

  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    const autoClear = renderer.autoClear, background = this.scene.background, shadows = renderer.shadowMap.autoUpdate, mask = this.camera.layers.mask;
    renderer.setRenderTarget(this.renderToScreen ? null : read);
    renderer.autoClear = false;
    this.veil.render(renderer);
    renderer.clearDepth();
    this.scene.background = null;
    renderer.shadowMap.autoUpdate = false;
    this.camera.layers.set(FOCUS_LAYER);
    renderer.render(this.scene, this.camera);
    this.camera.layers.mask = mask;
    renderer.shadowMap.autoUpdate = shadows;
    this.scene.background = background;
    renderer.autoClear = autoClear;
  }
}

/**
 * Arrow tile mark, in cells: a flat arrow with a short shaft and a big head (tip forward) and a thin frame just inside the
 * tile's rim, both embossed on the tile top in one colour. The frame still shows when an animal hides the arrow.
 */
const ARROW_MARK = {
  color: 0x8c7b4f,
  tileTop: 0.09,
  arrowDepth: 0.03,
  shaft: 0.13,
  head: 0.34,
  headLength: 0.4,
  length: 0.62,
  frameOuter: 0.44,
  frameBand: 0.06,
  frameDepth: 0.012,
};

/** The arrow outline in the shape plane, tip along +Y (+Z once laid flat by rotating X a quarter turn). */
function arrowShape(): THREE.Shape {
  const { shaft, head, headLength, length } = ARROW_MARK;
  const tail = -length / 2;
  const neck = length / 2 - headLength;
  const s = new THREE.Shape();
  s.moveTo(-shaft, tail);
  s.lineTo(shaft, tail);
  s.lineTo(shaft, neck);
  s.lineTo(head, neck);
  s.lineTo(0, length / 2);
  s.lineTo(-head, neck);
  s.lineTo(-shaft, neck);
  s.closePath();
  return s;
}

/** A square ring just inside the tile's rounded rim. */
function arrowTileFrame(): THREE.Shape {
  const o = ARROW_MARK.frameOuter;
  const i = o - ARROW_MARK.frameBand;
  const s = new THREE.Shape([new THREE.Vector2(-o, -o), new THREE.Vector2(o, -o), new THREE.Vector2(o, o), new THREE.Vector2(-o, o)]);
  s.holes.push(new THREE.Path([new THREE.Vector2(-i, -i), new THREE.Vector2(-i, i), new THREE.Vector2(i, i), new THREE.Vector2(i, -i)]));
  return s;
}

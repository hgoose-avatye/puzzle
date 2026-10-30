import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
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

const CRACK_GEO = new THREE.BoxGeometry(0.42, 0.02, 0.035);
const CRACK_MAT = new THREE.MeshBasicMaterial({ color: 0x3b2a1e });

/** Free what a board group created for itself; scenery meshes share cached geometry and materials and are skipped. */
function disposeOwned(root: THREE.Object3D): void {
  root.traverse((o) => {
    const sp = o as THREE.Sprite;
    if (sp.isSprite) { sp.material.map?.dispose(); sp.material.dispose(); return; }
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.shared) return;
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
  private crates: Array<{ crate: Crate; obj: THREE.Object3D; crack: THREE.Object3D; pips: THREE.Sprite; cracks: number; shakeT: number }> = [];
  /** Miniature look of the reference: the board stays sharp, the scenery above and below softens. */
  private composer!: EffectComposer;
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
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(4, 10, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    this.scene.add(sun);
    this.scene.add(this.board);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
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
      // a small bubble with one dot per hit left, so any crate look (hay, rock, log) reads as "this breaks"
      const pips = new THREE.Sprite(new THREE.SpriteMaterial({ map: pipTexture(k.hits), transparent: true, depthTest: false }));
      pips.scale.set(0.34 + 0.18 * k.hits, 0.34, 1);
      pips.position.set(0, 1.15, 0);
      pips.renderOrder = 9;
      obj.add(pips);
      this.board.add(obj);
      this.crates.push({ crate: k, obj, crack, pips, cracks: 0, shakeT: 0 });
    }
    for (const a of level.arrows ?? []) this.board.add(this.arrowTile(level, a.x, a.y, a.dir));
    this.fit();
  }

  private arrowTile(level: Level, x: number, y: number, dir: 'up' | 'down' | 'left' | 'right'): THREE.Object3D {
    const g = new THREE.Group();
    const tile = new THREE.Mesh(new RoundedBoxGeometry(0.92, 0.08, 0.92, 2, 0.03), new THREE.MeshStandardMaterial({ color: 0xede4ce }));
    tile.position.y = 0.05;
    tile.receiveShadow = true;
    g.add(tile);
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.55, 3), new THREE.MeshStandardMaterial({ color: 0x8c7b4f }));
    tri.rotation.x = Math.PI / 2;
    tri.position.y = 0.11;
    const holder = new THREE.Group();
    holder.add(tri);
    const v = directionVector(dir);
    holder.rotation.y = Math.atan2(v.x, v.y);
    g.add(holder);
    g.position.copy(this.worldOf(level, x, y));
    return g;
  }

  /** Move the camera back until the whole board fits the viewport. */
  fit(): void {
    if (!this.level) return;
    const d = this.fitDistance(this.keepZoom ? 58 : this.elevation);
    this.place(this.elevation, d);
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
  updateCrates(level: Level, alive: ReadonlySet<number>): Array<{ pos: THREE.Vector3; broke: boolean }> {
    const out: Array<{ pos: THREE.Vector3; broke: boolean }> = [];
    for (const c of this.crates) {
      const cracks = crateCracks(level, c.crate, alive);
      if (cracks <= c.cracks) continue;
      c.cracks = cracks;
      const broke = cracks >= c.crate.hits;
      if (broke) c.obj.visible = false;
      else {
        c.crack.visible = true;
        c.shakeT = 0.35;
        const m = c.pips.material;
        m.map?.dispose();
        m.map = pipTexture(c.crate.hits - cracks);
        m.needsUpdate = true;
        c.pips.scale.x = 0.34 + 0.18 * (c.crate.hits - cracks);
      }
      out.push({ pos: c.obj.position.clone(), broke });
    }
    return out;
  }

  update(dt: number): void {
    for (const c of this.crates) {
      if (c.shakeT <= 0) continue;
      c.shakeT = Math.max(0, c.shakeT - dt);
      c.obj.rotation.z = Math.sin(c.shakeT * 50) * 0.08 * (c.shakeT / 0.35);
      c.obj.scale.setScalar(1 - 0.06 * Math.sin((c.shakeT / 0.35) * Math.PI));
    }
  }

  render(): void {
    this.composer.render();
  }
}

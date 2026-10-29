import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { VerticalTiltShiftShader } from 'three/examples/jsm/shaders/VerticalTiltShiftShader.js';
import type { Level } from '../src/core/types';
import { directionVector, exitCell, exitDirection, onBoard } from '../src/core/rules';
import { createRng } from '../src/core/rng';
import type { Theme } from '../src/curve/curve';
import { buildScenery, obstacleFor, PALETTES } from './scenery';
import { composeScene } from './scenes';

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

/** Free what a board group created for itself; scenery meshes share cached geometry and materials and are skipped. */
function disposeOwned(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.shared) return;
    m.geometry.dispose();
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
  private board = new THREE.Group();
  private level: Level | null = null;
  private readonly ray = new THREE.Raycaster();
  private readonly hemi = new THREE.HemisphereLight(0xffffff, 0xb9c9a4, 1.1);
  /** Miniature look of the reference: the board stays sharp, the scenery above and below softens. */
  private composer!: EffectComposer;
  private tilt!: ShaderPass;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xcfe8f3);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
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

    // paved plaza: one stone per cell with a little colour play, on a mortar bed, framed by a curb
    const t = new THREE.Matrix4();
    const bed = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 1), new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.tileB).offsetHSL(0, 0, -0.18), roughness: 1 }), cells.length);
    const stones = new THREE.InstancedMesh(new RoundedBoxGeometry(0.93, 0.12, 0.93, 2, 0.05), new THREE.MeshStandardMaterial({ roughness: 0.95 }), cells.length);
    cells.forEach((c, i) => {
      const p = this.worldOf(level, c.x, c.y);
      bed.setMatrixAt(i, t.makeTranslation(p.x, -0.06, p.z));
      stones.setMatrixAt(i, t.makeTranslation(p.x + (rng.next() - 0.5) * 0.03, -0.055 + rng.next() * 0.012, p.z + (rng.next() - 0.5) * 0.03));
      stones.setColorAt(i, new THREE.Color((c.x + c.y) % 2 ? pal.tileA : pal.tileB).offsetHSL(0, (rng.next() - 0.5) * 0.04, (rng.next() - 0.5) * 0.05));
    });
    stones.receiveShadow = true;
    bed.receiveShadow = true;
    this.board.add(bed, stones);
    const edges: THREE.Matrix4[] = [];
    for (const c of cells) {
      const p = this.worldOf(level, c.x, c.y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (onBoard(level, c.x + dx, c.y + dy)) continue;
        const m = new THREE.Matrix4().makeTranslation(p.x + dx * 0.56, -0.02, p.z + dy * 0.56);
        if (dy !== 0) m.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
        edges.push(m);
      }
    }
    const curb = new THREE.InstancedMesh(new RoundedBoxGeometry(0.16, 0.16, 1.14, 2, 0.05), new THREE.MeshStandardMaterial({ color: 0xc9bfae, roughness: 0.9 }), edges.length);
    edges.forEach((m, i) => curb.setMatrixAt(i, m));
    curb.castShadow = true;
    this.board.add(curb);

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
    for (const a of level.arrows ?? []) this.board.add(this.arrowTile(level, a.x, a.y, a.dir));
    this.fit();
  }

  private arrowTile(level: Level, x: number, y: number, dir: 'up' | 'down' | 'left' | 'right'): THREE.Object3D {
    const g = new THREE.Group();
    const tile = new THREE.Mesh(new RoundedBoxGeometry(0.92, 0.08, 0.92, 2, 0.03), new THREE.MeshStandardMaterial({ color: 0xece4cf }));
    tile.position.y = 0.05;
    tile.receiveShadow = true;
    g.add(tile);
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.55, 3), new THREE.MeshStandardMaterial({ color: 0x8a7a52 }));
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
    const { width: w, height: h } = this.level;
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => new THREE.Vector3(sx * (w / 2 + 0.45), 0, sz * (h / 2 + 0.8)));
    const elev = (58 * Math.PI) / 180;
    for (let d = 6; d < 90; d += 0.4) {
      this.camera.position.set(0, d * Math.sin(elev), d * Math.cos(elev));
      this.camera.lookAt(0, 0, 0.4);
      this.camera.updateMatrixWorld();
      this.camera.updateProjectionMatrix();
      const fits = corners.every((c) => {
        const p = c.clone().project(this.camera);
        return Math.abs(p.x) < 0.97 && p.y > -0.8 && p.y < 0.86;
      });
      if (fits) break;
    }
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

  /** Grid coordinates (cell centers on integers) under a screen point, or null if the ray misses the floor. */
  screenToGrid(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.level) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    this.ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    return { x: hit.x + (this.level.width - 1) / 2, y: hit.z + (this.level.height - 1) / 2 };
  }

  gridToScreen(level: Level, x: number, y: number): { x: number; y: number } {
    const p = this.worldOf(level, x, y).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  }

  render(): void {
    this.composer.render();
  }
}

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Level } from '../src/core/types';
import { directionVector } from '../src/core/rules';

/** World position of a (possibly fractional) grid point. Cell centers sit on integer grid coordinates. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  private board = new THREE.Group();
  private level: Level | null = null;
  private readonly ray = new THREE.Raycaster();

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xcfe8f3);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c9a4, 1.1));
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
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  worldOf(level: Level, x: number, y: number): THREE.Vector3 {
    return new THREE.Vector3(x - (level.width - 1) / 2, 0, y - (level.height - 1) / 2);
  }

  setBoard(level: Level): void {
    this.level = level;
    this.scene.remove(this.board);
    this.board = new THREE.Group();
    this.scene.add(this.board);
    const { width: w, height: h } = level;

    const base = new THREE.Mesh(new RoundedBoxGeometry(w + 0.7, 0.4, h + 0.7, 3, 0.12), new THREE.MeshStandardMaterial({ color: 0xe9dcc3, roughness: 0.9 }));
    base.position.y = -0.2;
    base.receiveShadow = true;
    this.board.add(base);

    const canvas = document.createElement('canvas');
    canvas.width = w * 64;
    canvas.height = h * 64;
    const ctx = canvas.getContext('2d')!;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#f8f1e1' : '#f1e8d2';
        ctx.fillRect(x * 64, y * 64, 64, 64);
        ctx.strokeStyle = 'rgba(160,140,100,.25)';
        ctx.strokeRect(x * 64 + 0.5, y * 64 + 0.5, 63, 63);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.001;
    floor.receiveShadow = true;
    this.board.add(floor);

    for (const o of level.obstacles ?? []) {
      const bush = new THREE.Mesh(new RoundedBoxGeometry(0.85, 0.75, 0.85, 3, 0.25), new THREE.MeshStandardMaterial({ color: 0x6fa05a, roughness: 0.9 }));
      bush.position.copy(this.worldOf(level, o.x, o.y)).setY(0.4);
      bush.castShadow = true;
      this.board.add(bush);
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
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => new THREE.Vector3(sx * (w / 2 + 0.9), 0, sz * (h / 2 + 1.0)));
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
    this.renderer.render(this.scene, this.camera);
  }
}

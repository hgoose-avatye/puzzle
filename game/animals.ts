import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { directionVector, exitCell, exitDirection, traceExit } from '../src/core/rules';
import type { Level, Piece } from '../src/core/types';
import { exitPath, pointAt, type Pt } from '../src/game/path';

const SPECIES: Record<'one' | 'two' | 'long', string[]> = {
  one: ['penguin', 'chick', 'parrot'],
  two: ['cow', 'pig', 'fox', 'tiger', 'panda', 'koala'],
  long: ['caterpillar', 'dog', 'bunny'],
};

export function speciesFor(piece: Piece): string {
  const pool = piece.cells.length === 1 ? SPECIES.one : piece.cells.length === 2 ? SPECIES.two : SPECIES.long;
  return pool[piece.id % pool.length];
}

const cache = new Map<string, Promise<GLTF>>();
export function loadSpecies(name: string): Promise<GLTF> {
  if (!cache.has(name)) cache.set(name, new GLTFLoader().loadAsync(`/assets/cubepets/animal-${name}.glb`));
  return cache.get(name)!;
}

const MODEL_SCALE = 0.7;
const RUN_SPEED = 7.5;

export const pieceColor = (id: number): THREE.Color => new THREE.Color().setHSL(((id * 47) % 360) / 360, 0.7, 0.55);

/** Body z-range (model units) that gets stretched: the flat middle between the ears/face and the rump. */
const STRETCH_LO = -0.3;
const STRETCH_HI = 0.1;

/**
 * One continuous animal for a piece spanning `cells` cells. The body mesh is stretched in its flat middle only,
 * so face, ears and rump keep their shape; back legs and tail move back by the added length.
 * The animation clips overwrite node translations, so shifted nodes sit under an offset holder instead.
 */
function makeAnimal(gltf: GLTF, cells: number): THREE.Object3D {
  const root = SkeletonUtils.clone(gltf.scene);
  if (cells <= 1) return root;
  const extra = (cells - 1) / MODEL_SCALE;
  const span = STRETCH_HI - STRETCH_LO;
  const bodies: THREE.Mesh[] = [];
  const shifted: Array<{ node: THREE.Object3D; by: number }> = [];
  root.traverse((o) => {
    if (o === root || o.name === 'root') return;
    if (o.name === 'body') {
      if ((o as THREE.Mesh).isMesh) bodies.push(o as THREE.Mesh);
      return;
    }
    const z = o.position.z;
    const by = z <= -0.1 ? extra : Math.abs(z) < 0.1 ? extra / 2 : 0;
    if (by > 0) shifted.push({ node: o, by });
  });
  for (const body of bodies) {
    const geo = body.geometry.clone();
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      if (z >= STRETCH_HI) continue;
      pos.setZ(i, z <= STRETCH_LO ? z - extra : STRETCH_LO - extra + (z - STRETCH_LO) * ((span + extra) / span));
    }
    pos.needsUpdate = true;
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    body.geometry = geo;
  }
  for (const { node, by } of shifted) {
    const parent = node.parent!;
    const holder = new THREE.Object3D();
    holder.position.z = -by;
    parent.add(holder);
    holder.add(node);
  }
  return root;
}

function badgeTexture(items: string[], number?: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '72px system-ui, sans-serif';
  items.forEach((it, i) => ctx.fillText(it, 128 + (i - (items.length - 1) / 2) * 84, 56));
  if (number !== undefined) {
    ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = number <= 2 ? '#d22' : '#222';
    ctx.strokeText(String(number), 128, 108);
    ctx.fillText(String(number), 128, 108);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function zzzTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.font = '900 100px system-ui, sans-serif';
  ctx.lineWidth = 16;
  ctx.strokeStyle = '#2d4a8a';
  ctx.strokeText('Z', 64, 68);
  ctx.fillStyle = '#fff';
  ctx.fillText('Z', 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

type Anim = { kind: 'idle' } | { kind: 'run'; s: number; onDone: () => void } | { kind: 'done' };

export class PieceView {
  readonly group = new THREE.Group();
  readonly piece: Piece;
  private readonly pts: Pt[];
  private readonly segments: THREE.Object3D[] = [];
  private readonly mixer: THREE.AnimationMixer;
  private readonly clips: THREE.AnimationClip[];
  private current: THREE.AnimationAction | null = null;
  private readonly chevrons = new THREE.Group();
  private readonly badge: THREE.Sprite;
  private readonly zzz = new THREE.Group();
  private zzzT = Math.random() * 6;
  private anim: Anim = { kind: 'idle' };
  private shakeT = 0;
  private pulseT = 0;
  private readonly bodyLen: number;

  constructor(private readonly level: Level, piece: Piece, gltf: GLTF, private readonly world: (x: number, y: number) => THREE.Vector3) {
    this.piece = piece;
    this.bodyLen = piece.cells.length;
    this.pts = exitPath(level, piece);
    const color = pieceColor(piece.id);

    const species = speciesFor(piece);
    const head = makeAnimal(gltf, this.bodyLen);
    head.scale.setScalar(MODEL_SCALE);
    const size = new THREE.Box3().setFromObject(head).getSize(new THREE.Vector3());
    head.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    const headHolder = new THREE.Group();
    headHolder.add(head);
    const belt = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.1, 0.9 + (this.bodyLen - 1), 2, 0.04), new THREE.MeshStandardMaterial({ color }));
    belt.position.set(0, 0.05, -(this.bodyLen - 1) / 2);
    headHolder.add(belt);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 3), new THREE.MeshBasicMaterial({ color }));
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, size.y + 0.15, 0.62);
    headHolder.add(nose);
    this.segments.push(headHolder);
    for (const s of this.segments) this.group.add(s);

    this.mixer = new THREE.AnimationMixer(head);
    this.clips = gltf.animations;
    this.play('idle', true);
    this.mixer.update(Math.random() * 2);

    this.badge = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    this.badge.scale.set(1.1, 0.55, 1);
    this.badge.renderOrder = 10;
    this.badge.visible = false;
    this.group.add(this.badge);

    const zTex = zzzTexture();
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, depthTest: false }));
      sp.renderOrder = 11;
      this.zzz.add(sp);
    }
    this.zzz.visible = false;
    this.group.add(this.zzz);

    this.buildChevrons(color);
    this.group.add(this.chevrons);
    this.group.add(this.buildGate(color));
    this.place(this.bodyLen - 1);
  }

  private play(name: string, loop: boolean): void {
    const clip = THREE.AnimationClip.findByName(this.clips, name);
    if (!clip) return;
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = true;
    if (this.current && this.current !== action) this.current.crossFadeTo(action, 0.12, false);
    action.play();
    this.current = action;
  }

  /** Put the head at distance sHead along the path and let every body segment follow. */
  place(sHead: number): void {
    const seg = this.segments[0];
    const p = pointAt(this.pts, sHead);
    const tail = pointAt(this.pts, sHead - (this.bodyLen - 1));
    seg.position.copy(this.world(p.x, p.y));
    // The whole body is one rigid model: face along the chord from rump to head so bends stay smooth.
    const dx = p.x - tail.x;
    const dy = p.y - tail.y;
    seg.rotation.y = this.bodyLen > 1 && Math.hypot(dx, dy) > 1e-3 ? Math.atan2(dx, dy) : p.angle;
    const h = seg.position;
    this.badge.position.set(h.x, 1.75, h.z);
    this.zzz.position.set(h.x, 0, h.z);
  }

  private buildChevrons(color: THREE.Color): void {
    const trace = traceExit(this.level, this.piece);
    let prev = this.piece.cells[0];
    for (const c of trace.cells) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.34, 3), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
      cone.rotation.x = Math.PI / 2;
      const holder = new THREE.Group();
      holder.add(cone);
      holder.rotation.y = Math.atan2(c.x - prev.x, c.y - prev.y);
      holder.position.copy(this.world(c.x, c.y)).setY(0.04);
      this.chevrons.add(holder);
      prev = c;
    }
    this.chevrons.visible = false;
  }

  private buildGate(color: THREE.Color): THREE.Object3D {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const v = directionVector(exitDirection(this.level, this.piece));
    const cell = exitCell(this.level, this.piece);
    const along = v.x !== 0 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    for (const s of [-0.42, 0.42]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.75, 0.12), mat);
      post.position.copy(along).multiplyScalar(s).setY(0.375);
      g.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(v.x !== 0 ? 0.12 : 1.0, 0.12, v.x !== 0 ? 1.0 : 0.12), mat);
    lintel.position.y = 0.78;
    g.add(lintel);
    g.position.copy(this.world(cell.x + v.x * 0.62, cell.y + v.y * 0.62));
    g.traverse((o) => { o.castShadow = true; });
    return g;
  }

  showPath(visible: boolean): void {
    this.chevrons.visible = visible;
  }

  setBadges(items: string[], number?: number): void {
    if (items.length === 0) {
      this.badge.visible = false;
      return;
    }
    const mat = this.badge.material as THREE.SpriteMaterial;
    mat.map?.dispose();
    mat.map = badgeTexture(items, number);
    mat.needsUpdate = true;
    this.badge.visible = true;
  }

  /** Three Z's rise from the head one after another, growing and fading out. */
  private animateZzz(): void {
    this.zzz.children.forEach((c, i) => {
      const sp = c as THREE.Sprite;
      const t = ((this.zzzT * 0.45 + i / 3) % 1);
      sp.position.set(0.15 + t * 0.5 + Math.sin(t * 6) * 0.06, 1.25 + t * 0.9, 0);
      const k = 0.35 + t * 0.55;
      sp.scale.set(k, k, 1);
      (sp.material as THREE.SpriteMaterial).opacity = Math.min(1, t * 5) * (1 - t * t);
    });
  }

  setAsleep(asleep: boolean): void {
    this.zzz.visible = asleep;
  }

  runOut(onDone: () => void): void {
    this.chevrons.visible = false;
    this.anim = { kind: 'run', s: this.bodyLen - 1, onDone };
    this.play('run', true);
  }

  bump(): void {
    this.shakeT = 0.4;
    this.play('gesture-negative', false);
    setTimeout(() => { if (this.anim.kind === 'idle') this.play('idle', true); }, 700);
  }

  pulse(): void {
    this.pulseT = 0.35;
  }

  update(dt: number): void {
    this.mixer.update(dt);
    this.zzzT += dt;
    if (this.zzz.visible) this.animateZzz();
    if (this.anim.kind === 'run') {
      this.anim.s += RUN_SPEED * dt;
      this.place(this.anim.s);
      if (this.anim.s >= this.pts.length - 1) {
        const done = this.anim.onDone;
        this.anim = { kind: 'done' };
        this.group.visible = false;
        done();
      }
      return;
    }
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      this.group.position.x = Math.sin(this.shakeT * 70) * 0.07 * (this.shakeT / 0.4);
    } else this.group.position.x = 0;
    if (this.pulseT > 0) {
      this.pulseT = Math.max(0, this.pulseT - dt);
      const k = 1 + Math.sin((1 - this.pulseT / 0.35) * Math.PI) * 0.12;
      for (const s of this.segments) s.scale.setScalar(k);
    }
  }
}

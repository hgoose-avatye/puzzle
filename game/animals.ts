import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { directionVector, exitCell, exitDirection, traceExit } from '../src/core/rules';
import type { Level, Piece } from '../src/core/types';
import { exitPath } from '../src/game/path';
import { smoothPath, trackAt, type Track } from '../src/game/smooth';
import { buildAnimal } from './blocks';

/** Species per size class, following docs/art-reference/09-size-classes-1-2-3cell.png. */
const SPECIES: Record<'one' | 'two' | 'long', string[]> = {
  one: ['penguin', 'chick', 'parrot'],
  two: ['cow', 'pig', 'fox', 'tiger', 'husky'],
  long: ['snake', 'caterpillar', 'dachshund', 'crocodile'],
};

/** Demo scenes can pin a species to a piece id (e.g. the species sheet). */
export const speciesOverride = new Map<number, string>();

export function speciesFor(piece: Piece): string {
  const forced = speciesOverride.get(piece.id);
  if (forced) return forced;
  const pool = piece.cells.length === 1 ? SPECIES.one : piece.cells.length === 2 ? SPECIES.two : SPECIES.long;
  return pool[piece.id % pool.length];
}

const RUN_SPEED = 7.5;
/** Corner radius (cells) of the rounded exit path. */
const CORNER_RADIUS = 0.3;
/** Distance between block centers along the path: blocks are slightly longer than a cell so they touch. */
const BLOCK_SPACING = 1;

export const pieceColor = (id: number): THREE.Color => new THREE.Color().setHSL(((id * 47) % 360) / 360, 0.7, 0.55);

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
  /** Exit path with rounded corners; every block is placed by arc length along it. */
  private readonly track: Track;
  private readonly headStart: number;
  private readonly segments: THREE.Group[];
  private readonly plates: THREE.Mesh[] = [];
  private readonly markers: THREE.Object3D[] = [];
  private readonly chevrons = new THREE.Group();
  private readonly badge: THREE.Sprite;
  private readonly zzz = new THREE.Group();
  private zzzT = Math.random() * 6;
  private clock = Math.random() * 6;
  private lastS = 0;
  private anim: Anim = { kind: 'idle' };
  private shakeT = 0;
  private pulseT = 0;
  private readonly bodyLen: number;

  constructor(private readonly level: Level, piece: Piece, private readonly world: (x: number, y: number) => THREE.Vector3) {
    this.piece = piece;
    this.bodyLen = piece.cells.length;
    this.track = smoothPath(exitPath(level, piece), CORNER_RADIUS);
    this.headStart = this.track.vertexU[this.bodyLen - 1];
    const color = pieceColor(piece.id);

    this.segments = buildAnimal(speciesFor(piece), this.bodyLen);
    for (const seg of this.segments) this.group.add(seg);

    // Colored plate under each cell, following the path, so the whole animal reads as one color.
    for (let i = 0; i < this.bodyLen; i++) {
      const plate = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.1, 1.02, 2, 0.04), new THREE.MeshStandardMaterial({ color }));
      this.plates.push(plate);
      this.markers.push(plate);
      this.group.add(plate);
    }

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
    const gate = this.buildGate(color);
    this.markers.push(gate);
    this.group.add(gate);
    this.place(this.headStart);
  }

  /**
   * Put the head at arc length sHead along the path; block i sits i cells behind it, on the path itself, so corners
   * are taken one block at a time and the body length never changes.
   */
  place(sHead: number): void {
    this.lastS = sHead;
    const running = this.anim.kind === 'run';
    this.segments.forEach((seg, i) => {
      const q = trackAt(this.track, sHead - i * BLOCK_SPACING);
      seg.position.copy(this.world(q.x, q.y));
      seg.rotation.y = q.angle;
      // idle sway or running hop, delayed block by block so the chain ripples
      const phase = this.clock * (running ? 16 : 2.6) - i * 0.7;
      const part = seg.children[0];
      part.position.y = running ? Math.abs(Math.sin(phase)) * 0.09 : Math.sin(phase) * 0.018;
    });
    this.plates.forEach((plate, i) => {
      const q = trackAt(this.track, sHead - i * BLOCK_SPACING);
      plate.position.copy(this.world(q.x, q.y)).setY(0.05);
      plate.rotation.y = q.angle;
    });
    const h = this.segments[0].position;
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

  /** Hide the color plates and gate so the bare animal can be inspected. */
  hideMarkers(): void {
    for (const m of this.markers) m.visible = false;
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
      sp.position.set(0.15 + t * 0.5 + Math.sin(t * 6) * 0.06, 1.35 + t * 0.9, 0);
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
    this.pulseT = 0;
    for (const seg of this.segments) seg.scale.setScalar(1);
    this.anim = { kind: 'run', s: this.headStart, onDone };
  }

  /** Blocked tap: shake sideways and nod the head. */
  bump(): void {
    this.shakeT = 0.4;
  }

  pulse(): void {
    this.pulseT = 0.35;
  }

  /** Free what this view owns. Block geometry and materials are shared and stay alive. */
  dispose(): void {
    const shared = new Set<THREE.Object3D>();
    for (const seg of this.segments) seg.traverse((o) => shared.add(o));
    this.group.traverse((o) => {
      if (shared.has(o)) return;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
      }
      const sprite = o as THREE.Sprite;
      if (sprite.isSprite) {
        sprite.material.map?.dispose();
        sprite.material.dispose();
      }
    });
  }

  update(dt: number): void {
    this.clock += dt;
    this.zzzT += dt;
    if (this.zzz.visible) this.animateZzz();
    if (this.anim.kind === 'run') {
      this.anim.s += ((window as unknown as { __runSpeed?: number }).__runSpeed ?? RUN_SPEED) * dt;
      this.place(this.anim.s);
      if (this.anim.s >= this.track.length) {
        const done = this.anim.onDone;
        this.anim = { kind: 'done' };
        this.group.visible = false;
        done();
      }
      return;
    }
    this.place(this.lastS);
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      this.group.position.x = Math.sin(this.shakeT * 70) * 0.07 * (this.shakeT / 0.4);
      this.segments[0].children[0].rotation.x = Math.sin((1 - this.shakeT / 0.4) * Math.PI) * 0.25;
    } else {
      this.group.position.x = 0;
      this.segments[0].children[0].rotation.x = 0;
    }
    if (this.pulseT > 0) {
      this.pulseT = Math.max(0, this.pulseT - dt);
      const k = 1 + Math.sin((1 - this.pulseT / 0.35) * Math.PI) * 0.12;
      for (const s of this.segments) s.scale.setScalar(this.pulseT === 0 ? 1 : k);
    }
  }
}

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { directionVector, exitCell, exitDirection, traceExit } from '../src/core/rules';
import type { Level, Piece } from '../src/core/types';
import { routeOf } from '../src/game/flow';
import { trackAt, type Track } from '../src/game/smooth';
import { buildAnimal } from './blocks';
import { statusPixelScale, statusTexture } from './statusIcons';

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

/** 2.5D cards (approved 2026-11-02): the plate under each cell is a soft shadow pad, not the animal's hue */
const CARD_PLATE = { color: 0x000000, opacity: 0.1 };
const RUN_SPEED = 7.5;
/** Current running speed in cells/s (on the dev server, tests may override it with window.__runSpeed). */
export const runSpeed = (): number => (import.meta.env.DEV && typeof window !== 'undefined' ? (window as unknown as { __runSpeed?: number }).__runSpeed : undefined) ?? RUN_SPEED;

/** Collision "!" bubble: appear, hold, fade out. */
const ALERT_IN = 0.08;
const ALERT_HOLD = 0.2;
const ALERT_OUT = 0.15;
const ALERT_TOTAL = ALERT_IN + ALERT_HOLD + ALERT_OUT;
const FLINCH_TIME = 0.12;
/** unit bar for the floor mark at the front edge of a one-cell animal's tile, scaled per use */
/** Bomb count on the badge: Pretendard Bold like the HUD numbers, the system font until it has loaded. */
const BADGE_NUMBER_FONT = "700 70px Pretendard, system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif";
/** Badge width in cells, and how long a count change pops it. */
const BADGE_W = 1.9;
const BADGE_POP = 0.35;
/** seconds a 2.5D bomb icon at zero swells before it is gone (the burst plays where it was) */
const BOMB_SWELL = 0.15;
/**
 * 2.5D cards: the status icon sits on the top of its own animal's picture (no pointer since the status UI of
 * 2026-11-05). A badge floating over the head lands on the animal behind once the camera tilts, so on a crowded board
 * it read as that animal's. spriteCards' badgeTip is 0.25 of the picture inside its top; the icon is lifted this many
 * css px off it, onto the top edge, so it does not cover a one-cell animal's face.
 */
const CARD_ICON_LIFT_PX = 10;
const LAUNCH_TIME = 0.2;
/** cells past the board edge over which a block shrinks away */
const GATE_FADE = 0.8;
/** The chick tutorial's breathing on the animal to tap: up to 6% bigger and back, once per period (seconds). */
const BREATHE = { amount: 0.06, period: 1.2 };
/** Distance between block centers along the path: blocks are slightly longer than a cell so they touch. */
const BLOCK_SPACING = 1;

export const pieceColor = (id: number): THREE.Color => new THREE.Color().setHSL(((id * 47) % 360) / 360, 0.7, 0.55);
/** The same hue, more saturated, for the lit plate (the floor marks and effects keep pieceColor). */
const plateColor = (id: number): THREE.Color => new THREE.Color().setHSL(((id * 47) % 360) / 360, 0.896, 0.55);

/** Badge colours for a bomb's remaining taps: calm, getting close, about to go off. */
export const fuseTone = (n: number): { line: string; text: string } =>
  n <= 2 ? { line: '#e0453a', text: '#d0322a' } : n <= 4 ? { line: '#f2a33d', text: '#b9670f' } : { line: '#8a7a5c', text: '#3b3a36' };

/**
 * A cream speech-bubble pill over the head: icons, then the bomb's remaining taps in big digits. The light fill keeps
 * a black bomb readable on a dark animal (penguin, husky).
 */
function badgeTexture(items: string[], number?: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const tone = number === undefined ? { line: '#8a7a5c', text: '#3b3a36' } : fuseTone(number);
  const iconW = 76;
  const numW = number === undefined ? 0 : number >= 10 ? 96 : 60;
  const w = Math.min(300, items.length * iconW + numW + 40);
  const x0 = (320 - w) / 2;
  const paint = (): void => {
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#fff8e8';
    ctx.strokeStyle = tone.line;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.roundRect(x0, 14, w, 92, 46);
    ctx.fill();
    ctx.stroke();
    // little tail pointing down at the animal
    ctx.beginPath();
    ctx.moveTo(150, 104);
    ctx.lineTo(160, 122);
    ctx.lineTo(170, 104);
    ctx.closePath();
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '62px system-ui, sans-serif';
    items.forEach((it, i) => ctx.fillText(it, x0 + 20 + iconW * (i + 0.5), 62));
    if (number !== undefined) {
      ctx.font = BADGE_NUMBER_FONT;
      ctx.fillStyle = tone.text;
      ctx.fillText(String(number), x0 + 20 + items.length * iconW + numW / 2, 64);
    }
  };
  paint();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // the number is drawn once; if Pretendard is still loading, draw it again when it arrives
  if (number !== undefined && !document.fonts.check(BADGE_NUMBER_FONT)) {
    void document.fonts.load(BADGE_NUMBER_FONT, '0123456789').then(() => { paint(); tex.needsUpdate = true; });
  }
  return tex;
}

function alertTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd84a';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#fffbe8';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 84px system-ui, sans-serif';
  ctx.fillStyle = '#8a5a00';
  ctx.fillText('!', 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function dotsTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(255, 251, 232, 0.92)';
  ctx.beginPath();
  ctx.roundRect(4, 6, 120, 52, 26);
  ctx.fill();
  ctx.fillStyle = '#8a7a5a';
  for (const x of [38, 64, 90]) { ctx.beginPath(); ctx.arc(x, 32, 7, 0, Math.PI * 2); ctx.fill(); }
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

type Anim = { kind: 'idle' } | { kind: 'run'; s: number; onDone: () => void; onExit?: () => void } | { kind: 'done' };

export class PieceView {
  readonly group = new THREE.Group();
  readonly piece: Piece;
  /** Exit path with rounded corners; every block is placed by arc length along it. */
  readonly track: Track;
  readonly headStart: number;
  private readonly segments: THREE.Group[];
  private readonly plates: THREE.Mesh[] = [];
  private readonly markers: THREE.Object3D[] = [];
  private readonly chevrons = new THREE.Group();
  /** low mark on the floor at the front edge of a one-cell animal's tile, showing which way it faces */
  private readonly aheadMarks = new THREE.Group();
  private readonly badge: THREE.Sprite;
  private readonly zzz = new THREE.Group();
  private zzzT = Math.random() * 6;
  private clock = Math.random() * 6;
  private lastS = 0;
  private anim: Anim = { kind: 'idle' };
  private shakeT = 0;
  private flinchT = 0;
  /** take-off squash and stretch */
  private launchT = 0;
  private alertT = 0;
  private alert: THREE.Sprite | null = null;
  private badgeKey = '';
  private badgeNumber: number | undefined;
  private badgePopT = 0;
  /** 2.5D bomb gone off: seconds of swelling left, then the icon stays hidden (null: not gone off) */
  private blowT: number | null = null;
  private dots: THREE.Sprite | null = null;
  private waiting = false;
  /** seconds the current wait has lasted */
  private waitT = 0;
  private pulseT = 0;
  /** seconds into the tutorial's breathing, or null when it is off */
  private breatheT: number | null = null;
  readonly bodyLen: number;
  /** where the path leaves the board, just past its last cell: the rescue burst and sparkles play here */
  private gatePos = new THREE.Vector3();
  /** drawn as 2.5D picture cards (the Classic 3D blocks keep their own badge and Zzz) */
  readonly cards: boolean;
  /** 2.5D: the badge's items and whether the animal sleeps, so either change repaints one badge */
  private badgeItems: string[] = [];
  private asleep = false;
  /** badge height over width (Classic 3D) */
  private readonly badgeRatio = 0.4;
  /** 2.5D: the status icons' size on the screen, css px */
  private iconSize = { w: 0, h: 0 };

  constructor(private readonly level: Level, piece: Piece, private readonly world: (x: number, y: number) => THREE.Vector3) {
    this.piece = piece;
    this.bodyLen = piece.cells.length;
    ({ track: this.track, headStart: this.headStart } = routeOf(level, piece));
    const color = pieceColor(piece.id);
    const lit = plateColor(piece.id);

    this.segments = buildAnimal(speciesFor(piece), this.bodyLen);
    for (const seg of this.segments) this.group.add(seg);

    // Plate under each cell, following the path: Classic 3D in the animal's colour so the whole animal reads as one
    // colour; 2.5D cards as a neutral shadow pad (the pictures carry the identity).
    const cards = this.segments[0]?.userData.spriteCards === true;
    this.cards = cards;
    const plateMaterial = (): THREE.Material =>
      cards
        ? new THREE.MeshStandardMaterial({ color: CARD_PLATE.color, transparent: true, opacity: CARD_PLATE.opacity, roughness: 1 })
        : new THREE.MeshStandardMaterial({ color: lit });
    for (let i = 0; i < this.bodyLen; i++) {
      const plate = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.1, 1.02, 2, 0.04), plateMaterial());
      this.plates.push(plate);
      this.markers.push(plate);
      this.group.add(plate);
    }

    // 2.5D: a fixed size on the screen (statusPixelScale), anchored at its bottom centre on the top of the picture
    this.badge = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, sizeAttenuation: !cards }));
    if (cards) this.badge.center.set(0.5, 0);
    this.badge.scale.set(BADGE_W, BADGE_W * this.badgeRatio, 1);
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
    this.group.add(this.aheadMarks);
    this.group.add(this.chevrons);
    // no gate is drawn: any board edge lets an animal out (rules.ts traceExit), so a door at one spot would suggest a
    // rule the game does not have; only the point where this path leaves is kept, for the rescue effects
    const v = directionVector(exitDirection(this.level, this.piece));
    const cell = exitCell(this.level, this.piece);
    this.gatePos = this.world(cell.x + v.x * 0.62, cell.y + v.y * 0.62);
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
    // 2.5D: just inside the top of the head picture as last drawn (spriteCards sets badgeTip each frame); the icon's
    // own anchor lifts it onto the top edge (CARD_ICON_LIFT_PX)
    const tip = this.cards ? (this.segments[0].userData.badgeTip as THREE.Vector3 | undefined) : undefined;
    if (tip) this.badge.position.copy(tip);
    else this.badge.position.set(h.x, 2.1, h.z);
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

  /** The floor cue's parts (none since the direction V was removed; kept for the dev measurements). */
  markParts(): THREE.Object3D[] {
    return [...this.aheadMarks.children];
  }

  /** Hide the color plates so the bare animal can be inspected. */
  hideMarkers(): void {
    for (const m of this.markers) m.visible = false;
  }

  showPath(visible: boolean): void {
    this.chevrons.visible = visible;
  }

  /** 2.5D only: a bomb at zero swells its icon for BOMB_SWELL and then the icon is gone. False in Classic 3D (unchanged). */
  explode(): boolean {
    if (!this.cards || !this.badge.visible) return false;
    this.blowT = BOMB_SWELL;
    return true;
  }

  setBadges(items: string[], number?: number): void {
    if (this.cards) {
      this.badgeItems = items;
      this.badgeCount = number;
      this.showBadge(this.asleep ? [...items, '💤'] : items, number);
      return;
    }
    this.showBadge(items, number);
  }

  private badgeCount: number | undefined;

  private showBadge(items: string[], number?: number): void {
    if (items.length === 0) {
      this.badge.visible = false;
      return;
    }
    const key = `${items.join('')}:${number ?? ''}`;
    if (key === this.badgeKey && this.badge.visible) return;
    if (this.blowT !== null) return; // a bomb going off keeps its last icon until it is gone
    // a bomb's count going down pops the badge so the change is noticed
    if (number !== undefined && this.badgeNumber !== undefined && number < this.badgeNumber) this.badgePopT = BADGE_POP;
    this.badgeKey = key;
    this.badgeNumber = number;
    const mat = this.badge.material as THREE.SpriteMaterial;
    mat.map?.dispose();
    if (this.cards) {
      const icon = statusTexture(items, number);
      mat.map = icon.tex;
      this.iconSize = { w: icon.w, h: icon.h };
      this.badge.center.set(0.5, -CARD_ICON_LIFT_PX / icon.h);
    } else {
      mat.map = badgeTexture(items, number);
    }
    mat.needsUpdate = true;
    this.badge.visible = true;
  }

  /** Pop on a count change, and a steady heartbeat while a bomb is about to go off. */
  private animateBadge(dt: number): void {
    if (!this.badge.visible) return;
    let k = 1;
    if (this.blowT !== null) {
      this.blowT = Math.max(0, this.blowT - dt);
      if (this.blowT === 0) { this.badge.visible = false; return; }
      const px = statusPixelScale() * (1 + (1 - this.blowT / BOMB_SWELL) * 0.5);
      this.badge.scale.set(this.iconSize.w * px, this.iconSize.h * px, 1);
      return;
    }
    if (this.badgePopT > 0) {
      this.badgePopT = Math.max(0, this.badgePopT - dt);
      k += Math.sin((1 - this.badgePopT / BADGE_POP) * Math.PI) * 0.35;
    }
    if (this.badgeNumber !== undefined && this.badgeNumber <= 2) k += Math.max(0, Math.sin(this.clock * 7)) * 0.12;
    if (this.cards) {
      const px = statusPixelScale() * k;
      this.badge.scale.set(this.iconSize.w * px, this.iconSize.h * px, 1);
      return;
    }
    this.badge.scale.set(BADGE_W * k, BADGE_W * this.badgeRatio * k, 1);
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

  get running(): boolean { return this.anim.kind === 'run'; }

  /** World position of the head block (for effects). */
  headWorld(): THREE.Vector3 { return this.segments[0].position; }

  /** The body blocks, the colour plates under them and the badge over the head (not the path); dev measurements use it. */
  tapTargets(): THREE.Object3D[] {
    return [...this.segments, ...this.plates, this.badge];
  }

  /**
   * What a finger can land on. 2.5D: not the status icon, which is drawn over the animal behind and took its taps
   * (2026-11-05); a tap there goes to whatever is under the icon. Classic 3D: the badge too, as before.
   */
  touchTargets(): THREE.Object3D[] {
    return this.cards ? [...this.segments, ...this.plates] : this.tapTargets();
  }

  /** World position where the path leaves the board (the rescue effects play here). */
  gateWorld(): THREE.Vector3 { return this.gatePos; }

  get color(): number { return pieceColor(this.piece.id).getHex(); }

  /** Classic 3D: Z's rising from the body. 2.5D: the sleep icon over the head, so it points at its sleeper like the others. */
  setAsleep(asleep: boolean): void {
    if (!this.cards) {
      this.zzz.visible = asleep;
      return;
    }
    this.zzz.visible = false;
    if (asleep === this.asleep) return;
    this.asleep = asleep;
    this.showBadge(asleep ? [...this.badgeItems, '💤'] : this.badgeItems, this.badgeCount);
  }

  /**
   * 2.5D: whether the ray hits an opaque pixel of this animal's count-bomb icon (not its transparent margin). pick()
   * asks only after no animal was found under the finger, so the icon never takes another animal's touch (2026-11-05).
   */
  bombIconHit(ray: THREE.Raycaster): boolean {
    if (!this.cards || this.badgeNumber === undefined || !this.badge.visible || !this.group.visible) return false;
    const hit = ray.intersectObject(this.badge, false)[0];
    const canvas = (this.badge.material as THREE.SpriteMaterial).map?.image as HTMLCanvasElement | undefined;
    if (!hit?.uv || !canvas) return false;
    const x = Math.min(canvas.width - 1, Math.floor(hit.uv.x * canvas.width));
    const y = Math.min(canvas.height - 1, Math.floor((1 - hit.uv.y) * canvas.height));
    return canvas.getContext('2d')!.getImageData(x, y, 1, 1).data[3] > 127;
  }

  /** 2.5D tap test on the picture cards: distance to the nearest opaque card pixel under the ray (spriteCards drops transparent texels), else null. */
  cardHitDistance(ray: THREE.Raycaster): number | null {
    if (!this.group.visible) return null;
    const drawn = (o: THREE.Object3D | null): boolean => { for (; o && o !== this.group; o = o.parent) if (!o.visible) return false; return true; };
    const hit = ray.intersectObjects(this.segments, true).find((h) => h.object.userData.spriteCard === true && drawn(h.object));
    return hit ? hit.distance : null;
  }

  /** `onExit` fires once when the head crosses the board edge; `onDone` when the whole body is gone. */
  runOut(onDone: () => void, onExit?: () => void): void {
    this.chevrons.visible = false;
    this.aheadMarks.visible = false;
    this.pulseT = 0;
    this.breatheT = null;
    for (const seg of this.segments) seg.scale.setScalar(1);
    this.anim = { kind: 'run', s: this.headStart, onDone, onExit };
    this.launchT = LAUNCH_TIME;
  }

  /** Running position, driven by the traffic system (see src/game/traffic.ts). */
  setRun(sHead: number, waiting: boolean): void {
    if (this.anim.kind !== 'run') return;
    this.anim.s = sHead;
    this.waiting = waiting;
  }

  /** Running but held up by an animal ahead. */
  get isWaiting(): boolean { return this.anim.kind === 'run' && this.waiting; }

  /** Collision with another animal: a short flinch and one "!" over the head. A repeat restarts the same bubble. */
  collide(): void {
    this.flinchT = FLINCH_TIME;
    this.alertT = ALERT_TOTAL;
    if (!this.alert) {
      this.alert = new THREE.Sprite(new THREE.SpriteMaterial({ map: alertTexture(), transparent: true, depthTest: false }));
      this.alert.renderOrder = 12;
      this.group.add(this.alert);
    }
    this.updateAlert();
  }

  /** Small "…" over the head while waiting, once the "!" is gone. Built once, only shown or hidden afterwards. */
  private updateDots(): void {
    const show = this.isWaiting && this.alertT <= 0 && this.waitT > 0.15;
    if (!show) { if (this.dots) this.dots.visible = false; return; }
    if (!this.dots) {
      this.dots = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotsTexture(), transparent: true, depthTest: false, opacity: 0.9 }));
      this.dots.renderOrder = 12;
      this.dots.scale.set(0.5, 0.25, 1);
      this.group.add(this.dots);
    }
    const h = this.segments[0].position;
    this.dots.position.set(h.x, 1.65 + Math.sin(this.clock * 3) * 0.03, h.z);
    this.dots.visible = true;
  }

  /** True while the "!" is showing (for tests). */
  get alerting(): boolean { return this.alertT > 0; }

  private updateAlert(): void {
    const a = this.alert;
    if (!a) return;
    if (this.alertT <= 0) { a.visible = false; return; }
    const t = ALERT_TOTAL - this.alertT;
    const k = t < ALERT_IN ? t / ALERT_IN : t < ALERT_IN + ALERT_HOLD ? 1 : 1 - (t - ALERT_IN - ALERT_HOLD) / ALERT_OUT;
    const pop = t < ALERT_IN ? 0.7 + 0.5 * k : 1;
    const h = this.segments[0].position;
    a.visible = true;
    a.position.set(h.x, 1.7 + (t / ALERT_TOTAL) * 0.25, h.z);
    a.scale.setScalar(0.62 * pop);
    (a.material as THREE.SpriteMaterial).opacity = Math.max(0, Math.min(1, k));
  }

  /** Squash down, then stretch forward, then settle: the "here I go" before running. */
  private animateLaunch(dt: number): void {
    if (this.launchT <= 0) return;
    this.launchT = Math.max(0, this.launchT - dt);
    const t = 1 - this.launchT / LAUNCH_TIME;
    const y = this.launchT === 0 ? 1 : t < 0.4 ? 1 - 0.2 * Math.sin((t / 0.4) * Math.PI) : 1 + 0.12 * Math.sin(((t - 0.4) / 0.6) * Math.PI);
    const xz = 1 / Math.sqrt(y);
    for (const seg of this.segments) seg.scale.set(xz, y, xz);
  }

  /**
   * Past the board edge each block shrinks away within GATE_FADE cells, as if stepping off it, so nothing runs on into
   * the scenery around the board.
   */
  private shrinkIntoGate(): void {
    if (this.anim.kind !== 'run') return;
    const gateU = this.track.length - (this.bodyLen + 2) + 0.62;
    this.segments.forEach((seg, i) => {
      const k = Math.max(0, Math.min(1, 1 - (this.anim.kind === 'run' ? this.anim.s - i - gateU : 0) / GATE_FADE));
      if (k < 1) seg.scale.setScalar(k); // set, not multiply: the scale carries over between frames
      seg.visible = k > 0.02;
      this.plates[i].visible = k > 0.5;
    });
  }

  /** Heading of the head block (rotation about y), for effects. */
  get heading(): number { return this.segments[0].rotation.y; }

  /** World position of the tail block (for footprints). */
  tailWorld(): THREE.Vector3 { return this.segments[this.segments.length - 1].position; }

  /**
   * Short flinch; true while it is playing. Standing animals jiggle sideways; a running one only hops and nods, so it
   * never shifts toward the animal it is waiting behind.
   */
  private flinch(dt: number, lateral = true): boolean {
    if (this.flinchT <= 0) return false;
    this.flinchT = Math.max(0, this.flinchT - dt);
    const f = this.flinchT / FLINCH_TIME;
    if (lateral) this.group.position.x = Math.sin(f * Math.PI * 3) * 0.08 * f;
    else this.group.position.y = Math.sin(f * Math.PI) * 0.06;
    this.segments[0].children[0].rotation.x = this.flinchT > 0 ? Math.sin((1 - f) * Math.PI) * 0.2 : 0;
    return true;
  }

  /** Blocked tap: shake sideways and nod the head. */
  bump(): void {
    this.shakeT = 0.4;
  }

  pulse(): void {
    this.pulseT = 0.35;
  }

  /** The chick tutorial's slow breathing (1.00 to 1.06 and back) on an animal that stands; off puts it back at 1. */
  setBreathe(on: boolean): void {
    this.breatheT = on ? 0 : null;
    if (!on && !this.running && this.pulseT === 0) for (const s of this.segments) s.scale.setScalar(1);
  }

  /** Free what this view owns. Block geometry and materials are shared and stay alive. */
  dispose(): void {
    const shared = new Set<THREE.Object3D>();
    for (const seg of this.segments) seg.traverse((o) => shared.add(o));
    this.group.traverse((o) => {
      if (shared.has(o)) return;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        if (!mesh.userData.sharedGeometry) mesh.geometry.dispose();
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
    this.animateBadge(dt);
    if (this.alertT > 0) this.alertT = Math.max(0, this.alertT - dt);
    if (this.anim.kind === 'run') {
      this.place(this.anim.s);
      this.waitT = this.waiting ? this.waitT + dt : 0;
      this.flinch(dt, false);
      this.updateAlert();
      this.updateDots();
      this.animateLaunch(dt);
      this.shrinkIntoGate();
      if (this.anim.onExit && this.anim.s >= this.track.length - (this.bodyLen + 2)) {
        const exit = this.anim.onExit;
        this.anim.onExit = undefined;
        exit();
      }
      if (this.anim.s >= this.track.length) {
        const done = this.anim.onDone;
        this.anim = { kind: 'done' };
        this.group.visible = false;
        this.updateDots();
        done();
      }
      return;
    }
    this.place(this.lastS);
    this.updateAlert();
    if (this.flinch(dt)) {
      // flinch owns the offset this frame
    } else if (this.shakeT > 0) {
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
    if (this.breatheT !== null && this.pulseT === 0) {
      this.breatheT += dt;
      const k = 1 + (BREATHE.amount * (1 - Math.cos((this.breatheT / BREATHE.period) * Math.PI * 2))) / 2;
      for (const s of this.segments) s.scale.setScalar(k);
    }
  }
}

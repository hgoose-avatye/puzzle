import * as THREE from 'three';

/**
 * Cheap particle effects: soft dust puffs and twinkle stars (sprites), and small cubes for bursts.
 * One shared geometry; materials are cached per color. Particles remove themselves and are never disposed per particle.
 */
interface P {
  m: THREE.Object3D; v: THREE.Vector3; spin: THREE.Vector3; life: number; max: number; g: number; shrink: boolean;
  /** soft sprite (dust, sparkle): fades out instead of shrinking; its own material is disposed with it */
  sprite?: { mat: THREE.SpriteMaterial; size: number; grow: number; peak: number; twinkle: number; drag: number };
}

const geo = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map<number, THREE.MeshBasicMaterial>();
const mat = (c: number): THREE.MeshBasicMaterial => {
  let m = mats.get(c);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: c }); mats.set(c, m); }
  return m;
};
/** Canvas textures for the soft sprites, built once. */
const canvasTex = (draw: (g: CanvasRenderingContext2D, n: number) => void): THREE.CanvasTexture => {
  const n = 64;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  draw(c.getContext('2d')!, n);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
let puffTex: THREE.Texture | null = null;
/** a soft round cloud puff */
const puff = (): THREE.Texture => (puffTex ??= canvasTex((g, n) => {
  const r = n / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, n, n);
}));
let starTex: THREE.Texture | null = null;
/** a four-point twinkle star with a soft glow */
const star = (): THREE.Texture => (starTex ??= canvasTex((g, n) => {
  const r = n / 2;
  const glow = g.createRadialGradient(r, r, 0, r, r, r * 0.55);
  glow.addColorStop(0, 'rgba(255,255,255,0.9)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, n, n);
  const k = r * 0.16;
  const e = 0;
  const path = (): void => {
    g.beginPath();
    g.moveTo(r, e); g.quadraticCurveTo(r + k, r - k, n - e, r); g.quadraticCurveTo(r + k, r + k, r, n - e);
    g.quadraticCurveTo(r - k, r + k, e, r); g.quadraticCurveTo(r - k, r - k, r, e);
  };
  path(); g.fillStyle = '#fff'; g.fill();
}));
const DUST = 0xf6efe2;
/** warm gold: pale yellow vanished on the light floor and grass */
const SPARK = 0xffc21a;

export class Fx {
  private readonly parts: P[] = [];
  constructor(private readonly scene: THREE.Scene) {}

  private spawn(pos: THREE.Vector3, color: number, size: number, v: THREE.Vector3, life: number, g: number, shrink = true): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.copy(pos);
    m.scale.setScalar(size);
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.scene.add(m);
    this.parts.push({ m, v, spin: new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4), life, max: life, g, shrink });
    return m;
  }

  /** A soft sprite that grows and fades (dust puff) or twinkles (sparkle). */
  private soft(pos: THREE.Vector3, tex: THREE.Texture, color: number, size: number, v: THREE.Vector3, life: number,
    o: { g?: number; grow?: number; peak?: number; twinkle?: number; drag?: number; spin?: number; top?: boolean } = {}): void {
    // `top`: drawn over the dust and the animals so a sparkle is never hidden
    const mat = new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, depthTest: !o.top, toneMapped: !o.top, opacity: 0 });
    mat.rotation = Math.random() * Math.PI * 2;
    const m = new THREE.Sprite(mat);
    m.position.copy(pos);
    m.scale.setScalar(size);
    m.renderOrder = o.top ? 9 : 6;
    this.scene.add(m);
    this.parts.push({
      m, v, spin: new THREE.Vector3(0, 0, o.spin ?? 0), life, max: life, g: o.g ?? 0, shrink: false,
      sprite: { mat, size, grow: o.grow ?? 1, peak: o.peak ?? 0.85, twinkle: o.twinkle ?? 0, drag: o.drag ?? 0 },
    });
  }

  /** Dust cloud: puffs rolling outward along the floor and drifting up. */
  private dustCloud(pos: THREE.Vector3, n: number, speed: number, size: number): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const s = speed * (0.6 + Math.random() * 0.6);
      this.soft(new THREE.Vector3(pos.x + Math.cos(a) * 0.15, 0.18 + Math.random() * 0.15, pos.z + Math.sin(a) * 0.15), puff(), DUST,
        size * (0.8 + Math.random() * 0.5), new THREE.Vector3(Math.cos(a) * s, 0.35 + Math.random() * 0.4, Math.sin(a) * s),
        0.55 + Math.random() * 0.3, { g: -0.4, grow: 2.1, peak: 0.8, drag: 3.2, spin: (Math.random() - 0.5) * 1.5 });
    }
  }

  /** Twinkling stars popping up and out. */
  private stars(pos: THREE.Vector3, color: number, n: number, height: number): void {
    const tint = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.25).getHex();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const s = 0.9 + Math.random() * 1.2;
      const p = new THREE.Vector3(pos.x + Math.cos(a) * 0.2, height + Math.random() * 0.4, pos.z + Math.sin(a) * 0.2);
      this.soft(p, star(), i % 4 === 3 ? tint : SPARK, 0.3 + Math.random() * 0.18,
        new THREE.Vector3(Math.cos(a) * s, 1.6 + Math.random() * 1.2, Math.sin(a) * s),
        0.9 + Math.random() * 0.4, { g: 1.6, grow: 0.6, peak: 1, twinkle: 8 + Math.random() * 5, drag: 2, spin: (Math.random() - 0.5) * 3, top: true });
    }
  }

  /** Where an animal leaves the board: a dust cloud with sparkles twinkling out of it. */
  escape(pos: THREE.Vector3, color: number): void {
    this.dustCloud(pos, 9, 1.6, 0.55);
    this.stars(pos, color, 12, 0.7);
  }

  /** Take-off: a ring of dust puffs around the feet. */
  launch(pos: THREE.Vector3): void {
    this.dustCloud(pos, 7, 1.3, 0.4);
  }

  /** A little dust puff at an animal's feet while it runs. */
  dust(pos: THREE.Vector3): void {
    const a = Math.random() * Math.PI * 2;
    this.soft(new THREE.Vector3(pos.x, 0.15, pos.z), puff(), DUST, 0.26 + Math.random() * 0.12,
      new THREE.Vector3(Math.cos(a) * 0.4, 0.45, Math.sin(a) * 0.4), 0.45, { grow: 1.8, peak: 0.6, drag: 2 });
  }

  /** Rescue burst where an animal leaves the board, in the animal's own color. */
  burst(pos: THREE.Vector3, color: number): void {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 2.2;
      this.spawn(new THREE.Vector3(pos.x, 0.5, pos.z), i % 3 === 0 ? 0xffffff : color, 0.12 + Math.random() * 0.1, new THREE.Vector3(Math.cos(a) * s, 2 + Math.random() * 2.5, Math.sin(a) * s), 0.7, 9);
    }
  }

  update(dt: number): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.m);
        p.sprite?.mat.dispose();
        this.parts.splice(i, 1);
        continue;
      }
      p.v.y -= p.g * dt;
      if (p.sprite) {
        const sp = p.sprite;
        p.v.multiplyScalar(Math.max(0, 1 - sp.drag * dt));
        p.m.position.addScaledVector(p.v, dt);
        const t = 1 - p.life / p.max; // 0 → 1
        // quick fade in, slow fade out
        const fade = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
        const tw = sp.twinkle ? 0.65 + 0.35 * Math.sin(t * sp.twinkle * Math.PI) : 1;
        sp.mat.opacity = sp.peak * fade * tw;
        sp.mat.rotation += p.spin.z * dt;
        // a sparkle pops big and settles; dust grows as it spreads
        const k = sp.twinkle ? (t < 0.2 ? 0.4 + 3 * t : 1 - (t - 0.2) * (1 - sp.grow) / 0.8) * tw : 1 + (sp.grow - 1) * Math.sqrt(t);
        p.m.scale.setScalar(sp.size * k);
        continue;
      }
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += p.spin.x * dt;
      p.m.rotation.y += p.spin.y * dt;
      if (p.shrink) p.m.scale.multiplyScalar(1 - dt * 1.4);
    }
  }

  clear(): void {
    for (const p of this.parts) { this.scene.remove(p.m); p.sprite?.mat.dispose(); }
    this.parts.length = 0;
  }
}

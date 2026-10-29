import * as THREE from 'three';

/**
 * Cheap particle effects made of small cubes: puffs, rescue bursts, stars over blocked animals and clear confetti.
 * One shared geometry; materials are cached per color. Particles remove themselves and are never disposed per particle.
 */
interface P { m: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; life: number; max: number; g: number; shrink: boolean }

const geo = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map<number, THREE.MeshBasicMaterial>();
const mat = (c: number): THREE.MeshBasicMaterial => {
  let m = mats.get(c);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: c }); mats.set(c, m); }
  return m;
};
const CONFETTI = [0xff6f91, 0xffc75f, 0x6cc24a, 0x4aa8ff, 0xb37bff, 0xff9671];

export class Fx {
  private readonly parts: P[] = [];
  constructor(private readonly scene: THREE.Scene) {}

  private spawn(pos: THREE.Vector3, color: number, size: number, v: THREE.Vector3, life: number, g: number, shrink = true): void {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.copy(pos);
    m.scale.setScalar(size);
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.scene.add(m);
    this.parts.push({ m, v, spin: new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4), life, max: life, g, shrink });
  }

  /** A little dust puff at an animal's feet while it runs. */
  dust(pos: THREE.Vector3): void {
    this.spawn(new THREE.Vector3(pos.x, 0.1, pos.z), 0xf4efe6, 0.14 + Math.random() * 0.08, new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.5, (Math.random() - 0.5) * 0.6), 0.45, -0.5);
  }

  /** Rescue burst at the gate, in the animal's own color. */
  burst(pos: THREE.Vector3, color: number): void {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 2.2;
      this.spawn(new THREE.Vector3(pos.x, 0.5, pos.z), i % 3 === 0 ? 0xffffff : color, 0.12 + Math.random() * 0.1, new THREE.Vector3(Math.cos(a) * s, 2 + Math.random() * 2.5, Math.sin(a) * s), 0.7, 9);
    }
  }

  /** Yellow stars popping over a blocked animal. */
  stars(pos: THREE.Vector3): void {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.spawn(new THREE.Vector3(pos.x, 1.5, pos.z), 0xffd23f, 0.13, new THREE.Vector3(Math.cos(a) * 1.1, 1.3, Math.sin(a) * 1.1), 0.55, 4);
    }
  }

  /** Falling confetti over the whole board. */
  confetti(center: THREE.Vector3, spread: number): void {
    for (let i = 0; i < 90; i++) {
      const p = new THREE.Vector3(center.x + (Math.random() - 0.5) * spread, 5 + Math.random() * 3, center.z + (Math.random() - 0.5) * spread);
      this.spawn(p, CONFETTI[i % CONFETTI.length], 0.14 + Math.random() * 0.1, new THREE.Vector3((Math.random() - 0.5) * 1.5, -1.5 - Math.random() * 1.5, (Math.random() - 0.5) * 1.5), 2.6 + Math.random(), 0, false);
    }
  }

  update(dt: number): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.m);
        this.parts.splice(i, 1);
        continue;
      }
      p.v.y -= p.g * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += p.spin.x * dt;
      p.m.rotation.y += p.spin.y * dt;
      if (p.shrink) p.m.scale.multiplyScalar(1 - dt * 1.4);
    }
  }

  clear(): void {
    for (const p of this.parts) this.scene.remove(p.m);
    this.parts.length = 0;
  }
}

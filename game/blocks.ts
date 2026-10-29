import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Block animals, designed after docs/art-reference (09 size classes, 02 back views); the look of each species comes
 * from the GPT-made reference sketch (eyes, snouts, ears, patterns, tails, colors).
 *
 * An animal is first assembled in one frame (head at +z, N cells long) and then cut into one segment per cell by z,
 * so the path-following code can move the segments independently and the body bends at corners.
 * Geometry and materials are cached and shared by every animal: never dispose anything built here.
 */

export type AnimalType = 'penguin' | 'chick' | 'parrot' | 'cow' | 'pig' | 'fox' | 'tiger' | 'husky' | 'snake' | 'caterpillar' | 'dachshund' | 'crocodile';

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<number, THREE.MeshStandardMaterial>();

function mat(c: number): THREE.MeshStandardMaterial {
  if (!matCache.has(c)) matCache.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.88, metalness: 0 }));
  return matCache.get(c)!;
}
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key)!;
}
function add(g: THREE.Group, geo: THREE.BufferGeometry, c: number, x: number, y: number, z: number): THREE.Mesh {
  const o = new THREE.Mesh(geo, mat(c));
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  g.add(o);
  return o;
}
function box(g: THREE.Group, x: number, y: number, z: number, w: number, h: number, d: number, c: number, r = 0.12): THREE.Mesh {
  const rr = Math.min(r, w * 0.3, h * 0.3, d * 0.3);
  return add(g, cached(`b${w}|${h}|${d}|${rr}`, () => new RoundedBoxGeometry(w, h, d, 3, rr)), c, x, y, z);
}
function ball(g: THREE.Group, x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number): THREE.Mesh {
  const o = add(g, cached('sphere', () => new THREE.SphereGeometry(1, 16, 12)), c, x, y, z);
  o.scale.set(sx, sy, sz);
  return o;
}
function cone(g: THREE.Group, x: number, y: number, z: number, r: number, h: number, c: number, rot = 0): THREE.Mesh {
  const o = add(g, cached(`c${r}|${h}`, () => new THREE.ConeGeometry(r, h, 5)), c, x, y, z);
  o.rotation.z = rot;
  return o;
}
function eyes(g: THREE.Group, y: number, z: number, sep = 0.24, scale = 1): void {
  for (const s of [-1, 1]) {
    ball(g, s * sep, y, z, 0.17 * scale, 0.205 * scale, 0.085 * scale, 0xffffff);
    ball(g, s * sep + 0.045, y - 0.02, z + 0.075 * scale, 0.088 * scale, 0.112 * scale, 0.052 * scale, 0x242333);
  }
}
function feet(g: THREE.Group, length: number, color: number, offset = 0.31): void {
  for (const z of [length / 2 - 0.22, -length / 2 + 0.22]) for (const x of [-offset, offset]) box(g, x, 0.095, z, 0.23, 0.19, 0.27, color, 0.045);
}
function ear(g: THREE.Group, x: number, y: number, z: number, c: number, inner?: number): void {
  box(g, x, y, z, 0.24, 0.31, 0.2, c, 0.07);
  if (inner) box(g, x, y, z + 0.11, 0.13, 0.19, 0.035, inner, 0.03);
}
function tail(g: THREE.Group, z: number, c: number): void {
  box(g, 0, 0.61, z, 0.23, 0.24, 0.35, c, 0.08);
}

interface Dim { w: number; h: number }
const FLAT: Dim = { w: 0.98, h: 0.94 };
const BODY_BASE = 0.09;

/**
 * The spine: one rounded box per cell. Neighbours overlap by 0.15 on each side, so the rounded ends vanish inside each
 * other and a straight animal reads as one long body. The face end of the head and the rump end of the tail stay put.
 */
function spine(g: THREE.Group, n: number, color: (i: number) => number, head: Dim, bodyDim: Dim, r = 0.15, y = BODY_BASE): void {
  const zh = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const d = i === 0 ? head : bodyDim;
    const first = i === 0;
    const last = i === n - 1;
    const depth = n === 1 ? 0.98 : first ? 1.14 : last ? 1.12 : 1.3;
    const shift = n === 1 ? 0 : first ? -0.08 : last ? 0.07 : 0;
    // later segments are a hair smaller so equal side faces never overlap exactly (no z-fighting line at the joint)
    const inset = 0.006 * i;
    box(g, 0, y + d.h / 2, zh - i + shift, d.w - inset, d.h - inset, depth, color(i), r);
  }
}
const topOf = (d: Dim): number => BODY_BASE + d.h;

function build(type: AnimalType, n: 1 | 2 | 3): THREE.Group {
  const g = new THREE.Group();
  const len = 0.98 + (n - 1);
  const zh = (n - 1) / 2;
  const front = len / 2;
  const f = front + 0.02;
  const flat = (c: number): void => spine(g, n, () => c, FLAT, FLAT);

  switch (type) {
    case 'penguin':
      flat(0x45414b);
      box(g, 0, 0.55, f - 0.002, 0.78, 0.72, 0.055, 0xf5f1f6, 0.24);
      eyes(g, 0.73, f + 0.04, 0.23);
      ball(g, 0, 0.46, f + 0.17, 0.16, 0.13, 0.17, 0xffa22d);
      ear(g, -0.53, 0.58, 0.05, 0x45414b);
      ear(g, 0.53, 0.58, 0.05, 0x45414b);
      feet(g, len, 0xffa229);
      for (const x of [-0.12, 0, 0.12]) box(g, x, 1.13, -0.05, 0.15, 0.27, 0.17, 0x37323e, 0.07);
      ball(g, 0, 0.42, -len / 2 - 0.1, 0.14, 0.13, 0.13, 0xcfd8e6); // back view: pale puff, like the reference
      break;
    case 'chick':
      flat(0xffca49);
      eyes(g, 0.55, f, 0.23);
      ball(g, 0, 0.39, f + 0.16, 0.15, 0.13, 0.15, 0xf48728);
      ear(g, -0.53, 0.54, 0, 0xffca44);
      ear(g, 0.53, 0.54, 0, 0xffca44);
      feet(g, len, 0xd98929);
      for (const x of [-0.1, 0.08]) box(g, x, 1.13, -0.05, 0.18, 0.24, 0.2, 0xffd75b, 0.08);
      box(g, 0, 0.5, -len / 2 - 0.07, 0.17, 0.16, 0.14, 0xf2b52e, 0.06); // back view: a tiny tail tuft
      break;
    case 'parrot':
      flat(0xe95d3e);
      eyes(g, 0.6, f, 0.25);
      ball(g, 0, 0.43, f + 0.2, 0.18, 0.2, 0.22, 0x3d414a);
      for (const x of [-0.54, 0.54]) {
        box(g, x, 0.52, 0.05, 0.16, 0.46, 0.49, 0x1888c7, 0.06);
        box(g, x, 0.65, 0.05, 0.17, 0.15, 0.45, 0xf6d54e, 0.04);
      }
      feet(g, len, 0x823b2d);
      for (const x of [-0.14, 0, 0.14]) box(g, x, 1.15, -0.04, 0.15, 0.3, 0.17, 0xee5638, 0.07);
      for (const [x, c] of [[-0.1, 0x1888c7], [0.1, 0xf6d54e]] as const) box(g, x, 0.42, -len / 2 - 0.2, 0.12, 0.09, 0.46, c, 0.04).rotation.x = 0.25; // long tail feathers
      break;
    case 'cow':
      flat(0xf4f0ee);
      for (const [x, z, w, d] of [[-0.31, 0.2, 0.33, 0.43], [0.35, -0.34, 0.32, 0.48], [-0.05, -0.45, 0.37, 0.28]] as const) box(g, x, 1.04, z, w, 0.028, d, 0x46434b, 0.04);
      for (const x of [-0.51, 0.51]) box(g, x, 0.7, -0.18, 0.05, 0.45, 0.55, 0x48434b, 0.02);
      eyes(g, 0.55, f, 0.23);
      box(g, 0, 0.38, f + 0.15, 0.51, 0.32, 0.18, 0xf6a2a3, 0.13);
      for (const x of [-0.13, 0.13]) ball(g, x, 0.4, f + 0.255, 0.045, 0.055, 0.025, 0xb36d77);
      for (const x of [-0.3, 0.3]) {
        ear(g, x, 1.12, 0.44 + zh, 0x4d4950);
        box(g, x, 1.21, 0.46 + zh, 0.14, 0.24, 0.17, 0xffddbe, 0.04);
      }
      feet(g, len, 0x4e4a4d);
      tail(g, -len / 2 - 0.14, 0x4d4a4d);
      break;
    case 'pig':
      flat(0xf795a9);
      eyes(g, 0.54, f, 0.23);
      box(g, 0, 0.38, f + 0.14, 0.38, 0.28, 0.2, 0xe87990, 0.12);
      for (const x of [-0.1, 0.1]) ball(g, x, 0.39, f + 0.25, 0.037, 0.048, 0.022, 0xaf4e65);
      for (const x of [-0.31, 0.31]) ear(g, x, 1.11, 0.41 + zh, 0xf47f98, 0xe66884);
      feet(g, len, 0x754447);
      for (const x of [-0.5, 0.5]) ball(g, x, 0.63, -0.33, 0.015, 0.13, 0.19, 0xe76e88);
      tail(g, -len / 2 - 0.13, 0xe97891);
      break;
    case 'fox':
      flat(0xee8b3e);
      box(g, 0, 0.34, f + 0.01, 0.83, 0.33, 0.07, 0xf9f4eb, 0.13);
      eyes(g, 0.55, f, 0.22);
      ball(g, 0, 0.39, f + 0.16, 0.12, 0.1, 0.14, 0x2b2930);
      for (const x of [-0.34, 0.34]) ear(g, x, 1.12, 0.38 + zh, 0x9d5635, 0xf1c2a2);
      feet(g, len, 0x603e36);
      box(g, 0, 0.65, -len / 2 - 0.29, 0.37, 0.36, 0.62, 0xf3a55b, 0.13);
      box(g, 0, 0.65, -len / 2 - 0.59, 0.39, 0.35, 0.18, 0xfaf7ee, 0.08);
      break;
    case 'tiger':
      flat(0xf5b935);
      eyes(g, 0.55, f, 0.22);
      box(g, 0, 0.34, f + 0.025, 0.63, 0.32, 0.075, 0xffe1a0, 0.11);
      ball(g, 0, 0.39, f + 0.16, 0.11, 0.1, 0.12, 0x543a29);
      for (const x of [-0.34, 0.34]) ear(g, x, 1.11, 0.42 + zh, 0xa76a29, 0xf5b934);
      for (const z of [-0.53, -0.05, 0.46]) {
        box(g, -0.26, 1.045, z, 0.13, 0.034, 0.27, 0x86522c, 0.025);
        box(g, 0.26, 1.045, z, 0.13, 0.034, 0.27, 0x86522c, 0.025);
      }
      for (const x of [-0.5, 0.5]) for (const z of [-0.4, 0.22]) box(g, x, 0.76, z, 0.028, 0.15, 0.2, 0x8b542b, 0.02);
      feet(g, len, 0xb27c2c);
      tail(g, -len / 2 - 0.16, 0xb87b26);
      break;
    case 'husky':
      flat(0x69656f);
      box(g, 0, 0.36, f + 0.02, 0.79, 0.38, 0.07, 0xf4f2f3, 0.13);
      eyes(g, 0.57, f, 0.23);
      ball(g, 0, 0.39, f + 0.16, 0.11, 0.09, 0.12, 0x29252b);
      for (const x of [-0.32, 0.32]) ear(g, x, 1.12, 0.41 + zh, 0x66616c, 0xcac3ca);
      feet(g, len, 0x4a464f);
      box(g, 0, 0.26, f - 0.06, 0.88, 0.1, 0.13, 0xc3454c, 0.035);
      ball(g, 0, 0.19, f + 0.12, 0.105, 0.105, 0.05, 0xe7ad3e);
      tail(g, -len / 2 - 0.15, 0xe5e2e3);
      break;
    case 'snake': {
      const head: Dim = { w: 1.0, h: 0.94 };
      const bodyDim: Dim = { w: 0.93, h: 0.87 };
      spine(g, 3, (i) => (i === 0 ? 0x52a85a : 0x469953), head, bodyDim);
      for (let i = 0; i < 3; i++) {
        const d = i === 0 ? head : bodyDim;
        box(g, 0, 0.18, zh - i, d.w - 0.12, 0.15, 0.9, 0xc9c64d, 0.08);
        box(g, 0.24, topOf(d), zh - i, 0.2, 0.03, 0.15, 0xc6d64b, 0.02);
      }
      eyes(g, 0.66, front + 0.075, 0.23);
      box(g, 0, 0.36, front + 0.085, 0.54, 0.22, 0.13, 0xb5c450, 0.08);
      box(g, 0, 0.23, front + 0.23, 0.13, 0.07, 0.3, 0xe95b6d, 0.03);
      break;
    }
    case 'caterpillar': {
      const head: Dim = { w: 1.0, h: 0.98 };
      const bodyDim: Dim = { w: 0.92, h: 0.88 };
      spine(g, 3, (i) => (i === 0 ? 0xf58fa7 : 0xf6a1b4), head, bodyDim, 0.22);
      for (let i = 0; i < 3; i++) for (const x of [-0.3, 0.3]) box(g, x, topOf(i === 0 ? head : bodyDim), zh - i, 0.17, 0.028, 0.18, 0xffc4cf, 0.025);
      eyes(g, 0.57, front + 0.075, 0.23);
      ball(g, 0, 0.35, front + 0.16, 0.15, 0.12, 0.12, 0xe77d93);
      for (const x of [-0.22, 0.22]) box(g, x, topOf(head) + 0.12, zh - 0.07, 0.14, 0.33, 0.13, 0xe96e89, 0.07);
      feet(g, len, 0x9b4b61);
      break;
    }
    case 'dachshund': {
      const head: Dim = { w: 1.0, h: 0.98 };
      const bodyDim: Dim = { w: 0.92, h: 0.88 };
      spine(g, 3, () => 0xb66c43, head, bodyDim);
      box(g, 0, 0.28, f + 0.02, 0.72, 0.25, 0.08, 0xf4bd65, 0.1);
      eyes(g, 0.57, f, 0.22);
      ball(g, 0, 0.38, f + 0.17, 0.12, 0.11, 0.12, 0x343037);
      for (const x of [-0.53, 0.53]) box(g, x, 0.64, f - 0.19, 0.19, 0.51, 0.31, 0x694536, 0.1);
      feet(g, len, 0x7c4d35);
      box(g, 0, 0.53, f - 0.35, 1.04, 0.13, 0.17, 0x3466a1, 0.025);
      tail(g, -len / 2 - 0.18, 0x7c4b34);
      break;
    }
    case 'crocodile': {
      const head: Dim = { w: 0.98, h: 0.78 };
      const bodyDim: Dim = { w: 0.92, h: 0.72 };
      spine(g, 3, (i) => (i === 0 ? 0x4fa75b : 0x419c52), head, bodyDim, 0.13);
      for (let i = 0; i < 3; i++) {
        const d = i === 0 ? head : bodyDim;
        box(g, 0, 0.23, zh - i, d.w - 0.02, 0.18, 0.93, 0xd2c75e, 0.06);
        for (const x of [-0.24, 0.24]) cone(g, x, topOf(d) + 0.07, zh - i, 0.13, 0.23, 0x398c46);
      }
      box(g, 0, 0.41, zh + 0.68, 0.8, 0.35, 0.62, 0x4fa75b, 0.12);
      box(g, 0, 0.24, zh + 0.78, 0.78, 0.13, 0.58, 0xd8ce74, 0.05);
      eyes(g, 0.73, zh + 0.45, 0.24, 0.85);
      for (const x of [-0.31, 0.31]) for (const z of [zh + 0.64, zh + 0.93]) cone(g, x, 0.2, z, 0.065, 0.15, 0xf8f1dc, Math.PI);
      for (const x of [-0.55, 0.55]) for (const z of [-0.76, 0.76]) box(g, x, 0.23, z + 0, 0.21, 0.22, 0.33, 0x398b49, 0.05);
      break;
    }
  }
  return g;
}

export const BLOCK_SPECIES: AnimalType[] = ['penguin', 'chick', 'parrot', 'cow', 'pig', 'fox', 'tiger', 'husky', 'snake', 'caterpillar', 'dachshund', 'crocodile'];

/**
 * One segment per cell, head first. Each segment is a Group whose single child holds the meshes, so bob and nod never
 * fight the path placement. A part belongs to the segment whose cell contains its z; parts in front of the head or
 * behind the tail go to the first and last segment.
 */
export function buildAnimal(species: string, cells: number): THREE.Group[] {
  const type = (BLOCK_SPECIES as string[]).includes(species) ? (species as AnimalType) : 'cow';
  const n = Math.max(1, Math.min(3, cells)) as 1 | 2 | 3;
  const whole = build(type, n);
  const zh = (n - 1) / 2;
  const segments: THREE.Group[] = [];
  const parts: THREE.Group[] = [];
  for (let i = 0; i < n; i++) {
    const root = new THREE.Group();
    const part = new THREE.Group();
    root.add(part);
    segments.push(root);
    parts.push(part);
  }
  for (const m of [...whole.children]) {
    const idx = Math.max(0, Math.min(n - 1, Math.round(zh - m.position.z)));
    m.position.z -= zh - idx;
    parts[idx].add(m);
  }
  return segments;
}

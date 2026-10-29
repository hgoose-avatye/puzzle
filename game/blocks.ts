import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Procedural block animals following docs/art-reference (09 size classes, 02 back views). Every animal faces +z.
 * A piece of N cells is a head block plus N-1 body blocks, one per cell, so long animals are chains of cubes like in the
 * reference; the tail sits on the last block. Geometry and materials are shared and never disposed.
 */

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<number, THREE.MeshStandardMaterial>();

function rbox(w: number, h: number, d: number): THREE.BufferGeometry {
  const key = `b${w}/${h}/${d}`;
  if (!geoCache.has(key)) geoCache.set(key, new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.3));
  return geoCache.get(key)!;
}
function sphere(r: number): THREE.BufferGeometry {
  const key = `s${r}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.SphereGeometry(r, 14, 10));
  return geoCache.get(key)!;
}
function cone(r: number, h: number): THREE.BufferGeometry {
  const key = `c${r}/${h}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.ConeGeometry(r, h, 4));
  return geoCache.get(key)!;
}
function mat(color: number): THREE.MeshStandardMaterial {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.72 }));
  return matCache.get(color)!;
}

type V3 = [number, number, number];

function put(parent: THREE.Object3D, geo: THREE.BufferGeometry, color: number, pos: V3, rot: V3 = [0, 0, 0]): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.castShadow = true;
  parent.add(m);
  return m;
}

const HEAD_W = 0.98;
const HEAD_H = 0.96;
const HEAD_D = 0.94;
const LEG_H = 0.2;
const HEAD_Y = LEG_H + HEAD_H / 2 - 0.02;
const BODY_W = 0.84;
const BODY_H = 0.68;
const BODY_LEN = 1.06;
const BODY_Y = LEG_H + BODY_H / 2 - 0.02;
const FACE_Z = HEAD_D / 2;

interface Look {
  /** main color of head and body blocks */
  skin: number;
  /** leg / paw color */
  leg: number;
  head: (g: THREE.Group) => void;
  /** extra markings on a body block (spots, stripes...) */
  body?: (g: THREE.Group, i: number) => void;
  tail?: (g: THREE.Group) => void;
  /** snake has no legs, caterpillar and crocodile have short ones */
  legs?: 'none' | 'short';
  bodyColor?: number;
}

function eyes(g: THREE.Group, y: number, x = 0.2, big = 1): void {
  for (const s of [-1, 1]) {
    put(g, sphere(0.19 * big), 0xffffff, [s * x, y, FACE_Z - 0.03]).scale.z = 0.5;
    put(g, sphere(0.115 * big), 0x20222b, [s * x, y - 0.01, FACE_Z + 0.04]).scale.z = 0.55;
    put(g, sphere(0.042 * big), 0xffffff, [s * x + 0.04, y + 0.05, FACE_Z + 0.085]);
  }
}

const LOOKS: Record<string, Look> = {
  penguin: {
    skin: 0x363a47,
    leg: 0xf29a2e,
    head(g) {
      put(g, rbox(0.7, 0.52, 0.08), 0xf6f4ee, [0, HEAD_Y - 0.08, FACE_Z - 0.01]);
      eyes(g, HEAD_Y + 0.02, 0.19, 1.15);
      put(g, rbox(0.2, 0.11, 0.14), 0xf29a2e, [0, HEAD_Y - 0.12, FACE_Z + 0.05]);
      for (const s of [-1, 1]) put(g, rbox(0.12, 0.38, 0.34), 0x2c303c, [s * (HEAD_W / 2 + 0.03), HEAD_Y - 0.1, 0]);
      for (const x of [-0.12, 0, 0.12]) put(g, rbox(0.09, 0.2, 0.09), 0x2c303c, [x, HEAD_Y + HEAD_H / 2 + 0.07, -0.05]);
    },
    tail(g) {
      put(g, sphere(0.15), 0xb9c4d6, [0, 0.32, -HEAD_D / 2 - 0.04]);
    },
  },
  chick: {
    skin: 0xf8d94a,
    leg: 0xf29a2e,
    head(g) {
      eyes(g, HEAD_Y + 0.05, 0.2, 1.15);
      put(g, rbox(0.2, 0.11, 0.15), 0xf29a2e, [0, HEAD_Y - 0.1, FACE_Z + 0.05]);
      for (const s of [-1, 1]) put(g, rbox(0.1, 0.34, 0.3), 0xf2c632, [s * (HEAD_W / 2 + 0.03), HEAD_Y - 0.12, 0]);
      for (const x of [-0.1, 0.1]) put(g, rbox(0.1, 0.18, 0.1), 0xf8d94a, [x, HEAD_Y + HEAD_H / 2 + 0.07, 0]);
    },
    tail(g) {
      put(g, rbox(0.2, 0.2, 0.12), 0xf2c632, [0, 0.55, -HEAD_D / 2 - 0.03]);
    },
  },
  parrot: {
    skin: 0xd9382b,
    leg: 0x8a6a3a,
    head(g) {
      put(g, rbox(0.7, 0.5, 0.08), 0xf4eee6, [0, HEAD_Y + 0.02, FACE_Z - 0.01]);
      eyes(g, HEAD_Y + 0.08, 0.2, 1.1);
      put(g, rbox(0.26, 0.24, 0.22), 0x4a4f5c, [0, HEAD_Y - 0.12, FACE_Z + 0.08]);
      for (const s of [-1, 1]) {
        put(g, rbox(0.1, 0.36, 0.34), 0x2f6fd0, [s * (HEAD_W / 2 + 0.03), HEAD_Y - 0.1, 0.05]);
        put(g, rbox(0.1, 0.18, 0.3), 0xf2c230, [s * (HEAD_W / 2 + 0.03), HEAD_Y - 0.25, 0.05]);
      }
      for (const [x, h] of [[-0.12, 0.2], [0, 0.28], [0.12, 0.2]] as const) put(g, rbox(0.1, h, 0.1), 0xe0402e, [x, HEAD_Y + HEAD_H / 2 + h / 2 - 0.02, -0.05]);
    },
    tail(g) {
      for (const [x, c] of [[-0.1, 0x2f6fd0], [0.1, 0xf2c230]] as const) put(g, rbox(0.12, 0.1, 0.5), c, [x, 0.42, -HEAD_D / 2 - 0.22], [0.25, 0, 0]);
    },
  },
  cow: {
    skin: 0xf4f2ee,
    leg: 0x2b2b30,
    head(g) {
      put(g, rbox(0.4, 0.34, 0.08), 0x2b2b30, [-0.22, HEAD_Y + HEAD_H / 2 - 0.1, 0.05]).rotation.z = 0.1;
      put(g, rbox(0.52, 0.3, 0.16), 0xf2a9a9, [0, HEAD_Y - 0.2, FACE_Z + 0.04]);
      for (const s of [-1, 1]) put(g, sphere(0.035), 0xc97a7a, [s * 0.1, HEAD_Y - 0.2, FACE_Z + 0.125]);
      eyes(g, HEAD_Y + 0.1, 0.23);
      for (const s of [-1, 1]) {
        put(g, rbox(0.1, 0.2, 0.1), 0xe6c9a0, [s * 0.3, HEAD_Y + HEAD_H / 2 + 0.08, 0]);
        put(g, rbox(0.22, 0.12, 0.14), 0x2b2b30, [s * (HEAD_W / 2 + 0.1), HEAD_Y + 0.22, -0.02]);
      }
    },
    body(g, i) {
      put(g, rbox(0.5, 0.06, 0.55), 0x2b2b30, [i % 2 ? 0.22 : -0.2, BODY_Y + BODY_H / 2 - 0.01, 0.05]);
      put(g, rbox(0.06, 0.4, 0.5), 0x2b2b30, [(i % 2 ? -1 : 1) * (BODY_W / 2 - 0.01), BODY_Y, -0.1]);
    },
    tail(g) {
      put(g, rbox(0.07, 0.4, 0.07), 0xf4f2ee, [0, 0.5, -0.04], [0.15, 0, 0]);
      put(g, sphere(0.07), 0x2b2b30, [0, 0.28, -0.07]);
    },
  },
  pig: {
    skin: 0xf2a0b8,
    leg: 0xc87a92,
    head(g) {
      put(g, rbox(0.46, 0.3, 0.16), 0xf7b9cb, [0, HEAD_Y - 0.15, FACE_Z + 0.06]);
      for (const s of [-1, 1]) {
        put(g, sphere(0.04), 0xc2677f, [s * 0.1, HEAD_Y - 0.15, FACE_Z + 0.14]);
        put(g, rbox(0.22, 0.22, 0.08), 0xe58ba6, [s * 0.32, HEAD_Y + HEAD_H / 2 - 0.02, 0.1], [0.5, 0, s * 0.35]);
      }
      eyes(g, HEAD_Y + 0.13, 0.22);
    },
    tail(g) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 6, 10, Math.PI * 1.5), mat(0xe58ba6));
      t.position.set(0, 0.6, -0.04);
      t.castShadow = true;
      g.add(t);
    },
  },
  fox: {
    skin: 0xe8742a,
    leg: 0x6a3a1e,
    head(g) {
      for (const s of [-1, 1]) {
        put(g, cone(0.17, 0.4), 0xe8742a, [s * 0.28, HEAD_Y + HEAD_H / 2 + 0.14, -0.05]);
        put(g, cone(0.09, 0.22), 0x6a3a1e, [s * 0.28, HEAD_Y + HEAD_H / 2 + 0.1, 0.02]);
        put(g, rbox(0.34, 0.26, 0.14), 0xf8f2e8, [s * 0.22, HEAD_Y - 0.18, FACE_Z + 0.01]);
      }
      put(g, rbox(0.22, 0.2, 0.18), 0xf8f2e8, [0, HEAD_Y - 0.14, FACE_Z + 0.04]);
      put(g, sphere(0.06), 0x20222b, [0, HEAD_Y - 0.08, FACE_Z + 0.14]);
      eyes(g, HEAD_Y + 0.12, 0.22);
    },
    tail(g) {
      put(g, rbox(0.34, 0.34, 0.6), 0xe8742a, [0, 0.5, -0.2], [0.5, 0, 0]);
      put(g, rbox(0.3, 0.3, 0.26), 0xf8f2e8, [0, 0.66, -0.52], [0.5, 0, 0]);
    },
  },
  tiger: {
    skin: 0xf2c230,
    leg: 0xf2c230,
    head(g) {
      for (const s of [-1, 1]) {
        put(g, sphere(0.15), 0x6b4423, [s * 0.34, HEAD_Y + HEAD_H / 2 - 0.02, 0]);
        put(g, rbox(0.2, 0.08, 0.1), 0x6b4423, [s * 0.34, HEAD_Y + 0.3, FACE_Z - 0.02]);
      }
      put(g, rbox(0.46, 0.3, 0.14), 0xfff3d0, [0, HEAD_Y - 0.2, FACE_Z + 0.03]);
      put(g, sphere(0.05), 0x20222b, [0, HEAD_Y - 0.12, FACE_Z + 0.11]);
      eyes(g, HEAD_Y + 0.1, 0.22);
    },
    body(g) {
      for (const z of [-0.3, 0, 0.3]) put(g, rbox(BODY_W + 0.02, 0.07, 0.12), 0x6b4423, [0, BODY_Y + BODY_H / 2 - 0.02, z]);
      for (const s of [-1, 1]) for (const z of [-0.25, 0.15]) put(g, rbox(0.06, 0.3, 0.12), 0x6b4423, [s * (BODY_W / 2 - 0.005), BODY_Y, z]);
    },
    tail(g) {
      put(g, rbox(0.1, 0.1, 0.5), 0xf2c230, [0, 0.55, -0.32], [-0.6, 0, 0]);
      put(g, rbox(0.11, 0.11, 0.12), 0x6b4423, [0, 0.82, -0.5], [-0.6, 0, 0]);
    },
  },
  husky: {
    skin: 0x7d8290,
    leg: 0xf5f5f5,
    head(g) {
      put(g, rbox(0.74, 0.5, 0.1), 0xf5f5f5, [0, HEAD_Y - 0.16, FACE_Z - 0.02]);
      put(g, sphere(0.06), 0x20222b, [0, HEAD_Y - 0.1, FACE_Z + 0.1]);
      eyes(g, HEAD_Y + 0.1, 0.22);
      for (const s of [-1, 1]) {
        put(g, cone(0.17, 0.38), 0x7d8290, [s * 0.27, HEAD_Y + HEAD_H / 2 + 0.13, -0.02]);
        put(g, cone(0.09, 0.2), 0xf5f5f5, [s * 0.27, HEAD_Y + HEAD_H / 2 + 0.1, 0.04]);
      }
      put(g, rbox(HEAD_W + 0.04, 0.1, HEAD_D - 0.1), 0xd63a3a, [0, LEG_H + 0.1, -0.02]);
      put(g, sphere(0.07), 0xf2c230, [0, LEG_H + 0.02, FACE_Z - 0.02]);
    },
    body(g) {
      put(g, rbox(BODY_W - 0.1, 0.34, BODY_LEN - 0.12), 0xf5f5f5, [0, LEG_H + 0.14, 0]);
    },
    tail(g) {
      put(g, rbox(0.2, 0.2, 0.4), 0xdfe1e6, [0, 0.62, -0.28], [0.7, 0, 0]);
      put(g, rbox(0.2, 0.2, 0.15), 0xf5f5f5, [0, 0.78, -0.45], [0.7, 0, 0]);
    },
  },
  snake: {
    skin: 0x4caf50,
    leg: 0x4caf50,
    legs: 'none',
    head(g) {
      eyes(g, HEAD_Y + 0.1, 0.22, 1.25);
      put(g, rbox(0.88, 0.2, 0.12), 0xcde05a, [0, HEAD_Y - 0.3, FACE_Z - 0.01]);
      put(g, sphere(0.05), 0x20222b, [0.08, HEAD_Y - 0.05, FACE_Z + 0.04]);
      put(g, rbox(0.05, 0.03, 0.3), 0xd8384a, [0, HEAD_Y - 0.2, FACE_Z + 0.14]);
    },
    body(g, i) {
      put(g, rbox(0.3, 0.06, 0.3), 0xd8e04a, [0, BODY_Y + BODY_H / 2 - 0.005, 0], [0, i % 2 ? 0.6 : -0.6, 0]);
      put(g, rbox(BODY_W - 0.04, 0.16, BODY_LEN - 0.08), 0xcde05a, [0, LEG_H + 0.06, 0]);
    },
  },
  caterpillar: {
    skin: 0xf28aa8,
    leg: 0xe0607f,
    legs: 'short',
    head(g) {
      eyes(g, HEAD_Y + 0.1, 0.21, 1.2);
      put(g, sphere(0.09), 0xe5384e, [0, HEAD_Y - 0.1, FACE_Z + 0.04]);
      for (const s of [-1, 1]) {
        put(g, rbox(0.05, 0.28, 0.05), 0xf28aa8, [s * 0.22, HEAD_Y + HEAD_H / 2 + 0.12, 0.05], [0, 0, s * -0.25]);
        put(g, sphere(0.06), 0xe5384e, [s * 0.27, HEAD_Y + HEAD_H / 2 + 0.27, 0.05]);
      }
    },
    body(g, i) {
      for (const [x, z] of [[-0.2, 0.2], [0.25, -0.15], [0, -0.35]] as const) put(g, sphere(0.09), 0xf9bcd0, [x, BODY_Y + BODY_H / 2 - 0.02, z + (i % 2) * 0.05]);
      for (const s of [-1, 1]) put(g, sphere(0.1), 0xf9bcd0, [s * (BODY_W / 2 - 0.02), BODY_Y + 0.05, 0.1]);
    },
  },
  dachshund: {
    skin: 0x8b5a2b,
    leg: 0x5e3a1a,
    head(g) {
      put(g, rbox(0.44, 0.3, 0.18), 0xd9a35a, [0, HEAD_Y - 0.2, FACE_Z + 0.05]);
      put(g, sphere(0.06), 0x20222b, [0, HEAD_Y - 0.1, FACE_Z + 0.15]);
      eyes(g, HEAD_Y + 0.1, 0.22);
      for (const s of [-1, 1]) put(g, rbox(0.16, 0.5, 0.3), 0x5e3a1a, [s * (HEAD_W / 2 + 0.06), HEAD_Y - 0.02, -0.02], [0, 0, s * 0.12]);
      put(g, rbox(HEAD_W + 0.04, 0.1, HEAD_D - 0.1), 0x2f4fa8, [0, LEG_H + 0.1, -0.02]);
    },
    body(g) {
      put(g, rbox(BODY_W - 0.2, 0.3, BODY_LEN - 0.1), 0x9b6a38, [0, LEG_H + 0.16, 0]);
    },
    tail(g) {
      put(g, rbox(0.13, 0.13, 0.5), 0x8b5a2b, [0, 0.62, -0.3], [-0.7, 0, 0]);
    },
  },
  crocodile: {
    skin: 0x3fa34d,
    leg: 0x2f8a3f,
    legs: 'short',
    head(g) {
      put(g, rbox(0.8, 0.34, 0.6), 0x3fa34d, [0, HEAD_Y - 0.14, FACE_Z + 0.2]);
      put(g, rbox(0.8, 0.12, 0.6), 0xd8e86a, [0, HEAD_Y - 0.36, FACE_Z + 0.2]);
      for (const s of [-1, 1]) {
        put(g, sphere(0.15), 0xffffff, [s * 0.24, HEAD_Y + HEAD_H / 2 - 0.02, 0.18]);
        put(g, sphere(0.085), 0x20222b, [s * 0.24, HEAD_Y + HEAD_H / 2 + 0.01, 0.28]);
        put(g, sphere(0.04), 0x2a6a34, [s * 0.14, HEAD_Y - 0.06, FACE_Z + 0.5]);
      }
    },
    body(g) {
      for (const z of [-0.3, 0, 0.3]) put(g, rbox(0.14, 0.12, 0.14), 0x2f8a3f, [0, BODY_Y + BODY_H / 2 + 0.01, z]);
      put(g, rbox(BODY_W - 0.04, 0.16, BODY_LEN - 0.08), 0xd8e86a, [0, LEG_H + 0.06, 0]);
    },
    tail(g) {
      put(g, rbox(0.34, 0.26, 0.6), 0x3fa34d, [0, 0.4, -0.5]);
      put(g, rbox(0.2, 0.18, 0.4), 0x3fa34d, [0, 0.38, -0.92]);
    },
  },
};

export const BLOCK_SPECIES = Object.keys(LOOKS);

function legs(g: THREE.Group, look: Look, zs: number[]): void {
  if (look.legs === 'none') return;
  const h = look.legs === 'short' ? LEG_H * 0.75 : LEG_H;
  for (const z of zs) for (const s of [-1, 1]) put(g, rbox(0.2, h, 0.22), look.leg, [s * 0.27, h / 2, z]);
}

/** Head first. Each segment is a Group whose single child is the animated part, so tilt and bob never fight the path. */
export function buildAnimal(species: string, cells: number): THREE.Group[] {
  const look = LOOKS[species] ?? LOOKS.cow;
  const segments: THREE.Group[] = [];

  const headRoot = new THREE.Group();
  const head = new THREE.Group();
  headRoot.add(head);
  put(head, rbox(HEAD_W, HEAD_H, HEAD_D), look.skin, [0, HEAD_Y, 0]);
  look.head(head);
  legs(head, look, cells === 1 ? [0.25, -0.25] : [0.22]);
  if (cells === 1) look.tail?.(head);
  segments.push(headRoot);

  for (let i = 1; i < cells; i++) {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    put(body, rbox(BODY_W, BODY_H, BODY_LEN), look.bodyColor ?? look.skin, [0, BODY_Y, 0]);
    look.body?.(body, i);
    legs(body, look, [-0.15]);
    if (i === cells - 1) {
      const tail = new THREE.Group();
      tail.position.z = -BODY_LEN / 2 + 0.02;
      look.tail?.(tail);
      body.add(tail);
    }
    segments.push(root);
  }
  return segments;
}

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Block animals after docs/art-reference 01 (front sheet), 02 (back sheet) and 09 (1/2/3-cell classes).
 * +Z is the face direction. One segment per occupied cell, head first; parts are built directly in their own segment.
 * Geometry and materials are cached and shared by every animal: never dispose them per animal.
 */
export type AnimalType = 'penguin' | 'chick' | 'parrot' | 'cow' | 'pig' | 'fox' | 'tiger' | 'husky' | 'snake' | 'caterpillar' | 'dachshund' | 'crocodile';
export const BLOCK_SPECIES: AnimalType[] = ['penguin', 'chick', 'parrot', 'cow', 'pig', 'fox', 'tiger', 'husky', 'snake', 'caterpillar', 'dachshund', 'crocodile'];

const geometries = new Map<string, THREE.BufferGeometry>();
const materials = new Map<number, THREE.MeshStandardMaterial>();
function material(color: number): THREE.MeshStandardMaterial {
  let m = materials.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0 }); materials.set(color, m); }
  return m;
}
function geometry(key: string, create: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geometries.get(key);
  if (!g) { g = create(); geometries.set(key, g); }
  return g;
}
function mesh(g: THREE.Group, geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, material(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
function cube(g: THREE.Group, x: number, y: number, z: number, w: number, h: number, d: number, c: number, r = 0.13): THREE.Mesh {
  const rad = Math.max(0.004, Math.min(r, w * 0.32, h * 0.32, d * 0.32));
  return mesh(g, geometry(`box:${w}:${h}:${d}:${rad}`, () => new RoundedBoxGeometry(w, h, d, 3, rad)), c, x, y, z);
}
function oval(g: THREE.Group, x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number): THREE.Mesh {
  const m = mesh(g, geometry('sphere', () => new THREE.SphereGeometry(1, 20, 14)), c, x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}
function taper(g: THREE.Group, x: number, y: number, z: number, r: number, h: number, c: number, rz = 0): THREE.Mesh {
  const m = mesh(g, geometry(`cone:${r}:${h}`, () => new THREE.ConeGeometry(r, h, 5)), c, x, y, z);
  m.rotation.z = rz;
  return m;
}
/** Four-sided pyramid with a flat face to the front: block-style pointed ears and spikes. */
function pyramid(g: THREE.Group, x: number, y: number, z: number, r: number, h: number, c: number, rz = 0): THREE.Mesh {
  const m = mesh(g, geometry(`pyr:${r}:${h}`, () => { const geo = new THREE.ConeGeometry(r, h, 4); geo.rotateY(Math.PI / 4); return geo; }), c, x, y, z);
  m.rotation.z = rz;
  return m;
}
function ring(g: THREE.Group, x: number, y: number, z: number, r: number, t: number, c: number): THREE.Mesh {
  return mesh(g, geometry(`ring:${r}:${t}`, () => new THREE.TorusGeometry(r, t, 10, 20)), c, x, y, z);
}

const WHITE = 0xfffcfa;
const PUPIL = 0x33231e;
/** Eyes lie flat on the face (reference 01): a big white disc, a big dark-brown pupil, a small highlight. */
function eyes(g: THREE.Group, fz: number, y: number, spread = 0.23, s = 1): void {
  for (const sx of [-1, 1]) {
    oval(g, sx * spread, y, fz + 0.006, 0.19 * s, 0.22 * s, 0.022, WHITE).userData.eye = true;
    oval(g, sx * spread, y - 0.012, fz + 0.02, 0.13 * s, 0.155 * s, 0.02, PUPIL).userData.eye = true;
    oval(g, sx * spread + 0.045 * s, y + 0.05 * s, fz + 0.034, 0.04 * s, 0.045 * s, 0.012, 0xffffff).userData.eye = true;
  }
}
/** Short, thick legs (reference 09): they stand from the floor into the body. */
const B0 = 0.26;
function leg(g: THREE.Group, x: number, z: number, c: number, h = 0.32, w = 0.3): void {
  cube(g, x, h / 2, z, w, h, w, c, 0.09);
}

interface Frame { W: number; H: number; D: number; zc: number; fz: number; bz: number; top: number }

function frame(i: number, n: number, headDim: [number, number], bodyDim: [number, number]): Frame {
  const one = n === 1;
  const head = i === 0;
  const [W, H] = one ? [1.0, 0.98] : head ? headDim : bodyDim;
  // Multi-cell parts reach a little past their cell so straight bodies show no gap; the head's face stays at z=.53.
  const D = one ? 0.98 : head ? 1.13 : 1.12;
  const zc = one || !head ? 0 : -0.035;
  return { W, H, D, zc, fz: one ? 0.49 : 0.53, bz: one ? -0.49 : -0.56, top: B0 + H };
}

function frameOf(type: AnimalType, i: number, n: number): Frame {
  const long = type === 'snake' || type === 'caterpillar' || type === 'dachshund' || type === 'crocodile';
  return frame(i, n,
    type === 'crocodile' ? [1.0, 0.8] : long ? [1.04, 1.0] : [1.04, 1.0],
    type === 'crocodile' ? [0.94, 0.74] : long ? [0.94, 0.88] : [0.94, 0.9]);
}

function buildPart(type: AnimalType, i: number, n: number): THREE.Group {
  const g = new THREE.Group();
  const head = i === 0;
  const last = i === n - 1;
  const f = frameOf(type, i, n);
  const { W, H, D, zc, fz, bz, top } = f;
  const yE = B0 + H * 0.55; // eye line
  const block = (c: number, r = 0.18): THREE.Mesh => cube(g, 0, B0 + H / 2, zc, W, H, D, c, r);
  /** Legs: one pair at the front of the head and one at the back of the tail; every segment for crawlers. */
  const legsAt = (c: number, every = false, x = 0.3, h = 0.32): void => {
    const zs = n === 1 || every ? [0.24, -0.24] : [head ? 0.24 : -0.24];
    if (!every && n > 1 && !head && !last) return;
    for (const sx of [-x, x]) for (const z of zs) leg(g, sx, z + zc, c, h);
  };

  switch (type) {
    case 'penguin': {
      const dark = 0x4b5263;
      block(dark);
      legsAt(0xf4a12c, false, 0.26, 0.24);
      if (head) {
        cube(g, 0, B0 + 0.42, fz - 0.005, 0.8, 0.68, 0.06, 0xf7f5f2, 0.22); // white face and chest
        eyes(g, fz + 0.025, yE, 0.21);
        cube(g, 0, B0 + 0.33, fz + 0.09, 0.22, 0.13, 0.16, 0xf5a128, 0.05); // beak
        for (const sx of [-1, 1]) cube(g, sx * (W / 2 - 0.02), B0 + 0.42, zc - 0.02, 0.11, 0.42, 0.38, 0x3e4453, 0.06).rotation.z = sx * 0.18; // flippers, against the body
        for (const [x, hh] of [[-0.1, 0.16], [0, 0.24], [0.1, 0.16]] as const) cube(g, x, top + hh / 2 - 0.02, zc - 0.08, 0.1, hh, 0.11, 0x3e4453, 0.04); // tuft
      }
      if (last) oval(g, 0, B0 + 0.22, bz + 0.05, 0.14, 0.13, 0.12, 0xbfcbdd); // pale tail puff (02)
      break;
    }
    case 'chick': {
      const yellow = 0xffcf3f;
      block(yellow);
      legsAt(0xf0952a, false, 0.25, 0.24);
      if (head) {
        eyes(g, fz, yE, 0.23);
        cube(g, 0, B0 + 0.4, fz + 0.07, 0.2, 0.14, 0.14, 0xf28c25, 0.05); // beak
        for (const sx of [-1, 1]) oval(g, sx * 0.36, B0 + 0.36, fz + 0.01, 0.1, 0.06, 0.02, 0xf6a39c); // blush
        for (const sx of [-1, 1]) cube(g, sx * (W / 2 - 0.02), B0 + 0.42, zc - 0.04, 0.12, 0.34, 0.36, 0xf7bc2a, 0.08); // wings
        cube(g, -0.05, top + 0.1, zc, 0.12, 0.22, 0.14, yellow, 0.05);
        cube(g, 0.08, top + 0.06, zc - 0.02, 0.12, 0.14, 0.14, yellow, 0.05); // head tuft
      }
      if (last) cube(g, 0, B0 + 0.5, bz + 0.04, 0.18, 0.16, 0.14, 0xf7bc2a, 0.06);
      break;
    }
    case 'parrot': {
      const red = 0xe5452d;
      block(red);
      legsAt(0x6a3a2a, false, 0.25, 0.24);
      if (head) {
        eyes(g, fz, yE + 0.04, 0.25);
        cube(g, 0, B0 + 0.42, fz + 0.1, 0.28, 0.26, 0.22, 0x50555f, 0.1); // hooked beak
        cube(g, 0, B0 + 0.3, fz + 0.12, 0.16, 0.12, 0.14, 0x50555f, 0.05);
        for (const sx of [-1, 1]) {
          cube(g, sx * (W / 2 - 0.02), B0 + 0.42, zc - 0.02, 0.12, 0.44, 0.44, 0x2a7fd1, 0.07); // wings
          cube(g, sx * (W / 2 + 0.0), B0 + 0.3, zc - 0.02, 0.1, 0.14, 0.42, 0xf5cf3e, 0.04);
        }
        for (const [x, hh] of [[-0.11, 0.2], [0, 0.32], [0.11, 0.2]] as const) cube(g, x, top + hh / 2 - 0.02, zc - 0.06, 0.11, hh, 0.12, 0xef5a3a, 0.05); // crest
      }
      if (last) for (const [x, c] of [[-0.08, 0x2a7fd1], [0.08, 0xf5cf3e]] as const) cube(g, x, B0 + 0.4, bz + 0.02, 0.12, 0.08, 0.44, c, 0.03).rotation.x = 1.15; // tail feathers raised
      break;
    }
    case 'cow': {
      const white = 0xf6f3f1;
      const black = 0x37343b;
      block(white);
      legsAt(white);
      if (head || last) for (const sx of [-0.3, 0.3]) for (const z of n === 1 ? [0.24, -0.24] : [head ? 0.24 : -0.24]) cube(g, sx, 0.05, z + zc, 0.31, 0.1, 0.31, black, 0.04); // hooves
      // irregular black patches: overlapping rounded plates on the top and the sides (09)
      const patch = (x: number, z: number, w: number, d: number, rot: number): void => { cube(g, x, top + 0.006, z + zc, w, 0.03, d, black, 0.06).rotation.y = rot; };
      const side = (sx: number, y: number, z: number, h: number, d: number): void => { cube(g, sx * (W / 2 + 0.006), y, z + zc, 0.03, h, d, black, 0.06); };
      if (head) {
        patch(0.24, -0.12, 0.34, 0.4, 0.3); patch(0.32, 0.08, 0.2, 0.22, -0.4);
        side(1, B0 + 0.62, -0.05, 0.36, 0.42);
        cube(g, 0.24, B0 + 0.7, fz - 0.002, 0.34, 0.4, 0.04, black, 0.1); // patch around one eye
        cube(g, 0, B0 + 0.24, fz + 0.05, 0.62, 0.32, 0.14, 0xf4a6a8, 0.12); // muzzle
        for (const sx of [-1, 1]) oval(g, sx * 0.13, B0 + 0.26, fz + 0.125, 0.05, 0.06, 0.02, 0xc06d77);
        eyes(g, fz + 0.03, yE + 0.04, 0.24);
        for (const sx of [-1, 1]) {
          cube(g, sx * (W / 2 - 0.04), top - 0.12, zc + 0.12, 0.22, 0.13, 0.17, black, 0.05); // ears
          cube(g, sx * 0.26, top + 0.1, zc + 0.14, 0.12, 0.22, 0.12, 0xe8c9a0, 0.04).rotation.z = -sx * 0.25; // horns
        }
      } else {
        patch(-0.2, 0.15, 0.4, 0.44, 0.4); patch(0.25, -0.2, 0.34, 0.36, -0.3); patch(-0.05, -0.38, 0.24, 0.18, 0.2);
        side(-1, B0 + 0.5, 0.1, 0.4, 0.5); side(1, B0 + 0.6, -0.15, 0.3, 0.36);
      }
      if (n === 1) { patch(-0.2, -0.2, 0.3, 0.3, 0.4); side(-1, B0 + 0.5, -0.1, 0.36, 0.4); }
      if (last) {
        cube(g, 0, B0 + 0.55, bz - 0.04, 0.07, 0.42, 0.07, white, 0.03).rotation.x = 0.15;
        cube(g, 0, B0 + 0.32, bz - 0.08, 0.12, 0.14, 0.12, black, 0.05);
      }
      break;
    }
    case 'pig': {
      const pink = 0xf6a5b9;
      block(pink);
      legsAt(0x8c4a5c);
      if (head) {
        cube(g, 0, B0 + 0.3, fz + 0.06, 0.42, 0.28, 0.16, 0xf28aa4, 0.11); // snout
        for (const sx of [-1, 1]) oval(g, sx * 0.09, B0 + 0.3, fz + 0.14, 0.04, 0.055, 0.02, 0xb85a72);
        eyes(g, fz, yE + 0.04, 0.24);
        for (const sx of [-1, 1]) cube(g, sx * 0.32, top + 0.03, zc + 0.18, 0.28, 0.08, 0.28, 0xf08aa2, 0.04).rotation.set(0.55, 0, -sx * 0.25); // ears folded forward
      } else {
        oval(g, W / 2 + 0.004, B0 + 0.55, 0.05, 0.02, 0.16, 0.2, 0xef93aa); // darker side spot
      }
      if (last) ring(g, 0, top - 0.06, bz + 0.06, 0.17, 0.055, 0xf08aa2).rotation.y = Math.PI / 3; // big curly tail loop
      break;
    }
    case 'fox': {
      const orange = 0xf08b37;
      const cream = 0xfaf3e6;
      block(orange);
      legsAt(0x5b3527);
      for (const sx of [-1, 1]) cube(g, sx * (W / 2 + 0.004), B0 + 0.12, zc, 0.03, 0.18, D - 0.3, cream, 0.06); // white belly line
      if (head) {
        for (const sx of [-1, 1]) cube(g, sx * 0.25, B0 + 0.24, fz - 0.003, 0.46, 0.38, 0.06, cream, 0.14); // cheeks
        cube(g, 0, B0 + 0.24, fz + 0.06, 0.28, 0.2, 0.14, cream, 0.07); // muzzle
        oval(g, 0, B0 + 0.33, fz + 0.14, 0.08, 0.06, 0.06, 0x2a2228);
        eyes(g, fz + 0.03, yE + 0.04, 0.24);
        for (const sx of [-1, 1]) {
          pyramid(g, sx * 0.29, top + 0.28, zc - 0.02, 0.37, 0.64, orange, -sx * 0.1); // big triangle ears
          pyramid(g, sx * 0.29, top + 0.22, zc + 0.13, 0.2, 0.42, cream, -sx * 0.1);
          pyramid(g, sx * 0.32, top + 0.54, zc - 0.02, 0.12, 0.17, 0x5b3527, -sx * 0.1); // dark tips
        }
      }
      if (last) {
        cube(g, 0, top + 0.08, bz + 0.22, 0.46, 0.62, 0.4, orange, 0.2).rotation.x = 0.25; // bushy tail, standing up over the back
        cube(g, 0, top + 0.44, bz + 0.15, 0.42, 0.24, 0.36, cream, 0.16).rotation.x = 0.25; // white tip
      }
      break;
    }
    case 'tiger': {
      const yellow = 0xf6b93a;
      const stripe = 0x8b572a;
      block(yellow);
      legsAt(yellow);
      // stripes run over the back and down both sides as one band
      const bands = head ? (n === 1 ? [-0.25] : [-0.32]) : [0.28, 0, -0.28];
      for (const z of bands) {
        cube(g, 0, top + 0.006, z + zc, W * 0.62, 0.03, 0.1, stripe, 0.02);
        for (const sx of [-1, 1]) cube(g, sx * (W / 2 + 0.006), top - 0.2, z + zc + 0.03, 0.03, 0.34, 0.1, stripe, 0.02);
      }
      if (head) {
        cube(g, 0, top + 0.006, zc + 0.12, 0.09, 0.03, 0.4, stripe, 0.02); // forehead mark (01)
        for (const z of [0.05, 0.2]) cube(g, 0, top + 0.006, zc + z, 0.34, 0.03, 0.07, stripe, 0.02);
        cube(g, 0, B0 + 0.26, fz + 0.03, 0.5, 0.3, 0.1, 0xfff0c8, 0.12); // muzzle
        oval(g, 0, B0 + 0.37, fz + 0.1, 0.1, 0.075, 0.06, 0x4a2d1c); // dark nose
        eyes(g, fz + 0.02, yE + 0.05, 0.24);
        for (const sx of [-1, 1]) {
          oval(g, sx * 0.34, top + 0.06, zc + 0.12, 0.17, 0.15, 0.1, stripe); // round ears
          oval(g, sx * 0.34, top + 0.05, zc + 0.2, 0.09, 0.08, 0.04, 0xfff0c8);
        }
      }
      if (last) {
        cube(g, 0, top - 0.04, bz + 0.16, 0.15, 0.15, 0.56, yellow, 0.06).rotation.x = 1.3; // tail up
        cube(g, 0, top + 0.06, bz + 0.13, 0.17, 0.17, 0.07, stripe, 0.03).rotation.x = 1.3;
        cube(g, 0, top + 0.24, bz + 0.09, 0.17, 0.17, 0.16, stripe, 0.06).rotation.x = 1.3;
      }
      break;
    }
    case 'husky': {
      const gray = 0x6d6c78;
      const white = 0xf6f6f6;
      block(gray);
      cube(g, 0, B0 + 0.19, zc, W + 0.008, 0.38, D - 0.03, white, 0.16); // white belly and flanks
      legsAt(white);
      if (head) {
        cube(g, 0, B0 + 0.4, fz - 0.004, 0.86, 0.6, 0.06, white, 0.2); // wide white face
        cube(g, 0, B0 + 0.78, fz - 0.003, 0.18, 0.3, 0.06, white, 0.06); // centre blaze
        cube(g, 0, B0 + 0.27, fz + 0.05, 0.3, 0.2, 0.12, white, 0.07);
        oval(g, 0, B0 + 0.35, fz + 0.12, 0.08, 0.06, 0.06, 0x24212a);
        eyes(g, fz + 0.03, yE + 0.04, 0.24);
        for (const sx of [-1, 1]) {
          pyramid(g, sx * 0.29, top + 0.26, zc - 0.02, 0.35, 0.6, gray, -sx * 0.1); // big pointed ears
          pyramid(g, sx * 0.29, top + 0.2, zc + 0.12, 0.19, 0.4, 0xd8d4dc, -sx * 0.1);
        }
        cube(g, 0, B0 + 0.08, fz - 0.02, W * 0.86, 0.09, 0.08, 0xd2403f, 0.03); // red collar
        oval(g, 0, B0 + 0.02, fz + 0.04, 0.07, 0.07, 0.06, 0xe9b33f); // bell
      }
      if (last) {
        cube(g, 0, top - 0.02, bz + 0.16, 0.26, 0.26, 0.5, gray, 0.1).rotation.x = 1.3; // curled tail
        cube(g, 0, top + 0.22, bz + 0.1, 0.28, 0.26, 0.24, white, 0.1).rotation.x = 1.5;
      }
      break;
    }
    case 'snake': {
      block(head ? 0x56b65a : 0x4cae50, 0.17);
      cube(g, 0, B0 + 0.1, zc, W + 0.008, 0.2, D - 0.04, 0xcbd85c, 0.08); // pale belly band
      if (!head) for (const z of [0.2, -0.2]) cube(g, 0, top + 0.006, z, 0.2, 0.03, 0.2, 0xd9e05a, 0.02).rotation.y = Math.PI / 4; // back diamonds
      if (head) {
        cube(g, 0, B0 + 0.24, fz + 0.03, 0.9, 0.3, 0.12, 0xcbd85c, 0.1); // light chin
        eyes(g, fz, yE + 0.12, 0.25, 1.05);
        for (const sx of [-1, 1]) oval(g, sx * 0.07, B0 + 0.48, fz + 0.02, 0.03, 0.025, 0.02, 0x2a2a2a);
        cube(g, 0, B0 + 0.2, fz + 0.04, 0.09, 0.04, 0.14, 0xe23d4c, 0.02); // tongue
        for (const sx of [-1, 1]) cube(g, sx * 0.05, B0 + 0.2, fz + 0.12, 0.05, 0.04, 0.08, 0xe23d4c, 0.015).rotation.y = sx * 0.4;
      }
      break;
    }
    case 'caterpillar': {
      block(head ? 0xf5899f : 0xf7a6ba, 0.22);
      legsAt(0xb85570, true, 0.28, 0.26);
      if (!head) {
        for (const [x, z] of [[-0.22, 0.2], [0.24, -0.1], [-0.05, -0.3]] as const) oval(g, x, top + 0.004, z, 0.1, 0.02, 0.1, 0xffd3de);
        for (const sx of [-1, 1]) oval(g, sx * (W / 2 + 0.004), B0 + 0.5, sx * 0.12, 0.02, 0.09, 0.09, 0xffd3de);
      }
      if (head) {
        eyes(g, fz, yE + 0.02, 0.24);
        oval(g, 0, B0 + 0.3, fz + 0.06, 0.12, 0.1, 0.1, 0xe33a52); // round nose
        for (const sx of [-1, 1]) {
          cube(g, sx * 0.2, top + 0.14, zc + 0.05, 0.08, 0.3, 0.08, 0xf07c95, 0.03).rotation.z = -sx * 0.2; // antennae
          oval(g, sx * 0.24, top + 0.3, zc + 0.05, 0.09, 0.09, 0.09, 0xe33a52);
        }
      }
      break;
    }
    case 'dachshund': {
      const brown = 0xa9663b;
      block(brown);
      legsAt(0x6b3f25, false, 0.3, 0.26);
      if (head) {
        cube(g, 0, B0 + 0.3, fz - 0.06, 0.52, 0.34, 0.28, 0xe7b06a, 0.13); // muzzle
        oval(g, 0, B0 + 0.42, fz + 0.09, 0.1, 0.08, 0.07, 0x2a2228);
        eyes(g, fz, yE + 0.06, 0.24);
        for (const sx of [-1, 1]) cube(g, sx * (W / 2 - 0.02), B0 + 0.44, zc + 0.05, 0.14, 0.64, 0.38, 0x6b3f25, 0.07).rotation.z = sx * 0.08; // long floppy ears
        cube(g, 0, B0 + 0.12, zc - 0.48, W + 0.02, 0.14, 0.14, 0x3466b0, 0.04); // blue collar
      }
      if (last) cube(g, 0, top - 0.04, bz + 0.16, 0.13, 0.13, 0.5, brown, 0.05).rotation.x = 1.25; // tail up
      break;
    }
    case 'crocodile': {
      const green = head ? 0x4caa58 : 0x45a554;
      block(green, 0.14);
      cube(g, 0, B0 + 0.09, zc, W + 0.008, 0.18, D - 0.04, 0xd6cf63, 0.07); // yellow belly
      // four short side legs in all: front pair at the back of the head block, hind pair at the front of the tail block
      const legZ = n === 1 ? [0.2, -0.2] : head ? [-0.2] : last ? [0.2] : [];
      for (const sx of [-1, 1]) for (const z of legZ) cube(g, sx * (W / 2 - 0.02), 0.12, z + zc, 0.22, 0.24, 0.26, 0x3b9248, 0.06);
      for (const sx of [-0.22, 0.22]) for (const z of head ? [-0.25] : [0.2, -0.2]) pyramid(g, sx, top + 0.08, z + zc, 0.1, 0.18, 0x2f8a40); // back spikes
      if (head) {
        cube(g, 0, B0 + 0.3, fz - 0.12, 0.84, 0.3, 0.4, green, 0.12); // upper jaw, kept inside its own cell
        cube(g, 0, B0 + 0.12, fz - 0.12, 0.82, 0.12, 0.38, 0xd6cf63, 0.05); // lower jaw
        for (const sx of [-1, 1]) for (const z of [-0.26, -0.16, -0.06, 0.04]) taper(g, sx * 0.4, B0 + 0.17, fz + z, 0.045, 0.12, 0xf8f1dc, Math.PI); // teeth
        for (const sx of [-1, 1]) oval(g, sx * 0.14, B0 + 0.46, fz + 0.07, 0.04, 0.03, 0.03, 0x2a6a34); // nostrils
        for (const sx of [-1, 1]) {
          oval(g, sx * 0.26, top + 0.06, zc + 0.25, 0.17, 0.16, 0.17, green); // eye bumps
          oval(g, sx * 0.26, top + 0.1, zc + 0.39, 0.13, 0.13, 0.03, WHITE);
          oval(g, sx * 0.26, top + 0.09, zc + 0.415, 0.08, 0.09, 0.02, PUPIL);
        }
      }
      if (last) cube(g, 0, B0 + 0.24, bz + 0.06, 0.4, 0.3, 0.26, green, 0.1); // tail stub
      break;
    }
  }
  return g;
}

/**
 * Direction-reading mockups, chosen on the dev server with ?look= (docs/verification/direction-mockups.md).
 * base: the shipped animals (with the floor V on one-cell animals). A: head features lean forward, plus a forelock.
 * D: wide head, narrow low tail. E: D plus a small darker fur mark on the crown pointing forward.
 * AD: the A head on every animal, in the body colour only (shape, not shade); 2-3 cell bodies taper like D; one-cell
 * animals keep their square body (no round rump that reads as a head) and get the bigger tail. A, D, E, AD drop the V.
 */
export type Look = 'base' | 'A' | 'D' | 'E' | 'AD';
let look: Look = 'base';
export function setLook(next: Look): void { look = next; }
/** One-cell comparison (?one=base): one-cell animals keep the shipped model while longer ones take the look. */
let oneCellBase = false;
export function setOneCellBase(on: boolean): void { oneCellBase = on; }
/** Crown comparison (?crown=1, with look AD): head-top features made clearer (crownBoost). */
let crownOn = false;
export function setCrown(on: boolean): void { crownOn = on; }
export const currentLook = (): Look => look;

const bodyColor = (g: THREE.Group): THREE.Color => ((g.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color;

/**
 * Look A: what sits on top of the head (ears, tufts, crests, horns, antennae) moves forward and leans well forward, and
 * every head gets a forelock that sweeps forward over the face, in the body colour. All of it stays inside the cell.
 */
function headForward(g: THREE.Group, f: Frame, shade = 0.9): void {
  for (const m of g.children.slice(1)) {
    if (m.userData.eye) continue;
    const p = m.position;
    // on top of the head and not already at the front (the crocodile's eye bumps) or at the back (a one-cell tail)
    if (p.y > f.top - 0.12 && p.z > f.zc - 0.2 && p.z < 0.2) { p.z += 0.2; m.rotation.x += 0.6; m.userData.crown = true; }
  }
  const c = bodyColor(g).clone().multiplyScalar(shade).getHex();
  // forelock: three rounded locks rising from the crown and tipping forward over the brow
  for (const [x, w, h] of [[-0.12, 0.16, 0.16], [0, 0.2, 0.22], [0.12, 0.16, 0.16]] as const) {
    const lock = cube(g, x, f.top + h / 2 - 0.03, f.fz - 0.14, w, h, 0.18, c, 0.06);
    lock.rotation.x = 0.7;
    lock.userData.crown = true;
  }
}

/**
 * ?crown=1 (dev comparison D2): each head's own top features say more clearly which way is front, seen from above.
 * Built from what the animal already has; nothing new is lit, outlined or pointed. Stays inside the cell.
 */
function crownBoost(g: THREE.Group, type: AnimalType, f: Frame): void {
  const crown = g.children.filter((m) => m.userData.crown);
  const grow = (k: number): void => { for (const m of crown) m.scale.multiplyScalar(k); };
  const mark = (m: THREE.Mesh): void => { m.userData.crown = true; };
  switch (type) {
    case 'chick':
      // the head tuft grows into a sprout curling forward, with a third lock at its front tip
      grow(1.4);
      mark(cube(g, 0, f.top + 0.16, f.fz - 0.06, 0.12, 0.16, 0.12, 0xffcf3f, 0.05));
      break;
    case 'parrot':
      // the crest grows and curls further forward
      grow(1.3);
      for (const m of crown) m.rotation.x += 0.25;
      break;
    case 'pig':
      // the folded ears grow and droop further over the brow
      grow(1.3);
      for (const m of crown) m.rotation.x += 0.2;
      break;
    case 'penguin':
      // its white face carries on over the front of the crown, so the front reads on the dark head; the tuft grows
      grow(1.25);
      mark(cube(g, 0, f.top + 0.004, f.fz - 0.15, 0.76, 0.035, 0.28, 0xf7f5f2, 0.04));
      break;
    case 'husky':
      // the white blaze runs on over the crown
      mark(cube(g, 0, f.top + 0.004, f.fz - 0.13, 0.22, 0.035, 0.26, 0xf6f6f6, 0.04));
      break;
    default:
      break;
  }
}

/** Look D, one-cell animals: a full, square head end and a lower, narrower, rounded rump; the tail bigger. */
function frontHeavy(g: THREE.Group, f: Frame): void {
  const main = g.children[0] as THREE.Mesh;
  main.scale.z = 0.62;
  main.position.z = f.zc + f.D * 0.19;
  oval(g, 0, B0 + f.H * 0.36, f.zc - f.D * 0.2, f.W * 0.36, f.H * 0.4, f.D * 0.3, bodyColor(g).getHex());
  biggerTail(g, f);
}

/** Tail parts 40% bigger. With keepBack the tail grows towards the body, so it reaches no further back than before. */
function biggerTail(g: THREE.Group, f: Frame, keepBack = false): void {
  g.updateMatrixWorld(true);
  for (const m of g.children.slice(1)) {
    if (m.position.z >= f.bz + 0.3 || m.position.y <= B0) continue;
    const back = new THREE.Box3().setFromObject(m).min.z;
    m.scale.multiplyScalar(1.4);
    if (!keepBack) continue;
    m.updateMatrixWorld(true);
    m.position.z += back - new THREE.Box3().setFromObject(m).min.z;
  }
}

/** Look E: a small fur mark on the crown, a shade darker than the body, pointing the way the animal faces. */
function crownMark(g: THREE.Group, f: Frame): void {
  const c = bodyColor(g).clone().multiplyScalar(0.72).getHex();
  for (const sx of [-1, 1]) cube(g, sx * 0.08, f.top + 0.004, f.zc + 0.08, 0.07, 0.025, 0.26, c, 0.02).rotation.y = -sx * 0.6;
}

/** One segment per occupied cell, head first; each root has exactly one animated child. */
/** Scale of every animal block inside its cell: neighbouring animals no longer overlap (eyes, snouts, ears). */
const FIT = 0.9;
/** Look D: width and height of each segment from head to tail, so the body narrows and lowers towards the tail. */
const TAPER: Record<number, Array<[number, number]>> = { 2: [[1, 1], [0.76, 0.8]], 3: [[1, 1], [0.88, 0.9], [0.74, 0.78]] };

export function buildAnimal(species: string, cells: number): THREE.Group[] {
  const type: AnimalType = BLOCK_SPECIES.includes(species as AnimalType) ? (species as AnimalType) : 'cow';
  const n = Math.max(1, Math.min(3, Math.floor(Number.isFinite(cells) ? cells : 1)));
  return Array.from({ length: n }, (_, i) => {
    const root = new THREE.Group();
    const animated = new THREE.Group();
    const part = buildPart(type, i, n);
    const f = frameOf(type, i, n);
    const look = n === 1 && oneCellBase ? 'base' : currentLook();
    if (look === 'A' && i === 0) headForward(part, f);
    if (look === 'AD' && i === 0) headForward(part, f, 1);
    if (look === 'AD' && crownOn && i === 0) crownBoost(part, type, f);
    if (look === 'AD' && i === n - 1) biggerTail(part, f, true);
    const shaped = look === 'D' || look === 'E';
    if (shaped && n === 1) frontHeavy(part, f);
    if (shaped && n > 1 && i === n - 1) biggerTail(part, f);
    if (look === 'E' && i === 0) crownMark(part, f);
    // a touch smaller than the cell so bulging eyes and snouts stay off the neighbouring animals
    part.scale.setScalar(FIT);
    if ((shaped || look === 'AD') && n > 1) part.scale.set(FIT * TAPER[n][i][0], FIT * TAPER[n][i][1], FIT);
    animated.add(part);
    root.add(animated);
    return root;
  });
}

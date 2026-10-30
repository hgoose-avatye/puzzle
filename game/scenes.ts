import * as THREE from 'three';
import type { Rng } from '../src/core/rng';
import type { Theme } from '../src/curve/curve';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, cone, cyl, geo, LIB, part, pyramid } from './scenery';

/**
 * Hand-laid stage scenes after docs/art-reference/03 and 04: the board is a paved plaza, a band of village life sits
 * above it (a cottage, a market stall, a path, a river with a bridge) and a garden band below it (fence, bench, dog
 * house, a dock on the water). Everything is placed on purpose around the board instead of scattered at random.
 *
 * Coordinates are world units: the board spans x in [-hw, hw] and z in [-hz, hz]; -z is the top of the screen.
 */
export interface SceneFrame {
  hw: number;
  hz: number;
  /** world positions of the exit gates with their outward direction; the area right outside them stays clear */
  gates: Array<{ p: THREE.Vector3; v: THREE.Vector3 }>;
}

const sphere = (): THREE.BufferGeometry => geo('sphere', () => new THREE.SphereGeometry(0.5, 14, 10));
/** Coarse shapes for the many small bits in a merged strip (sprouts, stems, slabs): a few hundred of them add up. */
const lowSphere = (): THREE.BufferGeometry => geo('sphere-low', () => new THREE.SphereGeometry(0.5, 7, 5));
const plainBox = (): THREE.BufferGeometry => geo('box-plain', () => new THREE.BoxGeometry(1, 1, 1));

/** Soft round tree from a few overlapping balls, as in the reference trees. */
function fluffyTree(rng: Rng, s = 1, tint = 0x79c654): THREE.Group {
  const g = new THREE.Group();
  part(g, cyl(), 0x8c5835, 0, 0.45 * s, 0, 0.26 * s, 0.9 * s, 0.26 * s);
  const shades = [tint, new THREE.Color(tint).offsetHSL(0, 0, 0.06).getHex(), new THREE.Color(tint).offsetHSL(0.02, 0, -0.06).getHex()];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng.next();
    const r = i === 0 ? 0 : 0.42 * s;
    part(g, sphere(), shades[i % 3], Math.cos(a) * r, (1.25 + (i === 0 ? 0.35 : rng.next() * 0.2)) * s, Math.sin(a) * r, 1.05 * s, 0.95 * s, 1.05 * s);
  }
  return g;
}

function bushClump(rng: Rng, flowers = true): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) part(g, sphere(), i ? 0x68bb48 : 0x76c752, (i - 1) * 0.32, 0.25 + rng.next() * 0.08, (rng.next() - 0.5) * 0.25, 0.62, 0.52, 0.6);
  if (flowers) for (let i = 0; i < 4; i++) part(g, sphere(), [0xffffff, 0xfff3a8, 0xffb3c7][rng.int(0, 2)], (rng.next() - 0.5) * 0.8, 0.5 + rng.next() * 0.12, (rng.next() - 0.5) * 0.35, 0.12, 0.12, 0.12);
  return g;
}

function cottage(): THREE.Group {
  const g = new THREE.Group();
  part(g, box(), 0xbeb4a3, 0, 0.12, 0, 2.9, 0.24, 2.3); // stone footing
  part(g, box(), 0xf8ead0, 0, 1.0, 0, 2.7, 1.6, 2.1);
  for (const x of [-1.33, 1.33]) part(g, box(), 0xa97645, x, 1.0, 1.06, 0.1, 1.6, 0.06); // timber corners
  part(g, box(), 0xa97645, 0, 1.78, 1.06, 2.7, 0.1, 0.06);
  for (const sz of [-1, 1]) part(g, box(), 0xdc623b, 0, 2.25, sz * 0.62, 3.1, 0.16, 1.5).rotation.x = sz * 0.62; // gable roof
  part(g, box(), 0xbc4c2b, 0, 2.7, 0, 3.15, 0.14, 0.18);
  part(g, box(), 0xaaa195, 0.8, 2.75, -0.35, 0.36, 0.9, 0.36); // chimney
  part(g, box(), 0x8c542f, -0.55, 0.62, 1.07, 0.56, 0.95, 0.06); // door, arch and step
  part(g, cyl(), 0x8c542f, -0.55, 1.08, 1.07, 0.56, 0.06, 0.56).rotation.x = Math.PI / 2;
  part(g, box(), 0xcac1b3, -0.55, 0.08, 1.35, 0.9, 0.16, 0.5);
  part(g, box(), 0x458ec9, 0.6, 1.05, 1.07, 0.7, 0.62, 0.05); // window, awning, flower box
  part(g, box(), 0xcde8f6, 0.6, 1.05, 1.1, 0.54, 0.46, 0.03, 0x3a5a70);
  for (let i = 0; i < 4; i++) part(g, box(), i % 2 ? 0xffffff : 0x458ec9, 0.33 + i * 0.18, 1.5, 1.24, 0.18, 0.04, 0.42).rotation.x = 0.45;
  part(g, box(), 0x9e602c, 0.6, 0.7, 1.16, 0.74, 0.14, 0.16);
  for (let i = 0; i < 4; i++) part(g, sphere(), [0xff8fab, 0xffffff, 0xffd166][i % 3], 0.36 + i * 0.16, 0.82, 1.17, 0.13, 0.13, 0.13);
  return g;
}

function marketStall(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.8, 0.8]) for (const z of [-0.4, 0.4]) part(g, box(), 0x9e6a3e, x, 0.75, z, 0.1, 1.5, 0.1);
  part(g, box(), 0xb87843, 0, 0.62, 0.05, 1.75, 0.12, 0.9);
  for (let i = 0; i < 8; i++) part(g, box(), i % 2 ? 0xffffff : 0x518dd9, -0.79 + i * 0.226, 1.55, 0.05, 0.226, 0.06, 1.2).rotation.x = -0.18;
  for (let c = 0; c < 3; c++) {
    const cx = -0.55 + c * 0.55;
    part(g, box(), 0xc38949, cx, 0.78, 0.15, 0.46, 0.2, 0.4);
    for (let i = 0; i < 5; i++) part(g, sphere(), [0xf48a00, 0xe63223, 0x8ad23d][c], cx + (rng.next() - 0.5) * 0.3, 0.92, 0.15 + (rng.next() - 0.5) * 0.25, 0.14, 0.14, 0.14);
  }
  part(g, box(), 0x3d3a36, 1.1, 0.4, 0.55, 0.42, 0.55, 0.05).rotation.x = -0.2; // chalkboard
  return g;
}

function lampPost(): THREE.Group {
  const g = new THREE.Group();
  part(g, cyl(), 0x2f3338, 0, 0.9, 0, 0.1, 1.8, 0.1);
  part(g, box(), 0x2f3338, 0, 1.85, 0, 0.32, 0.06, 0.32);
  part(g, box(), 0xffe2a0, 0, 2.05, 0, 0.24, 0.32, 0.24, 0xffb347);
  part(g, pyramid(), 0x2f3338, 0, 2.3, 0, 0.42, 0.2, 0.42).rotation.y = Math.PI / 4;
  return g;
}

function barrel(): THREE.Group {
  const g = new THREE.Group();
  part(g, cyl(), 0xab6e35, 0, 0.3, 0, 0.5, 0.6, 0.5);
  for (const y of [0.12, 0.48]) part(g, cyl(), 0x5c4a38, 0, y, 0, 0.52, 0.05, 0.52);
  return g;
}

function bench(): THREE.Group {
  const g = new THREE.Group();
  for (const z of [-0.1, 0.1]) part(g, box(), 0xb87843, 0, 0.4, z, 1.4, 0.06, 0.16);
  part(g, box(), 0xb87843, 0, 0.7, -0.24, 1.4, 0.3, 0.06).rotation.x = -0.15;
  for (const x of [-0.6, 0.6]) part(g, box(), 0x3c4a53, x, 0.22, 0, 0.08, 0.44, 0.5);
  return g;
}

function dogHouse(): THREE.Group {
  const g = new THREE.Group();
  part(g, box(), 0xcb9257, 0, 0.42, 0, 1.0, 0.84, 1.0);
  part(g, pyramid(), 0x457dc9, 0, 1.08, 0, 1.6, 0.6, 1.5).rotation.y = Math.PI / 4;
  part(g, box(), 0x3e291e, 0, 0.32, 0.5, 0.42, 0.5, 0.04);
  return g;
}

function fenceRun(from: THREE.Vector3, to: THREE.Vector3, skip: (p: THREE.Vector3) => boolean): THREE.Group {
  const g = new THREE.Group();
  const len = from.distanceTo(to);
  const n = Math.max(1, Math.round(len / 0.9));
  const dir = to.clone().sub(from).normalize();
  const angle = Math.atan2(dir.x, dir.z);
  for (let i = 0; i < n; i++) {
    const a = from.clone().addScaledVector(dir, (i / n) * len);
    const b = from.clone().addScaledVector(dir, ((i + 1) / n) * len);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    if (skip(mid)) continue;
    for (const p of [a, b]) part(g, box(), 0xa97645, p.x, 0.32, p.z, 0.12, 0.64, 0.12);
    for (const y of [0.22, 0.46]) part(g, box(), 0xcb9a67, mid.x, y, mid.z, 0.06, 0.08, len / n).rotation.y = angle;
  }
  return g;
}

function cobblePath(rng: Rng, x0: number, x1: number, z0: number, z1: number): THREE.Group {
  const g = new THREE.Group();
  for (let x = x0; x < x1; x += 0.42) {
    for (let z = z0; z < z1; z += 0.42) {
      const c = new THREE.Color(0xd0c4af).offsetHSL(0, 0, (rng.next() - 0.5) * 0.08).getHex();
      part(g, box(), c, x + (rng.next() - 0.5) * 0.06, 0.02, z + (rng.next() - 0.5) * 0.06, 0.38, 0.06, 0.38).castShadow = false;
    }
  }
  return g;
}

function water(x: number, z: number, w: number, d: number): THREE.Group {
  const g = new THREE.Group();
  part(g, box(), 0x52c9eb, x, -0.12, z, w, 0.08, d).castShadow = false;
  part(g, box(), 0x88ddf5, x, -0.1, z, w * 0.8, 0.06, d * 0.6).castShadow = false;
  return g;
}

function bridge(): THREE.Group {
  const g = new THREE.Group();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = -1.6 + t * 3.2;
    const y = 0.15 + Math.sin(t * Math.PI) * 0.55;
    part(g, box(), 0xb88347, x, y, 0, 0.36, 0.1, 1.2).rotation.z = Math.cos(t * Math.PI) * -0.5;
    for (const z of [-0.6, 0.6]) part(g, box(), 0x8c5835, x, y + 0.3, z, 0.1, 0.5, 0.08);
  }
  for (const z of [-0.6, 0.6]) for (let i = 0; i < n - 1; i++) {
    const t = (i + 0.5) / (n - 1);
    part(g, box(), 0xa97645, -1.6 + t * 3.2, 0.62 + Math.sin(t * Math.PI) * 0.55, z, 0.42, 0.06, 0.06).rotation.z = Math.cos(t * Math.PI) * -0.5;
  }
  for (const x of [-1.8, 1.8]) part(g, box(), 0xbeb4a3, x, 0.25, 0, 0.5, 0.5, 1.4);
  return g;
}

function dock(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) part(g, box(), 0xb88347, 0, 0.12, i * 0.36, 1.1, 0.08, 0.32);
  for (const x of [-0.55, 0.55]) for (const z of [0, 1.8]) part(g, cyl(), 0x8c5835, x, 0.1, z, 0.16, 0.6, 0.16);
  return g;
}

function boat(): THREE.Group {
  const g = new THREE.Group();
  part(g, box(), 0x9e602c, 0, 0.08, 0, 0.9, 0.36, 1.9);
  part(g, box(), 0xc38949, 0, 0.22, 0, 0.72, 0.1, 1.7);
  part(g, box(), 0xb87843, 0, 0.3, 0.2, 0.74, 0.06, 0.18);
  return g;
}

function flowerPatch(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) part(g, sphere(), [0xffffff, 0xfff3a8, 0xffb3c7, 0xc8a2ff][rng.int(0, 3)], (rng.next() - 0.5) * 1.0, 0.07, (rng.next() - 0.5) * 0.7, 0.12, 0.1, 0.12);
  return g;
}

/** The village plaza by the flower field (reference 03). */
// ---------- more set pieces for the other stages ----------

function barn(): THREE.Group {
  const g = new THREE.Group();
  part(g, box(), 0xc73b2c, 0, 0.95, 0, 2.4, 1.9, 2.0);
  for (const sz of [-1, 1]) part(g, box(), 0x6c4937, 0, 2.15, sz * 0.58, 2.6, 0.14, 1.4).rotation.x = sz * 0.7;
  part(g, box(), 0xf5eddf, 0, 0.75, 1.01, 1.0, 1.3, 0.04);
  for (const s of [-1, 1]) part(g, box(), 0xf5eddf, 0, 0.75, 1.03, 1.3, 0.08, 0.03).rotation.z = s * 0.9;
  return g;
}
function silo(): THREE.Group {
  const g = new THREE.Group();
  part(g, cyl(), 0xdad2c2, 0, 1.3, 0, 1.1, 2.6, 1.1);
  part(g, geo('dome', () => new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), 0x898f96, 0, 2.6, 0, 1.12, 0.9, 1.12);
  return g;
}
function fountain(): THREE.Group {
  const g = new THREE.Group();
  part(g, cyl(), 0xd0c4af, 0, 0.2, 0, 2.0, 0.4, 2.0);
  part(g, cyl(), 0x65d1f2, 0, 0.36, 0, 1.7, 0.08, 1.7, 0x1a5a70).castShadow = false;
  part(g, cyl(), 0xd0c4af, 0, 0.75, 0, 0.3, 1.0, 0.3);
  part(g, cyl(), 0xd0c4af, 0, 1.25, 0, 0.9, 0.14, 0.9);
  part(g, sphere(), 0x9ae4fa, 0, 1.45, 0, 0.3, 0.4, 0.3, 0x2a7090);
  return g;
}
function snowHouse(): THREE.Group {
  const g = LIB.house(0xead7bd, 0xffffff)(rngConst);
  part(g, box(), 0xffd27a, 0.35, 0.55, 0.51, 0.3, 0.3, 0.04, 0xffa53a);
  return g;
}
function pirateShip(): THREE.Group {
  const g = new THREE.Group();
  part(g, box(), 0x6d4322, 0, 0.35, 0, 1.6, 0.8, 4.0);
  part(g, box(), 0x8c5835, 0, 0.8, -1.4, 1.5, 0.5, 1.0);
  part(g, cyl(), 0x5c391d, 0, 2.0, 0.2, 0.12, 3.0, 0.12);
  part(g, box(), 0x2b2b2f, 0, 2.3, 0.25, 1.6, 1.3, 0.04);
  part(g, sphere(), 0xffffff, 0, 2.35, 0.28, 0.4, 0.4, 0.04);
  return g;
}
function cannon(): THREE.Group {
  const g = new THREE.Group();
  part(g, box(), 0x8c5835, 0, 0.18, 0, 0.6, 0.3, 0.8);
  part(g, cyl(), 0x33363b, 0, 0.42, 0.15, 0.26, 0.9, 0.26).rotation.x = Math.PI / 2 - 0.25;
  return g;
}
function rockPile(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) part(g, LIB_ball(), [0x8f8a86, 0xa29d97, 0x7d7873][i % 3], (rng.next() - 0.5) * 1.2, 0.3 + i * 0.12, (rng.next() - 0.5) * 0.8, 0.9 - i * 0.12, 0.7, 0.8);
  return g;
}
function caveArch(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-1.1, 1.1]) part(g, box(), 0x7d7873, x, 0.9, 0, 0.8, 1.8, 1.0);
  part(g, box(), 0x8f8a86, 0, 1.95, 0, 3.0, 0.6, 1.1);
  part(g, box(), 0x24201e, 0, 0.8, -0.1, 1.4, 1.6, 0.6);
  return g;
}
function cliffFalls(): THREE.Group {
  const g = new THREE.Group();
  part(g, box(), 0x7f8c68, 0, 1.2, 0, 4.5, 2.4, 1.6);
  part(g, box(), 0x4a9c44, 0, 2.45, 0, 4.6, 0.2, 1.7);
  part(g, box(), 0x89ddf8, 0.2, 1.2, 0.82, 1.2, 2.4, 0.06, 0x2a7090).castShadow = false;
  part(g, cyl(), 0x63c9eb, 0.2, -0.05, 1.6, 2.6, 0.06, 1.6).castShadow = false;
  return g;
}
function stepPyramid(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) part(g, box(), i % 2 ? 0xb8b29f : 0xaaa58e, 0, 0.3 + i * 0.6, 0, 3.4 - i * 0.75, 0.6, 3.4 - i * 0.75);
  part(g, box(), 0x4a9c44, 0.9, 0.62, 1.2, 0.6, 0.06, 0.5);
  return g;
}
function bigLeaf(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng.next();
    const l = part(g, box(), 0x379c45, Math.cos(a) * 0.4, 0.35, Math.sin(a) * 0.4, 0.9, 0.04, 0.4);
    l.rotation.set(0, -a, 0.5);
  }
  return g;
}
function scarecrow(): THREE.Group {
  const g = new THREE.Group();
  part(g, cyl(), 0x7c5131, 0, 0.8, 0, 0.08, 1.6, 0.08);
  part(g, box(), 0x7c5131, 0, 1.2, 0, 1.2, 0.07, 0.07);
  part(g, box(), 0x8f48b3, 0, 1.15, 0, 0.5, 0.5, 0.3);
  part(g, sphere(), 0xf4b44c, 0, 1.6, 0, 0.36, 0.36, 0.36);
  part(g, cone(), 0x3c3451, 0, 1.92, 0, 0.5, 0.4, 0.5);
  return g;
}
function castleWall(): THREE.Group {
  const g = new THREE.Group();
  part(g, box(), 0x6b6388, 0, 0.8, 0, 5.0, 1.6, 0.7);
  for (let i = 0; i < 6; i++) part(g, box(), 0x6b6388, -2.25 + i * 0.9, 1.75, 0, 0.45, 0.3, 0.7);
  for (const x of [-2.6, 2.6]) {
    part(g, cyl(), 0x5c5479, x, 1.3, 0, 1.2, 2.6, 1.2);
    part(g, cone(), 0x483b7c, x, 3.0, 0, 1.4, 1.0, 1.4);
    part(g, box(), 0xffd27a, x, 1.6, 0.6, 0.25, 0.35, 0.04, 0xffa53a);
  }
  part(g, box(), 0x2a2341, 0, 0.6, 0.36, 1.1, 1.2, 0.04);
  return g;
}
function xmasTree(): THREE.Group {
  const g = new THREE.Group();
  part(g, cyl(), 0x7c5131, 0, 0.25, 0, 0.3, 0.5, 0.3);
  for (let i = 0; i < 4; i++) part(g, cone(), 0x297c44, 0, 0.75 + i * 0.6, 0, 2.2 - i * 0.45, 0.9, 2.2 - i * 0.45);
  part(g, sphere(), 0xffd84a, 0, 3.15, 0, 0.35, 0.35, 0.35, 0xffb000);
  const baubles = [0xdc3b3b, 0xf6d260, 0x518dd9, 0xffffff];
  for (let i = 0; i < 10; i++) {
    const a = i * 2.2;
    const y = 0.7 + (i % 4) * 0.55;
    const r = (2.0 - (i % 4) * 0.45) / 2 - 0.05;
    part(g, sphere(), baubles[i % 4], Math.cos(a) * r, y, Math.sin(a) * r, 0.16, 0.16, 0.16, baubles[i % 4] === 0xffffff ? 0x888888 : 0);
  }
  return g;
}
function starfish(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) part(g, box(), [0xf6874b, 0xfbb15b][rng.int(0, 1)], 0, 0.03, 0, 0.08, 0.04, 0.32).rotation.y = (i / 5) * Math.PI * 2;
  return g;
}
function umbrella(): THREE.Group {
  const g = new THREE.Group();
  part(g, cyl(), 0xf5eddf, 0, 0.8, 0, 0.06, 1.6, 0.06);
  part(g, cone(), 0xec4d4d, 0, 1.6, 0, 1.6, 0.4, 1.6);
  part(g, box(), 0xfaf3e5, 0.5, 0.05, 0.6, 0.6, 0.06, 1.1);
  return g;
}
function sled(): THREE.Group {
  const g = new THREE.Group();
  part(g, box(), 0xc73b2c, 0, 0.22, 0, 0.6, 0.1, 1.1);
  for (const x of [-0.26, 0.26]) part(g, box(), 0x898f96, x, 0.08, 0, 0.05, 0.06, 1.2);
  return g;
}
const rngConst: Rng = { next: () => 0.5, int: (a: number) => a };
const LIB_ball = (): THREE.BufferGeometry => geo('ball', () => new THREE.IcosahedronGeometry(0.5, 1));

type Put = (o: THREE.Object3D, x: number, z: number, rot?: number) => void;

/** Shared frame for every composed scene: placement that keeps the space right outside each gate clear. */
function sceneKit(f: SceneFrame): { g: THREE.Group; put: Put; nearGate: (p: THREE.Vector3, r?: number) => boolean } {
  const g = new THREE.Group();
  const nearGate = (p: THREE.Vector3, r = 1.3): boolean => f.gates.some((gt) => {
    const d = p.clone().sub(gt.p);
    const along = d.dot(gt.v);
    return along > -0.6 && along < 1.6 && Math.abs(d.x * gt.v.z - d.z * gt.v.x) < r;
  });
  const put: Put = (o, x, z, rot = 0) => {
    if (nearGate(new THREE.Vector3(x, 0, z))) return;
    o.position.set(x, 0, z);
    o.rotation.y = rot;
    g.add(o);
  };
  return { g, put, nearGate };
}

/** A row of `make` along both sides of the board, off the gates. */
function sides(put: Put, f: SceneFrame, make: () => THREE.Object3D, step = 1.6, off = 1.05): void {
  for (let z = -f.hz + 0.5; z < f.hz; z += step) { put(make(), -f.hw - off, z); put(make(), f.hw + off, z + step / 2); }
}

type Scene = (f: SceneFrame, rng: Rng) => THREE.Group;

/** Village stage 2: a working farm. Barn, silo and hay behind crop rows; no fences by the board (the pen is this stage's obstacle). */
const farm: Scene = (f, rng) => {
  const { g, put, nearGate } = sceneKit(f);
  const { hw, hz } = f;
  put(barn(), -hw + 1.0, -hz - 3.2);
  put(silo(), 1.4, -hz - 3.4);
  for (const [x, z] of [[2.6, -hz - 2.2], [3.2, -hz - 2.8], [-0.4, -hz - 2.2]] as const) put(LIB.hay(rng), x, z, rng.next());
  g.add(cropRows(rng, -hw - 2, hw + 2, -hz - 1.6, 2, (p) => !nearGate(p, 0.9)));
  let k = 0;
  for (let z = -hz + 0.5; z < hz; z += 2.0) for (const x of [-hw - 1.1, hw + 1.1]) put(k++ % 2 ? LIB.hay(rng) : flowerPot(rng), x, z, rng.next());
  g.add(cropRows(rng, -hw - 2, hw + 2, hz + 1.3, 2, (p) => !nearGate(p, 0.9)));
  put(dogHouse(), -hw + 0.6, hz + 3.2, 0.3);
  for (const x of [-hw - 1.6, hw + 1.8]) put(fluffyTree(rng, 1.1), x, hz + 3.8);
  return g;
};

/** Village stage 3: the town square. A shop at the top centre between houses with the fountain on the paving in front, benches and pots; no crates (this stage's obstacle). */
const square: Scene = (f, rng) => {
  const { g, put } = sceneKit(f);
  const { hw, hz } = f;
  g.add(cobblePath(rng, -hw - 4, hw + 4, -hz - 2.4, -hz - 0.9));
  put(shopFront(0x5aa35a), 0.2, -hz - 3.4);
  put(cottage(), -hw - 1.4, -hz - 3.4);
  put(cottage(), hw + 1.8, -hz - 3.6);
  put(fountain(), 0.2, -hz - 1.9);
  for (const x of [-2.0, 2.4]) put(flowerPot(rng), x, -hz - 1.3);
  for (const x of [-hw - 0.3, hw + 0.3]) put(lampPost(), x, -hz - 1.4);
  let k = 0;
  for (let z = -hz + 0.5; z < hz; z += 1.9) for (const x of [-hw - 1.0, hw + 1.0]) put(k++ % 2 ? bench() : flowerPot(rng), x, z, Math.PI / 2);
  g.add(cobblePath(rng, -hw - 4, hw + 4, hz + 0.9, hz + 3.0));
  for (const x of [-hw + 1.0, hw - 1.0]) put(bench(), x, hz + 2.4);
  for (const x of [-1.6, 0.2, 2.0]) put(flowerPot(rng), x, hz + 1.4);
  return g;
};

/** Forest stage 2: the river. Water and a bridge behind reeds, a pond with a dock below; no rocks by the board (this stage's obstacle). */
const riverside: Scene = (f, rng) => {
  const { g, put, nearGate } = sceneKit(f);
  const { hw, hz } = f;
  g.add(water(0, -hz - 3.0, 2 * hw + 10, 2.4));
  put(bridge(), 0.6, -hz - 3.0, Math.PI / 2);
  g.add(reeds(rng, -hw - 3, hw + 3, -hz - 1.75, (p) => !nearGate(p, 0.9)));
  for (let x = -hw - 3; x < hw + 3; x += 1.8) put(LIB.pine(false)(rng), x, -hz - 5.0 + (rng.next() - 0.5) * 0.6);
  for (let z = -hz + 0.5; z < hz; z += 1.8) for (const x of [-hw - 1.2, hw + 1.2]) put(LIB.pine(false)(rng), x, z + (rng.next() - 0.5) * 0.4);
  g.add(water(hw + 2.0, hz + 3.2, 6, 4));
  put(dock(), hw - 0.2, hz + 1.6);
  put(boat(), hw + 1.6, hz + 2.8, 0.5);
  g.add(reeds(rng, hw - 2.4, hw + 1.0, hz + 1.1, (p) => !nearGate(p, 0.9)));
  for (const [x, z] of [[-hw - 0.8, hz + 2.2], [-hw + 1.2, hz + 3.4], [-0.6, hz + 2.8]] as const) put(LIB.pine(false)(rng), x, z);
  put(needles(rng), -hw + 0.6, hz + 1.8, rng.next() * 3);
  return g;
};

/** Forest stage 3: deep in the woods. A cabin with its woodpile, pines on every side, needles and mushroom clusters; no stumps (this stage's obstacle). */
const deepWoods: Scene = (f, rng) => {
  const { g, put } = sceneKit(f);
  const { hw, hz } = f;
  for (let i = 0; i < 8; i++) put(needles(rng), -hw - 2 + (i % 4) * ((2 * hw + 4) / 3), i < 4 ? -hz - 1.9 : hz + 2.0, rng.next() * 3);
  put(LIB.house(0x9e6a3e, 0x3b6f43)(rng), -hw + 1.2, -hz - 2.8, 0.2);
  put(woodpile(), -hw + 2.7, -hz - 2.4, -0.2);
  for (let x = -hw - 3; x < hw + 3; x += 1.2) if (x > -hw + 3.4 || x < -hw - 0.4) put(LIB.pine(false)(rng), x + (rng.next() - 0.5) * 0.4, -hz - 1.9 - rng.next() * 2.6);
  for (let z = -hz + 0.5; z < hz; z += 1.3) for (const x of [-hw - 1.2, hw + 1.2]) put(LIB.pine(false)(rng), x, z + (rng.next() - 0.5) * 0.3);
  for (let x = -hw - 3; x < hw + 3; x += 1.1) put(rng.next() < 0.35 ? mushrooms(rng) : LIB.pine(false)(rng), x + (rng.next() - 0.5) * 0.4, hz + 2.0 + rng.next() * 2.0);
  return g;
};

const beach: Scene = (f, rng) => {
  const { g, put } = sceneKit(f);
  const { hw, hz } = f;
  for (const [x, z] of [[-hw - 0.6, -hz - 1.6], [hw + 0.4, -hz - 1.8], [-0.4, -hz - 2.2], [2.0, -hz - 1.5]] as const) put(LIB.palm(rng), x, z, rng.next() * 6);
  put(umbrella(), -hw + 1.8, -hz - 1.5);
  for (let i = 0; i < 5; i++) put(starfish(rng), -hw + i * 1.6, -hz - 0.9 + rng.next() * 0.3, rng.next() * 6);
  sides(put, f, () => (rng.next() < 0.5 ? LIB.shell(rng) : LIB.palm(rng)), 2.0, 1.3);
  for (const [x, z] of [[-hw + 0.4, hz + 1.6], [hw - 0.6, hz + 1.5]] as const) put(LIB.palm(rng), x, z, rng.next() * 6);
  put(umbrella(), 0.6, hz + 1.5);
  for (let i = 0; i < 4; i++) put(LIB.shell(rng), -hw + 1 + i * 2, hz + 1.0);
  put(boat(), hw + 2.0, hz + 3.4, 0.6);
  return g;
};

const harbour: Scene = (f, rng) => {
  const { g, put } = sceneKit(f);
  const { hw, hz } = f;
  put(pirateShip(), hw + 2.6, -hz - 2.4, 0.3);
  put(dock(), hw + 0.4, -hz - 2.0, Math.PI / 2);
  for (const [x, z] of [[-hw + 0.4, -hz - 1.6], [-hw + 1.2, -hz - 1.9], [0.4, -hz - 1.6]] as const) put(barrel(), x, z);
  for (const [x, z] of [[-1.0, -hz - 1.7], [1.6, -hz - 1.8]] as const) put(LIB.crate(rng), x, z, rng.next());
  put(cannon(), -hw - 0.6, -hz - 1.4, 0.4);
  put(LIB.palm(rng), -hw - 1.2, -hz - 2.6);
  sides(put, f, () => (rng.next() < 0.5 ? barrel() : LIB.crate(rng)), 2.4, 1.2);
  put(dock(), -hw + 1.0, hz + 1.2);
  put(boat(), -hw + 1.4, hz + 3.6, -0.3);
  for (const [x, z] of [[1.0, hz + 1.6], [1.8, hz + 1.9]] as const) put(barrel(), x, z);
  put(cannon(), hw - 0.6, hz + 1.5, Math.PI);
  return g;
};

const treasureCave: Scene = (f, rng) => {
  const { g, put } = sceneKit(f);
  const { hw, hz } = f;
  put(caveArch(), 0, -hz - 2.8);
  for (const x of [-hw - 0.6, -2.2, 2.4, hw + 1.0]) put(rockPile(rng), x, -hz - 2.0 - rng.next());
  for (const [x, z] of [[-1.4, -hz - 1.5], [1.4, -hz - 1.6]] as const) put(LIB.lantern(rng), x, z);
  put(LIB.chest(rng), 0.9, -hz - 1.4, -0.3);
  sides(put, f, () => rockPile(rng), 2.0, 1.3);
  for (const [x, z] of [[-hw + 0.8, hz + 1.6], [hw - 0.8, hz + 1.8]] as const) put(LIB.chest(rng), x, z, rng.next());
  for (const x of [-0.6, 1.4]) put(rockPile(rng), x, hz + 2.2);
  put(LIB.palm(rng), -hw - 1.0, hz + 2.4);
  return g;
};

/** Jungle stage 2: the waterfall. Cliff and falls behind vine trees, a lily pool below, undergrowth all round; no rocks (this stage's obstacle). */
const waterfall: Scene = (f, rng) => {
  const { g, put, nearGate } = sceneKit(f);
  const { hw, hz } = f;
  put(cliffFalls(), 0.4, -hz - 3.4);
  g.add(vineTrees(rng, [-hw - 1.2, -hw + 0.2, hw + 1.6, hw + 0.4].filter((x) => !nearGate(new THREE.Vector3(x, 0, -hz - 2.4))), () => -hz - 2.4));
  g.add(undergrowth(rng, -hw - 1.5, hw + 1.5, -hz - 1.5, (p) => !nearGate(p) && Math.abs(p.x - 0.6) > 1.4));
  let k = 0;
  for (let z = -hz + 0.5; z < hz; z += 1.5) for (const x of [-hw - 0.9, hw + 0.9]) put(k++ % 2 ? LIB.flowers(rng) : bigLeaf(rng), x, z);
  g.add(water(hw + 0.4, hz + 2.6, 4.4, 3));
  g.add(lilyPads(rng, hw - 1.4, hw + 2.0, hz + 1.6, hz + 3.6));
  g.add(undergrowth(rng, -hw - 1.5, hw - 2.2, hz + 1.4, (p) => !nearGate(p)));
  g.add(vineTrees(rng, [-hw - 0.4, -0.8].filter((x) => !nearGate(new THREE.Vector3(x, 0, hz + 3.0))), () => hz + 3.0, false));
  return g;
};

/** Jungle stage 3: the old temple. Step pyramid on a stone terrace, vine trees around; no pillars or ruin stacks by the board (this stage's obstacle). */
const ruins: Scene = (f, rng) => {
  const { g, put, nearGate } = sceneKit(f);
  const { hw, hz } = f;
  put(stepPyramid(), 0.4, -hz - 3.4);
  g.add(stoneTerrace(-hw - 1.5, hw + 1.5, -hz - 2.2, (p) => !nearGate(p, 0.9)));
  g.add(vineTrees(rng, [-hw - 1.6, -hw - 0.2, hw + 0.8, hw + 2.0].filter((x) => !nearGate(new THREE.Vector3(x, 0, -hz - 2.8))), () => -hz - 2.8));
  let k = 0;
  for (let z = -hz + 0.5; z < hz; z += 1.6) for (const x of [-hw - 0.9, hw + 0.9]) put(k++ % 2 ? LIB.flowers(rng) : bigLeaf(rng), x, z);
  g.add(stoneTerrace(-hw - 1.5, hw + 1.5, hz + 1.5, (p) => !nearGate(p, 0.9)));
  g.add(undergrowth(rng, -hw - 1.5, hw + 1.5, hz + 2.6, (p) => !nearGate(p)));
  g.add(vineTrees(rng, [-hw - 1.0, 0.4, hw + 1.0].filter((x) => !nearGate(new THREE.Vector3(x, 0, hz + 3.6))), () => hz + 3.6, false));
  return g;
};

const pumpkinPatch: Scene = (f, rng) => {
  const { g, put, nearGate } = sceneKit(f);
  const { hw, hz } = f;
  put(scarecrow(), -0.6, -hz - 2.4);
  for (let x = -hw - 2; x < hw + 2; x += 0.9) for (const z of [-hz - 1.4, -hz - 3.4]) put(LIB.pumpkin(rng), x + (rng.next() - 0.5) * 0.3, z + (rng.next() - 0.5) * 0.4, rng.next() * 6);
  for (const x of [-hw - 1.6, hw + 1.6]) put(LIB.deadTree(rng), x, -hz - 2.6);
  sides(put, f, () => (rng.next() < 0.6 ? LIB.pumpkin(rng) : LIB.lantern(rng)), 1.6, 1.1);
  g.add(fenceRun(new THREE.Vector3(-hw - 2, 0, hz + 1.0), new THREE.Vector3(hw + 2, 0, hz + 1.0), (p) => nearGate(p, 0.9)));
  for (let x = -hw; x < hw; x += 1.0) put(LIB.pumpkin(rng), x, hz + 2.0 + rng.next() * 0.6, rng.next() * 6);
  put(LIB.deadTree(rng), 0.4, hz + 3.6);
  return g;
};

const graveyard: Scene = (f, rng) => {
  const { g, put } = sceneKit(f);
  const { hw, hz } = f;
  for (let x = -hw - 1; x < hw + 1.5; x += 1.1) for (const z of [-hz - 1.5, -hz - 2.9]) put(LIB.grave(rng), x + (rng.next() - 0.5) * 0.2, z, (rng.next() - 0.5) * 0.3);
  for (const x of [-hw - 1.8, hw + 2.0]) put(LIB.deadTree(rng), x, -hz - 2.4);
  put(LIB.ghostLight(rng), 0.4, -hz - 3.8);
  sides(put, f, () => (rng.next() < 0.5 ? LIB.lantern(rng) : LIB.grave(rng)), 1.8, 1.1);
  for (let x = -hw; x < hw; x += 1.3) put(LIB.grave(rng), x, hz + 1.7, (rng.next() - 0.5) * 0.3);
  put(LIB.ghostLight(rng), hw - 0.8, hz + 3.0);
  put(LIB.deadTree(rng), -hw + 0.4, hz + 3.2);
  return g;
};

const castleYard: Scene = (f, rng) => {
  const { g, put } = sceneKit(f);
  const { hw, hz } = f;
  put(castleWall(), 0, -hz - 2.8);
  for (const x of [-hw - 0.2, hw + 0.2]) put(LIB.lantern(rng), x, -hz - 1.3);
  sides(put, f, () => (rng.next() < 0.5 ? LIB.stoneWall(rng) : LIB.lantern(rng)), 2.0, 1.1);
  for (let x = -hw; x < hw; x += 1.5) put(LIB.stoneWall(rng), x, hz + 1.4);
  for (const x of [-hw - 1.0, hw + 1.0]) put(LIB.deadTree(rng), x, hz + 2.8);
  put(LIB.ghostLight(rng), 0.2, hz + 3.0);
  return g;
};

const snowVillage: Scene = (f, rng) => {
  const { g, put } = sceneKit(f);
  const { hw, hz } = f;
  put(snowHouse(), -hw + 1.0, -hz - 2.8);
  put(snowHouse(), hw - 1.0, -hz - 3.2);
  put(lampPost(), 0.2, -hz - 1.6);
  for (const x of [-hw - 1.8, 0.0, hw + 2.0]) put(LIB.pine(true)(rng), x, -hz - 4.4);
  sides(put, f, () => (rng.next() < 0.5 ? LIB.pine(true)(rng) : LIB.snowPile(rng)), 1.8, 1.2);
  put(LIB.snowman(rng), -hw + 1.0, hz + 1.8);
  put(lampPost(), hw - 0.4, hz + 1.6);
  for (const x of [-hw - 0.6, 0.4, hw + 1.2]) put(LIB.pine(true)(rng), x, hz + 3.2);
  return g;
};

const iceLake: Scene = (f, rng) => {
  const { g, put } = sceneKit(f);
  const { hw, hz } = f;
  const ice = new THREE.Group();
  part(ice, box(), 0xcdeaf8, 0, -0.06, -hz - 3.2, 2 * hw + 6, 0.06, 3.4).castShadow = false;
  g.add(ice);
  for (let x = -hw - 2; x < hw + 2; x += 1.6) put(LIB.iceBlock(rng), x + (rng.next() - 0.5) * 0.6, -hz - 1.4);
  put(sled(), 1.2, -hz - 3.0, 0.6);
  for (let x = -hw - 3; x < hw + 3; x += 2.0) put(LIB.pine(true)(rng), x, -hz - 5.4);
  sides(put, f, () => (rng.next() < 0.5 ? LIB.iceBlock(rng) : LIB.snowPile(rng)), 1.9, 1.2);
  for (const x of [-hw + 0.4, 1.2]) put(LIB.snowPile(rng), x, hz + 1.6);
  put(LIB.snowman(rng), hw - 0.8, hz + 1.8);
  for (const x of [-hw - 1.0, -0.6, hw + 1.4]) put(LIB.pine(true)(rng), x, hz + 3.4);
  return g;
};

const xmasSquare: Scene = (f, rng) => {
  const { g, put } = sceneKit(f);
  const { hw, hz } = f;
  put(xmasTree(), 0.3, -hz - 2.8);
  for (const [x, z] of [[-1.2, -hz - 1.5], [1.6, -hz - 1.6], [-0.4, -hz - 1.3]] as const) put(LIB.gift(rng), x, z, rng.next());
  put(snowHouse(), -hw + 0.6, -hz - 3.0);
  put(snowHouse(), hw - 0.4, -hz - 3.4);
  sides(put, f, () => (rng.next() < 0.5 ? LIB.gift(rng) : LIB.pine(true)(rng)), 1.9, 1.2);
  put(LIB.snowman(rng), -hw + 1.0, hz + 1.8);
  put(LIB.snowman(rng), hw - 1.0, hz + 1.9);
  put(lampPost(), 0, hz + 1.7);
  for (const x of [-hw - 0.6, 0.8, hw + 1.2]) put(LIB.pine(true)(rng), x, hz + 3.4);
  return g;
};


// ---------- theme pieces: each region's own props, shared by its three stage scenes ----------
// Rule for every scene: the props right beside the board (the side columns and the strips along its edges) never use
// the model of a board obstacle (OBSTACLES in scenery.ts) and nothing there looks like an exit gate.

/**
 * One mesh per material for a prop built from many small parts (leaves, vines): far fewer draw calls. The merged
 * geometry belongs to this mesh (freed with the board); the materials stay the shared, cached ones.
 */
function mergeProp(g: THREE.Group): THREE.Group {
  g.updateMatrixWorld(true);
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const inverse = new THREE.Matrix4().copy(g.matrixWorld).invert();
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geom = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, m.matrixWorld));
    for (const name of Object.keys(geom.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geom.deleteAttribute(name);
    const mat = m.material as THREE.Material;
    byMaterial.set(mat, [...(byMaterial.get(mat) ?? []), geom]);
  });
  const out = new THREE.Group();
  for (const [mat, list] of byMaterial) {
    const mesh = new THREE.Mesh(mergeGeometries(list), mat);
    for (const gg of list) gg.dispose();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.ownGeometry = true;
    out.add(mesh);
  }
  return out;
}

/** Village: a shop front with a striped awning (a cottage with a canopy), so the top band reads as a street. */
function shopFront(awning: number): THREE.Group {
  const g = cottage();
  for (let i = 0; i < 5; i++) part(g, box(), i % 2 ? 0xffffff : awning, -1.0 + i * 0.5, 1.55, 1.25, 0.5, 0.08, 0.6).rotation.x = 0.35;
  return g;
}
/** Village: a round terracotta pot of flowers for the plaza edges (unlike the square planter the village uses as an obstacle). */
function flowerPot(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  part(g, cyl(), 0xc8653a, 0, 0.16, 0, 0.36, 0.32, 0.36);
  for (let i = 0; i < 3; i++) part(g, sphere(), [0xff8fab, 0xffd166, 0xffffff][rng.int(0, 2)], (i - 1) * 0.1, 0.38, (rng.next() - 0.5) * 0.12, 0.16, 0.16, 0.16);
  return g;
}
/** Forest: a low split-rail fence of dark wood (thin rails, not the round log the forest uses as an obstacle). */
function railFence(from: THREE.Vector3, to: THREE.Vector3, skip: (p: THREE.Vector3) => boolean): THREE.Group {
  const g = new THREE.Group();
  const len = from.distanceTo(to);
  const n = Math.max(1, Math.round(len / 1.2));
  const dir = to.clone().sub(from).normalize();
  const angle = Math.atan2(dir.x, dir.z);
  for (let i = 0; i < n; i++) {
    const a = from.clone().addScaledVector(dir, (i / n) * len);
    const b = from.clone().addScaledVector(dir, ((i + 1) / n) * len);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    if (skip(mid)) continue;
    part(g, cyl(), 0x6a4426, a.x, 0.25, a.z, 0.12, 0.5, 0.12);
    for (const y of [0.18, 0.38]) part(g, cyl(), 0x8a5a33, mid.x, y, mid.z, 0.09, len / n, 0.09).rotation.set(Math.PI / 2, angle, 0, 'YXZ');
  }
  return mergeProp(g);
}
/** Forest: a pyramid of cut logs, kept well away from the board (a single log is the forest's obstacle). */
function woodpile(): THREE.Group {
  const g = new THREE.Group();
  for (const [x, y] of [[-0.2, 0.12], [0.05, 0.12], [0.3, 0.12], [-0.08, 0.33], [0.18, 0.33]] as const) {
    part(g, cyl(), 0x8a5a33, x, y, 0, 0.22, 0.8, 0.22).rotation.x = Math.PI / 2;
    part(g, cyl(), 0xe2c08e, x, y, 0.41, 0.18, 0.02, 0.18).rotation.x = Math.PI / 2;
  }
  return mergeProp(g);
}
/** Forest: a flat patch of fallen needles on the grass. */
function needles(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  part(g, cyl(), 0xa8763f, 0, 0.005, 0, 1.2 + rng.next() * 0.6, 0.01, 0.9 + rng.next() * 0.5).castShadow = false;
  return g;
}
/** Jungle: a moss-covered stone head, the ruin people come to find (a block, not an arch: arches read as exits). */
function stoneHead(): THREE.Group {
  const g = new THREE.Group();
  part(g, box(), 0xa9a48f, 0, 0.75, 0, 1.2, 1.5, 0.9);
  part(g, box(), 0x8d8873, 0, 0.95, 0.46, 0.8, 0.12, 0.05);
  part(g, box(), 0x8d8873, 0, 0.45, 0.46, 0.5, 0.1, 0.05);
  for (const x of [-0.25, 0.25]) part(g, box(), 0x6f6a58, x, 0.95, 0.47, 0.18, 0.1, 0.04);
  part(g, sphere(), 0x3f9a46, -0.3, 1.5, 0.1, 0.6, 0.25, 0.5);
  part(g, sphere(), 0x3f9a46, 0.4, 1.2, 0.35, 0.3, 0.2, 0.25);
  return mergeProp(g);
}
/** Jungle: a row of jungle trees hung with vines, merged into a handful of meshes. */
function vineTrees(rng: Rng, xs: number[], z: (x: number) => number, vines = true): THREE.Group {
  const g = new THREE.Group();
  for (const x of xs) {
    const t = LIB.jungleTree(rng);
    t.position.set(x, 0, z(x));
    g.add(t);
    if (!vines) continue;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rng.next();
      part(g, box(), 0x4fae4a, x + Math.cos(a) * 0.7, 0.95, z(x) + Math.sin(a) * 0.7, 0.09, 1.1 + rng.next() * 0.3, 0.09);
    }
  }
  return mergeProp(g);
}
/** Jungle: dense low undergrowth of big leaves along a strip (under 0.5 high, so it hides nothing on the board). */
function undergrowth(rng: Rng, x0: number, x1: number, z: number, keep: (p: THREE.Vector3) => boolean): THREE.Group {
  const g = new THREE.Group();
  const leaf = (x: number, zz: number): void => {
    if (!keep(new THREE.Vector3(x, 0, zz))) return;
    const l = bigLeaf(rng);
    l.position.set(x, 0, zz);
    l.rotation.y = rng.next() * 6;
    g.add(l);
  };
  for (let x = x0; x < x1; x += 0.8) leaf(x + (rng.next() - 0.5) * 0.3, z + (rng.next() - 0.5) * 0.5);
  for (let x = x0 + 0.4; x < x1; x += 1.1) leaf(x, z + 0.9);
  return mergeProp(g);
}

/**
 * Village stage 1: a street. Paved square with a shop in the middle of the top band (the HUD covers both top corners
 * on short phones), market stalls either side, lamps and flower pots.
 */
const villageStreet: Scene = (f, rng) => {
  const { g, put } = sceneKit(f);
  const { hw, hz } = f;
  g.add(cobblePath(rng, -hw - 4, hw + 4, -hz - 2.2, -hz - 0.85));
  put(shopFront(0xd9634c), 0.2, -hz - 2.7);
  for (const x of [-hw + 0.9, hw - 0.5]) put(marketStall(rng), x, -hz - 2.1);
  put(shopFront(0x4f8fc6), -hw - 2.6, -hz - 2.9);
  for (const x of [-hw - 0.4, hw + 0.4]) put(lampPost(), x, -hz - 1.3);
  for (const x of [-1.7, 1.9]) put(flowerPot(rng), x, -hz - 1.25);
  let k = 0;
  for (let z = -hz + 0.5; z < hz; z += 1.8) for (const x of [-hw - 1.0, hw + 1.0]) put(k++ % 2 ? flowerPot(rng) : lampPost(), x, z);
  g.add(cobblePath(rng, -hw - 4, hw + 4, hz + 0.9, hz + 2.6));
  for (const x of [-hw + 1.2, hw - 1.2]) put(bench(), x, hz + 1.9);
  for (const x of [-hw - 0.4, 0.4, hw + 0.6]) put(flowerPot(rng), x, hz + 2.1);
  return g;
};

/** Forest stage 1: a camp in the pines. Tents and fire behind a rail fence, a dark wall of pines, woodpiles off to the side. */
const campsite: Scene = (f, rng) => {
  const { g, put, nearGate } = sceneKit(f);
  const { hw, hz } = f;
  for (let i = 0; i < 6; i++) put(needles(rng), -hw - 1.5 + i * ((2 * hw + 3) / 5), i % 2 ? -hz - 2.0 : hz + 2.2, rng.next() * 3);
  put(LIB.tent(rng), -hw + 1.0, -hz - 2.6, 0.3);
  put(LIB.tent(rng), 1.6, -hz - 2.9, -0.4);
  put(LIB.campfire(rng), -0.6, -hz - 2.2);
  put(woodpile(), hw + 1.0, -hz - 2.4, -0.4);
  for (let x = -hw - 3; x < hw + 3; x += 1.1) put(LIB.pine(false)(rng), x + (rng.next() - 0.5) * 0.3, -hz - 4.2 - rng.next() * 0.8);
  g.add(railFence(new THREE.Vector3(-hw - 1.0, 0, -hz - 0.95), new THREE.Vector3(hw + 1.0, 0, -hz - 0.95), (p) => nearGate(p, 0.9)));
  let k = 0;
  for (let z = -hz + 0.5; z < hz; z += 1.6) for (const x of [-hw - 1.2, hw + 1.2]) put(k++ % 3 ? LIB.pine(false)(rng) : LIB.mushroom(rng), x, z + (rng.next() - 0.5) * 0.4);
  g.add(railFence(new THREE.Vector3(-hw - 1.0, 0, hz + 0.95), new THREE.Vector3(hw + 1.0, 0, hz + 0.95), (p) => nearGate(p, 0.9)));
  put(woodpile(), -hw + 0.8, hz + 2.4, 0.2);
  put(LIB.mushroom(rng), 0.6, hz + 2.3);
  for (const x of [-hw - 2.0, hw + 2.2]) put(LIB.pine(false)(rng), x, hz + 3.2);
  return g;
};

/** Jungle stage 1: into the jungle. A stone head before vine-hung canopy, leaves and flowers at the sides, dense undergrowth below. */
const jungleEntrance: Scene = (f, rng) => {
  const { g, put, nearGate } = sceneKit(f);
  const { hw, hz } = f;
  const head = stoneHead();
  head.scale.setScalar(1.35);
  put(head, 0.3, -hz - 1.9);
  for (const x of [-1.5, 2.1]) put(LIB.ruin(rng), x, -hz - 2.2);
  const front: number[] = [];
  for (let x = -hw - 3; x < hw + 3; x += 1.2) if (Math.abs(x - 0.3) > 1.2 && !nearGate(new THREE.Vector3(x, 0, -hz - 2.9))) front.push(x + (rng.next() - 0.5) * 0.4);
  g.add(vineTrees(rng, front, () => -hz - 2.9 - rng.next() * 0.5));
  const back: number[] = [];
  for (let x = -hw - 2.4; x < hw + 3; x += 1.5) back.push(x);
  g.add(vineTrees(rng, back, () => -hz - 4.4, false));
  let k = 0;
  for (let z = -hz + 0.5; z < hz; z += 1.5) for (const x of [-hw - 0.9, hw + 0.9]) put(k++ % 2 ? LIB.flowers(rng) : bigLeaf(rng), x, z);
  g.add(undergrowth(rng, -hw - 1.5, hw + 1.5, hz + 1.4, (p) => !nearGate(p)));
  g.add(vineTrees(rng, [-hw, 0.6, hw + 0.5].filter((x) => !nearGate(new THREE.Vector3(x, 0, hz + 3.4))), () => hz + 3.4));
  return g;
};

/** Village: rows of tilled soil with sprouts, low (one merged mesh per material). */
function cropRows(rng: Rng, x0: number, x1: number, z: number, rows: number, keep: (p: THREE.Vector3) => boolean): THREE.Group {
  const g = new THREE.Group();
  for (let r = 0; r < rows; r++) for (let x = x0; x < x1; x += 0.9) {
    const zz = z + r * 0.55;
    if (!keep(new THREE.Vector3(x + 0.45, 0, zz))) continue;
    part(g, plainBox(), 0x9a6a43, x + 0.45, 0.04, zz, 0.85, 0.08, 0.32).castShadow = false;
    for (const dx of [0.2, 0.45, 0.7]) part(g, lowSphere(), 0x6cc04a, x + dx, 0.13, zz + (rng.next() - 0.5) * 0.06, 0.16, 0.14, 0.16);
  }
  return mergeProp(g);
}
/** Forest: a strip of reeds along a bank (thin stems, one merged mesh). */
function reeds(rng: Rng, x0: number, x1: number, z: number, keep: (p: THREE.Vector3) => boolean): THREE.Group {
  const g = new THREE.Group();
  for (let x = x0; x < x1; x += 0.35) {
    const zz = z + (rng.next() - 0.5) * 0.4;
    if (!keep(new THREE.Vector3(x, 0, zz))) continue;
    const h = 0.35 + rng.next() * 0.3;
    part(g, plainBox(), 0x6d9a3e, x, h / 2, zz, 0.04, h, 0.04).rotation.z = (rng.next() - 0.5) * 0.4;
    if (rng.next() < 0.4) part(g, cyl(), 0x7a4d2b, x, h + 0.05, zz, 0.07, 0.14, 0.07);
  }
  return mergeProp(g);
}
/** Forest: a cluster of three mushrooms (not a stump, the deep woods' obstacle). */
function mushrooms(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const m = LIB.mushroom(rng);
    m.position.set((i - 1) * 0.28, 0, (rng.next() - 0.5) * 0.3);
    m.scale.setScalar(0.7 + rng.next() * 0.5);
    g.add(m);
  }
  return mergeProp(g);
}
/** Jungle: lily pads on a pool (flat discs, one merged mesh). */
function lilyPads(rng: Rng, x0: number, x1: number, z0: number, z1: number): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const x = x0 + rng.next() * (x1 - x0), z = z0 + rng.next() * (z1 - z0);
    part(g, cyl(), 0x3f9a46, x, -0.03, z, 0.45, 0.02, 0.45).castShadow = false;
    if (rng.next() < 0.35) part(g, lowSphere(), 0xff9fc0, x + 0.08, 0.02, z, 0.14, 0.1, 0.14);
  }
  return mergeProp(g);
}
/**
 * Jungle: a strip of worn stone paving, two courses of staggered slabs almost flush with the grass. It reads as one
 * floor, never as single blocks: the jungle's third obstacle is a stone pillar (0.6 wide, 0.9 high), these are 0.04 high.
 */
function stoneTerrace(x0: number, x1: number, z: number, keep: (p: THREE.Vector3) => boolean): THREE.Group {
  const g = new THREE.Group();
  for (let row = 0; row < 2; row++) {
    const zz = z + row * 0.52;
    for (let x = x0 + row * 0.5, i = 0; x < x1; x += 1.0, i++) {
      if (!keep(new THREE.Vector3(x + 0.5, 0, zz))) continue;
      part(g, plainBox(), (i + row) % 2 ? 0xb3ad98 : 0xa49f8a, x + 0.5, 0.02, zz, 0.98, 0.04, 0.5).castShadow = false;
    }
  }
  return mergeProp(g);
}

const SCENES: Record<Theme, [Scene, Scene, Scene]> = {
  village: [villageStreet, farm, square],
  forest: [campsite, riverside, deepWoods],
  pirate: [beach, harbour, treasureCave],
  jungle: [jungleEntrance, waterfall, ruins],
  haunted: [pumpkinPatch, graveyard, castleYard],
  winter: [snowVillage, iceLake, xmasSquare],
};

/** The composed scene for this stage (every one of the 18 has one). */
export function composeScene(theme: Theme, stage: number, frame: SceneFrame, rng: Rng): THREE.Group | null {
  return SCENES[theme][Math.max(0, Math.min(2, stage - 1))](frame, rng);
}

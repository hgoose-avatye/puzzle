import * as THREE from 'three';
import type { Rng } from '../src/core/rng';
import type { Theme } from '../src/curve/curve';
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

/** Soft round tree from a few overlapping balls, as in the reference trees. */
function fluffyTree(rng: Rng, s = 1, tint = 0x7cc35c): THREE.Group {
  const g = new THREE.Group();
  part(g, cyl(), 0x8a5a3b, 0, 0.45 * s, 0, 0.26 * s, 0.9 * s, 0.26 * s);
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
  for (let i = 0; i < 3; i++) part(g, sphere(), i ? 0x6cb850 : 0x79c45a, (i - 1) * 0.32, 0.25 + rng.next() * 0.08, (rng.next() - 0.5) * 0.25, 0.62, 0.52, 0.6);
  if (flowers) for (let i = 0; i < 4; i++) part(g, sphere(), [0xffffff, 0xfff3a8, 0xffb3c7][rng.int(0, 2)], (rng.next() - 0.5) * 0.8, 0.5 + rng.next() * 0.12, (rng.next() - 0.5) * 0.35, 0.12, 0.12, 0.12);
  return g;
}

function cottage(): THREE.Group {
  const g = new THREE.Group();
  part(g, box(), 0xbdb4a4, 0, 0.12, 0, 2.9, 0.24, 2.3); // stone footing
  part(g, box(), 0xf7ead2, 0, 1.0, 0, 2.7, 1.6, 2.1);
  for (const x of [-1.33, 1.33]) part(g, box(), 0xa7774c, x, 1.0, 1.06, 0.1, 1.6, 0.06); // timber corners
  part(g, box(), 0xa7774c, 0, 1.78, 1.06, 2.7, 0.1, 0.06);
  for (const sz of [-1, 1]) part(g, box(), 0xd9694a, 0, 2.25, sz * 0.62, 3.1, 0.16, 1.5).rotation.x = sz * 0.62; // gable roof
  part(g, box(), 0xb9533a, 0, 2.7, 0, 3.15, 0.14, 0.18);
  part(g, box(), 0xa9a196, 0.8, 2.75, -0.35, 0.36, 0.9, 0.36); // chimney
  part(g, box(), 0x8a5636, -0.55, 0.62, 1.07, 0.56, 0.95, 0.06); // door, arch and step
  part(g, cyl(), 0x8a5636, -0.55, 1.08, 1.07, 0.56, 0.06, 0.56).rotation.x = Math.PI / 2;
  part(g, box(), 0xc9c1b4, -0.55, 0.08, 1.35, 0.9, 0.16, 0.5);
  part(g, box(), 0x4f8fc6, 0.6, 1.05, 1.07, 0.7, 0.62, 0.05); // window, awning, flower box
  part(g, box(), 0xcfe8f5, 0.6, 1.05, 1.1, 0.54, 0.46, 0.03, 0x3a5a70);
  for (let i = 0; i < 4; i++) part(g, box(), i % 2 ? 0xffffff : 0x4f8fc6, 0.33 + i * 0.18, 1.5, 1.24, 0.18, 0.04, 0.42).rotation.x = 0.45;
  part(g, box(), 0x9c6236, 0.6, 0.7, 1.16, 0.74, 0.14, 0.16);
  for (let i = 0; i < 4; i++) part(g, sphere(), [0xff8fab, 0xffffff, 0xffd166][i % 3], 0.36 + i * 0.16, 0.82, 1.17, 0.13, 0.13, 0.13);
  return g;
}

function marketStall(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.8, 0.8]) for (const z of [-0.4, 0.4]) part(g, box(), 0x9c6b45, x, 0.75, z, 0.1, 1.5, 0.1);
  part(g, box(), 0xb57a4c, 0, 0.62, 0.05, 1.75, 0.12, 0.9);
  for (let i = 0; i < 8; i++) part(g, box(), i % 2 ? 0xffffff : 0x5b8fd6, -0.79 + i * 0.226, 1.55, 0.05, 0.226, 0.06, 1.2).rotation.x = -0.18;
  for (let c = 0; c < 3; c++) {
    const cx = -0.55 + c * 0.55;
    part(g, box(), 0xc08a52, cx, 0.78, 0.15, 0.46, 0.2, 0.4);
    for (let i = 0; i < 5; i++) part(g, sphere(), [0xf28c25, 0xe2453c, 0x8ccf4a][c], cx + (rng.next() - 0.5) * 0.3, 0.92, 0.15 + (rng.next() - 0.5) * 0.25, 0.14, 0.14, 0.14);
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
  part(g, cyl(), 0xa8703f, 0, 0.3, 0, 0.5, 0.6, 0.5);
  for (const y of [0.12, 0.48]) part(g, cyl(), 0x5b4a3a, 0, y, 0, 0.52, 0.05, 0.52);
  return g;
}

function bench(): THREE.Group {
  const g = new THREE.Group();
  for (const z of [-0.1, 0.1]) part(g, box(), 0xb57a4c, 0, 0.4, z, 1.4, 0.06, 0.16);
  part(g, box(), 0xb57a4c, 0, 0.7, -0.24, 1.4, 0.3, 0.06).rotation.x = -0.15;
  for (const x of [-0.6, 0.6]) part(g, box(), 0x3d4a52, x, 0.22, 0, 0.08, 0.44, 0.5);
  return g;
}

function dogHouse(): THREE.Group {
  const g = new THREE.Group();
  part(g, box(), 0xc8935f, 0, 0.42, 0, 1.0, 0.84, 1.0);
  part(g, pyramid(), 0x4f7fc6, 0, 1.08, 0, 1.6, 0.6, 1.5).rotation.y = Math.PI / 4;
  part(g, box(), 0x3d2a20, 0, 0.32, 0.5, 0.42, 0.5, 0.04);
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
    for (const p of [a, b]) part(g, box(), 0xa7774c, p.x, 0.32, p.z, 0.12, 0.64, 0.12);
    for (const y of [0.22, 0.46]) part(g, box(), 0xc89b6d, mid.x, y, mid.z, 0.06, 0.08, len / n).rotation.y = angle;
  }
  return g;
}

function cobblePath(rng: Rng, x0: number, x1: number, z0: number, z1: number): THREE.Group {
  const g = new THREE.Group();
  for (let x = x0; x < x1; x += 0.42) {
    for (let z = z0; z < z1; z += 0.42) {
      const c = new THREE.Color(0xcfc4b0).offsetHSL(0, 0, (rng.next() - 0.5) * 0.08).getHex();
      part(g, box(), c, x + (rng.next() - 0.5) * 0.06, 0.02, z + (rng.next() - 0.5) * 0.06, 0.38, 0.06, 0.38).castShadow = false;
    }
  }
  return g;
}

function water(x: number, z: number, w: number, d: number): THREE.Group {
  const g = new THREE.Group();
  part(g, box(), 0x5ec8e8, x, -0.12, z, w, 0.08, d).castShadow = false;
  part(g, box(), 0x8edcf2, x, -0.1, z, w * 0.8, 0.06, d * 0.6).castShadow = false;
  return g;
}

function bridge(): THREE.Group {
  const g = new THREE.Group();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = -1.6 + t * 3.2;
    const y = 0.15 + Math.sin(t * Math.PI) * 0.55;
    part(g, box(), 0xb5844f, x, y, 0, 0.36, 0.1, 1.2).rotation.z = Math.cos(t * Math.PI) * -0.5;
    for (const z of [-0.6, 0.6]) part(g, box(), 0x8a5a3b, x, y + 0.3, z, 0.1, 0.5, 0.08);
  }
  for (const z of [-0.6, 0.6]) for (let i = 0; i < n - 1; i++) {
    const t = (i + 0.5) / (n - 1);
    part(g, box(), 0xa7774c, -1.6 + t * 3.2, 0.62 + Math.sin(t * Math.PI) * 0.55, z, 0.42, 0.06, 0.06).rotation.z = Math.cos(t * Math.PI) * -0.5;
  }
  for (const x of [-1.8, 1.8]) part(g, box(), 0xbdb4a4, x, 0.25, 0, 0.5, 0.5, 1.4);
  return g;
}

function dock(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) part(g, box(), 0xb5844f, 0, 0.12, i * 0.36, 1.1, 0.08, 0.32);
  for (const x of [-0.55, 0.55]) for (const z of [0, 1.8]) part(g, cyl(), 0x8a5a3b, x, 0.1, z, 0.16, 0.6, 0.16);
  return g;
}

function boat(): THREE.Group {
  const g = new THREE.Group();
  part(g, box(), 0x9c6236, 0, 0.08, 0, 0.9, 0.36, 1.9);
  part(g, box(), 0xc08a52, 0, 0.22, 0, 0.72, 0.1, 1.7);
  part(g, box(), 0xb57a4c, 0, 0.3, 0.2, 0.74, 0.06, 0.18);
  return g;
}

function flowerPatch(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) part(g, sphere(), [0xffffff, 0xfff3a8, 0xffb3c7, 0xc8a2ff][rng.int(0, 3)], (rng.next() - 0.5) * 1.0, 0.07, (rng.next() - 0.5) * 0.7, 0.12, 0.1, 0.12);
  return g;
}

/** The village plaza by the flower field (reference 03). */
function village(f: SceneFrame, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const { hw, hz } = f;
  const nearGate = (p: THREE.Vector3, r = 1.3): boolean => f.gates.some((gt) => {
    const d = p.clone().sub(gt.p);
    const along = d.dot(gt.v);
    const side = Math.abs(d.x * gt.v.z - d.z * gt.v.x);
    return along > -0.6 && along < 1.6 && side < r;
  });
  const put = (o: THREE.Object3D, x: number, z: number, rot = 0): void => {
    if (nearGate(new THREE.Vector3(x, 0, z))) return;
    o.position.set(x, 0, z);
    o.rotation.y = rot;
    g.add(o);
  };

  // top band, kept close to the board so it shows on a tall phone: path, cottage, market stall, lamps, river and bridge
  g.add(cobblePath(rng, -hw - 4, hw + 1.0, -hz - 1.75, -hz - 0.85));
  put(cottage(), -hw + 0.9, -hz - 3.3);
  put(marketStall(rng), 1.3, -hz - 2.55);
  put(barrel(), 2.45, -hz - 2.2);
  put(lampPost(), -0.5, -hz - 1.95);
  g.add(water(hw + 3.6, -hz - 3, 4.4, 8));
  put(bridge(), hw + 2.0, -hz - 1.3);
  for (const [x, z, s] of [[-hw - 2.4, -hz - 2.0, 1.1], [-hw - 1.0, -hz - 4.8, 1.2], [3.0, -hz - 4.2, 1.1], [0.2, -hz - 4.6, 1.0]] as const) put(fluffyTree(rng, s), x, z);
  for (const [x, z] of [[-hw - 0.7, -hz - 1.4], [2.3, -hz - 1.3]] as const) put(bushClump(rng), x, z);

  // left and right edges: hedges and flowers along the grass, off the gates
  for (let z = -hz + 0.5; z < hz; z += 1.6) {
    put(bushClump(rng, rng.next() < 0.6), -hw - 1.0, z + (rng.next() - 0.5) * 0.4);
    put(bushClump(rng, rng.next() < 0.6), hw + 1.0, z + (rng.next() - 0.5) * 0.4);
  }

  // bottom band: fence, bench and lamp, dog house, garden trees, dock and boat on the water
  g.add(fenceRun(new THREE.Vector3(-hw - 0.6, 0, hz + 0.95), new THREE.Vector3(hw - 1.2, 0, hz + 0.95), (p) => nearGate(p, 0.9)));
  put(bench(), -hw + 1.4, hz + 1.8);
  put(lampPost(), -hw + 0.2, hz + 1.7);
  put(dogHouse(), 0.7, hz + 2.2, -0.3);
  for (const [x, z, s] of [[-hw - 1.2, hz + 2.8, 1.1], [-hw + 0.6, hz + 3.6, 1.2], [-0.9, hz + 3.8, 1.0]] as const) put(fluffyTree(rng, s), x, z);
  for (const [x, z] of [[-1.3, hz + 1.9], [1.9, hz + 1.7], [-hw - 0.5, hz + 1.6]] as const) put(flowerPatch(rng), x, z);
  g.add(water(hw + 1.8, hz + 3.6, 5, 5));
  put(dock(), hw - 0.1, hz + 1.9);
  put(boat(), hw + 1.6, hz + 3.0, 0.4);
  return g;
}

// ---------- more set pieces for the other stages ----------

function barn(): THREE.Group {
  const g = new THREE.Group();
  part(g, box(), 0xc4473c, 0, 0.95, 0, 2.4, 1.9, 2.0);
  for (const sz of [-1, 1]) part(g, box(), 0x6b4a3a, 0, 2.15, sz * 0.58, 2.6, 0.14, 1.4).rotation.x = sz * 0.7;
  part(g, box(), 0xf4ede0, 0, 0.75, 1.01, 1.0, 1.3, 0.04);
  for (const s of [-1, 1]) part(g, box(), 0xf4ede0, 0, 0.75, 1.03, 1.3, 0.08, 0.03).rotation.z = s * 0.9;
  return g;
}
function silo(): THREE.Group {
  const g = new THREE.Group();
  part(g, cyl(), 0xd9d2c3, 0, 1.3, 0, 1.1, 2.6, 1.1);
  part(g, geo('dome', () => new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), 0x8a8f96, 0, 2.6, 0, 1.12, 0.9, 1.12);
  return g;
}
function fountain(): THREE.Group {
  const g = new THREE.Group();
  part(g, cyl(), 0xcfc4b0, 0, 0.2, 0, 2.0, 0.4, 2.0);
  part(g, cyl(), 0x6fd0ef, 0, 0.36, 0, 1.7, 0.08, 1.7, 0x1a5a70).castShadow = false;
  part(g, cyl(), 0xcfc4b0, 0, 0.75, 0, 0.3, 1.0, 0.3);
  part(g, cyl(), 0xcfc4b0, 0, 1.25, 0, 0.9, 0.14, 0.9);
  part(g, sphere(), 0x9fe3f7, 0, 1.45, 0, 0.3, 0.4, 0.3, 0x2a7090);
  return g;
}
function snowHouse(): THREE.Group {
  const g = LIB.house(0xe9d7bf, 0xffffff)(rngConst);
  part(g, box(), 0xffd27a, 0.35, 0.55, 0.51, 0.3, 0.3, 0.04, 0xffa53a);
  return g;
}
function pirateShip(): THREE.Group {
  const g = new THREE.Group();
  part(g, box(), 0x6b4428, 0, 0.35, 0, 1.6, 0.8, 4.0);
  part(g, box(), 0x8a5a3b, 0, 0.8, -1.4, 1.5, 0.5, 1.0);
  part(g, cyl(), 0x5b3a22, 0, 2.0, 0.2, 0.12, 3.0, 0.12);
  part(g, box(), 0x2b2b2f, 0, 2.3, 0.25, 1.6, 1.3, 0.04);
  part(g, sphere(), 0xffffff, 0, 2.35, 0.28, 0.4, 0.4, 0.04);
  return g;
}
function cannon(): THREE.Group {
  const g = new THREE.Group();
  part(g, box(), 0x8a5a3b, 0, 0.18, 0, 0.6, 0.3, 0.8);
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
  part(g, box(), 0x7f8b6a, 0, 1.2, 0, 4.5, 2.4, 1.6);
  part(g, box(), 0x4f9a4a, 0, 2.45, 0, 4.6, 0.2, 1.7);
  part(g, box(), 0x8fdcf5, 0.2, 1.2, 0.82, 1.2, 2.4, 0.06, 0x2a7090).castShadow = false;
  part(g, cyl(), 0x6cc8e8, 0.2, -0.05, 1.6, 2.6, 0.06, 1.6).castShadow = false;
  return g;
}
function stepPyramid(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) part(g, box(), i % 2 ? 0xb7b2a0 : 0xa9a48f, 0, 0.3 + i * 0.6, 0, 3.4 - i * 0.75, 0.6, 3.4 - i * 0.75);
  part(g, box(), 0x4f9a4a, 0.9, 0.62, 1.2, 0.6, 0.06, 0.5);
  return g;
}
function bigLeaf(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng.next();
    const l = part(g, box(), 0x3f9a4a, Math.cos(a) * 0.4, 0.35, Math.sin(a) * 0.4, 0.9, 0.04, 0.4);
    l.rotation.set(0, -a, 0.5);
  }
  return g;
}
function scarecrow(): THREE.Group {
  const g = new THREE.Group();
  part(g, cyl(), 0x7a5236, 0, 0.8, 0, 0.08, 1.6, 0.08);
  part(g, box(), 0x7a5236, 0, 1.2, 0, 1.2, 0.07, 0.07);
  part(g, box(), 0x8f4fb0, 0, 1.15, 0, 0.5, 0.5, 0.3);
  part(g, sphere(), 0xf0b45a, 0, 1.6, 0, 0.36, 0.36, 0.36);
  part(g, cone(), 0x3d3550, 0, 1.92, 0, 0.5, 0.4, 0.5);
  return g;
}
function castleWall(): THREE.Group {
  const g = new THREE.Group();
  part(g, box(), 0x6c6587, 0, 0.8, 0, 5.0, 1.6, 0.7);
  for (let i = 0; i < 6; i++) part(g, box(), 0x6c6587, -2.25 + i * 0.9, 1.75, 0, 0.45, 0.3, 0.7);
  for (const x of [-2.6, 2.6]) {
    part(g, cyl(), 0x5d5678, x, 1.3, 0, 1.2, 2.6, 1.2);
    part(g, cone(), 0x4a3f7a, x, 3.0, 0, 1.4, 1.0, 1.4);
    part(g, box(), 0xffd27a, x, 1.6, 0.6, 0.25, 0.35, 0.04, 0xffa53a);
  }
  part(g, box(), 0x2b2540, 0, 0.6, 0.36, 1.1, 1.2, 0.04);
  return g;
}
function xmasTree(): THREE.Group {
  const g = new THREE.Group();
  part(g, cyl(), 0x7a5236, 0, 0.25, 0, 0.3, 0.5, 0.3);
  for (let i = 0; i < 4; i++) part(g, cone(), 0x2f7a46, 0, 0.75 + i * 0.6, 0, 2.2 - i * 0.45, 0.9, 2.2 - i * 0.45);
  part(g, sphere(), 0xffd84a, 0, 3.15, 0, 0.35, 0.35, 0.35, 0xffb000);
  const baubles = [0xd94a4a, 0xf2d16b, 0x5b8fd6, 0xffffff];
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
  for (let i = 0; i < 5; i++) part(g, box(), [0xf28c5a, 0xf7b267][rng.int(0, 1)], 0, 0.03, 0, 0.08, 0.04, 0.32).rotation.y = (i / 5) * Math.PI * 2;
  return g;
}
function umbrella(): THREE.Group {
  const g = new THREE.Group();
  part(g, cyl(), 0xf4ede0, 0, 0.8, 0, 0.06, 1.6, 0.06);
  part(g, cone(), 0xe85a5a, 0, 1.6, 0, 1.6, 0.4, 1.6);
  part(g, box(), 0xf9f3e6, 0.5, 0.05, 0.6, 0.6, 0.06, 1.1);
  return g;
}
function sled(): THREE.Group {
  const g = new THREE.Group();
  part(g, box(), 0xc4473c, 0, 0.22, 0, 0.6, 0.1, 1.1);
  for (const x of [-0.26, 0.26]) part(g, box(), 0x8a8f96, x, 0.08, 0, 0.05, 0.06, 1.2);
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

const farm: Scene = (f, rng) => {
  const { g, put, nearGate } = sceneKit(f);
  const { hw, hz } = f;
  put(barn(), -hw + 1.0, -hz - 3.0);
  put(silo(), 1.4, -hz - 3.2);
  for (const [x, z] of [[2.6, -hz - 1.8], [3.2, -hz - 2.5], [-0.4, -hz - 1.7]] as const) put(LIB.hay(rng), x, z, rng.next());
  g.add(fenceRun(new THREE.Vector3(-hw - 2, 0, -hz - 1.1), new THREE.Vector3(hw + 2, 0, -hz - 1.1), (p) => nearGate(p, 0.9)));
  for (const [x, z, s] of [[-hw - 2.2, -hz - 2.4, 1.1], [hw + 2.0, -hz - 4.2, 1.2]] as const) put(fluffyTree(rng, s), x, z);
  sides(put, f, () => (rng.next() < 0.5 ? LIB.hay(rng) : bushClump(rng, false)), 2.2);
  g.add(fenceRun(new THREE.Vector3(-hw - 2, 0, hz + 1.0), new THREE.Vector3(hw + 2, 0, hz + 1.0), (p) => nearGate(p, 0.9)));
  for (let x = -hw; x < hw; x += 1.1) put(LIB.flowers(rng), x, hz + 2.4 + (rng.next() - 0.5) * 0.4);
  put(fluffyTree(rng, 1.2), -hw + 0.4, hz + 3.6);
  put(fluffyTree(rng, 1.0), hw - 0.6, hz + 3.4);
  return g;
};

const square: Scene = (f, rng) => {
  const { g, put } = sceneKit(f);
  const { hw, hz } = f;
  g.add(cobblePath(rng, -hw - 4, hw + 4, -hz - 2.2, -hz - 0.9));
  put(cottage(), -hw + 0.9, -hz - 3.6);
  const shop = cottage();
  put(shop, hw - 0.9, -hz - 3.6);
  put(fountain(), 0.2, -hz - 2.4);
  for (const x of [-hw - 0.3, hw + 0.3]) put(lampPost(), x, -hz - 1.4);
  sides(put, f, () => bushClump(rng), 1.8);
  g.add(cobblePath(rng, -hw - 4, hw + 4, hz + 0.9, hz + 2.0));
  for (const [x, rot] of [[-hw + 1.2, 0], [hw - 1.2, 0]] as const) put(bench(), x, hz + 2.6, rot);
  put(lampPost(), 0, hz + 2.4);
  for (const [x, z] of [[-1.4, hz + 2.6], [1.6, hz + 2.7]] as const) put(LIB.crate(rng), x, z, rng.next());
  for (const [x, s] of [[-hw - 0.8, 1.2], [hw + 0.6, 1.1], [0.4, 1.0]] as const) put(fluffyTree(rng, s), x, hz + 3.9);
  return g;
};

const campsite: Scene = (f, rng) => {
  const { g, put } = sceneKit(f);
  const { hw, hz } = f;
  put(LIB.tent(rng), -hw + 1.0, -hz - 2.4, 0.3);
  put(LIB.tent(rng), 1.6, -hz - 2.8, -0.4);
  put(LIB.campfire(rng), -0.6, -hz - 1.8);
  for (const [x, z, r] of [[-1.5, -hz - 1.6, 0.4], [0.3, -hz - 1.5, -0.3]] as const) put(LIB.log(rng), x, z, r);
  put(lampPost(), hw + 0.3, -hz - 1.4);
  for (const [x, z] of [[-hw - 2.0, -hz - 2.0], [-hw - 0.4, -hz - 4.6], [hw + 1.8, -hz - 3.4], [0.4, -hz - 4.8]] as const) put(LIB.pine(false)(rng), x, z, rng.next() * 6);
  sides(put, f, () => (rng.next() < 0.6 ? LIB.pine(false)(rng) : LIB.mushroom(rng)), 1.7, 1.3);
  for (const [x, z] of [[-hw + 0.6, hz + 1.8], [hw - 1.0, hz + 2.0]] as const) put(LIB.stump(rng), x, z);
  put(LIB.log(rng), 0.2, hz + 1.7, 0.2);
  for (const [x, z] of [[-hw - 1.0, hz + 3.0], [-0.8, hz + 3.6], [1.8, hz + 3.2], [hw + 1.2, hz + 3.0]] as const) put(LIB.pine(false)(rng), x, z);
  return g;
};

const riverside: Scene = (f, rng) => {
  const { g, put } = sceneKit(f);
  const { hw, hz } = f;
  g.add(water(0, -hz - 3.0, 2 * hw + 10, 2.4));
  put(bridge(), 0.6, -hz - 3.0, Math.PI / 2);
  for (let x = -hw - 3; x < hw + 3; x += 1.3) put(LIB.rock(rng), x + (rng.next() - 0.5) * 0.5, -hz - 1.7 - rng.next() * 0.2);
  for (let x = -hw - 3; x < hw + 3; x += 1.8) put(LIB.pine(false)(rng), x, -hz - 5.0 + (rng.next() - 0.5) * 0.6);
  sides(put, f, () => (rng.next() < 0.5 ? LIB.rock(rng) : bushClump(rng, false)), 1.8);
  g.add(water(hw + 2.0, hz + 3.2, 6, 4));
  put(dock(), hw - 0.2, hz + 1.6);
  put(boat(), hw + 1.6, hz + 2.8, 0.5);
  for (const [x, z] of [[-hw - 0.8, hz + 2.2], [-hw + 1.2, hz + 3.4], [-0.6, hz + 2.6]] as const) put(LIB.pine(false)(rng), x, z);
  for (const [x, z] of [[0.8, hz + 1.6], [-hw + 2.4, hz + 1.7]] as const) put(LIB.rock(rng), x, z);
  return g;
};

const deepWoods: Scene = (f, rng) => {
  const { g, put } = sceneKit(f);
  const { hw, hz } = f;
  put(LIB.house(0x9c6b45, 0x3e6e45)(rng), -hw + 1.2, -hz - 2.8, 0.2);
  for (let x = -hw - 3; x < hw + 3; x += 1.2) put(LIB.pine(false)(rng), x + (rng.next() - 0.5) * 0.4, -hz - (x < -hw + 2.5 ? 4.6 : 1.8 + rng.next() * 2.6));
  sides(put, f, () => LIB.pine(false)(rng), 1.3, 1.2);
  for (let x = -hw - 3; x < hw + 3; x += 1.1) put(rng.next() < 0.3 ? LIB.mushroom(rng) : LIB.pine(false)(rng), x + (rng.next() - 0.5) * 0.4, hz + 1.8 + rng.next() * 2.2);
  put(LIB.stump(rng), -0.4, hz + 1.5);
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

const jungleEntrance: Scene = (f, rng) => {
  const { g, put } = sceneKit(f);
  const { hw, hz } = f;
  for (let x = -hw - 3; x < hw + 3; x += 1.5) put(LIB.jungleTree(rng), x + (rng.next() - 0.5) * 0.5, -hz - 2.4 - rng.next() * 1.5);
  for (let x = -hw - 1; x < hw + 1; x += 1.2) put(rng.next() < 0.5 ? bigLeaf(rng) : LIB.bush(rng), x, -hz - 1.2);
  sides(put, f, () => (rng.next() < 0.5 ? bigLeaf(rng) : LIB.bush(rng)), 1.5, 1.1);
  for (let x = -hw - 2; x < hw + 2; x += 1.3) put(rng.next() < 0.4 ? LIB.flowers(rng) : bigLeaf(rng), x, hz + 1.4 + rng.next() * 0.5);
  for (const x of [-hw, 0.6, hw + 0.5]) put(LIB.jungleTree(rng), x, hz + 3.2);
  return g;
};

const waterfall: Scene = (f, rng) => {
  const { g, put } = sceneKit(f);
  const { hw, hz } = f;
  put(cliffFalls(), 0.4, -hz - 3.4);
  for (const x of [-hw - 1.2, hw + 1.6]) put(LIB.jungleTree(rng), x, -hz - 2.6);
  for (const x of [-2.0, 2.8]) put(LIB.rock(rng), x, -hz - 1.4);
  sides(put, f, () => (rng.next() < 0.5 ? LIB.rock(rng) : bigLeaf(rng)), 1.7, 1.1);
  g.add(water(hw + 2.2, hz + 3.0, 6, 4));
  for (const x of [-hw - 0.4, -0.8]) put(LIB.jungleTree(rng), x, hz + 2.8);
  for (const [x, z] of [[1.2, hz + 1.5], [hw - 0.4, hz + 1.4]] as const) put(LIB.rock(rng), x, z);
  return g;
};

const ruins: Scene = (f, rng) => {
  const { g, put } = sceneKit(f);
  const { hw, hz } = f;
  put(stepPyramid(), 0.4, -hz - 3.4);
  for (const x of [-hw + 0.2, -1.8, 2.4, hw + 0.4]) put(LIB.pillar(rng), x, -hz - 1.4);
  for (const x of [-hw - 1.6, hw + 2.0]) put(LIB.jungleTree(rng), x, -hz - 2.8);
  sides(put, f, () => (rng.next() < 0.5 ? LIB.ruin(rng) : LIB.bush(rng)), 1.9, 1.2);
  for (let x = -hw; x < hw; x += 1.6) put(rng.next() < 0.5 ? LIB.ruin(rng) : bigLeaf(rng), x, hz + 1.6);
  for (const x of [-hw - 1.0, 0.4, hw + 1.0]) put(LIB.jungleTree(rng), x, hz + 3.2);
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
  part(ice, box(), 0xcfeaf7, 0, -0.06, -hz - 3.2, 2 * hw + 6, 0.06, 3.4).castShadow = false;
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

const SCENES: Record<Theme, [Scene, Scene, Scene]> = {
  village: [village, farm, square],
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

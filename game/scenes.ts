import * as THREE from 'three';
import type { Rng } from '../src/core/rng';
import type { Theme } from '../src/curve/curve';
import { box, cyl, geo, part, pyramid } from './scenery';

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

/** A composed scene for this stage, or null where only the generic scatter exists so far. */
export function composeScene(theme: Theme, stage: number, frame: SceneFrame, rng: Rng): THREE.Group | null {
  if (theme === 'village' && stage === 1) return village(frame, rng);
  return null;
}

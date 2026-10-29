import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Rng } from '../src/core/rng';
import type { Theme } from '../src/curve/curve';

/**
 * Chapter surroundings, after docs/art-reference/08: a themed ground around the board island and low-poly props
 * scattered around it. Props are built from a few shared geometries and cached materials, so swapping levels only
 * drops groups and never leaks GPU memory.
 */
export interface Palette {
  sky: number;
  ground: number;
  /** island slab under the floor tiles */
  rim: number;
  tileA: string;
  tileB: string;
  /** optional band around the island (sand on the pirate beach) */
  shore?: number;
  hemiSky: number;
  hemiGround: number;
}

export const PALETTES: Record<Theme, Palette> = {
  village: { sky: 0xcfe8f3, ground: 0x9fcf7a, rim: 0xd9c6a0, tileA: '#f8f1e1', tileB: '#f1e8d2', hemiSky: 0xffffff, hemiGround: 0xb9c9a4 },
  forest: { sky: 0xb9dccb, ground: 0x6fa860, rim: 0xb59a72, tileA: '#f3ead6', tileB: '#eadfc6', hemiSky: 0xf4fff2, hemiGround: 0x7d9a6a },
  pirate: { sky: 0xbfe6f5, ground: 0x4fb6d6, rim: 0xe4c98f, tileA: '#f7ebcb', tileB: '#efdfb8', shore: 0xf1d9a0, hemiSky: 0xffffff, hemiGround: 0x9fd0dc },
  jungle: { sky: 0xc6e3c0, ground: 0x5f9a4c, rim: 0xb8a77c, tileA: '#efe6cf', tileB: '#e5d9bd', hemiSky: 0xf2ffe8, hemiGround: 0x6f8d55 },
  haunted: { sky: 0x5d5582, ground: 0x6c628c, rim: 0x8d84a8, tileA: '#d9d3e6', tileB: '#cfc8de', hemiSky: 0xd8ccff, hemiGround: 0x4b4366 },
  winter: { sky: 0xdcebf5, ground: 0xf3f7fb, rim: 0xc9d6e2, tileA: '#fbfdff', tileB: '#eef3f8', hemiSky: 0xffffff, hemiGround: 0xc4d3e0 },
};

const geoCache = new Map<string, THREE.BufferGeometry>();
const geo = (k: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry => {
  let g = geoCache.get(k);
  if (!g) { g = make(); geoCache.set(k, g); }
  return g;
};
const matCache = new Map<string, THREE.Material>();
const mat = (color: number, emissive = 0): THREE.Material => {
  const k = `${color}:${emissive}`;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, emissive, emissiveIntensity: emissive ? 0.9 : 0 }); matCache.set(k, m); }
  return m;
};

function part(g: THREE.Group, geometry: THREE.BufferGeometry, color: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, emissive = 0): THREE.Mesh {
  const m = new THREE.Mesh(geometry, mat(color, emissive));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.userData.shared = true;
  g.add(m);
  return m;
}

const box = (): THREE.BufferGeometry => geo('box', () => new RoundedBoxGeometry(1, 1, 1, 2, 0.12));
const ball = (): THREE.BufferGeometry => geo('ball', () => new THREE.IcosahedronGeometry(0.5, 1));
const cone = (): THREE.BufferGeometry => geo('cone', () => new THREE.ConeGeometry(0.5, 1, 7));
const cyl = (): THREE.BufferGeometry => geo('cyl', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8));
const pyramid = (): THREE.BufferGeometry => geo('pyramid', () => new THREE.ConeGeometry(0.62, 1, 4));

type Prop = (rng: Rng) => THREE.Group;

const roundTree: Prop = (rng) => {
  const g = new THREE.Group();
  const h = 0.5 + rng.next() * 0.3;
  part(g, cyl(), 0x8a5a3b, 0, h / 2, 0, 0.22, h, 0.22);
  part(g, ball(), [0x6dbb57, 0x7ccc5f, 0x5aa84a][rng.int(0, 2)], 0, h + 0.4, 0, 1.1, 1, 1.1);
  return g;
};
const pine = (snow: boolean): Prop => (rng) => {
  const g = new THREE.Group();
  const s = 0.8 + rng.next() * 0.5;
  part(g, cyl(), 0x7a5236, 0, 0.2 * s, 0, 0.2, 0.4 * s, 0.2);
  for (let i = 0; i < 3; i++) part(g, cone(), snow && i === 2 ? 0xf6fbff : 0x3f8a4f, 0, (0.55 + i * 0.42) * s, 0, (1.1 - i * 0.28) * s, 0.7 * s, (1.1 - i * 0.28) * s);
  return g;
};
const flowers: Prop = (rng) => {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) part(g, ball(), [0xff8fab, 0xffd166, 0xffffff, 0xc8a2ff][rng.int(0, 3)], (rng.next() - 0.5) * 0.8, 0.08, (rng.next() - 0.5) * 0.8, 0.18, 0.18, 0.18);
  return g;
};
const house = (wall: number, roof: number): Prop => () => {
  const g = new THREE.Group();
  part(g, box(), wall, 0, 0.45, 0, 1.2, 0.9, 1);
  part(g, pyramid(), roof, 0, 1.2, 0, 1.45, 0.7, 1.25).rotation.y = Math.PI / 4;
  part(g, box(), 0x8a5a3b, 0, 0.25, 0.51, 0.3, 0.5, 0.05);
  return g;
};
const fence: Prop = () => {
  const g = new THREE.Group();
  for (const x of [-0.45, 0, 0.45]) part(g, box(), 0xc89b6d, x, 0.25, 0, 0.1, 0.5, 0.1);
  part(g, box(), 0xc89b6d, 0, 0.32, 0, 1.0, 0.08, 0.06);
  return g;
};
const rock: Prop = (rng) => {
  const g = new THREE.Group();
  const s = 0.4 + rng.next() * 0.4;
  part(g, ball(), 0x9aa0a6, 0, s * 0.3, 0, s * 1.3, s * 0.8, s);
  return g;
};
const mushroom: Prop = () => {
  const g = new THREE.Group();
  part(g, cyl(), 0xf5ead6, 0, 0.12, 0, 0.12, 0.24, 0.12);
  part(g, ball(), 0xe2524a, 0, 0.28, 0, 0.4, 0.22, 0.4);
  return g;
};
const palm: Prop = (rng) => {
  const g = new THREE.Group();
  const h = 1.3 + rng.next() * 0.5;
  for (let i = 0; i < 4; i++) part(g, cyl(), 0x9c7046, i * 0.07, (i + 0.5) * (h / 4), 0, 0.16, h / 4 + 0.02, 0.16);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leaf = part(g, box(), 0x3fa458, 0.28 + Math.cos(a) * 0.35, h, Math.sin(a) * 0.35, 0.9, 0.06, 0.28);
    leaf.rotation.set(0, -a, -0.35);
  }
  return g;
};
const barrel: Prop = () => {
  const g = new THREE.Group();
  part(g, cyl(), 0xa8703f, 0, 0.3, 0, 0.5, 0.6, 0.5);
  part(g, cyl(), 0x5b4a3a, 0, 0.3, 0, 0.52, 0.06, 0.52);
  return g;
};
const chest: Prop = () => {
  const g = new THREE.Group();
  part(g, box(), 0x9c6236, 0, 0.22, 0, 0.7, 0.44, 0.48);
  part(g, box(), 0xf2c94c, 0, 0.3, 0.25, 0.12, 0.14, 0.04);
  return g;
};
const jungleTree: Prop = (rng) => {
  const g = new THREE.Group();
  part(g, cyl(), 0x7a5a3a, 0, 0.6, 0, 0.3, 1.2, 0.3);
  part(g, ball(), 0x2f8a46, 0, 1.45, 0, 1.6, 1.0, 1.6);
  part(g, ball(), 0x3c9e52, 0.4 * (rng.next() - 0.5), 1.85, 0.2, 1.0, 0.7, 1.0);
  return g;
};
const ruin: Prop = (rng) => {
  const g = new THREE.Group();
  const n = 1 + rng.int(0, 2);
  for (let i = 0; i < n; i++) part(g, box(), 0xb7b2a0, 0, 0.3 + i * 0.6, 0, 0.7 - i * 0.08, 0.6, 0.7 - i * 0.08);
  part(g, ball(), 0x4f9a4a, 0.25, n * 0.6, 0.2, 0.35, 0.2, 0.35);
  return g;
};
const deadTree: Prop = (rng) => {
  const g = new THREE.Group();
  part(g, cyl(), 0x3f3550, 0, 0.6, 0, 0.18, 1.2, 0.18);
  for (const s of [-1, 1]) part(g, cyl(), 0x3f3550, s * 0.25, 1.0 + rng.next() * 0.2, 0, 0.09, 0.6, 0.09).rotation.z = s * -0.8;
  return g;
};
const pumpkin: Prop = () => {
  const g = new THREE.Group();
  part(g, ball(), 0xf08a24, 0, 0.22, 0, 0.6, 0.44, 0.6, 0x7a2c00);
  part(g, cyl(), 0x4d7a2a, 0, 0.48, 0, 0.06, 0.12, 0.06);
  return g;
};
const grave: Prop = () => {
  const g = new THREE.Group();
  part(g, box(), 0x8b8aa0, 0, 0.35, 0, 0.5, 0.7, 0.14);
  return g;
};
const lantern: Prop = () => {
  const g = new THREE.Group();
  part(g, cyl(), 0x2f2a3d, 0, 0.5, 0, 0.08, 1, 0.08);
  part(g, box(), 0xffc76a, 0, 1.05, 0, 0.24, 0.26, 0.24, 0xffa53a);
  return g;
};
const snowman: Prop = () => {
  const g = new THREE.Group();
  part(g, ball(), 0xffffff, 0, 0.3, 0, 0.6, 0.6, 0.6);
  part(g, ball(), 0xffffff, 0, 0.75, 0, 0.42, 0.42, 0.42);
  part(g, cone(), 0xf28c25, 0, 0.77, 0.22, 0.06, 0.18, 0.06).rotation.x = Math.PI / 2;
  part(g, cyl(), 0xd94a4a, 0, 0.55, 0, 0.36, 0.08, 0.36);
  return g;
};
const iceBlock: Prop = (rng) => {
  const g = new THREE.Group();
  const s = 0.35 + rng.next() * 0.3;
  part(g, box(), 0xbfe3f5, 0, s / 2, 0, s, s, s);
  return g;
};

const hay: Prop = () => {
  const g = new THREE.Group();
  part(g, cyl(), 0xe8c55a, 0, 0.32, 0, 0.78, 0.64, 0.78).rotation.z = Math.PI / 2;
  for (const x of [-0.18, 0.18]) part(g, cyl(), 0xc99a35, x, 0.32, 0, 0.8, 0.05, 0.8).rotation.z = Math.PI / 2;
  return g;
};
/** A small fenced pen that fills a board cell, so it reads as "blocked" from above as well as from the side. */
const fenceBlock: Prop = () => {
  const g = new THREE.Group();
  for (const x of [-0.38, 0.38]) for (const z of [-0.38, 0.38]) part(g, box(), 0xb7834f, x, 0.33, z, 0.16, 0.66, 0.16);
  for (const y of [0.24, 0.48]) {
    for (const z of [-0.38, 0.38]) part(g, box(), 0xd3a26b, 0, y, z, 0.86, 0.1, 0.08);
    for (const x of [-0.38, 0.38]) part(g, box(), 0xd3a26b, x, y, 0, 0.08, 0.1, 0.86);
  }
  part(g, box(), 0x9fcf7a, 0, 0.03, 0, 0.7, 0.06, 0.7);
  return g;
};
/** Headstone on a stone slab, filling its cell. */
const graveBlock: Prop = () => {
  const g = new THREE.Group();
  part(g, box(), 0x6f6c86, 0, 0.06, 0, 0.84, 0.12, 0.84);
  part(g, box(), 0x9a98b0, 0, 0.45, -0.1, 0.62, 0.7, 0.28);
  part(g, box(), 0x8b8aa0, 0, 0.16, 0.22, 0.5, 0.12, 0.3);
  return g;
};
const crate: Prop = () => {
  const g = new THREE.Group();
  part(g, box(), 0xc08a52, 0, 0.36, 0, 0.72, 0.72, 0.72);
  for (const s of [-1, 1]) part(g, box(), 0x8f5f33, 0, 0.36, s * 0.37, 0.76, 0.12, 0.03).rotation.z = s * 0.78;
  return g;
};
const log: Prop = () => {
  const g = new THREE.Group();
  part(g, cyl(), 0x8a5a3b, 0, 0.24, 0, 0.48, 0.86, 0.48).rotation.z = Math.PI / 2;
  for (const x of [-0.43, 0.43]) part(g, cyl(), 0xe0b984, x, 0.24, 0, 0.4, 0.02, 0.4).rotation.z = Math.PI / 2;
  return g;
};
const stump: Prop = () => {
  const g = new THREE.Group();
  part(g, cyl(), 0x8a5a3b, 0, 0.25, 0, 0.7, 0.5, 0.7);
  part(g, cyl(), 0xe0b984, 0, 0.505, 0, 0.6, 0.02, 0.6);
  return g;
};
const tent: Prop = () => {
  const g = new THREE.Group();
  part(g, pyramid(), 0xf2a65a, 0, 0.5, 0, 1.6, 1, 1.4).rotation.y = Math.PI / 4;
  return g;
};
const campfire: Prop = () => {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) part(g, cyl(), 0x7a5236, 0, 0.08, 0, 0.12, 0.6, 0.12).rotation.set(Math.PI / 2, (i / 3) * Math.PI, 0);
  part(g, cone(), 0xffa53a, 0, 0.3, 0, 0.3, 0.45, 0.3, 0xff7a1a);
  return g;
};
const bush: Prop = () => {
  const g = new THREE.Group();
  part(g, ball(), 0x5aa84a, 0, 0.32, 0, 0.85, 0.7, 0.85);
  part(g, ball(), 0x6dbb57, 0.15, 0.5, 0.1, 0.5, 0.4, 0.5);
  return g;
};
const pillar: Prop = () => {
  const g = new THREE.Group();
  part(g, box(), 0xb7b2a0, 0, 0.42, 0, 0.6, 0.84, 0.6);
  part(g, box(), 0xa29d8a, 0, 0.88, 0, 0.72, 0.1, 0.72);
  return g;
};
const stoneWall: Prop = () => {
  const g = new THREE.Group();
  for (const [x, y] of [[-0.22, 0.17], [0.22, 0.17], [0, 0.5]] as const) part(g, box(), 0x8d8aa0, x, y, 0, 0.44, 0.32, 0.5);
  return g;
};
const snowPile: Prop = () => {
  const g = new THREE.Group();
  part(g, ball(), 0xffffff, 0, 0.18, 0, 0.9, 0.45, 0.9);
  part(g, ball(), 0xf4f8fc, 0.12, 0.35, 0.05, 0.5, 0.35, 0.5);
  return g;
};
const gift: Prop = () => {
  const g = new THREE.Group();
  part(g, box(), 0xd94a4a, 0, 0.3, 0, 0.62, 0.6, 0.62);
  part(g, box(), 0xf2d16b, 0, 0.3, 0, 0.66, 0.62, 0.12);
  part(g, box(), 0xf2d16b, 0, 0.3, 0, 0.12, 0.62, 0.66);
  return g;
};
const pond = (color: number): Prop => () => {
  const g = new THREE.Group();
  const m = part(g, cyl(), color, 0, 0.01, 0, 2.4, 0.04, 1.6);
  m.castShadow = false;
  return g;
};
const shell: Prop = (rng) => {
  const g = new THREE.Group();
  part(g, ball(), [0xffc2b0, 0xfff1e0, 0xf7a9c4][rng.int(0, 2)], 0, 0.06, 0, 0.3, 0.12, 0.26);
  return g;
};
const ghostLight: Prop = () => {
  const g = new THREE.Group();
  part(g, ball(), 0xe9e4ff, 0, 1.1, 0, 0.45, 0.55, 0.45, 0x8a7fd0);
  return g;
};

/**
 * Props per stage (three sub-themes per chapter), with relative weights: landmarks are rare, filler is common.
 * The same table also decides which obstacle sits on the board in that stage (see obstacleFor).
 */
const PROPS: Record<Theme, [Array<[Prop, number]>, Array<[Prop, number]>, Array<[Prop, number]>]> = {
  village: [
    [[flowers, 7], [roundTree, 4], [rock, 1], [house(0xfdf3e0, 0x4f8fc6), 1]],
    [[hay, 3], [fence, 4], [roundTree, 3], [house(0xd9634c, 0x8a3b2c), 1], [flowers, 2]],
    [[house(0xf6e3c4, 0xd9634c), 2], [house(0xfdf3e0, 0x4f8fc6), 2], [crate, 2], [roundTree, 3], [flowers, 2]],
  ],
  forest: [
    [[tent, 2], [campfire, 1], [log, 2], [pine(false), 5], [mushroom, 2]],
    [[pond(0x6cc3e0), 3], [rock, 3], [pine(false), 4], [roundTree, 2]],
    [[pine(false), 9], [stump, 2], [mushroom, 3], [house(0x9c6b45, 0x3e6e45), 1]],
  ],
  pirate: [
    [[palm, 6], [shell, 4], [rock, 2]],
    [[barrel, 4], [crate, 3], [palm, 3], [rock, 1]],
    [[rock, 5], [chest, 2], [palm, 2], [barrel, 1]],
  ],
  jungle: [
    [[jungleTree, 6], [bush, 3], [flowers, 2]],
    [[pond(0x5cbfd9), 3], [rock, 3], [jungleTree, 4]],
    [[ruin, 5], [pillar, 2], [jungleTree, 3], [rock, 1]],
  ],
  haunted: [
    [[pumpkin, 7], [deadTree, 3], [lantern, 1]],
    [[grave, 6], [deadTree, 3], [ghostLight, 1], [lantern, 1]],
    [[stoneWall, 3], [lantern, 3], [deadTree, 2], [ghostLight, 2], [pumpkin, 1]],
  ],
  winter: [
    [[house(0xe9d7bf, 0xc7414b), 2], [pine(true), 5], [snowPile, 2], [snowman, 1]],
    [[pond(0xcfeaf7), 3], [iceBlock, 4], [pine(true), 3], [snowPile, 1]],
    [[pine(true), 5], [gift, 3], [snowman, 3], [house(0xe9d7bf, 0xc7414b), 1]],
  ],
};

/** Board obstacle per stage: hay, fences and crates in the village, logs in the forest, barrels at the harbour... */
const OBSTACLES: Record<Theme, [Prop, Prop, Prop]> = {
  village: [hay, fenceBlock, crate],
  forest: [log, rock, stump],
  pirate: [rock, barrel, crate],
  jungle: [bush, rock, pillar],
  haunted: [pumpkin, graveBlock, stoneWall],
  winter: [snowPile, iceBlock, gift],
};

/** One obstacle model for a board cell of this stage (1-3). */
export function obstacleFor(theme: Theme, stage: number, rng: Rng): THREE.Group {
  const g = OBSTACLES[theme][Math.max(0, Math.min(2, stage - 1))](rng);
  g.rotation.y = rng.int(0, 3) * (Math.PI / 2);
  return g;
}

/** Where props may go: a grid box around the board, minus `blocked` (the island and the exit lanes). */
export interface SceneryArea {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  blocked: (x: number, y: number) => boolean;
  world: (x: number, y: number) => THREE.Vector3;
}

/** Ground plane plus props; the caller drops the group on the next level (shared geometry and materials stay). */
export function buildScenery(theme: Theme, stage: number, area: SceneryArea, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const p = PALETTES[theme];
  const ground = new THREE.Mesh(geo('plane', () => new THREE.PlaneGeometry(1, 1)), mat(p.ground));
  ground.rotation.x = -Math.PI / 2;
  const c = area.world((area.minX + area.maxX) / 2, (area.minY + area.maxY) / 2);
  ground.position.set(c.x, -0.42, c.z);
  ground.scale.set(area.maxX - area.minX + 40, area.maxY - area.minY + 40, 1);
  ground.receiveShadow = true;
  ground.userData.shared = true;
  g.add(ground);

  const table = PROPS[theme][Math.max(0, Math.min(2, stage - 1))];
  const total = table.reduce((s, [, w]) => s + w, 0);
  const pick = (): Prop => {
    let r = rng.next() * total;
    for (const [prop, w] of table) { r -= w; if (r <= 0) return prop; }
    return table[0][0];
  };
  // jittered grid: one try per 1.3 cells keeps props apart without a spacing check
  const step = 1.3;
  for (let y = area.minY; y <= area.maxY; y += step) {
    for (let x = area.minX; x <= area.maxX; x += step) {
      const px = x + (rng.next() - 0.5) * 0.8;
      const py = y + (rng.next() - 0.5) * 0.8;
      if (area.blocked(px, py) || rng.next() < 0.35) continue;
      const prop = pick()(rng);
      prop.position.copy(area.world(px, py)).setY(-0.42);
      prop.rotation.y = rng.next() * Math.PI * 2;
      g.add(prop);
    }
  }
  return g;
}

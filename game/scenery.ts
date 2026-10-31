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
  village: { sky: 0xcee8f4, ground: 0x9fcf7a, rim: 0xd9c6a0, tileA: '#f8f1e1', tileB: '#f1e8d2', hemiSky: 0xffffff, hemiGround: 0xb9c9a4 },
  forest: { sky: 0xb8ddcb, ground: 0x6fa860, rim: 0xb59a72, tileA: '#f3ead6', tileB: '#eadfc6', hemiSky: 0xf4fff2, hemiGround: 0x7d9a6a },
  pirate: { sky: 0xbde6f6, ground: 0x4fb6d6, rim: 0xe4c98f, tileA: '#f7ebcb', tileB: '#efdfb8', shore: 0xf1d9a0, hemiSky: 0xffffff, hemiGround: 0x9fd0dc },
  jungle: { sky: 0xc5e4bf, ground: 0x5f9a4c, rim: 0xb8a77c, tileA: '#efe6cf', tileB: '#e5d9bd', hemiSky: 0xf2ffe8, hemiGround: 0x6f8d55 },
  haunted: { sky: 0x5c5383, ground: 0x6c628c, rim: 0x8d84a8, tileA: '#d9d3e6', tileB: '#cfc8de', hemiSky: 0xd8ccff, hemiGround: 0x4b4366 },
  winter: { sky: 0xdbebf6, ground: 0xf3f7fb, rim: 0xc9d6e2, tileA: '#fbfdff', tileB: '#eef3f8', hemiSky: 0xffffff, hemiGround: 0xc4d3e0 },
};

const geoCache = new Map<string, THREE.BufferGeometry>();
export const geo = (k: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry => {
  let g = geoCache.get(k);
  if (!g) { g = make(); geoCache.set(k, g); }
  return g;
};
const matCache = new Map<string, THREE.Material>();
export const mat = (color: number, emissive = 0): THREE.Material => {
  const k = `${color}:${emissive}`;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, emissive, emissiveIntensity: emissive ? 0.9 : 0 }); matCache.set(k, m); }
  return m;
};

export function part(g: THREE.Group, geometry: THREE.BufferGeometry, color: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, emissive = 0): THREE.Mesh {
  const m = new THREE.Mesh(geometry, mat(color, emissive));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.userData.shared = true;
  g.add(m);
  return m;
}

export const box = (): THREE.BufferGeometry => geo('box', () => new RoundedBoxGeometry(1, 1, 1, 2, 0.12));
export const ball = (): THREE.BufferGeometry => geo('ball', () => new THREE.IcosahedronGeometry(0.5, 1));
export const cone = (): THREE.BufferGeometry => geo('cone', () => new THREE.ConeGeometry(0.5, 1, 7));
export const cyl = (): THREE.BufferGeometry => geo('cyl', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8));
export const pyramid = (): THREE.BufferGeometry => geo('pyramid', () => new THREE.ConeGeometry(0.62, 1, 4));

type Prop = (rng: Rng) => THREE.Group;

const roundTree: Prop = (rng) => {
  const g = new THREE.Group();
  const h = 0.5 + rng.next() * 0.3;
  part(g, cyl(), 0x8c5835, 0, h / 2, 0, 0.22, h, 0.22);
  part(g, ball(), [0x69be50, 0x78cf57, 0x56aa43][rng.int(0, 2)], 0, h + 0.4, 0, 1.1, 1, 1.1);
  return g;
};
const pine = (snow: boolean): Prop => (rng) => {
  const g = new THREE.Group();
  const s = 0.8 + rng.next() * 0.5;
  part(g, cyl(), 0x7c5131, 0, 0.2 * s, 0, 0.2, 0.4 * s, 0.2);
  for (let i = 0; i < 3; i++) part(g, cone(), snow && i === 2 ? 0xf6fbff : 0x398c4c, 0, (0.55 + i * 0.42) * s, 0, (1.1 - i * 0.28) * s, 0.7 * s, (1.1 - i * 0.28) * s);
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
  part(g, box(), 0x8c5835, 0, 0.25, 0.51, 0.3, 0.5, 0.05);
  return g;
};
const fence: Prop = () => {
  const g = new THREE.Group();
  for (const x of [-0.45, 0, 0.45]) part(g, box(), 0xcb9a67, x, 0.25, 0, 0.1, 0.5, 0.1);
  part(g, box(), 0xcb9a67, 0, 0.32, 0, 1.0, 0.08, 0.06);
  return g;
};
const rock: Prop = (rng) => {
  const g = new THREE.Group();
  const s = 0.4 + rng.next() * 0.4;
  part(g, ball(), 0x99a0a6, 0, s * 0.3, 0, s * 1.3, s * 0.8, s);
  return g;
};
const mushroom: Prop = () => {
  const g = new THREE.Group();
  part(g, cyl(), 0xf6ead5, 0, 0.12, 0, 0.12, 0.24, 0.12);
  part(g, ball(), 0xe64439, 0, 0.28, 0, 0.4, 0.22, 0.4);
  return g;
};
const palm: Prop = (rng) => {
  const g = new THREE.Group();
  const h = 1.3 + rng.next() * 0.5;
  for (let i = 0; i < 4; i++) part(g, cyl(), 0x9e6f3f, i * 0.07, (i + 0.5) * (h / 4), 0, 0.16, h / 4 + 0.02, 0.16);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leaf = part(g, box(), 0x36a754, 0.28 + Math.cos(a) * 0.35, h, Math.sin(a) * 0.35, 0.9, 0.06, 0.28);
    leaf.rotation.set(0, -a, -0.35);
  }
  return g;
};
const barrel: Prop = () => {
  const g = new THREE.Group();
  part(g, cyl(), 0xab6e35, 0, 0.3, 0, 0.5, 0.6, 0.5);
  part(g, cyl(), 0x5c4a38, 0, 0.3, 0, 0.52, 0.06, 0.52);
  return g;
};
const chest: Prop = () => {
  const g = new THREE.Group();
  part(g, box(), 0x9e602c, 0, 0.22, 0, 0.7, 0.44, 0.48);
  part(g, box(), 0xf6ca38, 0, 0.3, 0.25, 0.12, 0.14, 0.04);
  return g;
};
const jungleTree: Prop = (rng) => {
  const g = new THREE.Group();
  part(g, cyl(), 0x7c5935, 0, 0.6, 0, 0.3, 1.2, 0.3);
  part(g, ball(), 0x268c42, 0, 1.45, 0, 1.6, 1.0, 1.6);
  part(g, ball(), 0x33a04e, 0.4 * (rng.next() - 0.5), 1.85, 0.2, 1.0, 0.7, 1.0);
  return g;
};
const ruin: Prop = (rng) => {
  const g = new THREE.Group();
  const n = 1 + rng.int(0, 2);
  for (let i = 0; i < n; i++) part(g, box(), 0xb8b29f, 0, 0.3 + i * 0.6, 0, 0.7 - i * 0.08, 0.6, 0.7 - i * 0.08);
  part(g, ball(), 0x4a9c44, 0.25, n * 0.6, 0.2, 0.35, 0.2, 0.35);
  return g;
};
const deadTree: Prop = (rng) => {
  const g = new THREE.Group();
  part(g, cyl(), 0x3f3451, 0, 0.6, 0, 0.18, 1.2, 0.18);
  for (const s of [-1, 1]) part(g, cyl(), 0x3f3451, s * 0.25, 1.0 + rng.next() * 0.2, 0, 0.09, 0.6, 0.09).rotation.z = s * -0.8;
  return g;
};
const pumpkin: Prop = () => {
  const g = new THREE.Group();
  part(g, ball(), 0xf28800, 0, 0.22, 0, 0.6, 0.44, 0.6, 0x7a2c00);
  part(g, cyl(), 0x4c7c22, 0, 0.48, 0, 0.06, 0.12, 0.06);
  return g;
};
const grave: Prop = () => {
  const g = new THREE.Group();
  part(g, box(), 0x8a89a1, 0, 0.35, 0, 0.5, 0.7, 0.14);
  return g;
};
const lantern: Prop = () => {
  const g = new THREE.Group();
  part(g, cyl(), 0x2f293e, 0, 0.5, 0, 0.08, 1, 0.08);
  part(g, box(), 0xffc76a, 0, 1.05, 0, 0.24, 0.26, 0.24, 0xffa53a);
  return g;
};
const snowman: Prop = () => {
  const g = new THREE.Group();
  part(g, ball(), 0xffffff, 0, 0.3, 0, 0.6, 0.6, 0.6);
  part(g, ball(), 0xffffff, 0, 0.75, 0, 0.42, 0.42, 0.42);
  part(g, cone(), 0xf48a00, 0, 0.77, 0.22, 0.06, 0.18, 0.06).rotation.x = Math.PI / 2;
  part(g, cyl(), 0xdc3b3b, 0, 0.55, 0, 0.36, 0.08, 0.36);
  return g;
};
const iceBlock: Prop = (rng) => {
  const g = new THREE.Group();
  const s = 0.35 + rng.next() * 0.3;
  part(g, box(), 0xbce4f7, 0, s / 2, 0, s, s, s);
  return g;
};

const hay: Prop = () => {
  const g = new THREE.Group();
  part(g, cyl(), 0xecc64d, 0, 0.32, 0, 0.78, 0.64, 0.78).rotation.z = Math.PI / 2;
  for (const x of [-0.18, 0.18]) part(g, cyl(), 0xcc9a1f, x, 0.32, 0, 0.8, 0.05, 0.8).rotation.z = Math.PI / 2;
  return g;
};
/** A small fenced pen that fills a board cell, so it reads as "blocked" from above as well as from the side. */
const fenceBlock: Prop = () => {
  const g = new THREE.Group();
  for (const x of [-0.38, 0.38]) for (const z of [-0.38, 0.38]) part(g, box(), 0xba8247, x, 0.33, z, 0.16, 0.66, 0.16);
  for (const y of [0.24, 0.48]) {
    for (const z of [-0.38, 0.38]) part(g, box(), 0xd6a164, 0, y, z, 0.86, 0.1, 0.08);
    for (const x of [-0.38, 0.38]) part(g, box(), 0xd6a164, x, y, 0, 0.08, 0.1, 0.86);
  }
  part(g, box(), 0x9ed275, 0, 0.03, 0, 0.7, 0.06, 0.7);
  return g;
};
/** Headstone on a stone slab, filling its cell. */
const graveBlock: Prop = () => {
  const g = new THREE.Group();
  part(g, box(), 0x6e6b87, 0, 0.06, 0, 0.84, 0.12, 0.84);
  part(g, box(), 0x9997b1, 0, 0.45, -0.1, 0.62, 0.7, 0.28);
  part(g, box(), 0x8a89a1, 0, 0.16, 0.22, 0.5, 0.12, 0.3);
  return g;
};
const crate: Prop = () => {
  const g = new THREE.Group();
  part(g, box(), 0xc38949, 0, 0.36, 0, 0.72, 0.72, 0.72);
  for (const s of [-1, 1]) part(g, box(), 0x915e2a, 0, 0.36, s * 0.37, 0.76, 0.12, 0.03).rotation.z = s * 0.78;
  return g;
};
const log: Prop = () => {
  const g = new THREE.Group();
  part(g, cyl(), 0x8c5835, 0, 0.24, 0, 0.48, 0.86, 0.48).rotation.z = Math.PI / 2;
  for (const x of [-0.43, 0.43]) part(g, cyl(), 0xe3b97e, x, 0.24, 0, 0.4, 0.02, 0.4).rotation.z = Math.PI / 2;
  return g;
};
const stump: Prop = () => {
  const g = new THREE.Group();
  part(g, cyl(), 0x8c5835, 0, 0.25, 0, 0.7, 0.5, 0.7);
  part(g, cyl(), 0xe3b97e, 0, 0.505, 0, 0.6, 0.02, 0.6);
  return g;
};
const tent: Prop = () => {
  const g = new THREE.Group();
  part(g, pyramid(), 0xf6a44b, 0, 0.5, 0, 1.6, 1, 1.4).rotation.y = Math.PI / 4;
  return g;
};
const campfire: Prop = () => {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) part(g, cyl(), 0x7c5131, 0, 0.08, 0, 0.12, 0.6, 0.12).rotation.set(Math.PI / 2, (i / 3) * Math.PI, 0);
  part(g, cone(), 0xffa53a, 0, 0.3, 0, 0.3, 0.45, 0.3, 0xff7a1a);
  return g;
};
const bush: Prop = () => {
  const g = new THREE.Group();
  part(g, ball(), 0x56aa43, 0, 0.32, 0, 0.85, 0.7, 0.85);
  part(g, ball(), 0x69be50, 0.15, 0.5, 0.1, 0.5, 0.4, 0.5);
  return g;
};
const pillar: Prop = () => {
  const g = new THREE.Group();
  part(g, box(), 0xb8b29f, 0, 0.42, 0, 0.6, 0.84, 0.6);
  part(g, box(), 0xa39d89, 0, 0.88, 0, 0.72, 0.1, 0.72);
  return g;
};
const stoneWall: Prop = () => {
  const g = new THREE.Group();
  for (const [x, y] of [[-0.22, 0.17], [0.22, 0.17], [0, 0.5]] as const) part(g, box(), 0x8c89a1, x, y, 0, 0.44, 0.32, 0.5);
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
  part(g, box(), 0xdc3b3b, 0, 0.3, 0, 0.62, 0.6, 0.62);
  part(g, box(), 0xf6d260, 0, 0.3, 0, 0.66, 0.62, 0.12);
  part(g, box(), 0xf6d260, 0, 0.3, 0, 0.12, 0.62, 0.66);
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
  part(g, ball(), [0xffc2b0, 0xfff1e0, 0xf9a5c3][rng.int(0, 2)], 0, 0.06, 0, 0.3, 0.12, 0.26);
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
    [[flowers, 7], [roundTree, 4], [rock, 1], [house(0xfef3df, 0x458ec9), 1]],
    [[hay, 3], [fence, 4], [roundTree, 3], [house(0xdc5b3d, 0x8c3522), 1], [flowers, 2]],
    [[house(0xf8e3c2, 0xdc5b3d), 2], [house(0xfef3df, 0x458ec9), 2], [crate, 2], [roundTree, 3], [flowers, 2]],
  ],
  forest: [
    [[tent, 2], [campfire, 1], [log, 2], [pine(false), 5], [mushroom, 2]],
    [[pond(0x64c4e3), 3], [rock, 3], [pine(false), 4], [roundTree, 2]],
    [[pine(false), 9], [stump, 2], [mushroom, 3], [house(0x9e6a3e, 0x3b6f43), 1]],
  ],
  pirate: [
    [[palm, 6], [shell, 4], [rock, 2]],
    [[barrel, 4], [crate, 3], [palm, 3], [rock, 1]],
    [[rock, 5], [chest, 2], [palm, 2], [barrel, 1]],
  ],
  jungle: [
    [[jungleTree, 6], [bush, 3], [flowers, 2]],
    [[pond(0x52c1dc), 3], [rock, 3], [jungleTree, 4]],
    [[ruin, 5], [pillar, 2], [jungleTree, 3], [rock, 1]],
  ],
  haunted: [
    [[pumpkin, 7], [deadTree, 3], [lantern, 1]],
    [[grave, 6], [deadTree, 3], [ghostLight, 1], [lantern, 1]],
    [[stoneWall, 3], [lantern, 3], [deadTree, 2], [ghostLight, 2], [pumpkin, 1]],
  ],
  winter: [
    [[house(0xead7bd, 0xca3240), 2], [pine(true), 5], [snowPile, 2], [snowman, 1]],
    [[pond(0xcdeaf8), 3], [iceBlock, 4], [pine(true), 3], [snowPile, 1]],
    [[pine(true), 5], [gift, 3], [snowman, 3], [house(0xead7bd, 0xca3240), 1]],
  ],
};

/** Grass planter with flowers, the board obstacle of the village reference (03, 04). */
const planter: Prop = (rng) => {
  const g = new THREE.Group();
  part(g, box(), 0x8d6a40, 0, 0.12, 0, 0.86, 0.24, 0.86);
  part(g, box(), 0x6bc24d, 0, 0.36, 0, 0.88, 0.3, 0.88);
  for (let i = 0; i < 4; i++) part(g, ball(), [0xffffff, 0xfff3a8, 0xffb3c7][rng.int(0, 2)], (rng.next() - 0.5) * 0.5, 0.56, (rng.next() - 0.5) * 0.5, 0.16, 0.12, 0.16);
  return g;
};

/** Board obstacle per stage: hay, fences and crates in the village, logs in the forest, barrels at the harbour... */
const OBSTACLES: Record<Theme, [Prop, Prop, Prop]> = {
  village: [planter, fenceBlock, crate],
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
  ground.position.set(c.x, -0.1, c.z);
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
      prop.position.copy(area.world(px, py)).setY(0);
      prop.rotation.y = rng.next() * Math.PI * 2;
      g.add(prop);
    }
  }
  return g;
}

/** Prop library for the composed stage scenes (game/scenes.ts). */
export const LIB = { roundTree, pine, flowers, house, fence, rock, mushroom, palm, barrel, chest, jungleTree, ruin, deadTree, pumpkin, grave, lantern, snowman, iceBlock, hay, crate, log, stump, tent, campfire, bush, pillar, stoneWall, snowPile, gift, shell, ghostLight };
export type { Prop };

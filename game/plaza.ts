import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { onBoard } from '../src/core/rules';
import type { Rng } from '../src/core/rng';
import type { Level } from '../src/core/types';
import type { Theme } from '../src/curve/curve';

/**
 * The board's floor and its rim, different per chapter so a new region reads at a glance (art reference 08):
 * village stone paving with a curb, forest wooden deck edged with logs, a sandy beach plaza ringed by surf, mossy
 * jungle slabs with vines, dark haunted cobbles behind iron posts, icy winter tiles banked with snow.
 * Everything is instanced, one draw call per kind.
 */
type Floor = 'stone' | 'plank' | 'sand' | 'moss' | 'cobble' | 'ice';
type Rim = 'curb' | 'log' | 'surf' | 'vine' | 'iron' | 'snow';

interface Style { floor: Floor; rim: Rim; a: number; b: number; bed: number; rimColor: number }

const STYLES: Record<Theme, Style> = {
  village: { floor: 'stone', rim: 'curb', a: 0xf4ead7, b: 0xe9dcc2, bed: 0xbdae92, rimColor: 0xcabfad },
  forest: { floor: 'plank', rim: 'log', a: 0xcb995f, b: 0xbc8951, bed: 0x6d4d2f, rimColor: 0x8c5835 },
  pirate: { floor: 'sand', rim: 'surf', a: 0xf5e0aa, b: 0xf0d79c, bed: 0xdcc081, rimColor: 0xffffff },
  jungle: { floor: 'moss', rim: 'vine', a: 0xcac7b1, b: 0xbebba3, bed: 0x6f7b58, rimColor: 0x4a9c44 },
  haunted: { floor: 'cobble', rim: 'iron', a: 0xa9a3c2, b: 0x9b95b8, bed: 0x655d87, rimColor: 0x564e6d },
  winter: { floor: 'ice', rim: 'snow', a: 0xe7f4fc, b: 0xd5ebf7, bed: 0xb5cfe0, rimColor: 0xffffff },
};

const geos = new Map<string, THREE.BufferGeometry>();
const g = (k: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry => {
  let v = geos.get(k);
  if (!v) { v = make(); geos.set(k, v); }
  return v;
};

function instanced(geometry: THREE.BufferGeometry, mats: THREE.Matrix4[], colors: THREE.Color[] | number, rough = 0.95): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ roughness: rough, ...(typeof colors === 'number' ? { color: colors } : {}) }), mats.length);
  mats.forEach((m, i) => mesh.setMatrixAt(i, m));
  if (typeof colors !== 'number') colors.forEach((c, i) => mesh.setColorAt(i, c));
  mesh.receiveShadow = true;
  mesh.userData.sharedGeometry = true;
  return mesh;
}

const at = (x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

export function buildPlaza(level: Level, cells: Array<{ x: number; y: number }>, theme: Theme, world: (x: number, y: number) => THREE.Vector3, rng: Rng): THREE.Group {
  const st = STYLES[theme];
  const out = new THREE.Group();
  const tone = (c: number, l = 0.05): THREE.Color => new THREE.Color(c).offsetHSL(0, (rng.next() - 0.5) * 0.04, (rng.next() - 0.5) * l);
  const pos = cells.map((c) => world(c.x, c.y));
  out.add(instanced(g('bed', () => new THREE.BoxGeometry(1, 0.1, 1)), pos.map((p) => at(p.x, -0.06, p.z)), st.bed, 1));
  // the beach plaza sits on a sand island in the sea
  if (st.rim === 'surf') out.add(instanced(g('beach', () => new RoundedBoxGeometry(3.2, 0.12, 3.2, 3, 0.5)), pos.map((p) => at(p.x, -0.1, p.z)), 0xf4da9c, 1));

  const mats: THREE.Matrix4[] = [];
  const cols: THREE.Color[] = [];
  const top = (p: THREE.Vector3, i: number): number => ((cells[i].x + cells[i].y) % 2 ? st.a : st.b);
  if (st.floor === 'plank') {
    // three boards per cell running along the board's length
    pos.forEach((p, i) => { for (const dx of [-0.32, 0, 0.32]) { mats.push(at(p.x + dx, -0.05, p.z + (rng.next() - 0.5) * 0.04, 0, 1, 1 + (rng.next() - 0.5) * 0.1, 1)); cols.push(tone(top(p, i), 0.08)); } });
    out.add(instanced(g('plank', () => new RoundedBoxGeometry(0.3, 0.12, 0.98, 2, 0.03)), mats, cols));
  } else if (st.floor === 'cobble') {
    // four small cobbles per cell
    pos.forEach((p, i) => { for (const dx of [-0.24, 0.24]) for (const dz of [-0.24, 0.24]) { mats.push(at(p.x + dx + (rng.next() - 0.5) * 0.04, -0.05, p.z + dz + (rng.next() - 0.5) * 0.04, rng.next() * 0.3)); cols.push(tone(top(p, i), 0.1)); } });
    out.add(instanced(g('cobble', () => new RoundedBoxGeometry(0.44, 0.13, 0.44, 2, 0.08)), mats, cols));
  } else {
    const size = st.floor === 'sand' ? 0.98 : 0.93;
    pos.forEach((p, i) => { mats.push(at(p.x + (rng.next() - 0.5) * 0.03, -0.055 + rng.next() * 0.012, p.z + (rng.next() - 0.5) * 0.03)); cols.push(tone(top(p, i), st.floor === 'sand' ? 0.03 : 0.05)); });
    out.add(instanced(g(`tile${size}`, () => new RoundedBoxGeometry(size, 0.12, size, 2, st.floor === 'sand' ? 0.05 : 0.05)), mats, cols, st.floor === 'ice' ? 0.3 : 0.95));
    if (st.floor === 'moss' || st.floor === 'sand') {
      // moss patches on a few slabs, shells on the sand
      const spots: THREE.Matrix4[] = [];
      pos.forEach((p) => { if (rng.next() < 0.35) spots.push(at(p.x + (rng.next() - 0.5) * 0.5, 0.012, p.z + (rng.next() - 0.5) * 0.5, rng.next() * 3, st.floor === 'sand' ? 0.12 : 0.3 + rng.next() * 0.2, 1, st.floor === 'sand' ? 0.1 : 0.2 + rng.next() * 0.2)); });
      out.add(instanced(g('spot', () => new THREE.CylinderGeometry(0.5, 0.5, 0.02, 10)), spots, st.floor === 'sand' ? 0xffd9c7 : 0x7eb054, 1));
    }
  }

  // rim along every edge that faces off the board
  const edges: THREE.Matrix4[] = [];
  const posts: THREE.Matrix4[] = [];
  for (const c of cells) {
    const p = world(c.x, c.y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (onBoard(level, c.x + dx, c.y + dy)) continue;
      const ry = dy !== 0 ? Math.PI / 2 : 0;
      edges.push(at(p.x + dx * 0.56, -0.02, p.z + dy * 0.56, ry));
      if (st.rim === 'iron' && (c.x + c.y) % 2 === 0) posts.push(at(p.x + dx * 0.58, 0.2, p.z + dy * 0.58));
    }
  }
  const rimGeo: Record<Rim, () => THREE.BufferGeometry> = {
    curb: () => new RoundedBoxGeometry(0.16, 0.16, 1.14, 2, 0.05),
    log: () => new THREE.CylinderGeometry(0.11, 0.11, 1.12, 8).rotateX(Math.PI / 2),
    surf: () => new RoundedBoxGeometry(0.3, 0.06, 1.2, 2, 0.03),
    vine: () => new RoundedBoxGeometry(0.2, 0.18, 1.14, 3, 0.09),
    iron: () => new RoundedBoxGeometry(0.16, 0.14, 1.14, 2, 0.04),
    snow: () => new RoundedBoxGeometry(0.3, 0.22, 1.2, 3, 0.11),
  };
  const rim = instanced(g(`rim-${st.rim}`, rimGeo[st.rim]), edges, st.rim === 'iron' ? 0x736c8b : st.rimColor, st.rim === 'surf' ? 0.4 : 0.9);
  rim.castShadow = st.rim !== 'surf';
  out.add(rim);
  if (posts.length) out.add(instanced(g('ironpost', () => new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6)), posts, st.rimColor, 0.6));
  return out;
}

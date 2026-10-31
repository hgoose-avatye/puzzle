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
function mesh(g: THREE.Group, geo: THREE.BufferGeometry, color: number | THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, typeof color === 'number' ? material(color) : color);
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

/**
 * Tapered part (ears, wings, tails, snouts): a rounded box whose local +Y runs from its base, at the origin and pivot,
 * to its tip. Towards the tip it narrows to tx / tz of its width / depth, and the tip moves sweep along Z.
 */
function tapered(g: THREE.Group, x: number, y: number, z: number, w: number, h: number, d: number, c: number | THREE.Material, o: { r?: number; tx?: number; tz?: number; sweep?: number; rot?: [number, number, number] } = {}): THREE.Mesh {
  const { r = 0.04, tx = 0.5, tz = 0.5, sweep = 0, rot = [0, 0, 0] } = o;
  const geo = geometry(`taper:${w}:${h}:${d}:${r}:${tx}:${tz}:${sweep}`, () => {
    const t3 = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w * 0.3, d * 0.3, h * 0.3));
    const p = t3.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) + h / 2) / h;
      p.setXYZ(i, p.getX(i) * (1 - (1 - tx) * t), p.getY(i) + h / 2, p.getZ(i) * (1 - (1 - tz) * t) + sweep * t * t);
    }
    t3.computeVertexNormals();
    return t3;
  });
  const m = mesh(g, geo, c, x, y, z);
  m.rotation.set(...rot);
  return m;
}
/** Rotation that points a tapered part's tip back (-Z), raised by elev radians. */
const backUp = (elev: number): [number, number, number] => [-(Math.PI / 2 - elev), 0, 0];
/** Rotation that points a tapered part's tip forward (+Z), raised by elev radians. */
const frontUp = (elev: number): [number, number, number] => [Math.PI / 2 - elev, 0, 0];
/** Rotation that hangs a tapered part down from its base, its tip out to side sx by a radians. */
const hang = (sx: number, a: number): [number, number, number] => [0, 0, Math.PI + sx * a];

/**
 * Markings are painted into the body by the shader instead of plates stuck on: the base colour, with the mark colour
 * where the GLSL `inside` (world units, positive inside the mark) is above zero. The GLSL sees p (position in the part,
 * centre at 0), hw/hh/hd (half extents), v (0 floor .. 1 top), u (-1 back .. 1 front), s (0 middle .. 1 side),
 * blob(p, centre, radii) and band(x, centre, width). yShift moves p for tapered parts, whose geometry starts at the base.
 */
const marked = new Map<string, THREE.MeshStandardMaterial>();
function markMaterial(base: number, mark: number, glsl: string, [W, H, D]: [number, number, number], yShift = 0): THREE.MeshStandardMaterial {
  const key = `${base}:${mark}:${glsl}:${W}:${H}:${D}:${yShift}`;
  let mat = marked.get(key);
  if (mat) return mat;
  // colour holds the base so code reading a body's colour (bodyColor) still gets it
  mat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.78, metalness: 0 });
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.cMark = { value: new THREE.Color(mark) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvLocal = transformed - vec3(0.0, ${yShift.toFixed(4)}, 0.0);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vLocal;
        uniform vec3 cMark;
        float blob(vec3 p, vec3 c, vec3 r) { return (1.0 - length((p - c) / r)) * min(r.x, min(r.y, r.z)); }
        float band(float x, float c, float w) { return w * 0.5 - abs(x - c); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 p = vLocal;
        float hw = ${(W / 2).toFixed(4)}, hh = ${(H / 2).toFixed(4)}, hd = ${(D / 2).toFixed(4)};
        float v = (p.y + hh) / (2.0 * hh), u = p.z / hd, s = abs(p.x) / hw;
        float inside = -1.0;
        ${glsl}
        float aa = fwidth(inside) * 0.8 + 0.002;
        diffuseColor.rgb = mix(diffuseColor.rgb, cMark, smoothstep(-aa, aa, inside));`);
  };
  marked.set(key, mat);
  return mat;
}
/** A tapered part painted with its own mark (tail tips, wing bands, tail stripes). */
function markedTapered(g: THREE.Group, x: number, y: number, z: number, w: number, h: number, d: number, base: number, mark: number, glsl: string, o: Parameters<typeof tapered>[8]): THREE.Mesh {
  return tapered(g, x, y, z, w, h, d, markMaterial(base, mark, glsl, [w, h, d], h / 2), o);
}

/** The body block: a little rounder at the corners than a plain block, the flanks a touch fuller. */
function bodyGeometry(W: number, H: number, D: number, r: number): THREE.BufferGeometry {
  return geometry(`body:${W}:${H}:${D}:${r}`, () => {
    const seg = 18;
    const box = new THREE.BoxGeometry(W, H, D, seg, seg, seg);
    const pos = box.attributes.position;
    const nor = box.attributes.normal;
    const inner = new THREE.Vector3(W / 2 - r, H / 2 - r, D / 2 - r);
    const lo = inner.clone().negate();
    const v = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      c.copy(v).clamp(lo, inner);
      const off = v.clone().sub(c);
      if (off.lengthSq() > 1e-12) {
        off.normalize();
        nor.setXYZ(i, off.x, off.y, off.z);
        v.copy(c).addScaledVector(off, r);
      }
      const full = Math.max(0, 1 - (((v.y + H / 2) / H - 0.45) / 0.65) ** 2);
      pos.setXYZ(i, v.x * (1 + 0.03 * full), v.y, v.z);
    }
    return box;
  });
}
/** The segment's body, first child of its group; mark is [colour, GLSL] for painted markings. */
function body(g: THREE.Group, f: Frame, color: number, mark: [number, string] | null = null, r = 0.24): void {
  mesh(g, bodyGeometry(f.W, f.H, f.D, r), mark ? markMaterial(color, mark[0], mark[1], [f.W, f.H, f.D]) : color, 0, B0 + f.H / 2, f.zc);
}

/* GLSL markings shared by several animals */
/** A pale belly that carries round the front of both sides: far forward up by the face, furthest back at the belly. */
const BELLY_WRAP = (top: number, back: number, low = 0.08): string =>
  `float edge = ${back.toFixed(3)} + 0.55 * smoothstep(${(top - 0.25).toFixed(3)}, ${top.toFixed(3)}, v) + 0.35 * (1.0 - smoothstep(${low.toFixed(3)}, ${(low + 0.2).toFixed(3)}, v));
   inside = min(min((u - edge) * hd, (v - ${low.toFixed(3)}) * 2.0 * hh), (${top.toFixed(3)} - v) * 2.0 * hh);`;
const LOWER_BAND = (top: number): string => `inside = (${top.toFixed(3)} - v) * 2.0 * hh;`;
/** Penguin coat: white face and belly in front, carried round the sides; the cap dips a little at the sides. */
const PENGUIN_COAT = `float capEdge = 0.8 - 0.07 * s * s;
   float edge = 0.1 + 0.6 * smoothstep(0.42, 0.82, v) + 0.35 * (1.0 - smoothstep(0.08, 0.3, v));
   inside = min(min((u - edge) * hd, (v - 0.09) * 2.0 * hh), (capEdge - v) * 2.0 * hh);`;

/** Birds stand on two stout legs with flat feet pointing forward. */
function birdFeet(g: THREE.Group, c: number): void {
  for (const sx of [-1, 1]) {
    cube(g, sx * 0.22, 0.14, -0.02, 0.24, 0.28, 0.28, c, 0.08);
    cube(g, sx * 0.22, 0.04, 0.16, 0.3, 0.08, 0.34, c, 0.035);
  }
}
/** Wings hang from the shoulders, thinner and swept back towards the tip, which stands out from the body. */
function wings(g: THREE.Group, f: Frame, c: number, mark: [number, string] | null = null): void {
  for (const sx of [-1, 1]) {
    const o = { r: 0.05, tx: 0.6, tz: 0.5, sweep: -0.08, rot: hang(sx, 0.28) };
    const x = sx * (f.W / 2 + 0.03);
    const m = mark ? markedTapered(g, x, B0 + 0.66, f.zc - 0.04, 0.12, 0.44, 0.36, c, mark[0], mark[1], o) : tapered(g, x, B0 + 0.66, f.zc - 0.04, 0.12, 0.44, 0.36, c, o);
    m.rotation.y = -sx * 0.1;
  }
}
/** Penguin flipper: thick at the shoulder, thinner and swept back to the tip, its outer face bowed like a wing. */
function flipper(g: THREE.Group, sx: number, x: number, y: number, z: number, c: number): THREE.Mesh {
  const h = 0.5;
  const geo = geometry(`flipper:${sx}`, () => {
    const b = new RoundedBoxGeometry(0.13, h, 0.36, 3, 0.055);
    const p = b.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = (h / 2 - p.getY(i)) / h; // 0 shoulder, 1 tip
      const px = p.getX(i);
      p.setX(i, px * (1 - 0.45 * t) + (px * sx > 0 ? sx * 0.025 * Math.sin(Math.PI * Math.min(1, t * 1.3)) : 0));
      p.setZ(i, p.getZ(i) * (1 - 0.55 * t) - 0.09 * t * t);
    }
    b.computeVertexNormals();
    return b;
  });
  return mesh(g, geo, c, x, y, z);
}
/** Four-sided wedge pointing forward: the penguin's small beak. */
function beak(g: THREE.Group, x: number, y: number, z: number, c: number): THREE.Mesh {
  return mesh(g, geometry('beak', () => {
    const b = new THREE.ConeGeometry(0.12, 0.2, 4);
    b.rotateY(Math.PI / 4);
    b.rotateX(Math.PI / 2);
    b.scale(1, 0.62, 1);
    return b;
  }), c, x, y, z);
}

const WHITE = 0xfffcfa;
const PUPIL = 0x6b4d44;
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
  const { W, H, fz, bz, top, zc } = f;
  const yE = B0 + H * 0.55; // eye line
  /** Legs: one pair at the front of the head and one at the back of the tail; every segment for crawlers. */
  const legsAt = (c: number, every = false, x = 0.3, h = 0.32): void => {
    const zs = n === 1 || every ? [0.24, -0.24] : [head ? 0.24 : -0.24];
    if (!every && n > 1 && !head && !last) return;
    for (const sx of [-x, x]) for (const z of zs) leg(g, sx, z + zc, c, h);
  };

  // 70:30: the block body stays, its corners a little softer; markings are painted in, ears, wings and tails are
  // tapered 3D parts; the face end sticks out forward and the tail out back, so the front reads side-on too.
  switch (type) {
    case 'penguin': {
      const dark = 0x646d83;
      const fin = 0x555d72;
      body(g, f, dark, head ? [0xf8f5f1, PENGUIN_COAT] : null);
      if (n === 1) birdFeet(g, 0xf7a000);
      else legsAt(0xf7a000, false, 0.26, 0.24);
      if (head) {
        eyes(g, fz + 0.035, B0 + H * 0.56, 0.21);
        beak(g, 0, B0 + 0.36, fz + 0.12, 0xf7a000); // small wedge sticking out of the face
        for (const sx of [-1, 1]) flipper(g, sx, sx * (W / 2 + 0.03), B0 + 0.45, zc - 0.05, fin).rotation.set(0, -sx * 0.12, sx * 0.3);
        for (const [x, hh] of [[-0.09, 0.14], [0, 0.21], [0.09, 0.14]] as const) cube(g, x, top + hh / 2 - 0.03, zc - 0.06, 0.09, hh, 0.1, fin, 0.04); // tuft
      }
      // short fan tail out of the lower back, tipped down: flat and narrowing, so it never reads as a second beak
      if (last) tapered(g, 0, B0 + 0.12, bz + 0.07, 0.3, 0.22, 0.08, fin, { r: 0.035, tx: 0.4, tz: 0.65, rot: backUp(-0.45) });
      break;
    }
    case 'chick': {
      const yellow = 0xffcf3f;
      body(g, f, yellow, head ? [0xffe9a6, BELLY_WRAP(0.6, 0.15)] : null); // pale belly round the front of both sides
      if (n === 1) birdFeet(g, 0xf39300);
      else legsAt(0xf39300, false, 0.25, 0.24);
      if (head) {
        eyes(g, fz + 0.02, yE + 0.02, 0.23);
        tapered(g, 0, B0 + 0.4, fz - 0.02, 0.22, 0.2, 0.16, 0xf48a00, { r: 0.04, tx: 0.2, tz: 0.3, rot: frontUp(-0.1) }); // beak
        for (const sx of [-1, 1]) oval(g, sx * 0.36, B0 + 0.36, fz + 0.02, 0.1, 0.06, 0.02, 0xff948a); // blush
        wings(g, f, 0xfabc00);
        cube(g, -0.05, top + 0.08, zc, 0.12, 0.22, 0.14, yellow, 0.05);
        cube(g, 0.08, top + 0.05, zc - 0.02, 0.12, 0.14, 0.14, yellow, 0.05); // head tuft
      }
      if (last) tapered(g, 0, B0 + 0.5, bz + 0.06, 0.3, 0.26, 0.1, 0xe3a812, { r: 0.04, tx: 0.55, tz: 0.6, rot: backUp(0.55) }); // mustard fan tail, never the beak's orange
      break;
    }
    case 'parrot': {
      const red = 0xe83500;
      body(g, f, red, head ? [0xfff1e6, 'inside = min((u - 0.62) * hd, band(v, 0.6, 0.36) * 2.0 * hh);'] : null); // pale face round the eyes
      if (n === 1) birdFeet(g, 0x91513c);
      else legsAt(0x91513c, false, 0.25, 0.24);
      if (head) {
        eyes(g, fz + 0.02, yE + 0.04, 0.25);
        tapered(g, 0, B0 + 0.5, fz - 0.03, 0.28, 0.3, 0.24, 0x6b717e, { r: 0.08, tx: 0.35, tz: 0.4, sweep: -0.12, rot: frontUp(0.25) }); // hooked beak curling down
        cube(g, 0, B0 + 0.3, fz + 0.06, 0.16, 0.12, 0.14, 0x6b717e, 0.05);
        wings(g, f, 0x007dd4, [0xfbd100, 'inside = -p.y - 0.06;']); // yellow band near the tip
        for (const [x, hh] of [[-0.11, 0.2], [0, 0.3], [0.11, 0.2]] as const) tapered(g, x, top - 0.04, zc - 0.08, 0.11, hh, 0.12, 0xf44900, { r: 0.04, tx: 0.6, tz: 0.6, rot: backUp(1.2) }); // crest
      }
      if (last) for (const [x, c] of [[-0.08, 0x007dd4], [0.08, 0xfbd100]] as const) tapered(g, x, B0 + 0.4, bz + 0.06, 0.13, 0.32, 0.07, c, { r: 0.03, tx: 0.55, tz: 0.8, rot: backUp(0.4) }); // tail feathers
      break;
    }
    case 'cow': {
      const white = 0xf7f3f0;
      const black = 0x605b66;
      // irregular black patches painted on (09); the head's covers one eye
      const spots = head
        ? 'inside = max(blob(p, vec3(0.26, 0.12, 0.56), vec3(0.2, 0.22, 0.2)), blob(p, vec3(0.22, 0.5, -0.12), vec3(0.32, 0.18, 0.3)));'
        : `inside = max(max(blob(p, vec3(-0.2, 0.45, 0.15), vec3(0.32, 0.2, 0.3)), blob(p, vec3(0.3, 0.3, -0.2), vec3(0.26, 0.3, 0.3))),
                        max(blob(p, vec3(-0.47, 0.0, -0.05), vec3(0.12, 0.24, 0.3)), blob(p, vec3(0.0, 0.45, -0.42), vec3(0.2, 0.15, 0.14))));`;
      body(g, f, white, [black, spots]);
      legsAt(white);
      if (head || last) for (const sx of [-0.3, 0.3]) for (const z of n === 1 ? [0.24, -0.24] : [head ? 0.24 : -0.24]) cube(g, sx, 0.05, z + zc, 0.31, 0.1, 0.31, black, 0.04); // hooves
      if (head) {
        cube(g, 0, B0 + 0.24, fz + 0.04, 0.62, 0.32, 0.18, 0xfd979a, 0.14); // muzzle
        for (const sx of [-1, 1]) oval(g, sx * 0.13, B0 + 0.26, fz + 0.135, 0.05, 0.06, 0.02, 0xc85969);
        eyes(g, fz + 0.02, yE + 0.04, 0.24);
        for (const sx of [-1, 1]) {
          tapered(g, sx * (W / 2 - 0.06), top - 0.14, zc + 0.08, 0.16, 0.26, 0.2, black, { r: 0.05, tx: 0.6, tz: 0.4, rot: [0, 0, -sx * (Math.PI / 2 + 0.2)] }); // ears out to the sides
          tapered(g, sx * 0.24, top - 0.04, zc + 0.12, 0.13, 0.26, 0.13, 0xf0c992, { r: 0.04, tx: 0.4, tz: 0.4, rot: [0.15, 0, -sx * 0.35] }); // horns
        }
      }
      if (last) {
        // thin white tail rising up and back from the top of the rump, a black tuft at its tip
        tapered(g, 0, top - 0.06, bz + 0.08, 0.08, 0.4, 0.08, white, { r: 0.03, tx: 0.7, tz: 0.7, rot: backUp(1.15) });
        oval(g, 0, top + 0.3, bz - 0.06, 0.08, 0.1, 0.08, black);
      }
      break;
    }
    case 'pig': {
      const pink = 0xff95b1;
      body(g, f, pink, head ? null : [0xf97fa0, 'inside = blob(p, vec3(0.47, 0.08, 0.05), vec3(0.1, 0.18, 0.22));']); // darker side spot
      legsAt(0xa85a6f);
      if (head) {
        cube(g, 0, B0 + 0.3, fz + 0.06, 0.42, 0.3, 0.2, 0xfc7198, 0.12); // snout
        for (const sx of [-1, 1]) oval(g, sx * 0.09, B0 + 0.3, fz + 0.16, 0.04, 0.055, 0.02, 0xc13f66);
        eyes(g, fz + 0.01, yE + 0.04, 0.24);
        for (const sx of [-1, 1]) tapered(g, sx * 0.3, top - 0.04, zc + 0.1, 0.3, 0.3, 0.07, 0xfa7296, { r: 0.03, tx: 0.3, tz: 1, rot: [1.0, 0, -sx * 0.3] }); // pointed ears folded forward
      }
      if (last) ring(g, 0, top - 0.08, bz + 0.06, 0.16, 0.055, 0xfa7296).rotation.y = Math.PI / 3; // curly tail loop
      break;
    }
    case 'fox': {
      const orange = 0xf58600;
      const cream = 0xfdf4e3;
      body(g, f, orange, [cream, head ? BELLY_WRAP(0.45, 0.3, -0.1) : LOWER_BAND(0.2)]); // cream cheeks, chest and belly line
      legsAt(0x86503d);
      if (head) {
        tapered(g, 0, B0 + 0.26, fz - 0.08, 0.34, 0.2, 0.24, cream, { r: 0.07, tx: 0.6, tz: 0.6, rot: frontUp(0) }); // muzzle out to a point
        oval(g, 0, B0 + 0.27, fz + 0.13, 0.07, 0.055, 0.05, 0x60515c);
        eyes(g, fz + 0.02, yE + 0.04, 0.24);
        for (const sx of [-1, 1]) {
          pyramid(g, sx * 0.29, top + 0.26, zc - 0.02, 0.35, 0.6, orange, -sx * 0.1); // big triangle ears
          pyramid(g, sx * 0.29, top + 0.2, zc + 0.12, 0.19, 0.4, cream, -sx * 0.1);
          pyramid(g, sx * 0.315, top + 0.5, zc - 0.02, 0.12, 0.17, 0x86503d, -sx * 0.1); // dark tips
        }
      }
      if (last) markedTapered(g, 0, top - 0.12, bz + 0.22, 0.4, 0.56, 0.34, orange, cream, 'inside = p.y - 0.1;', { r: 0.15, tx: 0.45, tz: 0.5, rot: backUp(1.05) }); // bushy tail, cream tip
      break;
    }
    case 'tiger': {
      const yellow = 0xfbb900;
      const stripe = 0xab6c36;
      // stripes run over the back as one band and taper to points down the sides; a forehead mark on the head (01)
      const bands = head ? (n === 1 ? [-0.25] : [-0.32]) : [0.28, 0, -0.28];
      const glsl = bands.map((z) => `inside = max(inside, band(p.z + 0.04 * sin(p.x * 9.0), ${z.toFixed(3)}, 0.13 * smoothstep(0.35, 0.8, v)));`).join('\n')
        + (head ? '\ninside = max(inside, min(band(p.x, 0.0, 0.08), min(v - 0.97, p.z)));' : '');
      body(g, f, yellow, [stripe, glsl]);
      legsAt(yellow);
      if (head) {
        cube(g, 0, B0 + 0.26, fz + 0.04, 0.5, 0.3, 0.14, 0xfff0c8, 0.13); // muzzle
        oval(g, 0, B0 + 0.37, fz + 0.12, 0.1, 0.075, 0.06, 0x7d4f34); // dark nose
        eyes(g, fz + 0.02, yE + 0.05, 0.24);
        for (const sx of [-1, 1]) {
          oval(g, sx * 0.34, top + 0.06, zc + 0.12, 0.17, 0.15, 0.1, stripe); // round ears
          oval(g, sx * 0.34, top + 0.05, zc + 0.2, 0.09, 0.08, 0.04, 0xfff0c8);
        }
      }
      if (last) markedTapered(g, 0, top - 0.1, bz + 0.14, 0.16, 0.56, 0.16, yellow, stripe, 'inside = band(fract(p.y * 4.0 + 0.5), 0.5, 0.3) * 0.25;', { r: 0.06, tx: 0.7, tz: 0.7, rot: backUp(1.2) }); // striped tail up
      break;
    }
    case 'husky': {
      const gray = 0x838190;
      const white = 0xf6f6f6;
      // white face, centre blaze and belly painted in
      const mask = head
        ? 'inside = max(max(min((u - 0.45) * hd, (0.55 - v) * 2.0 * hh), min((u - 0.85) * hd, band(p.x, 0.0, 0.2))), (0.3 - v) * 2.0 * hh);'
        : LOWER_BAND(0.38);
      body(g, f, gray, [white, mask]);
      legsAt(white);
      if (head) {
        tapered(g, 0, B0 + 0.27, fz - 0.08, 0.32, 0.2, 0.22, white, { r: 0.07, tx: 0.65, tz: 0.6, rot: frontUp(0) }); // muzzle
        oval(g, 0, B0 + 0.28, fz + 0.13, 0.07, 0.055, 0.05, 0x554f61);
        eyes(g, fz + 0.02, yE + 0.04, 0.24);
        for (const sx of [-1, 1]) {
          pyramid(g, sx * 0.29, top + 0.24, zc - 0.02, 0.34, 0.58, gray, -sx * 0.1); // big pointed ears
          pyramid(g, sx * 0.29, top + 0.19, zc + 0.12, 0.18, 0.38, 0xd8d3dd, -sx * 0.1);
        }
        cube(g, 0, B0 + 0.08, fz - 0.02, W * 0.86, 0.09, 0.08, 0xd90600, 0.03); // red collar
        oval(g, 0, B0 + 0.02, fz + 0.04, 0.07, 0.07, 0.06, 0xefb300); // bell
      }
      if (last) markedTapered(g, 0, top - 0.1, bz + 0.12, 0.26, 0.5, 0.26, gray, white, 'inside = p.y - 0.1;', { r: 0.1, tx: 0.55, tz: 0.55, sweep: 0.12, rot: backUp(1.1) }); // curled tail, white tip
      break;
    }
    case 'snake': {
      const green = head ? 0x39bf41 : 0x57c55c;
      // pale belly band, light chin, diamonds down the back
      const glsl = head
        ? 'inside = max((0.22 - v) * 2.0 * hh, min((u - 0.7) * hd, (0.4 - v) * 2.0 * hh));'
        : 'inside = max((0.22 - v) * 2.0 * hh, max(0.13 - abs(p.x) - abs(p.z - 0.2), 0.13 - abs(p.x) - abs(p.z + 0.2)) * step(0.9, v));';
      body(g, f, green, [0xd3e32d, glsl], 0.22);
      if (head) {
        eyes(g, fz + 0.01, yE + 0.12, 0.25, 1.05);
        for (const sx of [-1, 1]) oval(g, sx * 0.07, B0 + 0.48, fz + 0.03, 0.03, 0.025, 0.02, 0x5a5a5a);
        cube(g, 0, B0 + 0.2, fz + 0.05, 0.09, 0.04, 0.16, 0xe8002f, 0.02); // tongue
        for (const sx of [-1, 1]) cube(g, sx * 0.05, B0 + 0.2, fz + 0.14, 0.05, 0.04, 0.08, 0xe8002f, 0.015).rotation.y = sx * 0.4;
      }
      if (last && n > 1) tapered(g, 0, B0 + 0.3, bz + 0.16, 0.5, 0.26, 0.4, green, { r: 0.12, tx: 0.25, tz: 0.35, rot: backUp(-0.1) }); // tail narrowing to a tip
      break;
    }
    case 'caterpillar': {
      const pink = head ? 0xff7091 : 0xff97b3;
      body(g, f, pink, head ? null : [0xffd3de, `inside = max(max(blob(p, vec3(-0.22, 0.44, 0.2), vec3(0.1, 0.06, 0.1)), blob(p, vec3(0.24, 0.44, -0.1), vec3(0.1, 0.06, 0.1))),
        max(blob(p, vec3(0.47, 0.06, 0.12), vec3(0.05, 0.09, 0.09)), blob(p, vec3(-0.47, 0.06, -0.12), vec3(0.05, 0.09, 0.09))));`], 0.26); // pale spots
      legsAt(0xc13664, true, 0.28, 0.26);
      if (head) {
        eyes(g, fz + 0.01, yE + 0.02, 0.24);
        oval(g, 0, B0 + 0.3, fz + 0.08, 0.12, 0.1, 0.1, 0xe8003d); // round nose
        for (const sx of [-1, 1]) {
          tapered(g, sx * 0.2, top - 0.02, zc + 0.05, 0.08, 0.32, 0.08, 0xfb5c85, { r: 0.03, tx: 0.7, tz: 0.7, rot: [0.35, 0, -sx * 0.25] }); // antennae
          oval(g, sx * 0.27, top + 0.3, zc + 0.15, 0.09, 0.09, 0.09, 0xe8003d);
        }
      }
      if (last && n > 1) tapered(g, 0, B0 + 0.3, bz + 0.1, 0.4, 0.26, 0.3, pink, { r: 0.1, tx: 0.4, tz: 0.4, rot: backUp(0.1) });
      break;
    }
    case 'dachshund': {
      const brown = 0xc27645;
      const tan = 0xf2ae41;
      // tan chest, cheeks and eyebrow points
      const glsl = head
        ? 'inside = max(min((u - 0.5) * hd, (0.42 - v) * 2.0 * hh), max(blob(p, vec3(-0.22, 0.27, 0.56), vec3(0.08, 0.05, 0.06)), blob(p, vec3(0.22, 0.27, 0.56), vec3(0.08, 0.05, 0.06))));'
        : LOWER_BAND(0.16);
      body(g, f, brown, [tan, glsl]);
      legsAt(0x925836, false, 0.3, 0.26);
      if (head) {
        tapered(g, 0, B0 + 0.3, fz - 0.12, 0.46, 0.26, 0.3, tan, { r: 0.1, tx: 0.75, tz: 0.7, rot: frontUp(0) }); // long muzzle
        oval(g, 0, B0 + 0.32, fz + 0.12, 0.09, 0.07, 0.06, 0x60515c);
        eyes(g, fz + 0.01, yE + 0.06, 0.24);
        for (const sx of [-1, 1]) tapered(g, sx * (W / 2 + 0.02), top - 0.06, zc + 0.05, 0.1, 0.62, 0.34, 0x925836, { r: 0.05, tx: 0.8, tz: 1.2, sweep: -0.04, rot: hang(sx, 0.12) }); // long floppy ears
        cube(g, 0, B0 + 0.12, zc - 0.48, W + 0.02, 0.14, 0.14, 0x3d75c9, 0.04); // blue collar
      }
      if (last) tapered(g, 0, top - 0.08, bz + 0.14, 0.12, 0.44, 0.12, brown, { r: 0.05, tx: 0.45, tz: 0.45, rot: backUp(1.1) }); // tail up
      break;
    }
    case 'crocodile': {
      const green = head ? 0x58c265 : 0x51be62;
      const yellow = 0xe0d83e;
      body(g, f, green, [yellow, LOWER_BAND(0.2)], 0.18); // yellow belly
      // four short side legs in all: front pair at the back of the head block, hind pair at the front of the tail block
      const legZ = n === 1 ? [0.2, -0.2] : head ? [-0.2] : last ? [0.2] : [];
      for (const sx of [-1, 1]) for (const z of legZ) cube(g, sx * (W / 2 - 0.02), 0.12, z + zc, 0.22, 0.24, 0.26, 0x48af57, 0.06);
      for (const sx of [-0.22, 0.22]) for (const z of head ? [-0.25] : [0.2, -0.2]) pyramid(g, sx, top + 0.08, z + zc, 0.1, 0.18, 0x3ca950); // back spikes
      if (head) {
        cube(g, 0, B0 + 0.3, fz - 0.1, 0.84, 0.3, 0.42, green, 0.13); // upper jaw, kept inside its own cell
        cube(g, 0, B0 + 0.12, fz - 0.1, 0.82, 0.12, 0.4, yellow, 0.05); // lower jaw
        for (const sx of [-1, 1]) for (const z of [-0.24, -0.14, -0.04, 0.06]) taper(g, sx * 0.4, B0 + 0.17, fz + z, 0.045, 0.12, 0xfcf3d8, Math.PI); // teeth
        for (const sx of [-1, 1]) oval(g, sx * 0.14, B0 + 0.46, fz + 0.09, 0.04, 0.03, 0.03, 0x3c9149); // nostrils
        for (const sx of [-1, 1]) {
          oval(g, sx * 0.26, top + 0.06, zc + 0.25, 0.17, 0.16, 0.17, green); // eye bumps
          oval(g, sx * 0.26, top + 0.1, zc + 0.39, 0.13, 0.13, 0.03, WHITE);
          oval(g, sx * 0.26, top + 0.09, zc + 0.415, 0.08, 0.09, 0.02, PUPIL);
        }
      }
      if (last && n > 1) tapered(g, 0, B0 + 0.24, bz + 0.16, 0.5, 0.26, 0.26, green, { r: 0.08, tx: 0.2, tz: 0.4, rot: backUp(-0.1) }); // tail tapering to a point
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
      mark(cube(g, 0, f.top + 0.004, f.fz - 0.15, 0.76, 0.035, 0.28, 0xf8f5f1, 0.04));
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

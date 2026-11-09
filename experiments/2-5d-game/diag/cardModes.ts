/**
 * DIAGNOSIS ONLY (vite.diag.config.ts). Swaps game/animals.ts's `./blocks` for one of three card placements, chosen with
 * ?cardmode=A|B|C, so the same pictures and manifests can be compared in the real game camera and board:
 *  A  the current renderer (spriteCards.ts, unchanged): camera-facing card, anchor at y=0, slid toward the camera by the
 *     picture height under the anchor and rescaled.
 *  B  world-anchored: camera-facing card, anchor pixel ON the plate top (y = PLATE_TOP), no slide, no rescale.
 *  C  screen-anchored: the anchor pixel is put exactly on the screen projection of the plate-top floor point and the card
 *     is sized from the projected cell width there; the card itself sits at the depth of the block centre.
 * Every card mesh gets userData.spriteCard (as A does) and userData.diag for the measuring script. spriteCards.ts and the
 * game are untouched.
 */
import * as THREE from 'three';
import { buildAnimal as buildA } from '../spriteCards';
import { nearestSprite, offsetWeight, partsFor, type SpeciesSprites } from '../../2-5d-crocodile/src/sprites';
import { TUCK } from '../../2-5d-crocodile/src/spriteRender';

const query = new URLSearchParams(location.search);
const MODE = query.get('cardmode') ?? 'A';
/** ?alphahit=1: taps that land on a transparent texel of a card go through it (Mesh.raycast filtered by the picture's alpha) */
const ALPHA_HIT = query.get('alphahit') === '1';
/** ?offsetscale=0..1 (B, C only): how much of the manifests' 0°/180° joining offsets to apply, for the length check */
const OFFSET_SCALE = Number(query.get('offsetscale') ?? 1);
/** top of the coloured plate under each cell (animals.ts: RoundedBox height 0.1 at y 0.05) */
export const PLATE_TOP = 0.1;

const manifests = import.meta.glob('../../2-5d-crocodile/{assets,public}/**/*.sprites.json', { eager: true, import: 'default' }) as Record<string, SpeciesSprites>;
const pictures = import.meta.glob('../../2-5d-crocodile/{assets,public}/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const registry = new Map<string, { sprites: SpeciesSprites; dir: string }>();
for (const [path, sprites] of Object.entries(manifests)) registry.set(sprites.species, { sprites, dir: path.slice(0, path.lastIndexOf('/') + 1) });

const loader = new THREE.TextureLoader();
const textures = new Map<string, THREE.Texture>();
function texture(url: string): THREE.Texture {
  let t = textures.get(url);
  if (!t) {
    t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    textures.set(url, t);
  }
  return t;
}

const v = { floor: new THREE.Vector3(), centre: new THREE.Vector3(), cam: new THREE.Vector3(), fwd: new THREE.Vector3() };

function cardBlock(entry: { sprites: SpeciesSprites; dir: string }, part: ReturnType<typeof partsFor>[number], index: number, species: string): THREE.Group {
  const root = new THREE.Group();
  const animated = new THREE.Group();
  root.add(animated);
  const material = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, toneMapped: false });
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  card.userData.spriteCard = true;
  if (ALPHA_HIT) alphaRaycast(card);
  animated.add(card);
  const cellPx = entry.sprites.frame.cellPx / (entry.sprites.scale ?? 1);
  const tuck = entry.sprites.tuck ?? TUCK;
  let shown = '';
  card.onBeforeRender = (_r, _s, camera) => {
    const deg = (root.rotation.y * 180) / Math.PI;
    const pick = nearestSprite(entry.sprites, part, deg);
    if (!pick) { card.visible = false; return; }
    const url = pictures[entry.dir + pick.file];
    const tex = texture(url);
    const img = tex.image as HTMLImageElement | undefined;
    if (shown !== url) { material.map = tex; material.needsUpdate = true; shown = url; }
    if (!img?.width) return;
    const ow = (pick.offset ? offsetWeight(entry.sprites, part, deg, pick.heading) : 0) * OFFSET_SCALE;
    const [ax0, ay0] = pick.anchor ?? entry.sprites.frame.anchor;
    const ax = ax0 - (pick.offset?.[0] ?? 0) * ow, ay = ay0 - (pick.offset?.[1] ?? 0) * ow;
    const anchorX = pick.mirror ? img.width - ax : ax;
    // floor point on the plate top (with the hop), pulled toward the head like A
    animated.getWorldPosition(v.floor);
    v.floor.add(new THREE.Vector3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y)).multiplyScalar(index * tuck * root.scale.x));
    v.floor.y += PLATE_TOP;
    camera.getWorldPosition(v.cam);
    camera.getWorldDirection(v.fwd);
    let scale = root.scale.x;
    const at = v.floor.clone();
    if (MODE === 'C') {
      // card plane through the block centre, facing the camera; anchor where the ray through the floor point meets it
      v.centre.copy(v.floor).setY(v.floor.y + 0.45 * root.scale.x);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(v.fwd.clone().negate(), v.centre);
      new THREE.Ray(v.cam.clone(), v.floor.clone().sub(v.cam).normalize()).intersectPlane(plane, at);
      // same projected cell width as at the floor point: world size scales with depth along the view axis
      const zFloor = v.floor.clone().sub(v.cam).dot(v.fwd), zCard = at.clone().sub(v.cam).dot(v.fwd);
      scale *= zCard / zFloor;
    }
    animated.updateWorldMatrix(true, false);
    card.position.copy(animated.worldToLocal(at.clone()));
    const q = animated.getWorldQuaternion(new THREE.Quaternion()).invert();
    card.quaternion.copy(q.multiply(camera.quaternion));
    const s = scale / (animated.getWorldScale(new THREE.Vector3()).x || 1);
    const w = img.width / cellPx, h = img.height / cellPx;
    card.scale.set((pick.mirror ? -w : w) * s, h * s, 1);
    const offX = (img.width / 2 - anchorX) / cellPx, offY = (ay - img.height / 2) / cellPx;
    card.position.add(new THREE.Vector3(pick.mirror ? -offX : offX, offY, 0).multiplyScalar(s).applyQuaternion(card.quaternion));
    card.userData.diag = { species, part, index, file: pick.file, mirror: pick.mirror, deg, heading: pick.heading };
    diagWindow.__diagCamera = camera;
  };
  return root;
}

/** opaque-texel lookup per picture, for the alpha-aware hit test */
const alphaMaps = new Map<string, { w: number; h: number; a: Uint8ClampedArray }>();
function alphaAt(img: HTMLImageElement, u: number, v: number): number {
  let m = alphaMaps.get(img.src);
  if (!m) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
    m = { w: img.width, h: img.height, a: g.getImageData(0, 0, img.width, img.height).data };
    alphaMaps.set(img.src, m);
  }
  const x = Math.min(m.w - 1, Math.max(0, Math.floor(u * m.w))), y = Math.min(m.h - 1, Math.max(0, Math.floor((1 - v) * m.h)));
  return m.a[(y * m.w + x) * 4 + 3];
}

/** Mesh.raycast that drops hits on transparent texels (alphaTest 0.5 hides them on screen, the default ray does not) */
function alphaRaycast(mesh: THREE.Mesh): void {
  mesh.raycast = (raycaster, intersects) => {
    const hits: THREE.Intersection[] = [];
    THREE.Mesh.prototype.raycast.call(mesh, raycaster, hits);
    const img = (mesh.material as THREE.MeshBasicMaterial).map?.image as HTMLImageElement | undefined;
    for (const h of hits) if (img?.width && h.uv && alphaAt(img, h.uv.x, h.uv.y) > 127) intersects.push(h);
  };
}

/** the camera the cards are drawn with (the game does not expose it), for the measuring script */
const diagWindow = window as unknown as { __diagCamera?: THREE.Camera; __diagThree?: typeof THREE; __diagAlpha?: typeof alphaAt };
diagWindow.__diagThree = THREE;
diagWindow.__diagAlpha = alphaAt;

/** A's cards are built by spriteCards.ts; only note which picture each one drew, without changing how it is placed */
function tagA(roots: THREE.Group[], species: string): THREE.Group[] {
  roots.forEach((root, index) => root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh || !o.userData.spriteCard) return;
    const mesh = o as THREE.Mesh, place = mesh.onBeforeRender;
    if (ALPHA_HIT) alphaRaycast(mesh);
    mesh.onBeforeRender = (...args) => {
      place.apply(mesh, args);
      diagWindow.__diagCamera = args[2];
      const src = ((mesh.material as THREE.MeshBasicMaterial).map?.image as HTMLImageElement | undefined)?.src ?? '';
      mesh.userData.diag = { species, part: partsFor(roots.length)[index], index, file: src.slice(src.lastIndexOf('/') + 1), mirror: mesh.scale.x < 0, deg: (root.rotation.y * 180) / Math.PI };
    };
  }));
  return roots;
}

/** an invisible mesh on the head block that hands the camera to the measuring script (also for Classic 3D blocks) */
function probe(roots: THREE.Group[]): THREE.Group[] {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  m.onBeforeRender = (_r, _s, camera) => { diagWindow.__diagCamera = camera; };
  roots[0]?.add(m);
  return roots;
}

export function buildAnimal(species: string, cells: number): THREE.Group[] {
  return probe(build(species, cells));
}

function build(species: string, cells: number): THREE.Group[] {
  if (MODE === 'A') {
    const roots = buildA(species, cells);
    return roots[0]?.children[0]?.children[0]?.userData.spriteCard ? tagA(roots, species) : roots;
  }
  const n = Math.max(1, Math.min(3, Math.floor(cells || 1)));
  const entry = registry.get(species);
  if (!entry || !partsFor(n).every((part) => Object.keys(entry.sprites.parts[part]?.drawn ?? {}).length)) return buildA(species, cells); // throws: not drawable
  return partsFor(n).map((part, i) => cardBlock(entry, part, i, species));
}

/**
 * buildAnimal for the 2.5D integration entry (vite.config.ts redirects game/animals.ts's `./blocks` here).
 * A species with a sprite manifest (any *.sprites.json in the experiment, keyed by its `species`) is built as 2D
 * image cards; every other species gets the original 3D blocks. No species is named in this file.
 *
 * Each block keeps the structure PieceView drives (root > animated > content), so placement on the track, the run,
 * the gate shrink, the hop and the flinch all work unchanged. The card itself, every frame (onBeforeRender):
 *  - picks the picture for the block's track heading (nearestSprite on the continuous angle) and mirrors it if needed,
 *  - faces the camera, with the picture's floor anchor on the block's floor point, moved by the picture's visual offset
 *    weighted by how close the block's real angle is to that picture's heading (offsetWeight: no jump when it switches),
 *  - is pulled 0.10 cell per joint toward the head (drawing only; the game's positions and rules are unchanged),
 *  - is slid toward the camera just far enough that the part drawn below the anchor stays above the floor (a camera-
 *    facing card through the floor point would otherwise sink into the board), and scaled back to keep its size.
 * Depth against walls, props and other animals comes from the normal depth buffer; transparent pixels are cut out.
 */
import * as THREE from 'three';
import { buildAnimal as build3d } from '../../game/blocks';
import { nearestSprite, offsetWeight, partsFor, type SpeciesSprites } from '../2-5d-crocodile/src/sprites';
import { TUCK } from '../2-5d-crocodile/src/spriteRender';

const query = new URLSearchParams(location.search);
/** ?render=3d Classic 3D, ?render=25d (default in this entry) Illustrated 2.5D */
const USE_CARDS = query.get('render') !== '3d';
/** size candidate for comparisons (?cardScale=1.2), times the manifest's optional per-species `scale`; feet stay put */
const CARD_SCALE = Number(query.get('cardScale') ?? 1) || 1;
/** comparison only: ?tuck=0 / 0.05 overrides the 0.10-cell visual tuck */
const TUCK_OVERRIDE = query.has('tuck') ? Number(query.get('tuck')) : undefined;

// every manifest in the experiment, keyed by species, with its pictures as URLs next to it
const manifests = import.meta.glob('../2-5d-crocodile/{assets,public}/**/*.sprites.json', { eager: true, import: 'default' }) as Record<string, SpeciesSprites>;
const pictures = import.meta.glob('../2-5d-crocodile/{assets,public}/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const registry = new Map<string, { sprites: SpeciesSprites; dir: string }>();
for (const [path, sprites] of Object.entries(manifests)) registry.set(sprites.species, { sprites, dir: path.slice(0, path.lastIndexOf('/') + 1) });

/** Species drawn as cards in this run (for the test hook and reports). */
export const spriteSpecies = (): string[] => (USE_CARDS ? [...registry.keys()] : []);

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

const tmp = { pos: new THREE.Vector3(), cam: new THREE.Vector3(), fwd: new THREE.Vector3(), q: new THREE.Quaternion(), head: new THREE.Vector3() };
let cardsDrawn = 0;
let cardsMissing = 0;
export const cardStats = (): { drawn: number; missing: number } => ({ drawn: cardsDrawn, missing: cardsMissing });

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

/**
 * Mesh.raycast that drops hits on transparent texels. alphaTest hides them on screen, the default ray does not, so a
 * tap on another animal seen through a card's empty margin picked the card's animal (DIAGNOSIS.md, touch: 19~36% → 0%).
 */
function alphaRaycast(mesh: THREE.Mesh): void {
  mesh.raycast = (raycaster, intersects) => {
    const hits: THREE.Intersection[] = [];
    THREE.Mesh.prototype.raycast.call(mesh, raycaster, hits);
    const img = (mesh.material as THREE.MeshBasicMaterial).map?.image as HTMLImageElement | undefined;
    for (const h of hits) if (img?.width && h.uv && alphaAt(img, h.uv.x, h.uv.y) > 127) intersects.push(h);
  };
}

function cardBlock(entry: { sprites: SpeciesSprites; dir: string }, part: ReturnType<typeof partsFor>[number], index: number): THREE.Group {
  const root = new THREE.Group();
  const animated = new THREE.Group();
  root.add(animated);
  const material = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, toneMapped: false });
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  card.userData.spriteCard = true;
  alphaRaycast(card);
  animated.add(card);
  // a larger card is the same picture over a smaller pixel-per-cell: the anchor (feet) stays on the floor point
  const cellPx = entry.sprites.frame.cellPx / (CARD_SCALE * (entry.sprites.scale ?? 1));
  // per-species tuck from the manifest, else the shared default; ?tuck= only for comparisons
  const tuck = TUCK_OVERRIDE ?? entry.sprites.tuck ?? TUCK;
  let shown = '';

  card.onBeforeRender = (_r, _s, camera) => {
    // heading of this block on the track = the root's rotation about y (PieceView: seg.rotation.y = track angle)
    const deg = (root.rotation.y * 180) / Math.PI;
    const pick = nearestSprite(entry.sprites, part, deg);
    if (!pick) { cardsMissing++; card.visible = false; return; }
    cardsDrawn++;
    // the resolved file: a mirrored or front-back reused heading has no entry of its own in `drawn`
    const url = pictures[entry.dir + pick.file];
    const tex = texture(url);
    const img = tex.image as HTMLImageElement | undefined;
    if (shown !== url) { material.map = tex; material.needsUpdate = true; shown = url; }
    if (!img?.width) return;
    // the visual offset moves the picture (y down = drawn lower), i.e. the effective anchor the other way
    const ow = pick.offset ? offsetWeight(entry.sprites, part, deg, pick.heading) : 0;
    const [ax0, ay0] = pick.anchor ?? entry.sprites.frame.anchor;
    const ax = ax0 - (pick.offset?.[0] ?? 0) * ow, ay = ay0 - (pick.offset?.[1] ?? 0) * ow;
    const w = img.width / cellPx, h = img.height / cellPx;
    const anchorX = pick.mirror ? img.width - ax : ax;
    // floor point of the block (with the hop), pulled toward the head along the block's heading
    animated.getWorldPosition(tmp.pos);
    tmp.head.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y)).multiplyScalar(index * tuck * root.scale.x);
    tmp.pos.add(tmp.head);
    // slide toward the camera so the lowest pixel sits on the floor, then rescale so the card keeps its screen size
    camera.getWorldPosition(tmp.cam);
    camera.getWorldDirection(tmp.fwd);
    const below = ((img.height - ay) / cellPx) * root.scale.x; // world height of the picture under its anchor
    const elev = Math.asin(Math.min(1, Math.max(0.05, -tmp.fwd.y)));
    const slide = below * Math.cos(elev) / Math.sin(elev);
    const dist = tmp.pos.distanceTo(tmp.cam);
    tmp.pos.addScaledVector(tmp.fwd, -slide);
    const k = (dist - slide) / dist;
    // place in the parent's frame: world position and the camera's rotation
    animated.updateWorldMatrix(true, false);
    card.position.copy(animated.worldToLocal(tmp.pos.clone()));
    animated.getWorldQuaternion(tmp.q).invert();
    card.quaternion.copy(tmp.q.multiply(camera.quaternion));
    const s = root.scale.x * k / (animated.getWorldScale(new THREE.Vector3()).x || 1);
    card.scale.set((pick.mirror ? -w : w) * s, h * s, 1);
    // the plane is centred: shift it so the anchor pixel is at the floor point
    const offX = (img.width / 2 - anchorX) / cellPx, offY = (ay - img.height / 2) / cellPx;
    card.position.add(new THREE.Vector3(pick.mirror ? -offX : offX, offY, 0).multiplyScalar(s).applyQuaternion(card.quaternion));
  };
  return root;
}

/** every buildAnimal call: the species the game chose (speciesFor) and how it was drawn, for the capture script */
const built: Array<{ species: string; cells: number; as: 'cards' | '3d' }> = [];
/** species the game asked for that have no 2.5D art yet (drawn with the 3D fallback): the conversion to-do list */
const missingSpecies = (): string[] => (USE_CARDS ? [...new Set(built.filter((b) => b.as === '3d').map((b) => b.species))].sort() : []);
(window as unknown as { __cards: unknown }).__cards = { built, stats: cardStats, species: spriteSpecies, missingSpecies, scale: CARD_SCALE };
if (USE_CARDS) console.info('[2.5D] sprite species:', spriteSpecies().join(', '));

export function buildAnimal(species: string, cells: number): THREE.Group[] {
  const n = Math.max(1, Math.min(3, Math.floor(cells || 1)));
  // cards only when every part of this animal has at least one picture (a species still being drawn stays 3D)
  const found = USE_CARDS ? registry.get(species) : undefined;
  const entry = found && partsFor(n).every((part) => Object.keys(found.sprites.parts[part]?.drawn ?? {}).length) ? found : undefined;
  built.push({ species, cells, as: entry ? 'cards' : '3d' });
  if (!entry) return build3d(species, cells);
  const parts = partsFor(n);
  return parts.map((part, i) => cardBlock(entry, part, i));
}

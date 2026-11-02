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
 *  - has its anchor on the screen projection of the plate-top floor point, on a plane through the block centre (depth
 *    between animals follows the blocks, not the picture's transparent margin), sized from the projected cell width
 *    there (DIAGNOSIS.md, placement C).
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
/** art review: ?art=candidate draws <species>/candidate/<same file name> where one exists (originals stay untouched) */
const ART_CANDIDATE = query.get('art') === 'candidate';

// every manifest in the experiment, keyed by species, with its pictures as URLs next to it
const manifests = import.meta.glob('../2-5d-crocodile/{assets,public}/**/*.sprites.json', { eager: true, import: 'default' }) as Record<string, SpeciesSprites>;
const pictures = import.meta.glob('../2-5d-crocodile/{assets,public}/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const registry = new Map<string, { sprites: SpeciesSprites; dir: string }>();
// a manifest under candidate/ (its own frame and pictures, e.g. the chick's standard-frame cut-outs) stands in for the
// species' manifest only with ?art=candidate and is ignored otherwise; every other manifest registers as before
const isCandidateManifest = (path: string) => path.includes('/candidate/');
const register = (path: string, sprites: SpeciesSprites) => registry.set(sprites.species, { sprites, dir: path.slice(0, path.lastIndexOf('/') + 1) });
for (const [path, sprites] of Object.entries(manifests)) if (!isCandidateManifest(path)) register(path, sprites);
if (ART_CANDIDATE) for (const [path, sprites] of Object.entries(manifests)) if (isCandidateManifest(path)) register(path, sprites);
/** candidates whose bottom was moved down behind the near part by repeating one row band (tools/polish_candidates.py) */
const extensions = import.meta.glob('../2-5d-crocodile/assets/*/candidate/extend.json', { eager: true, import: 'default' }) as Record<string, Record<string, { band: number; rows: number }>>;
/**
 * The extension is only hidden while the near part (lower on screen) heads the same way. In a turn that part already
 * shows its short side view, so the repeated rows are taken out again in step with the angle between the two blocks:
 * all of them at FOLD_DEG apart, before this block's own picture changes at 45°.
 */
const FOLD_DEG = 30;
/** map_fragment with the band shortened: rows below band + shown are read `rows - shown` further down the picture */
const FOLD_FRAGMENT = /* glsl */ `
#ifdef USE_MAP
  vec2 foldUv = vMapUv;
  float foldY = (1.0 - foldUv.y) * foldRows.w;
  if (foldY > foldRows.x + foldRows.z) foldY += foldRows.y - foldRows.z;
  foldUv.y = 1.0 - foldY / foldRows.w;
  diffuseColor *= foldY < foldRows.w ? texture2D(map, foldUv) : vec4(0.0);
#endif
`;
type Fold = { band: number; rows: number; shown: number; h: number };
/** picture row for a texture v under a fold (null: past the picture's bottom), as FOLD_FRAGMENT reads it */
function foldV(f: Fold | undefined, v: number): number | null {
  if (!f?.rows) return v;
  let y = (1 - v) * f.h;
  if (y > f.band + f.shown) y += f.rows - f.shown;
  return y < f.h ? 1 - y / f.h : null;
}

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

const tmp = { pos: new THREE.Vector3(), cam: new THREE.Vector3(), fwd: new THREE.Vector3(), q: new THREE.Quaternion(), head: new THREE.Vector3(), centre: new THREE.Vector3(), at: new THREE.Vector3(), plane: new THREE.Plane(), ray: new THREE.Ray() };
let cardsDrawn = 0;
let cardsMissing = 0;
export const cardStats = (): { drawn: number; missing: number } => ({ drawn: cardsDrawn, missing: cardsMissing });

/** top of the coloured plate under each cell (game/animals.ts: RoundedBox height 0.1 at y 0.05) */
const PLATE_TOP = 0.1;
/** height of the block centre above the plate top, in cells: the depth the card is drawn at */
const CARD_DEPTH_LIFT = 0.45;

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
    for (const h of hits) {
      if (!img?.width || !h.uv) continue;
      const v = foldV(mesh.userData.fold as Fold | undefined, h.uv.y);
      if (v !== null && alphaAt(img, h.uv.x, v) > 127) intersects.push(h);
    }
  };
}

function cardBlock(entry: { sprites: SpeciesSprites; dir: string }, part: ReturnType<typeof partsFor>[number], index: number, blocks: THREE.Group[]): THREE.Group {
  const root = new THREE.Group();
  const animated = new THREE.Group();
  root.add(animated);
  const material = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, toneMapped: false });
  const foldRows = { value: new THREE.Vector4(0, 0, 0, 1) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.foldRows = foldRows;
    shader.fragmentShader = `uniform vec4 foldRows;\n${shader.fragmentShader.replace('#include <map_fragment>', FOLD_FRAGMENT)}`;
  };
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
    const candidate = ART_CANDIDATE ? pictures[`${entry.dir}candidate/${pick.file.slice(pick.file.lastIndexOf('/') + 1)}`] : undefined;
    const url = candidate ?? pictures[entry.dir + pick.file];
    const tex = texture(url);
    const img = tex.image as HTMLImageElement | undefined;
    if (shown !== url) { material.map = tex; material.needsUpdate = true; shown = url; }
    if (!img?.width) return;
    const ext = candidate ? extensions[`${entry.dir}candidate/extend.json`]?.[pick.file.slice(pick.file.lastIndexOf('/') + 1)] : undefined;
    let fold: Fold | undefined;
    if (ext) {
      // the near part: toward the head at 0° (head nearest the camera), toward the tail at 180°
      const near = blocks[Math.cos((pick.heading * Math.PI) / 180) > 0 ? index - 1 : index + 1];
      const d = near ? near.rotation.y - root.rotation.y : 0;
      const apart = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) * 180 / Math.PI;
      fold = { ...ext, shown: ext.rows * Math.max(0, 1 - apart / FOLD_DEG), h: img.height };
    }
    foldRows.value.set(fold?.band ?? 0, fold?.rows ?? 0, fold?.shown ?? 0, img.height);
    card.userData.fold = fold;
    // the visual offset moves the picture (y down = drawn lower), i.e. the effective anchor the other way
    // temporarily off at 0°/180°: those joining offsets pulled end cards onto the next cell, leaving its plate bare
    const ow = pick.offset && pick.heading % 180 !== 0 ? offsetWeight(entry.sprites, part, deg, pick.heading) : 0;
    const [ax0, ay0] = pick.anchor ?? entry.sprites.frame.anchor;
    const ax = ax0 - (pick.offset?.[0] ?? 0) * ow, ay = ay0 - (pick.offset?.[1] ?? 0) * ow;
    const w = img.width / cellPx, h = img.height / cellPx;
    const anchorX = pick.mirror ? img.width - ax : ax;
    // floor point of the block (with the hop), pulled toward the head along the block's heading
    animated.getWorldPosition(tmp.pos);
    tmp.head.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y)).multiplyScalar(index * tuck * root.scale.x);
    tmp.pos.add(tmp.head);
    tmp.pos.y += PLATE_TOP;
    // camera-facing plane through the block centre; the anchor goes where the ray to the floor point meets it
    camera.getWorldPosition(tmp.cam);
    camera.getWorldDirection(tmp.fwd);
    tmp.centre.copy(tmp.pos).setY(tmp.pos.y + CARD_DEPTH_LIFT * root.scale.x);
    tmp.plane.setFromNormalAndCoplanarPoint(tmp.fwd.clone().negate(), tmp.centre);
    tmp.ray.set(tmp.cam, tmp.pos.clone().sub(tmp.cam).normalize());
    if (!tmp.ray.intersectPlane(tmp.plane, tmp.at)) tmp.at.copy(tmp.pos);
    // same projected cell width as at the floor point: world size scales with depth along the view axis
    const k = tmp.at.clone().sub(tmp.cam).dot(tmp.fwd) / tmp.pos.clone().sub(tmp.cam).dot(tmp.fwd);
    // place in the parent's frame: world position and the camera's rotation
    animated.updateWorldMatrix(true, false);
    card.position.copy(animated.worldToLocal(tmp.at.clone()));
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
  const blocks: THREE.Group[] = [];
  parts.forEach((part, i) => blocks.push(cardBlock(entry, part, i, blocks)));
  return blocks;
}

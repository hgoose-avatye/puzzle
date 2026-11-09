/**
 * buildAnimal for the game entry (vite.config.ts resolves game/animals.ts's `./cards` here). A species with a sprite
 * manifest (any *.sprites.json in the experiment, keyed by its `species`) is built as 2D image cards. There is no
 * other look: an animal without complete pictures is an error (spriteCheck.ts; the build checks every species the game
 * draws). No species is named in this file.
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
import { nearestSprite, offsetWeight, partsFor, type SpeciesSprites } from '../2-5d-crocodile/src/sprites';
import { TUCK } from '../2-5d-crocodile/src/spriteRender';
import spritePictures from 'virtual:sprite-pictures';
import { spriteProblems } from './spriteCheck';

// comparison switches below work on the dev server only; a production build always draws the shipped cards
const query = import.meta.env.DEV ? new URLSearchParams(location.search) : new URLSearchParams();
/** size candidate for comparisons (?cardScale=1.2), times the manifest's optional per-species `scale`; feet stay put */
const CARD_SCALE = Number(query.get('cardScale') ?? 1) || 1;
/** comparison only: ?tuck=0 / 0.05 overrides the 0.10-cell visual tuck */
const TUCK_OVERRIDE = query.has('tuck') ? Number(query.get('tuck')) : undefined;
/** art review: ?art=candidate draws <species>/candidate/<same file name> where one exists (originals stay untouched) */
const ART_CANDIDATE = query.get('art') === 'candidate';

// every manifest in the experiment, keyed by species, with its pictures as URLs next to it
const manifests = import.meta.glob('../2-5d-crocodile/{assets,public}/**/*.sprites.json', { eager: true, import: 'default' }) as Record<string, SpeciesSprites>;
// only the pictures the manifests name (vite.config.ts spritePictures), not every picture in the sprite folders
const pictures: Record<string, string> = spritePictures;
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
export const spriteSpecies = (): string[] => [...registry.keys()];

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

const tmp = { pos: new THREE.Vector3(), cam: new THREE.Vector3(), fwd: new THREE.Vector3(), q: new THREE.Quaternion(), roll: new THREE.Quaternion(), head: new THREE.Vector3(), centre: new THREE.Vector3(), depth: new THREE.Vector3(), at: new THREE.Vector3(), plane: new THREE.Plane(), ray: new THREE.Ray() };
const Z_AXIS = new THREE.Vector3(0, 0, 1);
let cardsDrawn = 0;
let cardsMissing = 0;
export const cardStats = (): { drawn: number; missing: number } => ({ drawn: cardsDrawn, missing: cardsMissing });

/** top of the coloured plate under each cell (game/animals.ts: RoundedBox height 0.1 at y 0.05) */
const PLATE_TOP = 0.1;
/** height of the block centre above the plate top, in cells: the depth the card is drawn at */
const CARD_DEPTH_LIFT = 0.45;
/**
 * Depth step per block from the head, in cells (positive: the head in front). Only decides blocks side by side, at the
 * same depth; neighbours one above the other are ~0.5 cell apart in depth.
 */
const PART_DEPTH_STEP = 0.01;
/**
 * Depth step between neighbouring columns, in cells (± on alternate columns). The camera has no yaw, so blocks in one
 * row stand at one depth, and two animals' blocks with the same index side by side had nothing to decide them: their
 * overlapping pictures z-fought, swapping front and back while they swayed (husky and crocodile heads, 2026-11-08; 306
 * pairs on 143 of the 180 levels). √2·sin(πx + π/4) is +1 and −1 on alternate columns whether the board's columns sit on
 * whole or half x, so neighbours differ by 2 × this (~5 depth-buffer steps on the farthest board) on any board width,
 * and that stays under PART_DEPTH_STEP: the head still goes in front of a neighbour's body.
 */
const COLUMN_DEPTH_STEP = 0.0025;

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
 * How far below the top of the drawn picture the badge pointer ends, in picture heights. On levels 116, 117 and 120
 * (2026-11-03) a tip on the very top landed on another animal or the floor for 8 of 12 badges; from 0.15 down every
 * one was on its own animal.
 */
const BADGE_TIP_DROP = 0.25;
/** the count dynamite's screen centre, as a fraction of the drawn body block's height from its top */
const BODY_DROP = 0.45;

/** the opaque part of a picture, in texture fractions from the top-left: where its drawn top and middle are */
const opaqueBoxes = new Map<string, { top: number; mid: number; bottom: number }>();
function opaqueBox(img: HTMLImageElement): { top: number; mid: number; bottom: number } {
  let box = opaqueBoxes.get(img.src);
  if (box) return box;
  alphaAt(img, 0, 0); // fills alphaMaps for this picture
  const m = alphaMaps.get(img.src)!;
  let top = m.h, left = m.w, right = -1, bottom = 0;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (m.a[(y * m.w + x) * 4 + 3] <= 127) continue;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
    if (x < left) left = x;
    if (x > right) right = x;
  }
  box = right < 0 ? { top: 0, mid: 0.5, bottom: 1 } : { top: top / m.h, mid: (left + right + 1) / 2 / m.w, bottom: (bottom + 1) / m.h };
  opaqueBoxes.set(img.src, box);
  return box;
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
  root.userData.spriteCards = true; // PieceView: this animal is drawn as cards (its floor cue is drawn on top)
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
    // fold data: a candidate's from its folder's extend.json, an approved picture's from the manifest (`extend`)
    const pictureName = pick.file.slice(pick.file.lastIndexOf('/') + 1);
    const ext = candidate ? extensions[`${entry.dir}candidate/extend.json`]?.[pictureName] : entry.sprites.extend?.[pictureName];
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
    // floor point of the block (with the hop), pulled toward the head along the block's heading
    animated.getWorldPosition(tmp.pos);
    tmp.head.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y)).multiplyScalar(index * tuck * root.scale.x);
    tmp.pos.add(tmp.head);
    tmp.pos.y += PLATE_TOP;
    // depth from the block's place on the track alone (root, not animated): the hop/sway (each block bobs on its own
    // phase), the launch squash and the gate shrink moved the plane, which swapped head and body side by side; a fixed
    // step per block decides blocks at the same depth, and a step per column decides two animals' blocks side by side
    root.getWorldPosition(tmp.depth);
    const column = Math.SQRT2 * Math.sin(Math.PI * tmp.depth.x + Math.PI / 4);
    tmp.depth.addScaledVector(tmp.head.normalize(), index * tuck);
    tmp.depth.y += PLATE_TOP + CARD_DEPTH_LIFT;
    placeCard(card, animated, tmp.pos, root.scale.x, camera, img, cellPx, ax, ay, pick.mirror, tmp.depth.addScaledVector(camera.getWorldDirection(tmp.fwd), index * PART_DEPTH_STEP + column * COLUMN_DEPTH_STEP), (root.userData.roll as number | undefined) ?? 0);
    // where the status badge's pointer ends, in the world (PieceView reads it on the head): a little inside the top of
    // the drawn picture, not on its edge, where ear tips and outlines let the animal behind or the floor show through
    const box = opaqueBox(img);
    card.updateWorldMatrix(true, false);
    const tip = (root.userData.badgeTip as THREE.Vector3 | undefined) ?? (root.userData.badgeTip = new THREE.Vector3());
    tip.set(box.mid - 0.5, Math.max(-0.4, 0.5 - box.top - BADGE_TIP_DROP), 0).applyMatrix4(card.matrixWorld);
    // where the body-mounted count dynamite sits (its screen centre), BODY_DROP of the drawn block down from its top
    const body = (root.userData.bodyTip as THREE.Vector3 | undefined) ?? (root.userData.bodyTip = new THREE.Vector3());
    body.set(box.mid - 0.5, 0.5 - box.top - BODY_DROP * (box.bottom - box.top), 0).applyMatrix4(card.matrixWorld);
  };
  return root;
}

/**
 * Placement C for one card: a camera-facing plane through the block centre above the world floor point `floor` (plate
 * top included), the picture's anchor pixel (ax, ay) on that point, sized from the projected cell width there. `roll`
 * (radians) tilts the picture in its own plane about that anchor (the blocked head shake).
 */
function placeCard(card: THREE.Mesh, animated: THREE.Object3D, floor: THREE.Vector3, scaleX: number, camera: THREE.Camera, img: HTMLImageElement, cellPx: number, ax: number, ay: number, mirror: boolean, centre?: THREE.Vector3, roll = 0): void {
  const w = img.width / cellPx, h = img.height / cellPx;
  const anchorX = mirror ? img.width - ax : ax;
  // camera-facing plane through the block centre (or `centre`); the anchor goes where the ray to the floor point meets it
  camera.getWorldPosition(tmp.cam);
  camera.getWorldDirection(tmp.fwd);
  if (centre) tmp.centre.copy(centre);
  else tmp.centre.copy(floor).setY(floor.y + CARD_DEPTH_LIFT * scaleX);
  tmp.plane.setFromNormalAndCoplanarPoint(tmp.fwd.clone().negate(), tmp.centre);
  tmp.ray.set(tmp.cam, floor.clone().sub(tmp.cam).normalize());
  if (!tmp.ray.intersectPlane(tmp.plane, tmp.at)) tmp.at.copy(floor);
  // same projected cell width as at the floor point: world size scales with depth along the view axis
  const k = tmp.at.clone().sub(tmp.cam).dot(tmp.fwd) / floor.clone().sub(tmp.cam).dot(tmp.fwd);
  // place in the parent's frame: world position and the camera's rotation
  animated.updateWorldMatrix(true, false);
  card.position.copy(animated.worldToLocal(tmp.at.clone()));
  animated.getWorldQuaternion(tmp.q).invert();
  card.quaternion.copy(tmp.q.multiply(camera.quaternion));
  if (roll) card.quaternion.multiply(tmp.roll.setFromAxisAngle(Z_AXIS, roll));
  const s = scaleX * k / (animated.getWorldScale(new THREE.Vector3()).x || 1);
  card.scale.set((mirror ? -w : w) * s, h * s, 1);
  // the plane is centred: shift it so the anchor pixel is at the floor point
  const offX = (img.width / 2 - anchorX) / cellPx, offY = (ay - img.height / 2) / cellPx;
  card.position.add(new THREE.Vector3(mirror ? -offX : offX, offY, 0).multiplyScalar(s).applyQuaternion(card.quaternion));
}

/** blocks this far apart in heading (degrees) are on different legs of a turn: the corner cell between them is empty */
const JOINT_DEG = 45;
/** screen direction of a world vector: 'up' (away from the camera), 'down', 'left', 'right' */
const screenDir = (v: THREE.Vector3): 'up' | 'down' | 'left' | 'right' => (Math.abs(v.z) >= Math.abs(v.x) ? (v.z < 0 ? 'up' : 'down') : v.x > 0 ? 'right' : 'left');

/**
 * The corner piece between block `ahead` (toward the head) and `behind` (manifest `joints`): while the two blocks head
 * different ways the corner cell between them is empty (blocks are one cell apart on a track whose corners have a
 * 0.3-cell radius, so at most one block is ever inside the bend), and the straight cards' cut ends show. The piece is
 * drawn at the corner cell — where the two blocks' lines meet — with the elbow picture whose arms point at the two
 * blocks (left-hand corners mirror the right-hand pictures), with placement C like every other card. Cosmetic only:
 * no fold, not tappable, not counted.
 */
function jointCard(entry: { sprites: SpeciesSprites; dir: string }, ahead: THREE.Group, behind: THREE.Group): THREE.Mesh {
  const joints = entry.sprites.joints!;
  const material = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, toneMapped: false });
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  card.raycast = () => {};
  card.visible = false;
  const animated = ahead.children[0];
  animated.add(card);
  const cellPx = entry.sprites.frame.cellPx / (CARD_SCALE * (entry.sprites.scale ?? 1));
  const fA = new THREE.Vector3(), fB = new THREE.Vector3(), pA = new THREE.Vector3(), pB = new THREE.Vector3();
  let shown = '';
  card.onBeforeRender = (_r, _s, camera) => {
    const d = ahead.rotation.y - behind.rotation.y;
    const apart = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) * 180 / Math.PI;
    card.visible = apart >= JOINT_DEG;
    if (!card.visible) return;
    const L = ahead.scale.x; // one cell (BLOCK_SPACING) in world units
    fA.set(Math.sin(ahead.rotation.y), 0, Math.cos(ahead.rotation.y));
    fB.set(Math.sin(behind.rotation.y), 0, Math.cos(behind.rotation.y));
    ahead.getWorldPosition(pA);
    behind.getWorldPosition(pB);
    // the corner: one cell back from the block ahead along its heading = one cell on from the block behind along its
    // heading; the mean of the two while one block is still inside the bend
    tmp.pos.copy(pA).addScaledVector(fA, -L).add(pB.addScaledVector(fB, L)).multiplyScalar(0.5);
    tmp.pos.y += PLATE_TOP;
    // arms of the elbow: toward the block ahead, and toward the block behind (against its heading)
    const toAhead = screenDir(fA), toBehind = screenDir(fB.negate());
    const vertical = toAhead === 'up' || toAhead === 'down' ? toAhead : toBehind;
    const horizontal = toAhead === 'left' || toAhead === 'right' ? toAhead : toBehind;
    const url = pictures[entry.dir + (vertical === 'up' ? joints.upRight : joints.downRight)];
    const tex = texture(url);
    const img = tex.image as HTMLImageElement | undefined;
    if (shown !== url) { material.map = tex; material.needsUpdate = true; shown = url; }
    if (!img?.width) return;
    const [ax, ay] = entry.sprites.frame.anchor;
    placeCard(card, animated, tmp.pos, ahead.scale.x, camera, img, cellPx, ax, ay, horizontal === 'left');
  };
  return card;
}

/** every buildAnimal call: the species the game chose (speciesFor) and whether it could be drawn, for the capture scripts */
const built: Array<{ species: string; cells: number; as: 'cards' | 'missing' }> = [];
/** species the game asked for without complete pictures (buildAnimal threw for them); empty on a sound run */
const missingSpecies = (): string[] => [...new Set(built.filter((b) => b.as === 'missing').map((b) => b.species))].sort();
if (import.meta.env.DEV) {
  (window as unknown as { __cards: unknown }).__cards = { built, stats: cardStats, species: spriteSpecies, missingSpecies, scale: CARD_SCALE };
  console.info('[2.5D] sprite species:', spriteSpecies().join(', '));
}

/** dev only: the missing pictures in a red box over the game, so a blank or broken board is never the only sign */
function showMissing(message: string): void {
  if (!import.meta.env.DEV) return;
  let box = document.getElementById('missing-sprites');
  if (!box) {
    box = document.createElement('pre');
    box.id = 'missing-sprites';
    box.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:99999;margin:0;padding:10px;background:#b00020;color:#fff;font:12px/1.4 monospace;white-space:pre-wrap;pointer-events:none';
    document.body.appendChild(box);
  }
  box.textContent += `${box.textContent ? '\n' : ''}${message}`;
}

export function buildAnimal(species: string, cells: number): THREE.Group[] {
  const n = Math.max(1, Math.min(3, Math.floor(cells || 1)));
  const entry = registry.get(species);
  const problems = spriteProblems(entry?.sprites, species, n);
  if (!entry || problems.length) {
    built.push({ species, cells, as: 'missing' });
    const message = `[2.5D] cannot draw ${species} (${n} cell${n > 1 ? 's' : ''}): ${problems.join('; ')}`;
    console.error(message);
    showMissing(message);
    throw new Error(message);
  }
  built.push({ species, cells, as: 'cards' });
  const parts = partsFor(n);
  const blocks: THREE.Group[] = [];
  parts.forEach((part, i) => blocks.push(cardBlock(entry, part, i, blocks)));
  // corner pieces between neighbouring blocks, when the manifest has them (only shown while the two blocks turn)
  if (entry.sprites.joints) for (let i = 0; i + 1 < blocks.length; i++) jointCard(entry, blocks[i], blocks[i + 1]);
  return blocks;
}

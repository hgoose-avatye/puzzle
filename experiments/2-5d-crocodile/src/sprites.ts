/**
 * Species-independent 2.5D sprite rules, taken from the crocodile experiment (SPRITES.md). Pure functions, no drawing:
 * a renderer asks which part each block is, which picture and mirror flag fits a block's heading, where to draw the
 * block (with the visual tuck) and in what order. Game rules, tracks and occupied cells are untouched; this module
 * only reads a track. Not wired into the prototype (src/main.ts) yet.
 */
import { type Track, trackAt } from './rules';

export type Part = 'single' | 'head' | 'body' | 'tail';
/** 8 headings in degrees: 0 down the screen (toward the camera), 90 right, 180 up, 270 left. */
export type Heading = 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315;

/**
 * A drawn picture: a path relative to the manifest, or a path with its own floor-centre anchor (cut-out sprites).
 * `anchor` is where the feet really are in the picture. `offset` (picture px, x right, y down) is a separate visual
 * correction that joins the parts (a 0° tail drawn lower behind the head): it applies fully at the picture's own
 * heading and fades out before the picture switches (offsetWeight), so turning never makes the card jump.
 */
export type Picture = string | { file: string; anchor: [number, number]; offset?: [number, number] };

export interface PartSprites {
  /** drawn pictures by heading */
  drawn: Partial<Record<Heading, Picture>>;
  /** the block looks the same turned round (a middle body block): heading h may use heading h + 180 */
  frontBack?: boolean;
}

export interface SpeciesSprites {
  species: string;
  /** every picture: size x size canvas, one floor cell cellPx wide, the block's floor centre at anchor */
  frame: { size: number; cellPx: number; anchor: [number, number] };
  /** in-game size factor for the cards (feet stay on the floor point); approved 2026-11-01: 1.2 */
  scale?: number;
  /** visual tuck per joint toward the head, in cells; absent = the shared default (0.10). Crocodile: 0 (approved 2026-11-01) */
  tuck?: number;
  parts: Partial<Record<Part, PartSprites>>;
}

/** Which part each block is, head first: 1 cell a single sprite, 2 cells head + tail, more cells head, bodies, tail. */
export function partsFor(cells: number): Part[] {
  if (cells <= 1) return ['single'];
  return ['head', ...Array<Part>(cells - 2).fill('body'), 'tail'];
}

/** The nearest of the 8 headings for a track angle in radians (atan2(dx, dy), as trackAt returns). */
export function headingOf(angle: number): Heading {
  const deg = ((angle * 180) / Math.PI) % 360;
  return ((Math.round(((deg + 360) % 360) / 45) % 8) * 45) as Heading;
}

const mirrorOf = (h: Heading): Heading => ((360 - h) % 360) as Heading;
const turned = (h: Heading): Heading => ((h + 180) % 360) as Heading;

/**
 * The picture for a part at a heading: drawn as is, else the left-right mirror of the opposite side (lighting is
 * symmetric), else for front-back symmetric parts the picture of the turned-round heading (again plain or mirrored).
 * Null when nothing fits: the art for that heading is missing.
 */
export interface Resolved { file: string; mirror: boolean; anchor?: [number, number]; offset?: [number, number] }

export function spriteFor(sprites: SpeciesSprites, part: Part, heading: Heading): Resolved | null {
  const p = sprites.parts[part];
  if (!p) return null;
  const tries: Array<[Heading, boolean]> = [[heading, false], [mirrorOf(heading), true]];
  if (p.frontBack) tries.push([turned(heading), false], [mirrorOf(turned(heading)), true]);
  for (const [h, mirror] of tries) {
    const pic = p.drawn[h];
    if (pic) {
      if (typeof pic === 'string') return { file: pic, mirror };
      return { file: pic.file, mirror, anchor: pic.anchor, ...(pic.offset ? { offset: pic.offset } : {}) };
    }
  }
  return null;
}

const HEADINGS: Heading[] = [0, 45, 90, 135, 180, 225, 270, 315];

/**
 * The picture whose heading is nearest the block's actual (continuous) track angle in degrees, among the headings the
 * part has a picture for; ties go clockwise. With all 8 headings covered this is plain rounding to 45°; with fewer
 * (the chick's 4 facings) it switches pictures halfway between them, as the old chick drawing did. Null only when the
 * part has no picture at all. Ranking by the continuous angle matters: rounding to 45° first would switch early.
 */
export function nearestSprite(sprites: SpeciesSprites, part: Part, angleDeg: number): (Resolved & { heading: Heading }) | null {
  const a = ((angleDeg % 360) + 360) % 360;
  let best: (Resolved & { heading: Heading; d: number; cw: boolean }) | null = null;
  for (const h of HEADINGS) {
    const r = spriteFor(sprites, part, h);
    if (!r) continue;
    const d = Math.abs(((a - h + 540) % 360) - 180);
    const cw = (h - a + 360) % 360 <= 180;
    if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) <= 1e-9 && cw && !best.cw)) best = { ...r, heading: h, d, cw };
  }
  if (!best) return null;
  const { d: _d, cw: _cw, ...out } = best;
  return out;
}

/**
 * How much of a picture's visual offset to apply at the block's continuous angle: 1 at the picture's heading, easing
 * (smoothstep) to 0 at the angle where nearestSprite switches to the neighbouring picture, i.e. halfway to the closest
 * other covered heading. The offset is then already gone when the picture changes, so the card does not jump. Uses the
 * real angle, never the rounded one; `heading` is the one nearestSprite returned for that angle.
 */
export function offsetWeight(sprites: SpeciesSprites, part: Part, angleDeg: number, heading: Heading): number {
  const gap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
  const others = HEADINGS.filter((h) => h !== heading && spriteFor(sprites, part, h));
  if (!others.length) return 1;
  const half = Math.min(...others.map((h) => gap(h, heading))) / 2;
  const x = Math.min(1, gap(angleDeg, heading) / half);
  return 1 - x * x * (3 - 2 * x);
}

/** Headings of a part that no picture covers (empty when the part is complete). */
export function missingHeadings(sprites: SpeciesSprites, part: Part): Heading[] {
  return ([0, 45, 90, 135, 180, 225, 270, 315] as Heading[]).filter((h) => !spriteFor(sprites, part, h));
}

export interface BlockPose { index: number; part: Part; x: number; y: number; heading: Heading }

/**
 * Where to draw each block when the head is at arc length sHead: block i sits i cells behind the head on the track,
 * pulled `tuck` cells per joint toward the head so the blocks read as one animal (drawing only; 0.10 provisional).
 */
export function blockPoses(track: Track, sHead: number, cells: number, tuck = 0.1): BlockPose[] {
  return partsFor(cells).map((part, i) => {
    const q = trackAt(track, sHead - i * (1 - tuck));
    return { index: i, part, x: q.x, y: q.y, heading: headingOf(q.angle) };
  });
}

/** Painter's order by screen depth: further up the board first, so nearer blocks cover the joint (never "head on top"). */
export function drawOrder<T extends { y: number }>(blocks: T[]): T[] {
  return [...blocks].sort((a, b) => a.y - b.y);
}

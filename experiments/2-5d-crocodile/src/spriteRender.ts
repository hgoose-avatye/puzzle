/**
 * Draws animals from species manifests through the shared sprite rules (src/sprites.ts): blockPoses (which uses
 * partsFor) for each block's part and place with the 0.10-cell tuck, nearestSprite (spriteFor, then the nearest drawn
 * heading) for the picture and mirror flag; the caller sorts all items with drawOrder. Positions come only from the
 * game track; rules and traffic are untouched.
 */
import { type Track, trackAt } from './rules';
import { blockPoses, type Heading, nearestSprite, type Part, type Picture, type SpeciesSprites } from './sprites';

export const TUCK = 0.1;

export interface Species { sprites: SpeciesSprites; images: Map<string, HTMLImageElement> }

/** Fetch a manifest and every picture it names (paths relative to the manifest). */
export async function loadSpecies(manifestUrl: string): Promise<Species> {
  const base = new URL(manifestUrl, location.href);
  const sprites = (await (await fetch(base)).json()) as SpeciesSprites;
  const images = new Map<string, HTMLImageElement>();
  const files = new Set<string>();
  for (const p of Object.values(sprites.parts)) for (const pic of Object.values(p?.drawn ?? {}) as Picture[]) files.add(typeof pic === 'string' ? pic : pic.file);
  await Promise.all([...files].map(async (f) => {
    const img = new Image();
    img.src = new URL(f, base).href;
    await img.decode();
    images.set(f, img);
  }));
  return { sprites, images };
}

export interface Pose { part: Part; gx: number; gy: number; heading: Heading; angle: number; k: number; shakeX: number }

/** One animal's blocks to draw: tucked poses, gate shrink while running, sideways shake while blocked. */
export function posesOf(a: { cells: number; track: Track; s: number; running: boolean; shake: number }, shakeTime: number, gateFade: number): Pose[] {
  const gateU = a.track.length - (a.cells + 2) + 0.62;
  const sh = a.shake > 0 ? Math.sin((1 - a.shake / shakeTime) * Math.PI * 6) * 0.07 * (a.shake / shakeTime) : 0;
  return blockPoses(a.track, a.s, a.cells, TUCK).map((b) => {
    const arc = a.s - b.index * (1 - TUCK);
    const angle = trackAt(a.track, arc).angle;
    const k = a.running ? Math.max(0, Math.min(1, 1 - (arc - gateU) / gateFade)) : 1;
    return { part: b.part, gx: b.x, gy: b.y, heading: b.heading, angle, k, shakeX: sh };
  });
}

export interface Env {
  ctx: CanvasRenderingContext2D;
  floor: (gx: number, gy: number) => { x: number; y: number };
  pxPerUnit: (gx: number, gy: number) => number;
  pitch: number;
}

/** Draw one block (shadow, then picture); returns false when the manifest has no picture for it at all. */
export function drawPose(env: Env, sp: Species, p: Pose): boolean {
  if (p.k <= 0.02) return true;
  const gx = p.gx + Math.cos(p.angle) * p.shakeX, gy = p.gy - Math.sin(p.angle) * p.shakeX;
  const foot = env.floor(gx, gy);
  const ppx = env.pxPerUnit(gx, gy) * p.k;
  const { ctx } = env;
  ctx.save(); ctx.filter = 'blur(2px)'; ctx.fillStyle = 'rgba(60,40,20,.22)';
  ctx.beginPath(); ctx.ellipse(foot.x, foot.y, ppx * 0.46, ppx * 0.46 * Math.sin(env.pitch) * 0.85, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  const r = nearestSprite(sp.sprites, p.part, (p.angle * 180) / Math.PI);
  const img = r && sp.images.get(r.file);
  if (!r || !img) return false;
  const scale = ppx / sp.sprites.frame.cellPx;
  const [ax, ay] = r.anchor ?? sp.sprites.frame.anchor;
  const w = img.width * scale, h = img.height * scale;
  const left = foot.x - (r.mirror ? img.width - ax : ax) * scale, top = foot.y - ay * scale;
  ctx.save();
  if (r.mirror) { ctx.translate(left + w, top); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); }
  else ctx.drawImage(img, left, top, w, h);
  ctx.restore();
  return true;
}

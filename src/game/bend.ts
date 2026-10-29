import { type Track, trackAt } from './smooth';

export interface Local {
  /** Position in the head's local frame, model units (world / scale). */
  x: number;
  z: number;
  /** Heading of the path at that point relative to the head heading. */
  rel: number;
}

/**
 * Where the point `d` cells behind the head sits in the head's local frame, optionally pushed `lateral` cells to the
 * side of the path. The head frame is rotated by the head heading, so this is the inverse of that rotation applied to
 * the world displacement.
 */
export function localOffset(track: Track, sHead: number, d: number, lateral: number, scale: number): Local {
  const head = trackAt(track, sHead);
  const q = trackAt(track, sHead - d);
  const theta = head.angle;
  const ux = q.x - head.x;
  const uy = q.y - head.y;
  const rel = q.angle - theta;
  return {
    x: (ux * Math.cos(theta) - uy * Math.sin(theta) + lateral * Math.cos(rel)) / scale,
    z: (ux * Math.sin(theta) + uy * Math.cos(theta) - lateral * Math.sin(rel)) / scale,
    rel,
  };
}

/**
 * Holder placement for a part (leg, tail, wing) whose own rest offset inside the holder is (x0, z0) model units.
 * `shift` is how many cells further back than its rest position the part sits. The holder is rotated by `rel`, so the
 * part's own z offset has to be taken off along that rotated heading, not along the head's.
 */
export function holderPlacement(track: Track, sHead: number, z0: number, shift: number, scale: number): Local {
  const l = localOffset(track, sHead, -z0 * scale + shift, 0, scale);
  return { x: l.x - z0 * Math.sin(l.rel), z: l.z - z0 * Math.cos(l.rel), rel: l.rel };
}

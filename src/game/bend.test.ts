import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { makeAnimal } from '../../game/animals';
import type { Direction, Level, Piece } from '../core/types';
import { holderPlacement, localOffset } from './bend';
import { exitPath } from './path';
import { smoothPath, trackAt } from './smooth';

const STEP: Record<Direction, { x: number; y: number }> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const TURNS: Array<[Direction, Direction]> = [
  ['up', 'left'], ['up', 'right'], ['down', 'left'], ['down', 'right'],
  ['left', 'up'], ['left', 'down'], ['right', 'up'], ['right', 'down'],
];
const SCALE = 0.7;
const RADIUS = 0.3;

function turnTrack(from: Direction, to: Direction, len: number) {
  const v = STEP[from];
  const cells = Array.from({ length: len }, (_, k) => ({ x: 4 - v.x * k, y: 4 - v.y * k }));
  const piece: Piece = { id: 1, cells };
  const level: Level = { width: 9, height: 9, pieces: [piece], arrows: [{ x: 4 + v.x * 2, y: 4 + v.y * 2, dir: to }] };
  const track = smoothPath(exitPath(level, piece), RADIUS);
  return { track, headStart: track.vertexU[len - 1] };
}

/** World (x, z) of a point given in the head's local frame (model units), head frame rotated by theta. */
function toWorld(head: { x: number; y: number }, theta: number, lx: number, lz: number): [number, number] {
  return [head.x + (lx * Math.cos(theta) + lz * Math.sin(theta)) * SCALE, head.y + (-lx * Math.sin(theta) + lz * Math.cos(theta)) * SCALE];
}

describe('bent bodies follow the path in every turn', () => {
  for (const [from, to] of TURNS) {
    for (const len of [2, 3]) {
      it(`${from}→${to}, ${len} cells: parts and body surface stay on the path before, during and after the corner`, () => {
        const { track, headStart } = turnTrack(from, to, len);
        for (let u = headStart; u < track.length; u += 0.05) {
          const head = trackAt(track, u);
          // a rear leg: rest offset (0.25, -0.25) model units, pushed back by the body extension
          const x0 = 0.25;
          const z0 = -0.25;
          const shift = len - 1;
          const h = holderPlacement(track, u, z0, shift, SCALE);
          const nx = h.x + x0 * Math.cos(h.rel) + z0 * Math.sin(h.rel);
          const nz = h.z - x0 * Math.sin(h.rel) + z0 * Math.cos(h.rel);
          const [wx, wz] = toWorld(head, head.angle, nx, nz);
          const q = trackAt(track, u - (-z0 * SCALE + shift));
          expect(wx).toBeCloseTo(q.x + x0 * SCALE * Math.cos(q.angle), 6);
          expect(wz).toBeCloseTo(q.y - x0 * SCALE * Math.sin(q.angle), 6);

          // a body surface point 0.44 to the side, 1 cell behind the head
          const l = localOffset(track, u, 1, 0.44, SCALE);
          const [sx, sz] = toWorld(head, head.angle, l.x, l.z);
          const p = trackAt(track, u - 1);
          expect(sx).toBeCloseTo(p.x + 0.44 * Math.cos(p.angle), 6);
          expect(sz).toBeCloseTo(p.y - 0.44 * Math.sin(p.angle), 6);
        }
      });
    }
  }

  it('does not turn the body toward the side the path is going to: trailing parts end up behind the head', () => {
    // up→right: after the corner the tail is to the LEFT of the head (smaller x), not to the right
    const { track } = turnTrack('up', 'right', 2);
    const u = track.vertexU[3] + 0.4; // the head is past the corner vertex, the tail is not
    const head = trackAt(track, u);
    const tail = trackAt(track, u - 1);
    expect(tail.x).toBeLessThan(head.x);
    const l = localOffset(track, u, 1, 0, SCALE);
    const [tx] = toWorld(head, head.angle, l.x, l.z);
    expect(tx).toBeLessThan(head.x);
  });
});

describe('makeAnimal tracks only real parts', () => {
  function fakeGltf(withTail: boolean): { scene: THREE.Group; animations: [] } {
    const scene = new THREE.Group();
    const wrapper = new THREE.Group();
    wrapper.name = 'animal-fox';
    const root = new THREE.Group();
    root.name = 'root';
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.25, 1.25), new THREE.MeshBasicMaterial());
    body.name = 'body';
    body.position.y = 0.18;
    if (withTail) {
      const tail = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial());
      tail.name = 'tail';
      tail.position.set(0, 0.5, -0.495);
      body.add(tail);
    }
    root.add(body);
    for (const [name, x, z] of [['leg-back-left', 0.25, -0.25], ['leg-back-right', -0.25, -0.25], ['leg-front-left', 0.25, 0.25], ['leg-front-right', -0.25, 0.25]] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.2), new THREE.MeshBasicMaterial());
      leg.name = name;
      leg.position.set(x, 0.3, z);
      root.add(leg);
    }
    wrapper.add(root);
    scene.add(wrapper);
    return { scene, animations: [] };
  }

  it('never wraps the model containers, and leaves front legs on the head', () => {
    const built = makeAnimal(fakeGltf(true) as never, 2, 'fox');
    const names = built.tracked.map((t) => t.holder.children[0].name).sort();
    expect(names).toEqual(['leg-back-left', 'leg-back-right', 'tail']);
    for (const t of built.tracked) expect((t.holder.children[0] as THREE.Mesh).isMesh).toBe(true);
  });

  it('adds one extra leg pair per middle cell for a long dog, as clones with distinct names', () => {
    const built = makeAnimal(fakeGltf(false) as never, 3, 'dog');
    const names = built.tracked.map((t) => t.holder.children[0].name).sort();
    expect(names).toEqual(['leg-back-left', 'leg-back-right', 'mid1-leg-back-left', 'mid1-leg-back-right']);
  });

  it('stretches the body by exactly the added cells behind the head', () => {
    const built = makeAnimal(fakeGltf(false) as never, 3, 'dog');
    const pos = built.body!.geometry.getAttribute('position');
    let minZ = Infinity;
    for (let i = 0; i < pos.count; i++) minZ = Math.min(minZ, pos.getZ(i));
    expect(minZ).toBeCloseTo(-0.625 - 2 / SCALE, 5);
  });
});

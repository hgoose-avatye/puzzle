import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BLOCK_SPECIES, buildAnimal } from '../../game/blocks';

const SIZE: Record<string, number> = {
  penguin: 1, chick: 1, parrot: 1, cow: 2, pig: 2, fox: 2, tiger: 2, husky: 2, snake: 3, caterpillar: 3, dachshund: 3, crocodile: 3,
};

function meshes(seg: THREE.Group): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  seg.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
  return out;
}

describe('block animals', () => {
  for (const species of BLOCK_SPECIES) {
    it(`${species}: one segment per cell, each with its own body and parts centered on its cell`, () => {
      const n = SIZE[species];
      const segs = buildAnimal(species, n);
      expect(segs).toHaveLength(n);
      for (const seg of segs) {
        expect(seg.children).toHaveLength(1); // the animated part group
        const ms = meshes(seg);
        expect(ms.length).toBeGreaterThan(0);
        for (const m of ms) expect(Math.abs(m.position.z)).toBeLessThan(1.7); // parts are re-centered on their own cell
      }
      // the head carries the face: at least two white eye spheres on its front half
      const eyes = meshes(segs[0]).filter((m) => (m.material as THREE.MeshStandardMaterial).color.getHex() === 0xffffff && m.position.z > 0.1);
      expect(eyes.length).toBeGreaterThanOrEqual(2);
    });
  }

  it('long animals have a head larger than the body segments', () => {
    for (const species of ['snake', 'caterpillar', 'dachshund', 'crocodile']) {
      const segs = buildAnimal(species, 3);
      const width = (seg: THREE.Group): number => Math.max(...meshes(seg).map((m) => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox!.getSize(new THREE.Vector3()).x * m.scale.x; }).filter((w) => w < 1.2));
      expect(width(segs[0])).toBeGreaterThan(width(segs[1]));
    }
  });

  it('every segment of every animal reuses shared geometry and materials: nothing is created per animal', () => {
    const a = buildAnimal('cow', 2);
    const b = buildAnimal('cow', 2);
    const ids = (segs: THREE.Group[]): Set<string> => new Set(segs.flatMap((s) => meshes(s)).flatMap((m) => [m.geometry.uuid, (m.material as THREE.Material).uuid]));
    const idsA = ids(a);
    for (const id of ids(b)) expect(idsA.has(id)).toBe(true);
    const mesh = meshes(a[0])[0];
    expect(meshes(b[0]).some((m) => m.geometry === mesh.geometry)).toBe(true);
  });

  it('an unknown species falls back instead of throwing, and the cell count is clamped to 1-3', () => {
    expect(buildAnimal('unicorn', 2)).toHaveLength(2);
    expect(buildAnimal('cow', 7)).toHaveLength(3);
    expect(buildAnimal('cow', 0)).toHaveLength(1);
  });
});

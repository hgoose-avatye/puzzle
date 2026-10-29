import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { sliceAlongZ } from './slice';

function area(geo: THREE.BufferGeometry): number {
  const p = geo.getAttribute('position');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let sum = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    sum += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return sum;
}

describe('sliceAlongZ', () => {
  const box = new THREE.BoxGeometry(1, 1, 1);

  it('adds triangles at the cut planes without changing the surface', () => {
    const cut = sliceAlongZ(box, [-0.25, 0, 0.25]);
    expect(cut.getAttribute('position').count % 3).toBe(0);
    expect(cut.getAttribute('position').count).toBeGreaterThan(box.getAttribute('position').count);
    expect(area(cut)).toBeCloseTo(area(box.toNonIndexed()), 5);
  });

  it('creates vertices lying on each plane and keeps every attribute in step', () => {
    const cut = sliceAlongZ(box, [0.1]);
    const pos = cut.getAttribute('position');
    let onPlane = 0;
    for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getZ(i) - 0.1) < 1e-6) onPlane++;
    expect(onPlane).toBeGreaterThan(0);
    expect(cut.getAttribute('normal').count).toBe(pos.count);
    expect(cut.getAttribute('uv').count).toBe(pos.count);
  });

  it('leaves geometry untouched when no plane crosses it', () => {
    const cut = sliceAlongZ(box, [5]);
    expect(cut.getAttribute('position').count).toBe(box.toNonIndexed().getAttribute('position').count);
  });
});

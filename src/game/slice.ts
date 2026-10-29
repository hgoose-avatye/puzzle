import * as THREE from 'three';

/** Cut every triangle of `geo` at each z plane in `planes`, interpolating all attributes, so the mesh can bend smoothly. */
export function sliceAlongZ(geo: THREE.BufferGeometry, planes: number[]): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  const names = Object.keys(g.attributes);
  for (const c of planes) {
    const src = names.map((n) => g.getAttribute(n));
    const out = names.map(() => [] as number[]);
    const vert = (i: number): number[][] => src.map((a) => Array.from({ length: a.itemSize }, (_, k) => a.getComponent(i, k)));
    const lerp = (a: number[][], b: number[][], t: number): number[][] => a.map((x, ai) => x.map((v, k) => v + (b[ai][k] - v) * t));
    const emit = (...vs: number[][][]): void => vs.forEach((v) => v.forEach((comp, a) => out[a].push(...comp)));
    for (let t = 0; t < g.getAttribute('position').count; t += 3) {
      const v = [vert(t), vert(t + 1), vert(t + 2)];
      const side = v.map((x) => x[0][2] - c);
      const above = side.filter((d) => d > 0).length;
      if (above === 0 || above === 3) { emit(v[0], v[1], v[2]); continue; }
      // rotate so v[0] is the lone vertex on its side of the plane
      const lone = above === 1 ? side.findIndex((d) => d > 0) : side.findIndex((d) => d <= 0);
      const a = v[lone];
      const b = v[(lone + 1) % 3];
      const d = v[(lone + 2) % 3];
      const tb = (c - a[0][2]) / (b[0][2] - a[0][2]);
      const td = (c - a[0][2]) / (d[0][2] - a[0][2]);
      const ab = lerp(a, b, tb);
      const ad = lerp(a, d, td);
      emit(a, ab, ad);
      emit(ab, b, d);
      emit(ab, d, ad);
    }
    const next = new THREE.BufferGeometry();
    names.forEach((n, a) => next.setAttribute(n, new THREE.BufferAttribute(new Float32Array(out[a]), src[a].itemSize)));
    g = next;
  }
  return g;
}

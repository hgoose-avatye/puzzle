import { describe, expect, it } from 'vitest';
import type { Level } from '../core/types';
import { distanceToPolyline, exitPath, pointAlong, pointAt } from './path';

describe('exitPath', () => {
  it('lists tail to head, then the exit trace, then extra cells past the edge', () => {
    const level: Level = { width: 5, height: 1, pieces: [{ id: 1, cells: [{ x: 2, y: 0 }, { x: 1, y: 0 }] }] };
    const pts = exitPath(level, level.pieces[0], 2);
    expect(pts).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 }, { x: 6, y: 0 }]);
  });
  it('follows an arrow tile bend and keeps going in the final direction', () => {
    const level: Level = {
      width: 5, height: 5,
      pieces: [{ id: 1, cells: [{ x: 1, y: 2 }, { x: 0, y: 2 }] }],
      arrows: [{ x: 3, y: 2, dir: 'up' }],
    };
    const pts = exitPath(level, level.pieces[0], 1);
    expect(pts.slice(-3)).toEqual([{ x: 3, y: 1 }, { x: 3, y: 0 }, { x: 3, y: -1 }]);
  });
});

describe('pointAt', () => {
  const pts = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }];
  it('interpolates along the polyline and reports the heading', () => {
    expect(pointAt(pts, 0.5)).toMatchObject({ x: 1.5, y: 0 });
    expect(pointAt(pts, 0.5).angle).toBeCloseTo(Math.PI / 2);
    expect(pointAt(pts, 1.5)).toMatchObject({ x: 2, y: 0.5 });
    expect(pointAt(pts, 1.5).angle).toBeCloseTo(0);
  });
  it('clamps outside the path', () => {
    expect(pointAt(pts, -3)).toMatchObject({ x: 1, y: 0 });
    expect(pointAt(pts, 99)).toMatchObject({ x: 2, y: 1 });
  });
});

describe('distanceToPolyline', () => {
  it('measures to the nearest segment, so a tap beside a long body still hits it', () => {
    const body = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];
    expect(distanceToPolyline(body, 2, 0.5)).toBeCloseTo(0.5);
    expect(distanceToPolyline(body, 5, 0)).toBeCloseTo(2);
  });
});

describe('pointAlong', () => {
  const pts = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
  it('matches pointAt inside the path', () => {
    expect(pointAlong(pts, 1.5)).toEqual(pointAt(pts, 1.5));
  });
  it('extrapolates behind the start and past the end along the end tangents', () => {
    expect(pointAlong(pts, -0.5)).toMatchObject({ x: 0, y: -0.5 });
    expect(pointAlong(pts, 2.5)).toMatchObject({ x: 1.5, y: 1 });
  });
});

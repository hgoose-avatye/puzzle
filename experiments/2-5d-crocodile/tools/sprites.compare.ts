/**
 * src/sprites.ts: part assignment for 1 / 2 / 3+ cells, heading -> picture resolution against the crocodile manifest
 * (matching what tools/croc_full_check.py drew), block poses equal to the game's track at zero tuck, depth order.
 * Run: npx vitest run --config experiments/2-5d-crocodile/vitest.config.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { smoothPath as gameSmooth, trackAt as gameTrackAt } from '../../../src/game/smooth';
import { smoothPath } from '../src/rules';
import { blockPoses, drawOrder, headingOf, missingHeadings, nearestSprite, offsetWeight, partsFor, type SpeciesSprites, spriteFor } from '../src/sprites';

const manifestUrl = new URL('../assets/crocodile/crocodile.sprites.json', import.meta.url);
const croc = JSON.parse(readFileSync(manifestUrl, 'utf8')) as SpeciesSprites;

describe('parts per size class', () => {
  it('1 cell single, 2 cells head + tail, 3 cells head + body + tail, longer adds bodies', () => {
    expect(partsFor(1)).toEqual(['single']);
    expect(partsFor(2)).toEqual(['head', 'tail']);
    expect(partsFor(3)).toEqual(['head', 'body', 'tail']);
    expect(partsFor(5)).toEqual(['head', 'body', 'body', 'body', 'tail']);
  });
});

describe('crocodile manifest', () => {
  it('every file exists and every part covers all 8 headings', () => {
    for (const [part, p] of Object.entries(croc.parts)) {
      for (const f of Object.values(p.drawn)) expect(existsSync(new URL(`../assets/crocodile/${f}`, import.meta.url)), f).toBe(true);
      expect(missingHeadings(croc, part as never), part).toEqual([]);
    }
  });

  it('resolves headings the way the verified run drew them', () => {
    const want: Array<[string, number, string, boolean]> = [
      ['head', 270, 'head-approved/crocodile_head_090.png', true],
      ['head', 315, 'head-approved/crocodile_head_045.png', true],
      ['body', 180, 'body-approved/crocodile_body_000.png', false],
      ['body', 225, 'body-approved/crocodile_body_045.png', false],
      ['body', 135, 'body-approved/crocodile_body_045.png', true],
      ['body', 270, 'body-approved/crocodile_body_090.png', true],
      ['tail', 225, 'tail-approved/crocodile_tail_135.png', true],
      ['tail', 180, 'tail-approved/crocodile_tail_180.png', false],
    ];
    for (const [part, h, file, mirror] of want) expect(spriteFor(croc, part as never, h as never), `${part} ${h}`).toEqual({ file, mirror });
  });

  it('a part without enough art reports the missing headings', () => {
    const partial: SpeciesSprites = { ...croc, parts: { tail: { drawn: { 0: 'x.png' } } } };
    expect(missingHeadings(partial, 'tail')).toEqual([45, 90, 135, 180, 225, 270, 315]);
  });
});

describe('chick manifest (1 cell, standard-frame pictures; approved 2026-11-02)', () => {
  const chick = JSON.parse(readFileSync(new URL('../public/sprites/chick/chick.sprites.json', import.meta.url), 'utf8')) as SpeciesSprites;

  it('every file exists; the one block is a single part', () => {
    for (const pic of Object.values(chick.parts.single!.drawn)) {
      const f = typeof pic === 'string' ? pic : pic!.file;
      expect(existsSync(new URL(`../public/sprites/chick/${f}`, import.meta.url)), f).toBe(true);
    }
    expect(partsFor(1)).toEqual(['single']);
  });

  it('4 facings as the old chick drawing: down front, up back, left side, right side mirrored', () => {
    expect(spriteFor(chick, 'single', 0)).toEqual({ file: 'approved/chick_000.png', mirror: false });
    expect(spriteFor(chick, 'single', 180)?.file).toBe('approved/chick_180.png');
    expect(spriteFor(chick, 'single', 270)).toMatchObject({ file: 'approved/chick_270.png', mirror: false });
    expect(spriteFor(chick, 'single', 90)).toMatchObject({ file: 'approved/chick_270.png', mirror: true });
  });

  it('diagonals have no picture: nearestSprite takes the next facing clockwise, as the old chick drawing rounded', () => {
    expect(missingHeadings(chick, 'single')).toEqual([45, 135, 225, 315]);
    // legacy: Math.round(angle / 90°) -> 45° is the right side, 135° the back, 225° the left side, 315° the front
    expect(nearestSprite(chick, 'single', 45)).toMatchObject({ file: 'approved/chick_270.png', mirror: true, heading: 90 });
    expect(nearestSprite(chick, 'single', 135)).toMatchObject({ file: 'approved/chick_180.png', heading: 180 });
    expect(nearestSprite(chick, 'single', 225)).toMatchObject({ file: 'approved/chick_270.png', mirror: false, heading: 270 });
    expect(nearestSprite(chick, 'single', 315)).toMatchObject({ file: 'approved/chick_000.png', heading: 0 });
  });

  it('switches on the continuous angle, halfway between drawn facings (not after rounding to 45°)', () => {
    // 30° into a bend from down to right: still the front (legacy: Math.round(30 / 90) = 0)
    expect(nearestSprite(chick, 'single', 30)).toMatchObject({ file: 'approved/chick_000.png', heading: 0 });
    expect(nearestSprite(chick, 'single', 44)).toMatchObject({ file: 'approved/chick_000.png', heading: 0 });
    expect(nearestSprite(chick, 'single', 46)).toMatchObject({ file: 'approved/chick_270.png', mirror: true, heading: 90 });
    for (let deg = 0; deg < 360; deg += 1.5) {
      const legacy = Math.round(deg / 90) % 4; // 0 front, 1 right side, 2 back, 3 left side
      expect(nearestSprite(chick, 'single', deg)!.heading, `${deg}°`).toBe(legacy * 90);
    }
  });

  it('with all 8 headings drawn it is plain rounding to 45° (crocodile unchanged)', () => {
    for (let deg = 0; deg < 360; deg += 1.5) expect(nearestSprite(croc, 'head', deg)!.heading, `${deg}°`).toBe(headingOf((deg * Math.PI) / 180));
  });
});

describe('2-cell animal (test manifest from the approved crocodile head + tail)', () => {
  const two = JSON.parse(readFileSync(new URL('../assets/crocodile/two-cell-test.sprites.json', import.meta.url), 'utf8')) as SpeciesSprites;
  const path = [{ x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }, { x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 }];

  it('two parts, head then tail, each covering all 8 headings (5 drawn + 3 mirrored)', () => {
    expect(partsFor(2)).toEqual(['head', 'tail']);
    for (const part of ['head', 'tail'] as const) {
      expect(missingHeadings(two, part)).toEqual([]);
      expect(spriteFor(two, part, 270)).toMatchObject({ mirror: true });
      expect(spriteFor(two, part, 90)).toMatchObject({ mirror: false });
    }
  });

  it('poses: no tuck = the game track exactly; tuck 0.10 = tail 0.9 cell behind the head on the same track', () => {
    const mine = smoothPath(path);
    const game = gameSmooth(path, 0.3);
    for (let s = 1; s < 6; s += 0.05) {
      blockPoses(mine, s, 2, 0).forEach((b, i) => {
        const q = gameTrackAt(game, s - i);
        expect(Math.hypot(b.x - q.x, b.y - q.y)).toBeLessThan(1e-9);
        expect(b.heading).toBe(headingOf(q.angle));
      });
      const [, tail] = blockPoses(mine, s, 2, 0.1);
      const q = gameTrackAt(game, s - 0.9);
      expect(Math.hypot(tail.x - q.x, tail.y - q.y)).toBeLessThan(1e-9);
    }
  });

  it('draw order: heading down the screen the tail (further up) is drawn first; heading up the head is', () => {
    const down = drawOrder(blockPoses(smoothPath([{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }]), 1.5, 2));
    expect(down.map((b) => b.part)).toEqual(['tail', 'head']);
    const up = drawOrder(blockPoses(smoothPath([{ x: 2, y: 5 }, { x: 2, y: 4 }, { x: 2, y: 3 }, { x: 2, y: 2 }]), 1.5, 2));
    expect(up.map((b) => b.part)).toEqual(['head', 'tail']);
  });
});

describe('poses and order', () => {
  const path = [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 }];
  const mine = smoothPath(path);
  const game = gameSmooth(path, 0.3);

  it('with no tuck every block is exactly where the game puts it', () => {
    for (let s = 2; s < 6; s += 0.05) {
      blockPoses(mine, s, 3, 0).forEach((b, i) => {
        const q = gameTrackAt(game, s - i);
        expect(Math.hypot(b.x - q.x, b.y - q.y)).toBeLessThan(1e-9);
        expect(b.heading).toBe(headingOf(q.angle));
      });
    }
  });

  it('the tuck only pulls blocks toward the head along the same track', () => {
    const [h, b, t] = blockPoses(mine, 2, 3, 0.1);
    expect(h.y - b.y).toBeCloseTo(0.9, 9);
    expect(b.y - t.y).toBeCloseTo(0.9, 9);
  });

  it('draws further-up blocks first', () => {
    expect(drawOrder([{ y: 3 }, { y: 1 }, { y: 2 }]).map((b) => b.y)).toEqual([1, 2, 3]);
  });
});

describe('batch 2 visual offsets (tail 0°, head 180°): anchor = real feet, offset = joining correction', () => {
  const load = (sp: string) => JSON.parse(readFileSync(new URL(`../assets/${sp}/${sp}.sprites.json`, import.meta.url), 'utf8')) as SpeciesSprites;
  // the 35% placement approved 2026-11-01 (anchor y before the split), per species: [tail 0°, head 180°]
  const approved35: Record<string, [number, number]> = { cow: [270, 418], pig: [227, 379], fox: [205, 397], tiger: [245, 393], husky: [205, 414] };
  // drawn offset for a part at a continuous angle, as spriteCards applies it (picture px, y down)
  const shift = (m: SpeciesSprites, part: 'head' | 'tail', deg: number) => {
    const pick = nearestSprite(m, part, deg)!;
    return pick.offset ? pick.offset[1] * offsetWeight(m, part, deg, pick.heading) : 0;
  };

  for (const sp of Object.keys(approved35)) {
    const m = load(sp);

    it(`${sp}: only tail 0° and head 180° carry an offset; anchors are the standard feet point`, () => {
      for (const part of ['head', 'tail'] as const) {
        for (const [h, pic] of Object.entries(m.parts[part]!.drawn)) {
          const withOffset = (part === 'tail' && h === '0') || (part === 'head' && h === '180');
          expect(typeof pic === 'object' && pic.anchor, `${part} ${h}`).toEqual([512, 510]);
          expect(typeof pic === 'object' && Boolean(pic.offset), `${part} ${h}`).toBe(withOffset);
        }
      }
    });

    it(`${sp}: standing still at 0° / 180° the picture sits exactly where the approved 35% anchors put it`, () => {
      expect(510 - shift(m, 'tail', 0)).toBe(approved35[sp][0]);
      expect(510 - shift(m, 'head', 180)).toBe(approved35[sp][1]);
      expect(shift(m, 'tail', 90) + shift(m, 'tail', 180) + shift(m, 'tail', 270)).toBe(0);
      expect(shift(m, 'head', 0) + shift(m, 'head', 90) + shift(m, 'head', 270)).toBe(0);
    });

    it(`${sp}: turning through every angle the offset changes smoothly (no jump where the picture switches)`, () => {
      for (const part of ['head', 'tail'] as const) {
        let prev = shift(m, part, 0);
        for (let deg = 0.1; deg <= 360.001; deg += 0.1) {
          const cur = shift(m, part, deg);
          expect(Math.abs(cur - prev), `${part} ${deg.toFixed(1)}°`).toBeLessThan(1.5);
          prev = cur;
        }
        // where the picture changes (45°, 135°, ...) the offset is already gone
        for (const edge of [45, 135, 225, 315]) expect(shift(m, part, edge - 1e-6) + shift(m, part, edge + 1e-6)).toBeLessThan(1e-6);
      }
    });

    it(`${sp}: the picture chosen at each angle is unchanged (4 facings, switching halfway between them)`, () => {
      for (const part of ['head', 'tail'] as const) {
        for (let deg = 0; deg < 360; deg += 0.5) expect(nearestSprite(m, part, deg)!.heading, `${part} ${deg}°`).toBe((Math.round(deg / 90) % 4) * 90);
      }
    });
  }

  it('the weight is 1 at the heading, 1/2 at a quarter of the gap, 0 at the switch; real angle, not rounded', () => {
    const m = load('fox');
    expect(offsetWeight(m, 'tail', 0, 0)).toBe(1);
    expect(offsetWeight(m, 'tail', 22.5, 0)).toBeCloseTo(0.5, 9);
    expect(offsetWeight(m, 'tail', 337.5, 0)).toBeCloseTo(0.5, 9);
    expect(offsetWeight(m, 'tail', 45, 0)).toBe(0);
    expect(offsetWeight(m, 'tail', 10, 0)).toBeGreaterThan(offsetWeight(m, 'tail', 20, 0));
  });
});

describe('batch 3 (3 cells): snake and caterpillar on provisional received/ manifests, dachshund on its approved whole-body cuts', () => {
  const load = (sp: string) => JSON.parse(readFileSync(new URL(`../assets/${sp}/${sp}.sprites.json`, import.meta.url), 'utf8')) as SpeciesSprites;
  const shift = (m: SpeciesSprites, part: 'head' | 'body' | 'tail', deg: number) => {
    const pick = nearestSprite(m, part, deg)!;
    return pick.offset ? pick.offset[1] * offsetWeight(m, part, deg, pick.heading) : 0;
  };

  for (const sp of ['snake', 'caterpillar', 'dachshund']) {
    const m = load(sp);

    it(`${sp}: head, body, tail each drawn at 0 / 90 / 180, every file present, 270 mirrored`, () => {
      expect(partsFor(3)).toEqual(['head', 'body', 'tail']);
      for (const part of ['head', 'body', 'tail'] as const) {
        expect(Object.keys(m.parts[part]!.drawn).sort()).toEqual(['0', '180', '90']);
        for (const pic of Object.values(m.parts[part]!.drawn)) {
          const f = typeof pic === 'string' ? pic : pic!.file;
          expect(existsSync(new URL(`../assets/${sp}/${f}`, import.meta.url)), f).toBe(true);
        }
        expect(spriteFor(m, part, 270)).toMatchObject({ mirror: true });
      }
    });

    it(`${sp}: offsets only on the blocks behind at 0° (body, tail) and 180° (body, head), and they never jump`, () => {
      for (const part of ['head', 'body', 'tail'] as const) {
        for (const [h, pic] of Object.entries(m.parts[part]!.drawn)) {
          const behind = (h === '0' && part !== 'head') || (h === '180' && part !== 'tail');
          if (!behind) expect(typeof pic === 'object' && pic.offset, `${part} ${h}`).toBeFalsy();
        }
        let prev = shift(m, part, 0);
        for (let deg = 0.1; deg <= 360.001; deg += 0.1) {
          const cur = shift(m, part, deg);
          expect(Math.abs(cur - prev), `${part} ${deg.toFixed(1)}°`).toBeLessThan(2);
          prev = cur;
        }
        for (let deg = 0; deg < 360; deg += 0.5) expect(nearestSprite(m, part, deg)!.heading, `${part} ${deg}°`).toBe((Math.round(deg / 90) % 4) * 90);
      }
    });
  }

  it('dachshund (approved 2026-11-02): standard frame, no per-picture anchors or offsets, two corner pieces present', () => {
    const m = load('dachshund');
    expect(m.frame).toEqual({ size: 1024, cellPx: 512, anchor: [512, 640] });
    expect(m.tuck).toBe(0);
    for (const part of ['head', 'body', 'tail'] as const) for (const pic of Object.values(m.parts[part]!.drawn)) expect(typeof pic).toBe('string');
    expect(m.joints && Object.keys(m.joints).sort()).toEqual(['downRight', 'upRight']);
    for (const f of Object.values(m.joints!)) expect(existsSync(new URL(`../assets/dachshund/${f}`, import.meta.url)), f).toBe(true);
  });
});

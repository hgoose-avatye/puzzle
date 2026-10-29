import { type Track, trackAt } from './smooth';

/** Body blocks of different animals keep at least this far apart (center to center). Blocks of one animal sit 1 apart and touch. */
export const MIN_GAP = 0.999;
/** Sweep sample spacing along a track. */
const STEP = 0.05;
/** A new block within this many seconds of resuming is the same hold-up (e.g. creeping behind a tail): no new alert. */
const REBLOCK_QUIET = 0.3;

export type RunState = 'moving' | 'waiting';

export interface Runner {
  id: number;
  track: Track;
  bodyLen: number;
  /** arc length of the head on `track` */
  s: number;
  state: RunState;
  /** seconds of unhindered running since the last resume */
  freeFor: number;
  /** dense samples of the track, index k at arc length k * STEP */
  samples: Array<{ x: number; y: number }>;
}

export interface TrafficEvent {
  id: number;
  type: 'wait' | 'resume' | 'gone';
  /** a wait that continues the previous hold-up: no new feedback */
  quiet?: boolean;
}

/**
 * Animals that were sent out and are still on (or just off) the board, in the order they were sent.
 *
 * Priority is first come, first served: a runner never enters the part of the board an earlier runner still has to
 * sweep (from that runner's tail to the end of its track), so an earlier runner can always keep going and never waits
 * for a later one. A later runner moves as far as that allows, waits, and carries on by itself once the space is free.
 * Waiting edges only ever point from later to earlier runners, so there is no cycle and no deadlock: the first runner
 * always finishes, then the next one can, and so on.
 */
export class Traffic {
  readonly runners: Runner[] = [];

  add(id: number, track: Track, bodyLen: number, s: number): Runner {
    const samples = [];
    for (let u = 0; u <= track.length + STEP; u += STEP) samples.push(trackAt(track, u));
    const r: Runner = { id, track, bodyLen, s, state: 'moving', freeFor: Infinity, samples };
    this.runners.push(r);
    return r;
  }

  get(id: number): Runner | undefined {
    return this.runners.find((r) => r.id === id);
  }

  clear(): void {
    this.runners.length = 0;
  }

  /** Would runner `idx` with its head at `s` stay clear of everything earlier runners still have to sweep? */
  fits(idx: number, s: number): boolean {
    const r = this.runners[idx];
    const blocks = [];
    for (let i = 0; i < r.bodyLen; i++) blocks.push(trackAt(r.track, s - i));
    for (let k = 0; k < idx; k++) {
      const e = this.runners[k];
      const from = Math.max(0, Math.floor((e.s - (e.bodyLen - 1)) / STEP));
      for (let j = from; j < e.samples.length; j++) {
        const p = e.samples[j];
        for (const b of blocks) {
          const dx = b.x - p.x;
          const dy = b.y - p.y;
          if (dx * dx + dy * dy < MIN_GAP * MIN_GAP) return false;
        }
      }
    }
    return true;
  }

  /** Advance every runner by up to `speed * dt`, earliest first. Returns state changes; finished runners are dropped. */
  step(dt: number, speed: number): TrafficEvent[] {
    const events: TrafficEvent[] = [];
    const full = speed * dt;
    for (let idx = 0; idx < this.runners.length; idx++) {
      const r = this.runners[idx];
      const want = r.s + full;
      let next = r.s;
      if (this.fits(idx, want)) next = want;
      else {
        // furthest safe point between here and the full step
        let lo = r.s;
        let hi = want;
        for (let it = 0; it < 10; it++) {
          const mid = (lo + hi) / 2;
          if (this.fits(idx, mid)) lo = mid;
          else hi = mid;
        }
        next = lo;
      }
      const moved = next - r.s;
      r.s = next;
      if (r.state === 'moving' && moved < full * 0.1) {
        r.state = 'waiting';
        events.push({ id: r.id, type: 'wait', ...(r.freeFor < REBLOCK_QUIET ? { quiet: true } : {}) });
      } else if (r.state === 'waiting' && moved > full * 0.5) {
        r.state = 'moving';
        r.freeFor = 0;
        events.push({ id: r.id, type: 'resume' });
      } else if (r.state === 'moving') r.freeFor += dt;
    }
    for (let idx = this.runners.length - 1; idx >= 0; idx--) {
      const r = this.runners[idx];
      if (r.s >= r.track.length) {
        this.runners.splice(idx, 1);
        events.push({ id: r.id, type: 'gone' });
      }
    }
    return events;
  }
}

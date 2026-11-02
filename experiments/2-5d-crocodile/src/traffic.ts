/**
 * Runners on their way out, first come first served (same behaviour as src/game/traffic.ts): a later runner never
 * enters the part of the board an earlier runner still has to sweep, so it moves as far as that allows and waits.
 */
import { type Track, trackAt } from './rules';

const MIN_GAP = 0.999;
const STEP = 0.05;

export interface Runner { id: number; track: Track; bodyLen: number; s: number; waiting: boolean; samples: Array<{ x: number; y: number }> }

export class Traffic {
  readonly runners: Runner[] = [];

  add(id: number, track: Track, bodyLen: number, s: number): void {
    const samples = [];
    for (let u = 0; u <= track.length + STEP; u += STEP) samples.push(trackAt(track, u));
    this.runners.push({ id, track, bodyLen, s, waiting: false, samples });
  }

  get(id: number): Runner | undefined {
    return this.runners.find((r) => r.id === id);
  }

  private fits(idx: number, s: number): boolean {
    const r = this.runners[idx];
    const blocks = [];
    for (let i = 0; i < r.bodyLen; i++) blocks.push(trackAt(r.track, s - i));
    for (let k = 0; k < idx; k++) {
      const e = this.runners[k];
      for (let j = Math.max(0, Math.floor((e.s - (e.bodyLen - 1)) / STEP)); j < e.samples.length; j++) {
        const p = e.samples[j];
        for (const b of blocks) if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < MIN_GAP * MIN_GAP) return false;
      }
    }
    return true;
  }

  /** Move every runner on by up to speed * dt, earliest first; returns the ids that left the track. */
  step(dt: number, speed: number): number[] {
    const full = speed * dt;
    this.runners.forEach((r, idx) => {
      const want = r.s + full;
      let next = want;
      if (!this.fits(idx, want)) {
        let lo = r.s, hi = want;
        for (let it = 0; it < 10; it++) { const mid = (lo + hi) / 2; if (this.fits(idx, mid)) lo = mid; else hi = mid; }
        next = lo;
      }
      r.waiting = next - r.s < full * 0.1;
      r.s = next;
    });
    const gone: number[] = [];
    for (let i = this.runners.length - 1; i >= 0; i--) if (this.runners[i].s >= this.runners[i].track.length) gone.push(this.runners.splice(i, 1)[0].id);
    return gone;
  }
}

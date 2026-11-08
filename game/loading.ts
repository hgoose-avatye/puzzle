import * as THREE from 'three';

/**
 * Pictures on their way (2026-11-08): the 2.5D animal cards ask for their pictures the first time they are drawn, so on
 * a slow first visit the board, and the chick's finger over it, showed with no animals for seconds. Every texture is
 * fetched through THREE.DefaultLoadingManager, so this counts what is still coming and what failed, for both entries
 * (Classic 3D asks for none, and nothing ever waits there).
 */
const manager = THREE.DefaultLoadingManager;
let busy = false;
let failures = 0;
const waiting = new Set<() => void>();
manager.onStart = () => { busy = true; };
manager.onError = () => { failures++; };
manager.onLoad = () => {
  busy = false;
  for (const done of [...waiting]) done();
};

export type PicturesOutcome = 'ready' | 'failed' | 'slow';

/**
 * Wait until every picture asked for so far has arrived (or failed), never longer than `limitMs`: a slow or broken
 * connection must not hold the game forever. 'failed' when any of them could not be loaded since the wait began,
 * 'slow' when the limit ran out first (the late pictures still appear when they come).
 */
export function picturesSettled(limitMs: number): Promise<PicturesOutcome> {
  const failedBefore = failures;
  const outcome = (): PicturesOutcome => (failures > failedBefore ? 'failed' : 'ready');
  if (!busy) return Promise.resolve(outcome());
  return new Promise((resolve) => {
    const finish = (r: PicturesOutcome): void => { waiting.delete(done); window.clearTimeout(timer); resolve(r); };
    const done = (): void => finish(outcome());
    const timer = window.setTimeout(() => finish('slow'), limitMs);
    waiting.add(done);
  });
}

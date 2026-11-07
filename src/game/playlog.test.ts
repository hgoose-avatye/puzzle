import { describe, expect, it } from 'vitest';
import { PLAYLOG_KEY, PlayLog } from './playlog';

const memory = (): { getItem(k: string): string | null; setItem(k: string, v: string): void; data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
};
const build = { commit: 'abc1234', branch: 'test', dirty: false, levels: 'deadbeef' };
let t = 0;
const clock = (): string => `2026-11-07T00:00:${String(t++ % 60).padStart(2, '0')}Z`;

describe('PlayLog', () => {
  it('records an attempt with exits, pushes, bumps, undos and hints told apart, and the way it ended', () => {
    const store = memory();
    const log = new PlayLog(store, build, clock);
    log.begin(9);
    log.tap('exit'); log.tap('exit'); log.tap('push'); log.tap('bump'); log.tap('ignored');
    log.undo(); log.hint();
    log.end('clear');
    log.rate(4);
    const [a] = log.all;
    expect(a).toMatchObject({ build, level: 9, attempt: 1, taps: { exit: 2, push: 1, bump: 1, ignored: 1 }, undos: 1, hints: 1, end: 'clear', fun: 4 });
    expect(a.startedAt < a.endedAt!).toBe(true);
    // written to its own key only, on every change
    expect(Object.keys(store.data)).toEqual([PLAYLOG_KEY]);
    expect(JSON.parse(store.data[PLAYLOG_KEY]).records).toHaveLength(1);
  });

  it('a retry keeps the record made before it and counts attempts per level', () => {
    const log = new PlayLog(memory(), build, clock);
    log.begin(12); log.tap('push');
    log.begin(12); // retry without an explicit end
    log.tap('exit'); log.end('clear');
    expect(log.all.map((r) => [r.attempt, r.end, r.taps.push, r.taps.exit])).toEqual([[1, 'retry', 1, 0], [2, 'clear', 0, 1]]);
    log.begin(13);
    expect(log.current).toMatchObject({ level: 13, attempt: 1 });
  });

  it('an attempt left open by a reload is closed as such when the log loads again, and nothing is lost', () => {
    const store = memory();
    const first = new PlayLog(store, build, clock);
    first.begin(20); first.tap('push'); first.tap('push');
    const second = new PlayLog(store, build, clock);
    expect(second.all).toHaveLength(1);
    expect(second.all[0]).toMatchObject({ level: 20, end: 'reload', taps: { push: 2 } });
    second.begin(20);
    expect(second.current!.attempt).toBe(2);
  });

  it('ignores taps after the end and a second end, and works without storage', () => {
    const log = new PlayLog(null, build, clock);
    log.begin(1); log.end('home'); log.end('clear'); log.tap('exit'); log.undo();
    expect(log.all[0]).toMatchObject({ end: 'home', taps: { exit: 0 }, undos: 0 });
    expect(JSON.parse(log.exportJson()).records).toHaveLength(1);
  });
});

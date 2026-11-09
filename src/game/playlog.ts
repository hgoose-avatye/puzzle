/**
 * Play log for playtests (E3, 2026-11-07): one record per attempt at a level, kept in its own localStorage key and
 * never read by the game. What a tester did, tap by tap in kind, so a difficulty judgement can be tied to real play:
 * the build (code commit + level data hash), the level, when it started and ended, how it ended, and the counts of
 * exits (free animals out), pushes (blocked taps that moved), bumps that moved nothing, ignored taps, undos, hints
 * and retries, plus a fun rating the tester gives on the clear card. A record is written on every change, so a page
 * reload or a retry keeps what came before it: an attempt left open is closed as 'reload' when the log loads again.
 *
 * Pure except for the storage handed in, so the game and the tests share the same code. Test builds only: the game
 * switches it on under import.meta.env.DEV.
 */

export type EndKind = 'clear' | 'lost-bomb' | 'lost-stuck' | 'retry' | 'home' | 'reload' | 'skip';
export type TapKind = 'exit' | 'push' | 'bump' | 'ignored';

export interface Attempt {
  /** which code and level data (tools/build-info.ts) */
  build: { commit: string; branch: string; dirty: boolean; levels: string };
  level: number;
  /** a label for levels outside the 180 (?exp=, ?demo=) */
  tag?: string;
  /** 1 for the first try at this level in this log, 2 for the next, ... */
  attempt: number;
  startedAt: string;
  endedAt?: string;
  end?: EndKind;
  taps: Record<TapKind, number>;
  undos: number;
  hints: number;
}

export const PLAYLOG_KEY = 'animal-rescue-playlog';
const VERSION = 1;

interface Store { getItem(key: string): string | null; setItem(key: string, value: string): void }

export class PlayLog {
  private records: Attempt[] = [];
  private open: Attempt | null = null;

  constructor(private readonly store: Store | null, private readonly build: Attempt['build'], private readonly now: () => string = () => new Date().toISOString()) {
    this.load();
    // an attempt left open by a reload: closed as such, never lost
    const last = this.records[this.records.length - 1];
    if (last && !last.end) { last.end = 'reload'; last.endedAt = last.endedAt ?? this.now(); this.save(); }
  }

  private load(): void {
    try {
      const raw = this.store?.getItem(PLAYLOG_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && parsed.version === VERSION && Array.isArray(parsed.records)) this.records = parsed.records;
    } catch { this.records = []; }
  }

  private save(): void {
    try { this.store?.setItem(PLAYLOG_KEY, JSON.stringify({ version: VERSION, records: this.records })); } catch { /* storage may be unavailable: the log is best effort */ }
  }

  /** A level starts: whatever was open ends as `endOpenAs` (a retry by default) and a new record begins. */
  begin(level: number, tag?: string, endOpenAs: EndKind = 'retry'): Attempt {
    if (this.open && !this.open.end) this.end(endOpenAs);
    const attempt = this.records.filter((r) => r.level === level && r.tag === tag).length + 1;
    this.open = { build: this.build, level, ...(tag ? { tag } : {}), attempt, startedAt: this.now(), taps: { exit: 0, push: 0, bump: 0, ignored: 0 }, undos: 0, hints: 0 };
    this.records.push(this.open);
    this.save();
    return this.open;
  }

  tap(kind: TapKind): void { if (this.open && !this.open.end) { this.open.taps[kind]++; this.save(); } }
  undo(): void { if (this.open && !this.open.end) { this.open.undos++; this.save(); } }
  hint(): void { if (this.open && !this.open.end) { this.open.hints++; this.save(); } }

  /** The open attempt ends; a second end is ignored (the first one is what happened). */
  end(kind: EndKind): void {
    if (!this.open || this.open.end) return;
    this.open.end = kind;
    this.open.endedAt = this.now();
    this.save();
  }

  get current(): Attempt | null { return this.open; }
  get all(): readonly Attempt[] { return this.records; }

  /** The whole log as a JSON document, for the export button. */
  exportJson(): string { return JSON.stringify({ version: VERSION, exportedAt: this.now(), records: this.records }, null, 1); }
}

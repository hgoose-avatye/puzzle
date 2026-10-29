/**
 * Sound-effect system. Game code only uses event names (`SoundName`); file paths, volumes and anti-overlap
 * rules live here. A name whose `file` is null (not obtained yet) plays nothing: no substitute sound is used.
 * Loading failures are swallowed so the game never depends on audio. The AudioContext is created on the first
 * user gesture (autoplay rules) and the mute flag is persisted.
 */
export type SoundName = 'select' | 'move' | 'arrive' | 'wall' | 'collision' | 'rescued' | 'clear' | 'gameover';

interface Entry {
  /** file under /assets/sounds, or null when the source file has not been obtained */
  file: string | null;
  /** initial volume (0-1), tune by ear */
  volume: number;
  /** ignore a repeat of the same sound within this many ms */
  cooldown: number;
  /** play only this part of the file (seconds), for files with silence around the sound; the file itself stays as downloaded */
  trim?: { start: number; length: number };
}

export const MANIFEST: Record<SoundName, Entry> = {
  // Pixabay "Pop Cartoon": the file has 0.5 s of silence before a 0.11 s pop, so only the pop is played
  select: { file: 'pop-cartoon.mp3', volume: 0.3, cooldown: 80, trim: { start: 0.49, length: 0.15 } },
  move: { file: 'move.mp3', volume: 0.18, cooldown: 60 },
  arrive: { file: 'arrive.mp3', volume: 0.22, cooldown: 120 },
  wall: { file: 'wall.mp3', volume: 0.22, cooldown: 120 }, // Mixkit "Small hit in a game" (sfx 2072)
  collision: { file: 'collision.mp3', volume: 0.25, cooldown: 150 }, // Mixkit "Soft quick punch" (sfx 2151)
  rescued: { file: 'rescued.mp3', volume: 0.3, cooldown: 90 },
  clear: { file: 'clear.mp3', volume: 0.45, cooldown: 1000 },
  gameover: { file: 'gameover.mp3', volume: 0.3, cooldown: 1000 },
};

/** Sounds that must not play while a higher-priority one is still sounding. */
const SUPPRESSED_BY: Partial<Record<SoundName, SoundName[]>> = {
  arrive: ['rescued', 'clear', 'gameover', 'collision', 'wall'],
  wall: ['collision', 'clear', 'gameover'],
  collision: ['clear', 'gameover'],
  rescued: ['clear', 'gameover'],
  move: ['clear', 'gameover'],
};

/** Playing the key cuts these short if they are still sounding (a collision on the same input beats the select pop). */
const CUTS: Partial<Record<SoundName, SoundName[]>> = {
  select: ['select'], // rapid taps: one pop at a time
  collision: ['select', 'move'],
  wall: ['select'],
};

/** At most this many sounds at once; further ones are dropped except the result sounds. */
const MAX_VOICES = 4;
const ALWAYS: SoundName[] = ['clear', 'gameover'];

const MUTE_KEY = 'animal-rescue-muted';

export interface SoundDeps {
  createContext: () => AudioContext | null;
  /** fetch the raw bytes of a sound file */
  load: (url: string) => Promise<ArrayBuffer>;
  now: () => number;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  baseUrl?: string;
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private readonly lastAt = new Map<SoundName, number>();
  private readonly playingUntil = new Map<SoundName, number>();
  private readonly active = new Set<AudioBufferSourceNode>();
  private readonly sources = new Map<AudioBufferSourceNode, SoundName>();
  private readonly volumes = new Map<SoundName, number>();
  muted: boolean;
  private unlocked = false;

  constructor(private readonly deps: SoundDeps) {
    let m = false;
    try { m = deps.storage?.getItem(MUTE_KEY) === '1'; } catch { /* ignore */ }
    this.muted = m;
  }

  /** Create the (still suspended) context and start decoding right away, so the first tap already has its sounds. */
  prepare(): void {
    if (this.ctx) return;
    this.ctx = this.deps.createContext();
    if (!this.ctx) return;
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);
    void this.preload();
  }

  /** Call from every user-gesture handler (autoplay rules): resumes the context; sounds play only after this. */
  unlock(): void {
    this.prepare();
    if (!this.ctx) return;
    this.unlocked = true;
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => { /* retried on the next gesture */ });
  }

  /** Decode every available file; a failure only leaves that sound silent. */
  async preload(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const base = this.deps.baseUrl ?? '/assets/sounds/';
    await Promise.all((Object.keys(MANIFEST) as SoundName[]).map(async (name) => {
      const file = MANIFEST[name].file;
      if (!file) return;
      try {
        this.buffers.set(name, await ctx.decodeAudioData(await this.deps.load(base + file)));
      } catch { /* missing or undecodable file: stay silent */ }
    }));
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try { this.deps.storage?.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
    if (m) this.stopAll();
  }

  /** Adjust one sound's volume while listening (0-1). */
  setVolume(name: SoundName, v: number): void {
    this.volumes.set(name, Math.max(0, Math.min(1, v)));
  }

  /** True when this sound has a decoded buffer and would be heard. */
  isReady(name: SoundName): boolean { return this.buffers.has(name); }

  play(name: SoundName): boolean {
    if (this.muted || !this.unlocked || !this.ctx || !this.master) return false;
    const buf = this.buffers.get(name);
    if (!buf) return false;
    const now = this.deps.now();
    if (now - (this.lastAt.get(name) ?? -Infinity) < MANIFEST[name].cooldown) return false;
    for (const higher of SUPPRESSED_BY[name] ?? []) if ((this.playingUntil.get(higher) ?? 0) > now) return false;
    if (this.active.size >= MAX_VOICES && !ALWAYS.includes(name)) return false;
    for (const cut of CUTS[name] ?? []) this.cut(cut);
    this.lastAt.set(name, now);
    const trim = MANIFEST[name].trim;
    this.playingUntil.set(name, now + (trim ? trim.length : buf.duration) * 1000);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = this.volumes.get(name) ?? MANIFEST[name].volume;
    src.connect(g).connect(this.master);
    this.active.add(src);
    this.sources.set(src, name);
    src.onended = () => { this.active.delete(src); this.sources.delete(src); };
    if (trim) src.start(0, trim.start, trim.length);
    else src.start();
    return true;
  }

  private cut(name: SoundName): void {
    for (const [src, n] of this.sources) {
      if (n !== name) continue;
      try { src.stop(); } catch { /* already stopped */ }
      this.active.delete(src);
      this.sources.delete(src);
    }
    this.playingUntil.delete(name);
  }

  /** Stop everything that is sounding (restart, mute). */
  stopAll(): void {
    for (const s of this.active) { try { s.stop(); } catch { /* already stopped */ } }
    this.active.clear();
    this.sources.clear();
    this.playingUntil.clear();
  }
}

export const sound = new Sound({
  createContext: () => {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return AC ? new AC() : null;
  },
  load: async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`sound ${url}: ${r.status}`);
    return r.arrayBuffer();
  },
  now: () => performance.now(),
  storage: typeof localStorage === 'undefined' ? undefined : localStorage,
});

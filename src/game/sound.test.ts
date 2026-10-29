/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { MANIFEST, Sound, type SoundName } from '../../game/sound';

interface Played { gain: number; stopped: boolean; args: number[] }

function rig(opts: { failLoad?: string[]; missing?: boolean } = {}) {
  let t = 1000;
  const played: Played[] = [];
  const loaded: string[] = [];
  const ctx = {
    destination: {},
    resume: async () => {},
    createGain: () => ({ gain: { value: 1 }, connect: (n: unknown) => n }),
    createBufferSource: () => {
      const src: { buffer: unknown; onended: (() => void) | null; connect: (g: { gain: { value: number } }) => unknown; start: (...a: number[]) => void; stop: () => void } = {
        buffer: null, onended: null,
        connect(g) { return g; },
        start(...a: number[]) { rec.args = a; }, stop() { rec.stopped = true; },
      };
      const rec: Played = { gain: 0, stopped: false, args: [] };
      played.push(rec);
      const origConnect = src.connect;
      src.connect = (g) => { rec.gain = g.gain.value; return origConnect(g); };
      return src;
    },
    decodeAudioData: async () => ({ duration: 0.5 }),
  };
  const store = new Map<string, string>();
  const sound = new Sound({
    createContext: () => ctx as unknown as AudioContext,
    load: async (url) => {
      loaded.push(url);
      if (opts.failLoad?.some((f) => url.endsWith(f))) throw new Error('404');
      return new ArrayBuffer(8);
    },
    now: () => t,
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
  });
  return { sound, played, loaded, advance: (ms: number) => { t += ms; }, store };
}

const ready = async (r: ReturnType<typeof rig>) => { r.sound.unlock(); await r.sound.preload(); };

describe('sound system', () => {
  it('plays nothing before the first user gesture', () => {
    const r = rig();
    expect(r.sound.play('move')).toBe(false);
    expect(r.played).toHaveLength(0);
  });

  it('uses the configured initial volume per event', async () => {
    const r = rig();
    await ready(r);
    for (const n of ['move', 'rescued', 'clear'] as SoundName[]) { r.sound.play(n); r.advance(2000); }
    expect(r.played.map((p) => p.gain)).toEqual([MANIFEST.move.volume, MANIFEST.rescued.volume, MANIFEST.clear.volume]);
  });

  it('a sound without a source file stays silent: no substitute is played', async () => {
    const saved = MANIFEST.arrive.file;
    MANIFEST.arrive.file = null;
    try {
      const r = rig();
      await ready(r);
      expect(r.sound.play('arrive')).toBe(false);
      expect(r.loaded.some((u) => u.includes(saved!))).toBe(false);
    } finally {
      MANIFEST.arrive.file = saved;
    }
  });

  it('select plays only the pop, skipping the silence at the start of the file', async () => {
    const r = rig();
    await ready(r);
    expect(MANIFEST.select.file).toBe('pop-cartoon.mp3');
    expect(r.sound.play('select')).toBe(true);
    expect(r.played[0].args).toEqual([0, 0.49, 0.15]);
  });

  it('a new select cuts the previous one, so rapid taps never pile up pops', async () => {
    const r = rig();
    await ready(r);
    r.sound.play('select');
    r.advance(100);
    r.sound.play('select');
    expect(r.played[0].stopped).toBe(true);
    expect(r.played[1].stopped).toBe(false);
  });

  it('ignores a rapid repeat of the same sound but allows it after the cooldown', async () => {
    const r = rig();
    await ready(r);
    expect(r.sound.play('move')).toBe(true);
    r.advance(10);
    expect(r.sound.play('move')).toBe(false);
    r.advance(MANIFEST.move.cooldown);
    expect(r.sound.play('move')).toBe(true);
    expect(r.played).toHaveLength(2);
  });

  it('arrive and rescued are held back while clear is sounding, and clear plays once', async () => {
    const r = rig();
    await ready(r);
    expect(r.sound.play('clear')).toBe(true);
    r.advance(200);
    expect(r.sound.play('rescued')).toBe(false);
    expect(r.sound.play('arrive')).toBe(false);
    expect(r.sound.play('clear')).toBe(false); // cooldown
    r.advance(1500);
    expect(r.sound.play('rescued')).toBe(true);
  });

  it('arrive is skipped right when an escape sound is sounding', async () => {
    const r = rig();
    await ready(r);
    r.sound.play('rescued');
    r.advance(130);
    expect(r.sound.play('arrive')).toBe(false);
  });

  it('mute silences and stops what is playing, persists, and unmute restores', async () => {
    const r = rig();
    await ready(r);
    r.sound.play('gameover');
    r.sound.setMuted(true);
    expect(r.played[0].stopped).toBe(true);
    r.advance(2000);
    expect(r.sound.play('move')).toBe(false);
    expect(r.store.get('animal-rescue-muted')).toBe('1');
    r.sound.setMuted(false);
    expect(r.sound.play('move')).toBe(true);
  });

  it('restoring a saved mute flag', () => {
    const r = rig();
    r.store.set('animal-rescue-muted', '1');
    const again = new Sound({ createContext: () => null, load: async () => new ArrayBuffer(0), now: () => 0, storage: { getItem: (k) => r.store.get(k) ?? null, setItem: () => {} } });
    expect(again.muted).toBe(true);
  });

  it('stopAll (restart) stops a game-over sound so it cannot stack on the next one', async () => {
    const r = rig();
    await ready(r);
    r.sound.play('gameover');
    r.sound.stopAll();
    expect(r.played[0].stopped).toBe(true);
    r.advance(1100);
    expect(r.sound.play('gameover')).toBe(true);
    expect(r.played).toHaveLength(2);
  });

  it('a file that fails to load only silences that sound; the others still play', async () => {
    const r = rig({ failLoad: ['move.mp3'] });
    await ready(r);
    expect(r.sound.isReady('move')).toBe(false);
    expect(r.sound.play('move')).toBe(false);
    expect(r.sound.play('rescued')).toBe(true);
  });

  it('adjusting a volume by ear changes the next play only', async () => {
    const r = rig();
    await ready(r);
    r.sound.setVolume('move', 0.5);
    r.sound.play('move');
    expect(r.played[0].gain).toBe(0.5);
    r.sound.setVolume('move', 7);
    r.advance(100);
    r.sound.play('move');
    expect(r.played[1].gain).toBe(1);
  });

  it('every configured file exists on disk', () => {
    const files = Object.keys(import.meta.glob('../../game/public/assets/sounds/*.mp3', { query: '?url', eager: false }));
    for (const [name, e] of Object.entries(MANIFEST)) {
      if (e.file) expect(files.some((f) => f.endsWith(`/${e.file}`)), name).toBe(true);
    }
  });

  it('wall and collision use their own files and initial volumes', async () => {
    const r = rig();
    await ready(r);
    expect(MANIFEST.wall).toMatchObject({ file: 'wall.mp3', volume: 0.22 });
    expect(MANIFEST.collision).toMatchObject({ file: 'collision.mp3', volume: 0.25 });
    expect(r.sound.play('wall')).toBe(true);
    r.advance(1000);
    expect(r.sound.play('collision')).toBe(true);
  });

  it('a collision cuts a select sound that is still sounding, and a repeat collision is rate limited', async () => {
    const r = rig();
    await ready(r);
    r.sound.play('move');
    r.advance(30);
    expect(r.sound.play('collision')).toBe(true);
    expect(r.played[0].stopped).toBe(true); // move cut
    expect(r.sound.play('collision')).toBe(false); // inside cooldown
  });

  it('no more than four sounds at once, but the result sounds always get through', async () => {
    const r = rig();
    await ready(r);
    const names: SoundName[] = ['move', 'rescued', 'wall', 'arrive', 'collision'];
    const results = names.map((n) => { r.advance(200); return r.sound.play(n); });
    expect(results.filter(Boolean).length).toBeLessThanOrEqual(4);
    expect(r.sound.play('clear')).toBe(true);
  });

  it('prepare decodes before any gesture, but nothing plays until unlock', async () => {
    const r = rig();
    r.sound.prepare();
    await r.sound.preload();
    expect(r.sound.isReady('move')).toBe(true);
    expect(r.sound.play('move')).toBe(false);
    r.sound.unlock();
    expect(r.sound.play('move')).toBe(true);
  });
});
